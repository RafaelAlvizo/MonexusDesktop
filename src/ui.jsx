import AttachmentPreview from './views/AttachmentPreview.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { desktop, nativeAction } from './native.mjs';
import {
  X,
  Plus,
  ArrowDownToLine,
  Paperclip,
  LoaderCircle,
  Pin,
} from 'lucide-react';
export const humanError = (e) =>
  String(e?.message || e || 'Request failed.').replace(/^Firebase:\s*/, '');
export function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button
      type="button"
      className="icon-btn"
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon size={17} />
    </button>
  );
}
export function Btn({ icon: Icon, children, kind = '', ...p }) {
  return (
    <button type="button" className={'btn ' + kind} {...p}>
      {Icon && <Icon size={16} />} {children}
    </button>
  );
}
export function WindowPin() {
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!desktop) return;
    const receive = e => { if (e.data?.kind === 'pin_state') setPinned(e.data.pinned); };
    desktop.addEventListener('message', receive);
    nativeAction('get_pin');
    return () => desktop.removeEventListener('message', receive);
  }, []);
  return desktop && <IconButton icon={Pin} label={pinned ? 'Unpin window' : 'Pin window'}
    aria-pressed={pinned} onClick={() => nativeAction('toggle_pin')} />;
}
export function Avatar({ person, small = false }) {
  const name = person?.name || 'Unassigned',
    letters = name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join('');
  const tone = ['green', 'violet', 'gold', 'blue', 'rose'][
    (person?.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 5
  ];
  return (
    <span className={'avatar ' + tone + (small ? ' small' : '')} title={name}>
      {person?.photo ? <img alt="" src={person.photo}/> : person ? letters : '–'}
    </span>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  drawer = false,
}) {
  const ref = useRef(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement,
      el = ref.current;
    el.focus();
    const key = (e) => {
      if ([...document.querySelectorAll('[aria-modal="true"]')].at(-1) !== el)
        return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const els = [
          ...el.querySelectorAll(
            'summary,button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
          ),
        ].filter((x) => x.offsetParent !== null);
        if (!els.length) {
          e.preventDefault();
          return;
        }
        const i = els.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          els.at(-1).focus();
        } else if (!e.shiftKey && (i < 0 || i === els.length - 1)) {
          e.preventDefault();
          els[0].focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      before?.focus?.();
    };
  }, []);
  return (
    <div
      className={'scrim ' + (drawer ? 'drawer-wrap' : '')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={'modal ' + (wide ? 'wide ' : '') + (drawer ? 'drawer' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <div>
            {subtitle && <div className="eyebrow">{subtitle}</div>}
            <h2>{title}</h2>
          </div>
          <IconButton icon={X} label="Close dialog" onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
export function Label({ name, children, wide = false }) {
  const labelId = React.useId();
  return (
    <label className={'label ' + (wide ? 'span' : '')}>
      <span id={labelId}>{name}</span>
      {React.isValidElement(children)
        ? React.cloneElement(children, { 'aria-labelledby': labelId })
        : children}
    </label>
  );
}
export function Check({ children, ...p }) {
  return (
    <label className="check">
      <input type="checkbox" {...p} />
      {children}
    </label>
  );
}
export function Tabs({ values, value, onChange }) {
  return (
    <div className="tabs">
      {values.map((x) => {
        const [k, n] = Array.isArray(x) ? x : [x, x];
        return (
          <button
            key={k}
            type="button"
            className={k === value ? 'active' : ''}
            onClick={() => onChange(k)}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}
export function ErrorText({ error }) {
  return error ? (
    <div className="error" role="alert">
      {humanError(error)}
    </div>
  ) : null;
}
export function useJob() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    lock = useRef(false);
  const run = async (fn) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(humanError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
export function useLoad(fn, deps) {
  const [state, set] = useState({ data: null, error: '', loading: true }),
    [version, bump] = useState(0);
  useEffect(() => {
    let live = true;
    set({ data: null, error: '', loading: true });
    Promise.resolve()
      .then(fn)
      .then(
        (data) => {
          if (live) set({ data, error: '', loading: false });
        },
        (e) => {
          if (live) set({ data: null, error: humanError(e), loading: false });
        },
      );
    return () => {
      live = false;
    };
  }, [...deps, version]);
  return { ...state, refresh: () => bump((x) => x + 1) };
}
export function usePages(api, action, args) {
  const signature = JSON.stringify(args),
    [version, bump] = useState(0),
    [state, set] = useState({
      items: [],
      next: null,
      loading: true,
      error: '',
    }),
    seq = useRef(0);
  async function load(cursor, token) {
    set((s) => ({ ...s, loading: true, error: '' }));
    try {
      const page = await api.command(action, { ...args, cursor });
      if (seq.current === token)
        set((s) => ({
          items: cursor ? [...s.items, ...page.items] : page.items,
          next: page.next,
          loading: false,
          error: '',
        }));
    } catch (e) {
      if (seq.current === token)
        set((s) => ({ ...s, loading: false, error: humanError(e) }));
    }
  }
  useEffect(() => {
    const token = ++seq.current;
    set({ items: [], next: null, loading: true, error: '' });
    load(null, token);
    return () => {
      seq.current++;
    };
  }, [api, action, signature, version]);
  return {
    ...state,
    more: () => load(state.next, seq.current),
    refresh: () => bump((x) => x + 1),
  };
}
export function More({ page }) {
  return (
    <>
      <ErrorText error={page.error} />
      {page.loading ? (
        <p className="muted loading">
          <LoaderCircle size={15} /> Loading…
        </p>
      ) : page.next ? (
        <Btn onClick={page.more}>Load more</Btn>
      ) : null}
    </>
  );
}
export function saveBlob(blob, name) {
  const u = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 15000);
}
export async function saveFile(api, key, name) {
  if (window.showSaveFilePicker && api.fileResponse) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName: name });
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }
    const res = await api.fileResponse(key),
      out = await handle.createWritable();
    await res.body.pipeTo(out);
    return;
  }
  saveBlob(await api.fileBlob(key), name);
}
export function openLink(url) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) return;
  if (desktop) return nativeAction('open_link', { url: u.href });
  window.open(u.href, '_blank', 'noopener,noreferrer');
}
export function Attachments({ api, scope, canAdd }) {
  const page = usePages(api, 'file.list', { scope }),
    job = useJob(),
    [percent, setPercent] = useState(0),
    task = useRef(),
    [paused, pause] = useState(false);
  return (
    <section className="attachments">
      <div className="section-line">
        <h3>
          <Paperclip size={15} /> Media &amp; files
        </h3>
        {canAdd && (
          <label className="btn compact">
            <Plus size={14} /> Attach
            <input
              type="file"
              hidden
              disabled={job.busy}
              onChange={(e) => {
                const file = e.target.files[0];
                e.target.value = '';
                if (file)
                  job.run(async () => {
                    setPercent(0);
                    pause(false);
                    try {
                      await api.upload(scope, file, setPercent, (t) => {
                        task.current = t;
                      });
                      page.refresh();
                    } finally {
                      task.current = null;
                    }
                  });
              }}
            />
          </label>
        )}
      </div>
      {job.busy && (
        <div className="row">
          <progress value={percent} max="100" />
          {percent}%
          {task.current && (
            <Btn
              onClick={() => {
                paused ? task.current.resume() : task.current.pause();
                pause(!paused);
              }}
            >
              {paused ? 'Resume' : 'Pause'}
            </Btn>
          )}
        </div>
      )}
      {page.items.map(file => <AttachmentPreview key={file.id} api={api} file={file} />)}
      {!page.loading && !page.items.length && (
        <span className="muted">No attachments yet.</span>
      )}
      <More page={page} />
      <ErrorText error={job.error} />
    </section>
  );
}
