import React, { useState, useRef } from 'react';
import { Btn, ErrorText, Label, usePages, More, useJob } from '../ui.jsx';
import { newId, mayContribute } from '../../functions/core/model.mjs';
const tools = [
  ['select', 'Select'],
  ['pen', 'Draw'],
  ['rect', 'Rectangle'],
  ['diamond', 'Decision'],
  ['ellipse', 'Ellipse'],
  ['text', 'Text'],
  ['line', 'Connect'],
];
export default function Canvas({ api, me, contributions }) {
  const pages = usePages(api, 'canvas.list', {}),
    job = useJob(),
    [doc, set] = useState(null),
    [mode, tool] = useState('select'),
    [selected, pick] = useState(''),
    [color, paint] = useState('#397b65'),
    [dirty, mark] = useState(false);
  const svg = useRef(null),
    drag = useRef(null),
    can = mayContribute(contributions, 'whiteboard', me);
  function change(fn) {
    mark(true);
    set((d) => ({ ...d, elements: fn(d.elements) }));
  }
  function open(d) {
    if (dirty && !window.confirm('Discard unsaved whiteboard changes?')) return;
    job.run(async () => {
      set(
        d
          ? await api.command('canvas.get', { id: d.id })
          : {
              id: newId('canvas'),
              name: 'Untitled whiteboard',
              elements: [],
              rev: 0,
            },
      );
      pick('');
      tool('select');
      mark(!d);
    });
  }
  function point(e) {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.current.getScreenCTM().inverse(),
    );
    return [p.x, p.y];
  }
  function down(e) {
    if (!can || job.busy) return;
    const [x, y] = point(e),
      id = e.target.closest('[data-id]')?.dataset.id,
      item = doc.elements.find((i) => i.id === id);
    if (mode === 'select') {
      pick(id || '');
      if (!item || ['pen', 'line'].includes(item.kind)) return;
      drag.current = { id, dx: x - item.x, dy: y - item.y };
    } else if (mode === 'line') {
      if (!item || ['line', 'pen'].includes(item.kind)) return;
      if (selected && selected !== id) {
        change((es) => [
          ...es,
          { id: newId('line'), kind: 'line', from: selected, to: id, color },
        ]);
        pick('');
      } else pick(id);
      return;
    } else if (mode === 'pen') {
      const key = newId('pen');
      change((es) => [
        ...es,
        { id: key, kind: 'pen', points: [[x, y]], color },
      ]);
      drag.current = { id: key, pen: true };
    } else {
      const key = newId('shape');
      change((es) => [
        ...es,
        {
          id: key,
          kind: mode,
          x,
          y,
          color,
          label: mode === 'text' ? 'Text' : '',
        },
      ]);
      pick(key);
      tool('select');
    }
    svg.current.setPointerCapture(e.pointerId);
  }
  const item = doc?.elements.find((x) => x.id === selected);
  return (
    <div className="page canvas-page">
      <header className="page-head">
        <h1>Whiteboards</h1>
        {can && <Btn onClick={() => open(null)}>New whiteboard</Btn>}
      </header>
      <div className="canvas-layout">
        <aside className="panel">
          <h3>Workspace boards</h3>
          {pages.items.map((d) => (
            <button
              key={d.id}
              className="resource-name"
              onClick={() => open(d)}
            >
              {d.name}
            </button>
          ))}
          <More page={pages} />
        </aside>
        {doc ? (
          <section className="panel stack">
            <div className="section-line">
              <input
                aria-label="Whiteboard name"
                readOnly={!can || job.busy}
                value={doc.name}
                onChange={(e) => {
                  mark(true);
                  set({ ...doc, name: e.target.value });
                }}
              />
              {can && (
                <Btn
                  kind="primary"
                  disabled={job.busy || !dirty}
                  onClick={() =>
                    job.run(async () => {
                      const meta = await api.command('canvas.save', doc);
                      set({ ...doc, ...meta });
                      mark(false);
                      pages.refresh();
                    })
                  }
                >
                  Save whiteboard
                </Btn>
              )}
            </div>
            {can && (
              <div className="canvas-tools">
                {tools.map(([k, n]) => (
                  <button
                    className={'btn ' + (mode === k ? 'tinted' : '')}
                    aria-pressed={mode === k}
                    key={k}
                    onClick={() => {
                      tool(k);
                      pick('');
                    }}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="color"
                  aria-label="Drawing color"
                  value={color}
                  onChange={(e) => paint(e.target.value)}
                />
              </div>
            )}
            {mode === 'line' && (
              <small>
                {selected
                  ? 'Click the destination shape.'
                  : 'Click the first shape to connect.'}
              </small>
            )}
            <svg
              ref={svg}
              viewBox="0 0 1000 650"
              className="drawing-surface"
              aria-label="Drawing canvas"
              onPointerDown={down}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                const [x, y] = point(e);
                change((es) =>
                  es.map((i) =>
                    i.id !== d.id
                      ? i
                      : d.pen
                        ? {
                            ...i,
                            points:
                              i.points.length < 2000
                                ? [...i.points, [x, y]]
                                : i.points,
                          }
                        : { ...i, x: x - d.dx, y: y - d.dy },
                  ),
                );
              }}
            >
              {[...doc.elements]
                .sort(
                  (a, b) =>
                    Number(a.kind !== 'line') - Number(b.kind !== 'line'),
                )
                .map((i) => {
                  if (i.kind === 'line') {
                    const a = doc.elements.find((x) => x.id === i.from),
                      b = doc.elements.find((x) => x.id === i.to);
                    return (
                      a &&
                      b && (
                        <line
                          key={i.id}
                          data-id={i.id}
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke={i.color}
                          strokeWidth="4"
                        />
                      )
                    );
                  }
                  if (i.kind === 'pen')
                    return (
                      <polyline
                        key={i.id}
                        data-id={i.id}
                        points={i.points.map((p) => p.join(',')).join(' ')}
                        fill="none"
                        stroke={i.color}
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                    );
                  return (
                    <g
                      key={i.id}
                      data-id={i.id}
                      transform={'translate(' + i.x + ' ' + i.y + ')'}
                      stroke={i.color}
                      strokeWidth={selected === i.id ? 4 : 2}
                      fill="#ffffff"
                    >
                      {i.kind === 'rect' ? (
                        <rect x="-65" y="-29" width="130" height="58" rx="8" />
                      ) : i.kind === 'diamond' ? (
                        <polygon points="0,-38 75,0 0,38 -75,0" />
                      ) : i.kind === 'ellipse' ? (
                        <ellipse rx="68" ry="30" />
                      ) : null}
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        stroke="none"
                        fill="#20332e"
                      >
                        {i.label}
                      </text>
                    </g>
                  );
                })}
            </svg>
            {can && !job.busy && item && (
              <div className="section-line">
                {!['pen', 'line'].includes(item.kind) && (
                  <Label name="Shape text">
                    <input
                      disabled={job.busy}
                      maxLength={150}
                      value={item.label}
                      onChange={(e) =>
                        change((es) =>
                          es.map((i) =>
                            i.id === selected
                              ? { ...i, label: e.target.value }
                              : i,
                          ),
                        )
                      }
                    />
                  </Label>
                )}
                <Btn
                  onClick={() => {
                    change((es) =>
                      es.filter(
                        (i) =>
                          i.id !== selected &&
                          i.from !== selected &&
                          i.to !== selected,
                      ),
                    );
                    pick('');
                  }}
                >
                  Remove selected
                </Btn>
              </div>
            )}
          </section>
        ) : (
          <div className="resource-empty">
            Choose a whiteboard or create one.
          </div>
        )}
      </div>
      <ErrorText error={job.error} />
    </div>
  );
}
