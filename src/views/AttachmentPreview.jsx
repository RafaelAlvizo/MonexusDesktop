import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText } from 'lucide-react';
import { Btn, Modal, ErrorText, saveFile, useJob } from '../ui.jsx';
import { attachmentType } from '../attachmentTypes.mjs';

const DocumentContents = lazy(() => import('./DocumentContents.jsx'));
export default function AttachmentPreview({ api, file }) {
  const type = attachmentType(file);
  const media = ['image', 'audio', 'video'].includes(type.kind);
  const large = file.size > 64 * 1024 * 1024;
  const [requested, request] = useState(false);
  const [open, setOpen] = useState(false), [visible, setVisible] = useState(false);
  const [blob, setBlob] = useState(null), [url, setUrl] = useState('');
  const [error, setError] = useState(''), [attempt, retry] = useState(0);
  const ref = useRef(null), job = useJob();
  useEffect(() => {
    if (!media) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '180px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [media]);
  const load = media ? visible && (!large || requested) : open && type.kind !== 'other';
  useEffect(() => {
    if (!load) return;
    const abort = new AbortController();
    let objectUrl;
    setBlob(null); setUrl(''); setError('');
    api.fileBlob(file.id, abort.signal).then(data => {
      if (abort.signal.aborted) return;
      if (media) {
        objectUrl = URL.createObjectURL(data.slice(0, data.size, type.mime));
        setUrl(objectUrl);
      } else setBlob(data);
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => { abort.abort(); setBlob(null); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, file.id, load, type.mime, media, attempt]);
  const failure = error && <div><ErrorText error={error}/><Btn onClick={() => retry(n => n + 1)}>Retry preview</Btn></div>;
  const download = <Btn icon={Download} disabled={job.busy} onClick={() => job.run(() => saveFile(api, file.id, file.name))}>Download</Btn>;
  return <div ref={ref} className="attachment-preview">
    {media ? <figure>
      {url && (type.kind === 'image' ?
        <button className="attachment-image" aria-label={'Enlarge ' + file.name} onClick={() => setOpen(true)}>
          <img src={url} alt={file.name} onError={() => setError('This image could not be displayed.')}/>
        </button> : type.kind === 'video' ?
        <video controls playsInline preload="metadata" src={url} aria-label={file.name} onError={() => setError('This video format cannot be played in this browser.')}/> :
        <audio controls preload="metadata" src={url} aria-label={file.name} onError={() => setError('This audio format cannot be played in this browser.')}/>)}
      {large && !requested ? <Btn onClick={() => request(true)}>Load {type.kind} preview</Btn> :
        !url && !error && <small role="status">Loading media…</small>}
      <figcaption>{file.name}</figcaption>{failure}
      {error && download}
    </figure> : <button className="attachment-document" onClick={() => setOpen(true)}>
      <FileText size={20}/><span><strong>{file.name}</strong><small>Preview document</small></span>
    </button>}
    {open && createPortal(<Modal wide title={file.name} onClose={() => { setOpen(false); setError(''); }}>
      <div className="attachment-reader">
        {media ? <img src={url} alt={file.name}/> : type.kind === 'other' ?
          <p>A content preview is unavailable for this file format.</p> :
          blob ? <Suspense fallback={<p>Opening document…</p>}><DocumentContents blob={blob} type={type}/></Suspense> :
          !error && <p role="status">Opening document…</p>}
        {failure}
      </div>
      <footer><ErrorText error={job.error}/>{download}<Btn onClick={() => setOpen(false)}>Close</Btn></footer>
    </Modal>, document.body)}
  </div>;
}
