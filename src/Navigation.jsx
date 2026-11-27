import { createPortal } from 'react-dom';
import React, { useEffect, useRef, useState } from 'react';

export function useNavigationOrder(api, tell) {
  const [order, setOrder] = useState({}),
    ref = useRef({}),
    writes = useRef(Promise.resolve());
  useEffect(() => {
    let live = true;
    ref.current = {};
    setOrder({});
    if (!api) return;
    const key = 'monexus.navigation.' + api.uid;
    try {
      ref.current = JSON.parse(localStorage.getItem(key)) || {};
      setOrder(ref.current);
    } catch {}
    const initial = ref.current;
    api
      .command('conversations.order')
      .then((remote) => {
        if (live && initial === ref.current) {
          ref.current = remote;
          setOrder(remote);
          localStorage.setItem(key, JSON.stringify(remote));
        }
      })
      .catch(tell);
    return () => {
      live = false;
    };
  }, [api]);
  function arrange(group, ids) {
    const next = { ...ref.current, [group]: ids };
    ref.current = next;
    setOrder(next);
    localStorage.setItem('monexus.navigation.' + api.uid, JSON.stringify(next));
    writes.current = writes.current
      .then(() => api.command('conversations.arrange', { group, ids }))
      .catch(tell);
  }
  function sorted(items, group, getId) {
    const ids = order[group] || [];
    const rank = (x) =>
      ids.includes(getId(x)) ? ids.indexOf(getId(x)) : Infinity;
    return [...items].sort((a, b) => rank(a) - rank(b));
  }
  function props(group, id, ids, extra = []) {
    return {
      draggable: true,
      onContextMenu: (e) => {
        const button = e.currentTarget,
          index = ids.indexOf(id);
        function move(to) {
          const next = ids.filter((x) => x !== id);
          next.splice(to, 0, id);
          arrange(group, next);
        }
        quickMenu(e, [
          {
            label: 'Open ' + button.textContent.trim(),
            run: () => button.click(),
          },
          ...extra,
          index > 0 && { label: 'Move up', run: () => move(index - 1) },
          index < ids.length - 1 && {
            label: 'Move down',
            run: () => move(index + 1),
          },
        ]);
      },
      onDragStart: (e) =>
        e.dataTransfer.setData(
          'monexus/navigation',
          JSON.stringify([group, id]),
        ),
      onDragOver: (e) => {
        if (e.dataTransfer.types.includes('monexus/navigation'))
          e.preventDefault();
      },
      onDrop: (e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData('monexus/navigation');
        if (!raw) return;
        const [g, from] = JSON.parse(raw);
        if (g !== group || !ids.includes(from) || from === id) return;
        const next = ids.filter((x) => x !== from);
        next.splice(ids.indexOf(id), 0, from);
        arrange(group, next);
      },
    };
  }
  return { sorted, props };
}
export function quickMenu(e, entries) {
  e.preventDefault();
  window.dispatchEvent(
    new CustomEvent('monexus-actions', {
      detail: { x: e.clientX, y: e.clientY, entries: entries.filter(Boolean) },
    }),
  );
}
// Build quick actions from the controls available on the selected row.
export function QuickActions() {
  const [menu, set] = useState(null),
    list = useRef(null);
  useEffect(() => {
    function open(e) {
      if (
        e.defaultPrevented ||
        e.target.closest(
          'input,textarea,[contenteditable=true],.file-browser,[role=menu]',
        )
      )
        return;
      const row = e.target.closest(
        '.conversation-row,.post,.chat-post,.ticket-card,.table-ticket,.resource-row,.note-summary,.notebook-location,.nav-item, .report-card,.canvas-layout aside .resource-name,.agenda-item,.meeting-card,.meeting-row,.notice-row,.inbox-row,.figma-tools,.note-sheet-tools,.board-actions,[data-quick-actions]',
      );
      if (!row) return;
      const controls = [
        ...(row.matches('button') ? [row] : []),
        ...row.querySelectorAll('button:not(:disabled)'),
      ].filter((b) => !b.disabled);
      const entries = controls
        .map((el) => ({
          label:
            el.title ||
            el.getAttribute('aria-label') ||
            el.innerText.trim().split('\n')[0],
          run: () => el.click(),
        }))
        .filter((x) => x.label);
      if (!entries.length) return;
      e.preventDefault();
      set({
        entries,
        x: Math.min(e.clientX, innerWidth - 235),
        y: Math.min(
          e.clientY,
          innerHeight - Math.min(340, entries.length * 34 + 14),
        ),
      });
    }
    const close = (e) => {
      if (!list.current?.contains(e.target)) set(null);
    };
    const key = (e) => {
      if (e.key === 'Escape') set(null);
    };
    function custom(e) {
      const m = e.detail;
      set({
        ...m,
        x: Math.min(m.x, innerWidth - 235),
        y: Math.min(
          m.y,
          innerHeight - Math.min(340, m.entries.length * 34 + 14),
        ),
      });
    }
    window.addEventListener('monexus-actions', custom);
    document.addEventListener('contextmenu', open);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('monexus-actions', custom);
      document.removeEventListener('contextmenu', open);
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, []);
  useEffect(() => {
    if (menu) list.current?.querySelector('button')?.focus();
  }, [menu]);
  return (
    menu &&
    createPortal(
      <div
        ref={list}
        className="file-menu quick-actions"
        role="menu"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const buttons = [...list.current.querySelectorAll('button')];
            buttons[
              (buttons.indexOf(document.activeElement) +
                (e.key === 'ArrowUp' ? -1 : 1) +
                buttons.length) %
                buttons.length
            ]?.focus();
          }
        }}
        aria-label="Quick actions"
        style={{ left: Math.max(4, menu.x), top: Math.max(4, menu.y) }}
      >
        {menu.entries.map((x, i) => (
          <button
            key={i}
            role="menuitem"
            onClick={() => {
              set(null);
              x.run();
            }}
          >
            {x.label}
          </button>
        ))}
      </div>,
      document.body,
    )
  );
}
