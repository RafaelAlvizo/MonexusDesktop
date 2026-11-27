import React, { useLayoutEffect, useRef } from 'react';

const tags = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'MARK',
  'BR',
  'DIV',
  'P',
  'UL',
  'OL',
  'LI',
  'FONT',
  'SPAN',
]);
const fonts = ['Arial', 'Georgia', 'Verdana', 'Courier New'];
function safeFragment(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  function copy(source, parent) {
    for (const node of source.childNodes) {
      if (node.nodeType === 3) {
        parent.append(document.createTextNode(node.data));
        continue;
      }
      if (
        node.nodeType !== 1 ||
        ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)
      )
        continue;
      if (!tags.has(node.tagName)) {
        copy(node, parent);
        continue;
      }
      const el = document.createElement(node.tagName);
      if (node.tagName === 'FONT') {
        if (fonts.includes(node.face)) el.face = node.face;
        if (/^[1-7]$/.test(node.size)) el.size = node.size;
      }
      const color = node.style.backgroundColor;
      if (/^(#[0-9a-f]{3,8}|rgb\([0-9, ]+\)|yellow)$/i.test(color))
        el.style.backgroundColor = color;
      copy(node, el);
      parent.append(el);
    }
  }
  const result = document.createDocumentFragment();
  copy(doc.body, result);
  return result;
}
export default function NoteBody({ note, change }) {
  const editor = useRef(null),
    last = useRef(null),
    selection = useRef(null);
  useLayoutEffect(() => {
    if (
      last.current === note.rich &&
      (note.rich || editor.current.innerText === note.body)
    )
      return;
    const el = editor.current;
    if (note.rich) el.replaceChildren(safeFragment(note.rich));
    else el.innerText = note.body;
    last.current = note.rich;
  }, [note.rich, note.body]);
  function publish() {
    const el = editor.current;
    last.current = el.innerHTML;
    change({
      body: el.innerText.replaceAll('\u00a0', ' '),
      rich: el.innerHTML,
    });
  }
  function remember() {
    const s = window.getSelection();
    if (s.rangeCount && editor.current.contains(s.anchorNode))
      selection.current = s.getRangeAt(0).cloneRange();
  }
  function format(command, value) {
    editor.current.focus();
    const s = window.getSelection();
    if (
      selection.current &&
      editor.current.contains(selection.current.commonAncestorContainer)
    ) {
      s.removeAllRanges();
      s.addRange(selection.current);
    }
    document.execCommand(command, false, value);
    remember();
    publish();
  }
  return (
    <>
      {change && (
        <div
          className="note-format"
          role="toolbar"
          aria-label="Text formatting"
        >
          {[
            ['bold', 'Bold'],
            ['italic', 'Italic'],
            ['insertUnorderedList', 'Bullets'],
            ['insertOrderedList', 'Numbered'],
            ['hiliteColor', 'Highlight'],
          ].map(([cmd, label]) => (
            <button
              type="button"
              key={cmd}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                format(cmd, cmd === 'hiliteColor' ? '#ffe68a' : undefined)
              }
            >
              {label}
            </button>
          ))}
          <select
            aria-label="Font family"
            defaultValue=""
            onChange={(e) => format('fontName', e.target.value)}
          >
            <option disabled value="">
              Font
            </option>
            {fonts.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Font size"
            defaultValue=""
            onChange={(e) => format('fontSize', e.target.value)}
          >
            <option disabled value="">
              Size
            </option>
            {['Small', 'Normal', 'Medium', 'Large', 'Heading'].map((x, i) => (
              <option key={x} value={i + 2}>
                {x}
              </option>
            ))}
          </select>
        </div>
      )}
      <div
        className="rich-note"
        role={change ? 'textbox' : 'document'}
        aria-label="Note body"
        aria-multiline={change ? true : undefined}
        contentEditable={!!change}
        suppressContentEditableWarning
        ref={editor}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        onInput={change ? publish : undefined}
        onMouseUp={remember}
        onKeyUp={remember}
        onBlur={remember}
        onDrop={(e) => e.preventDefault()}
        onPaste={(e) => {
          if (change) {
            e.preventDefault();
            document.execCommand(
              'insertText',
              false,
              e.clipboardData.getData('text/plain'),
            );
          }
        }}
      />
    </>
  );
}
