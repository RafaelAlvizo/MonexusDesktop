import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Circle,
  Diamond,
  FileText,
  Hand,
  Link2,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Share2,
  Square,
  StickyNote,
  Type,
  WholeWord,
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  PanelsTopLeft,
} from 'lucide-react';
import { Btn, ErrorText, Label, Modal, More, usePages, useJob } from '../ui.jsx';
import { newId, mayContribute } from '../../functions/core/model.mjs';
import { PeoplePicker } from './Sharing.jsx';
import { quickMenu } from '../Navigation.jsx';
import '../whiteboard.css';

const tools = [
  ['select', 'Select', MousePointer2],
  ['hand', 'Pan', Hand],
  ['pen', 'Draw', Pencil],
  ['segment', 'Line', Minus],
  ['line', 'Connect shapes', Link2],
  ['rect', 'Rectangle', Square],
  ['diamond', 'Diamond', Diamond],
  ['ellipse', 'Ellipse', Circle],
  ['textbox', 'Text box', WholeWord],
  ['text', 'Plain text', Type],
  ['sticky', 'Sticky note', StickyNote],
];
const isNode = (e) => e && !['pen', 'segment', 'line'].includes(e.kind);
const clamp = (n) => Math.max(0.15, Math.min(4, n));
export async function newCanvas(api, name) {
  return api.command('canvas.save', {
    id: newId('canvas'),
    name: name.trim() || 'Untitled whiteboard',
    elements: [],
    rev: 0,
  });
}
function applyPatch(doc, patch) {
  const items = new Map(doc.elements.map((e) => [e.id, e]));
  for (const id of patch.remove || []) items.delete(id);
  for (const e of patch.add || []) if (!items.has(e.id)) items.set(e.id, e);
  for (const e of patch.update || []) if (items.has(e.id)) items.set(e.id, e);
  return {
    ...doc,
    name: patch.name ?? doc.name,
    elements: [...items.values()].filter(
      (e) => e.kind !== 'line' || (items.has(e.from) && items.has(e.to)),
    ),
  };
}
function useCanvas(api, id, room, session) {
  const [doc, setDoc] = useState(null),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const live = useRef(false),
    base = useRef(null),
    pending = useRef([]),
    busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const args = { id, ...(room ? { room, session } : {}) };
    const paint = () => {
      if (live.current) setDoc(base.current && pending.current.reduce(applyPatch, base.current));
    };
    try {
      if (!pending.current.length) {
        const res = await api.command('canvas.get', { ...args, rev: base.current?.rev ?? 0 });
        base.current = res.unchanged ? { ...base.current, canEdit: res.canEdit } : res;
        paint();
      }
      while (pending.current.length) {
        const patch = pending.current[0];
        base.current = await api.command('canvas.patch', { ...args, ...patch });
        pending.current.shift();
        paint();
      }
      if (live.current) setError('');
    } catch (e) {
      if (/permission-denied|not-found/.test(e.code || '')) {
        base.current = null;
        pending.current = [];
        paint();
      } else if (/invalid-argument|failed-precondition/.test(e.code || '') && pending.current.length) {
        pending.current.shift();
        paint();
      }
      if (live.current) setError(e.message);
    } finally {
      busy.current = false;
      if (live.current) setSaving(pending.current.length > 0);
    }
  }, [api, id, room, session]);
  useEffect(() => {
    live.current = true;
    refresh();
    const timer = setInterval(refresh, 2200);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  function change(patch) {
    if (!base.current?.canEdit) return;
    pending.current.push(patch);
    setDoc(pending.current.reduce(applyPatch, base.current));
    setSaving(true);
    refresh();
  }
  return { doc, error, saving, change, refresh };
}
function NotePicker({ api, onPick, close }) {
  const notes = usePages(api, 'notes.list', {}),
    [query, search] = useState('');
  return (
    <Modal title="Insert a copy of a note" onClose={close}>
      <div className="form-body stack">
        <input
          type="search"
          aria-label="Find a note"
          placeholder="Find a note…"
          value={query}
          onChange={(e) => search(e.target.value)}
        />
        {notes.items
          .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
          .map((n) => (
            <Btn key={n.id} icon={FileText} onClick={() => onPick(n)}>
              {n.title}
              {[n.title, n.body].filter(Boolean).join('\n').length > 2000 && (
                <small>First 2,000 characters</small>
              )}
            </Btn>
          ))}
        <More page={notes} />
      </div>
    </Modal>
  );
}
function Sharing({ api, doc, members, close, refresh }) {
  const [mode, setMode] = useState(doc.audience || 'team'),
    [shared, setShared] = useState(doc.shared || []),
    job = useJob();
  return (
    <Modal title="Share whiteboard" onClose={close}>
      <div className="form-body stack">
        <Label name="Who can access this whiteboard">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="private">Only me</option>
            <option value="selected">Selected teammates</option>
            <option value="team">Entire team</option>
          </select>
        </Label>
        {mode === 'selected' && (
          <PeoplePicker
            label="Teammates"
            options={members.filter((m) => m.active && m.id !== doc.by)}
            value={shared}
            change={setShared}
          />
        )}
        <ErrorText error={job.error} />
      </div>
      <footer>
        <Btn onClick={close}>Cancel</Btn>
        <Btn
          kind="primary"
          disabled={job.busy}
          onClick={() =>
            job.run(async () => {
              await api.command('canvas.access', { id: doc.id, rev: doc.rev, audience: mode, shared });
              await refresh();
              close();
            })
          }
        >
          Save sharing
        </Btn>
      </footer>
    </Modal>
  );
}
function Shape({ item: i, selected, nodes }) {
  const attrs = {
    'data-id': i.id,
    className: 'wb-object' + (selected ? ' selected' : ''),
    stroke: i.color,
    strokeWidth: 2,
  };
  if (i.kind === 'line' || i.points) {
    const a = nodes.get(i.from),
      b = nodes.get(i.to);
    if (!i.points && (!a || !b)) return null;
    const points = (
      i.points || [
        [a.x, a.y],
        [b.x, b.y],
      ]
    )
      .map((p) => p.join(','))
      .join(' ');
    return (
      <g {...attrs} fill="none">
        <polyline points={points} stroke="transparent" strokeWidth="15" />
        <polyline
          points={points}
          strokeWidth={selected ? 4 : 3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>
    );
  }
  return (
    <g {...attrs} transform={'translate(' + i.x + ' ' + i.y + ')'}>
      {i.kind === 'diamond' ? (
        <polygon points="0,-45 86,0 0,45 -86,0" />
      ) : i.kind === 'ellipse' ? (
        <ellipse rx="83" ry="40" />
      ) : i.kind !== 'text' ? (
        <rect
          x="-78"
          y="-39"
          width="156"
          height="78"
          rx={i.kind === 'sticky' ? 2 : 8}
          style={i.kind === 'sticky' ? { fill: i.color } : undefined}
        />
      ) : null}
      <foreignObject
        x={i.kind === 'diamond' ? -52 : -74}
        y="-36"
        width={i.kind === 'diamond' ? 104 : 148}
        height="72"
      >
        <div
          className={'wb-label ' + i.kind}
          style={{
            fontFamily: i.font || 'sans-serif',
            ...(i.kind === 'text' ? { color: i.color } : {}),
            ...(i.kind === 'sticky'
              ? {
                  color:
                    parseInt(i.color.slice(1, 3), 16) * 0.299 +
                      parseInt(i.color.slice(3, 5), 16) * 0.587 +
                      parseInt(i.color.slice(5), 16) * 0.114 >
                    145
                      ? '#172020'
                      : 'white',
                }
              : {}),
          }}
        >
          {i.label || (i.kind === 'text' ? 'Text' : '')}
        </div>
      </foreignObject>
    </g>
  );
}
export function CanvasEditor({ api, me, members, id, room = '', session = '', back }) {
  const { doc, error, change, refresh, saving } = useCanvas(api, id, room, session);
  const [mode, tool] = useState('select'),
    [selected, pick] = useState(''),
    [color, paint] = useState('#488576'),
    [font, setFont] = useState('sans-serif');
  const [view, setView] = useState({ x: 100, y: 100, z: 1 }),
    [preview, showPreview] = useState(null),
    [dialog, setDialog] = useState(''),
    [draft, setDraft] = useState('');
  const surface = useRef(),
    gesture = useRef(),
    viewRef = useRef(view);
  viewRef.current = view;
  const elements = doc?.elements || [],
    item = elements.find((e) => e.id === selected),
    can = !!doc?.canEdit;
  const display = preview
    ? elements.some((e) => e.id === preview.id)
      ? elements.map((e) => (e.id === preview.id ? preview : e))
      : [...elements, preview]
    : elements;
  const nodes = new Map(display.filter(isNode).map((e) => [e.id, e]));
  function zoom(factor, clientX, clientY) {
    const b = surface.current.getBoundingClientRect(),
      px = clientX == null ? b.width / 2 : clientX - b.left,
      py = clientY == null ? b.height / 2 : clientY - b.top;
    setView((v) => {
      const z = clamp(v.z * factor);
      return { z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z };
    });
  }
  useEffect(() => {
    const svg = surface.current;
    if (!svg) return;
    const wheel = (e) => {
      e.preventDefault();
      zoom(Math.exp(-Math.max(-80, Math.min(80, e.deltaY)) * 0.008), e.clientX, e.clientY);
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [!!doc]);
  function pos(e) {
    const b = surface.current.getBoundingClientRect(),
      v = viewRef.current;
    return [(e.clientX - b.left - v.x) / v.z, (e.clientY - b.top - v.y) / v.z];
  }
  function down(e) {
    if (e.button === 2) return;
    const [x, y] = pos(e),
      id = e.target.closest('[data-id]')?.dataset.id,
      obj = elements.find((i) => i.id === id);
    if (e.button === 1 || mode === 'hand' || (!can && !obj)) {
      e.preventDefault();
      gesture.current = { pan: true, x: e.clientX, y: e.clientY, view };
    } else if (mode === 'select') {
      pick(id || '');
      if (!can || !obj || obj.kind === 'line') return;
      gesture.current = { obj, x, y };
    } else if (can && mode === 'line') {
      if (!isNode(obj)) return;
      if (selected && selected !== id) {
        change({ add: [{ id: newId('line'), kind: 'line', from: selected, to: id, color }] });
        pick('');
      } else pick(id);
      return;
    } else if (can && (mode === 'segment' || mode === 'pen')) {
      const obj = { id: newId('stroke'), kind: mode, points: [[x, y]], color };
      gesture.current = { fresh: true, obj, last: obj };
      showPreview(obj);
    } else if (can) {
      const obj = {
        id: newId('shape'),
        kind: mode,
        x,
        y,
        color: mode === 'sticky' && color === '#488576' ? '#eed483' : color,
        font,
        label: '',
      };
      change({ add: [obj] });
      pick(obj.id);
      tool('select');
      if (['text', 'textbox', 'sticky'].includes(mode)) {
        setDraft('');
        setDialog('text');
      }
      return;
    } else return;
    surface.current.setPointerCapture(e.pointerId);
  }
  function move(e) {
    const g = gesture.current;
    if (!g) return;
    if (g.pan) {
      setView({ ...g.view, x: g.view.x + e.clientX - g.x, y: g.view.y + e.clientY - g.y });
      return;
    }
    const [x, y] = pos(e),
      o = g.obj;
    let next;
    if (g.fresh) {
      const points =
        o.kind === 'segment'
          ? [o.points[0], [x, y]]
          : g.last.points.length < 2000
            ? [...g.last.points, [x, y]]
            : g.last.points;
      next = { ...o, points };
    } else
      next = o.points
        ? { ...o, points: o.points.map(([px, py]) => [px + x - g.x, py + y - g.y]) }
        : { ...o, x: o.x + x - g.x, y: o.y + y - g.y };
    g.last = next;
    showPreview(next);
  }
  function end(cancel) {
    const g = gesture.current;
    gesture.current = null;
    showPreview(null);
    if (!cancel && g?.last) change(g.fresh ? { add: [g.last] } : { update: [g.last] });
  }
  function edit(obj) {
    if (!can || !isNode(obj)) return;
    pick(obj.id);
    setDraft(obj.label);
    setDialog('text');
  }
  function remove(id) {
    change({ remove: [id] });
    pick('');
  }
  function fit() {
    const bounds = elements.flatMap(
      (e) =>
        e.points ||
        (isNode(e)
          ? [
              [e.x - 90, e.y - 45],
              [e.x + 90, e.y + 45],
            ]
          : []),
    );
    if (!bounds.length) {
      setView({ x: 100, y: 100, z: 1 });
      return;
    }
    let l = Infinity,
      t = Infinity,
      r = -Infinity,
      b = -Infinity;
    for (const [x, y] of bounds) {
      l = Math.min(l, x);
      t = Math.min(t, y);
      r = Math.max(r, x);
      b = Math.max(b, y);
    }
    const box = surface.current.getBoundingClientRect(),
      z = clamp(Math.min((box.width - 80) / Math.max(1, r - l), (box.height - 75) / Math.max(1, b - t)));
    setView({ z, x: (box.width - (l + r) * z) / 2, y: (box.height - (t + b) * z) / 2 });
  }
  const fitted = useRef(false);
  useEffect(() => {
    if (doc && !fitted.current) {
      fitted.current = true;
      if (doc.elements.length) fit();
    }
  }, [doc]);
  if (!doc)
    return (
      <section className="wb-loading">
        {back && <Btn onClick={back}>Whiteboards</Btn>}
        <p role="status">{error || 'Opening whiteboard…'}</p>
      </section>
    );
  return (
    <section className="wb-editor" aria-label="Whiteboard editor">
      <header className="wb-header">
        {back && (
          <button aria-label="All whiteboards" disabled={saving} onClick={back}>
            <ArrowLeft size={18} />
          </button>
        )}
        <strong>{doc.name}</strong>
        <small>{saving ? 'Saving…' : can ? '' : 'View only'}</small>
        {!room && doc.by === me.id && (
          <>
            <Btn
              disabled={saving}
              onClick={() => {
                setDraft(doc.name);
                setDialog('name');
              }}
            >
              Rename
            </Btn>
            <Btn disabled={saving} icon={Share2} onClick={() => setDialog('share')}>
              Share
            </Btn>
          </>
        )}
      </header>
      <div className="wb-stage">
        <svg
          ref={surface}
          className={'wb-surface tool-' + mode}
          aria-label="Drawing canvas"
          tabIndex={0}
          style={{
            backgroundSize: 22 * view.z + 'px ' + 22 * view.z + 'px',
            backgroundPosition: view.x + 'px ' + view.y + 'px',
          }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => end(false)}
          onPointerCancel={() => end(true)}
          onDoubleClick={(e) => edit(nodes.get(e.target.closest('[data-id]')?.dataset.id))}
          onContextMenu={(e) => {
            const id = e.target.closest('[data-id]')?.dataset.id,
              o = elements.find((e) => e.id === id);
            quickMenu(e, [
              { label: 'Fit to view', run: fit },
              can && isNode(o) && { label: 'Edit text', run: () => edit(o) },
              can &&
                o &&
                o.kind !== 'line' && {
                  label: 'Duplicate',
                  run: () => {
                    const copy = { ...o, id: newId('shape') };
                    if (o.points) copy.points = o.points.map(([x, y]) => [x + 20, y + 20]);
                    else {
                      copy.x += 20;
                      copy.y += 20;
                    }
                    change({ add: [copy] });
                    pick(copy.id);
                  },
                },
              can && o && { label: 'Remove item', run: () => remove(id) },
            ]);
          }}
          onKeyDown={(e) => {
            if (can && selected && ['Delete', 'Backspace'].includes(e.key)) {
              e.preventDefault();
              remove(selected);
            }
            if (e.key === 'Escape') {
              pick('');
              tool('select');
            }
          }}
        >
          <g transform={'translate(' + view.x + ' ' + view.y + ') scale(' + view.z + ')'}>
            {[...display]
              .sort((a, b) => (a.kind !== 'line') - (b.kind !== 'line'))
              .map((e) => (
                <Shape key={e.id} item={e} selected={selected === e.id} nodes={nodes} />
              ))}
          </g>
        </svg>
        <div className="wb-tools" role="toolbar" aria-label="Drawing tools">
          {tools
            .filter(([k]) => can || k === 'select' || k === 'hand')
            .map(([k, label, Icon]) => (
              <button
                key={k}
                title={label}
                aria-label={label}
                aria-pressed={mode === k}
                onClick={() => {
                  tool(k);
                  pick('');
                }}
              >
                <Icon size={17} />
              </button>
            ))}
          {can && (
            <button
              title="Insert existing note"
              aria-label="Insert existing note"
              onClick={() => setDialog('note')}
            >
              <FileText size={17} />
            </button>
          )}
        </div>
        {can && (
          <div className="wb-style">
            <input
              type="color"
              aria-label="Item color"
              value={item?.color || color}
              onChange={(e) => {
                paint(e.target.value);
                if (item) change({ update: [{ ...item, color: e.target.value }] });
              }}
            />
            <select
              aria-label="Font"
              value={item?.font || font}
              onChange={(e) => {
                setFont(e.target.value);
                if (isNode(item)) change({ update: [{ ...item, font: e.target.value }] });
              }}
            >
              {['sans-serif', 'serif', 'monospace', 'cursive'].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            {isNode(item) && <button onClick={() => edit(item)}>Edit text</button>}
            {item && (
              <button aria-label="Remove selected" onClick={() => remove(item.id)}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
        {mode === 'line' && (
          <small className="wb-hint">
            {selected ? 'Choose the destination shape' : 'Choose the first shape'}
          </small>
        )}
        <div className="wb-zoom">
          <button aria-label="Zoom out" onClick={() => zoom(1 / 1.25)}>
            <ZoomOut size={17} />
          </button>
          <span>{Math.round(view.z * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
            <ZoomIn size={17} />
          </button>
          <button aria-label="Fit to view" onClick={fit}>
            <Maximize size={16} />
          </button>
        </div>
      </div>
      <ErrorText error={error} />
      {dialog === 'share' && <Sharing {...{ api, doc, members, refresh }} close={() => setDialog('')} />}
      {dialog === 'note' && (
        <NotePicker
          api={api}
          close={() => setDialog('')}
          onPick={(n) => {
            const b = surface.current.getBoundingClientRect();
            change({
              add: [
                {
                  id: newId('sticky'),
                  kind: 'sticky',
                  color: '#eed483',
                  font,
                  x: (b.width / 2 - view.x) / view.z,
                  y: (b.height / 2 - view.y) / view.z,
                  label: [n.title, n.body].filter(Boolean).join('\n').slice(0, 2000),
                },
              ],
            });
            setDialog('');
          }}
        />
      )}
      {['text', 'name'].includes(dialog) && (
        <Modal
          title={dialog === 'name' ? 'Rename whiteboard' : 'Edit text'}
          onClose={() => setDialog('')}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dialog === 'name') change({ name: draft });
              else if (item) change({ update: [{ ...item, label: draft }] });
              setDialog('');
            }}
          >
            <div className="form-body">
              <Label name={dialog === 'name' ? 'Whiteboard name' : 'Text'}>
                <textarea
                  autoFocus
                  required={dialog === 'name'}
                  maxLength={dialog === 'name' ? 100 : 2000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </Label>
            </div>
            <footer>
              <Btn onClick={() => setDialog('')}>Cancel</Btn>
              <button className="btn primary">Apply</button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
export default function Canvas({ api, me, members, contributions }) {
  const pages = usePages(api, 'canvas.list', {}),
    [id, open] = useState(''),
    [tab, choose] = useState('Mine'),
    [creating, create] = useState(false),
    [name, setName] = useState(''),
    job = useJob();
  if (id)
    return (
      <div className="page wb-page">
        <CanvasEditor
          key={id}
          {...{ api, me, members, id }}
          back={() => {
            open('');
            pages.refresh();
          }}
        />
      </div>
    );
  const list = pages.items.filter((d) => (tab === 'Mine' ? d.by === me.id : d.by !== me.id));
  return (
    <section className="page">
      <header className="page-head">
        <h1>Whiteboards</h1>
        {mayContribute(contributions, 'whiteboard', me) && (
          <Btn
            kind="primary"
            icon={Plus}
            onClick={() => {
              setName('');
              create(true);
            }}
          >
            New whiteboard
          </Btn>
        )}
      </header>
      <div className="tabs">
        {['Mine', 'Shared with me'].map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => choose(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="wb-library">
        {list.map((d) => (
          <button key={d.id} onClick={() => open(d.id)}>
            <PanelsTopLeft size={22} />
            <strong>{d.name}</strong>
            <small>
              {d.audience === 'private'
                ? 'Private'
                : d.audience === 'selected'
                  ? 'Selected teammates'
                  : 'Team'}
            </small>
          </button>
        ))}
      </div>
      {!list.length && !pages.loading && <p className="muted">No whiteboards here yet.</p>}
      <More page={pages} />
      {creating && (
        <Modal title="New whiteboard" onClose={() => create(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              job.run(async () => {
                const d = await newCanvas(api, name);
                create(false);
                open(d.id);
              });
            }}
          >
            <div className="form-body">
              <Label name="Whiteboard name">
                <input
                  autoFocus
                  maxLength={100}
                  value={name}
                  placeholder="Untitled whiteboard"
                  onChange={(e) => setName(e.target.value)}
                />
              </Label>
              <ErrorText error={job.error} />
            </div>
            <footer>
              <Btn onClick={() => create(false)}>Cancel</Btn>
              <button disabled={job.busy} className="btn primary">
                Create whiteboard
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
