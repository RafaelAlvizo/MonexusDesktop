import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronRight,
  Ellipsis,
  File,
  FileText,
  Folder,
  Image,
  Link2,
  LockKeyhole,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { IconButton, More } from '../ui.jsx';
import { accessSummary } from './Sharing.jsx';

const typeNames = {
  folder: 'Folder',
  file: 'File',
  link: 'Link',
  upload: 'File',
  text: 'Secure text',
  document: 'Document',
  environment: 'Environment file',
  credential: 'Credential',
};
export default function FileBrowser({
  name,
  path,
  navigate,
  items,
  page,
  uid,
  open,
  permissions,
  canManage = () => false,
  edit,
  move,
  remove,
  canRemove,
  search = '',
  onSearch,
  tools,
}) {
  const [menu, setMenu] = useState(null),
    [order, sort] = useState('name');
  const popup = useRef(null),
    trigger = useRef(null);
  function close(focus = false) {
    setMenu(null);
    if (focus) trigger.current?.focus();
  }
  useEffect(() => {
    if (!menu) return;
    popup.current?.querySelector('button')?.focus();
    function outside(e) {
      if (!popup.current?.contains(e.target)) close();
    }
    function escape(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
    }
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', outside);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', outside);
    };
  }, [menu]);
  useEffect(() => {
    if (search && page.next && !page.loading && !page.error) page.more();
  }, [search, page.next, page.loading, page.error]);
  const list = items
    .filter(
      (n) =>
        !search ||
        [n.name, n.category, n.tags]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.kind === 'folder') - Number(a.kind === 'folder') ||
        (order === 'type'
          ? (typeNames[a.kind] || a.kind).localeCompare(
              typeNames[b.kind] || b.kind,
            )
          : 0) ||
        (order === 'reverse'
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name)),
    );
  function show(e, item, button) {
    e.preventDefault();
    trigger.current = button || e.currentTarget.querySelector('button');
    const rect = e.currentTarget.getBoundingClientRect(),
      atPointer = e.type === 'contextmenu' && (e.clientX || e.clientY);
    setMenu({
      item,
      x: Math.max(
        6,
        Math.min(innerWidth - 208, atPointer ? e.clientX : rect.right - 198),
      ),
      y: Math.max(
        6,
        Math.min(innerHeight - 210, atPointer ? e.clientY : rect.bottom + 3),
      ),
    });
  }
  const action = (title, Icon, fn) => (
    <button
      role="menuitem"
      onClick={() => {
        close(true);
        fn(menu.item);
      }}
    >
      <Icon size={16} />
      {title}
    </button>
  );
  return (
    <section className="file-browser">
      <div className="browser-chrome">
        <nav className="browser-path" aria-label="Folder path">
          <IconButton
            label="Up one folder"
            icon={ArrowUp}
            disabled={!path.length}
            onClick={() => navigate(path.slice(0, -1))}
          />
          <button onClick={() => navigate([])}>{name}</button>
          {path.map((f, i) => (
            <React.Fragment key={f.id}>
              <ChevronRight size={13} />
              <button onClick={() => navigate(path.slice(0, i + 1))}>
                {f.name}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <label className="browser-search">
          <Search size={15} />
          <input
            type="search"
            aria-label="Search files"
            placeholder="Search this location"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="browser-tools">
        <div className="row wrap">{tools}</div>
        <select
          aria-label="Sort items"
          value={order}
          onChange={(e) => sort(e.target.value)}
        >
          <option value="name">Name A–Z</option>
          <option value="reverse">Name Z–A</option>
          <option value="type">File type</option>
        </select>
      </div>
      <div className="file-columns">
        <span>Name</span>
        <span>Type</span>
        <span>Access</span>
        <span />
      </div>
      {list.map((n) => {
        const Icon =
          n.kind === 'folder'
            ? Folder
            : n.kind === 'link'
              ? Link2
              : n.mime?.startsWith('image/')
                ? Image
                : ['text', 'credential', 'environment'].includes(n.kind)
                  ? LockKeyhole
                  : FileText;
        return (
          <div
            key={n.id}
            className="file-row"
            onContextMenu={(e) => show(e, n)}
            onKeyDown={(e) => {
              if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))
                show(e, n);
            }}
          >
            <button className="file-title" onClick={() => open(n)}>
              <span className={'file-symbol ' + n.kind}>
                <Icon size={19} />
              </span>
              <span>
                {n.name}
                {n.kind === 'file' && !n.ready && (
                  <small>Awaiting upload</small>
                )}
              </span>
            </button>
            <span>{typeNames[n.kind] || n.kind}</span>
            <span className="file-access">
              {n.acl
                ? accessSummary(n, uid)
                : n.managed
                  ? 'Shared with you'
                  : 'Reference grants'}
            </span>
            <IconButton
              icon={Ellipsis}
              label={'Actions for ' + n.name}
              onClick={(e) => show(e, n, e.currentTarget)}
            />
          </div>
        );
      })}
      {!list.length && !page.loading && !page.error && (
        <div className="resource-empty">
          {search ? <Search size={28} /> : <Folder size={32} />}
          <h3>{search ? 'No matching items' : 'This location is empty'}</h3>
        </div>
      )}
      <More page={page} />
      {menu && (
        <div
          ref={popup}
          className="file-menu"
          role="menu"
          aria-label={menu.item.name + ' actions'}
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={(e) => {
            const opts = [...e.currentTarget.querySelectorAll('button')],
              i = opts.indexOf(document.activeElement);
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              opts[
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? opts.length - 1
                    : (i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) %
                      opts.length
              ].focus();
            }
            if (e.key === 'Tab') close();
          }}
        >
          {action(
            menu.item.kind === 'file' && menu.item.ready ? 'Download' : 'Open',
            File,
            open,
          )}
          {permissions &&
            canManage(menu.item) &&
            action('Permissions', ShieldCheck, permissions)}
          {edit && action('Edit details', FileText, edit)}
          {move &&
            (menu.item.area || menu.item.acl) &&
            action('Move to folder', Folder, move)}
          {remove && canRemove(menu.item) && action('Delete', Trash2, remove)}
        </div>
      )}
    </section>
  );
}
