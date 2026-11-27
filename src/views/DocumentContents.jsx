import React, { useEffect, useRef, useState } from 'react';
import { Btn, ErrorText } from '../ui.jsx';

const textLimit = 300000;
const elements = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
async function documentText(blob, type) {
  if (type.kind === 'text') {
    const bytes = await blob.slice(0, textLimit * 4).arrayBuffer();
    const view = new Uint8Array(bytes);
    const encoding = view[0] === 255 && view[1] === 254 ? 'utf-16le' :
      view[0] === 254 && view[1] === 255 ? 'utf-16be' : 'utf-8';
    return new TextDecoder(encoding).decode(bytes).slice(0, textLimit);
  }
  const { unzipSync } = await import('fflate');
  let budget = 24 * 1024 * 1024;
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()), {filter(entry) {
    if (!/^(word\/document\.xml|content\.xml|ppt\/slides\/slide\d+\.xml|xl\/(sharedStrings|worksheets\/sheet\d+)\.xml)$/.test(entry.name)) return false;
    budget -= entry.originalSize;
    if (budget < 0) throw Error('This document exceeds the text preview limit.');
    return true;
  }});
  const xml = path => {
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(files[path]), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw Error('The document could not be read.');
    return doc;
  };
  const paths = Object.keys(files).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
  if (type.ext === 'xlsx') {
    const strings = files['xl/sharedStrings.xml'] ? elements(xml('xl/sharedStrings.xml'),'si').map(n=>n.textContent) : [];
    return paths.filter(p=>p.includes('/worksheets/')).map((p,i) => {
      const rows = elements(xml(p),'row').map(row => elements(row,'c').map(cell => {
        const value = elements(cell,'v')[0]?.textContent || '';
        return cell.getAttribute('t') === 's' ? strings[Number(value)] || '' :
          cell.getAttribute('t') === 'inlineStr' ? cell.textContent : value;
      }).join('\t'));
      return 'Sheet ' + (i + 1) + '\n' + rows.join('\n');
    }).join('\n\n').slice(0,textLimit);
  }
  return paths.map(p => elements(xml(p),'p').map(para =>
    p === 'content.xml' ? para.textContent : elements(para,'t').map(t=>t.textContent).join('')
  ).join('\n')).join('\n\n').slice(0,textLimit);
}
export default function DocumentContents({ blob, type }) {
  const [text,setText] = useState(null), [pdf,setPdf] = useState(null);
  const [page,setPage] = useState(1), [error,fail] = useState('');
  const canvas = useRef(null);
  useEffect(() => {
    let live = true, task;
    async function load() {
      if (type.kind !== 'pdf') {
        const value = await documentText(blob, type);
        if (live) setText(value);
        return;
      }
      const [lib, worker, bytes] = await Promise.all([
        import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'), blob.arrayBuffer(),
      ]);
      if (!live) return;
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      task = lib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false });
      const doc = await task.promise;
      if (live) setPdf(doc);
    }
    load().catch(e => { if (live) fail(e.message); });
    return () => { live = false; task?.destroy().catch(() => {}); };
  }, [blob, type.kind, type.ext]);
  useEffect(() => {
    if (!pdf) return;
    let live = true, render;
    pdf.getPage(page).then(async p => {
      if (!live) return;
      const base = p.getViewport({scale:1});
      const viewport = p.getViewport({scale: Math.min(2, 1600 / Math.max(base.width,base.height))});
      const el = canvas.current;
      el.width = Math.ceil(viewport.width); el.height = Math.ceil(viewport.height);
      render = p.render({ canvas: el, viewport });
      await render.promise;
      if (live) p.cleanup();
    }).catch(e => { if (live) fail(e.message); });
    return () => { live = false; render?.cancel(); };
  }, [pdf, page]);
  if (error) return <ErrorText error={error}/>;
  if (pdf) return <><div className="reader-pages">
    <Btn disabled={page <= 1} onClick={() => setPage(page-1)}>Previous</Btn>
    <span>Page {page} of {pdf.numPages}</span>
    <Btn disabled={page >= pdf.numPages} onClick={() => setPage(page+1)}>Next</Btn>
  </div><canvas ref={canvas} aria-label={'PDF page ' + page}/></>;
  return text === null ? <p role="status">Rendering preview…</p> :
    <pre>{text || 'This document contains no previewable text.'}{text.length === textLimit && '\n…'}</pre>;
}
