import {Access,FolderPicker} from './Sharing.jsx';
import React, { useState } from 'react';
import {
  Plus,
  Folder,
  FileText,
  Link2,
  Download,
  Settings2,
  Search,
  ChevronRight,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { isAdmin, newId, aclAllows } from '../../functions/core/model.mjs';
import {
  Btn,
  IconButton,
  Modal,
  Label,
  Check,
  Tabs,
  Empty,
  ErrorText,
  More,
  usePages,
  useJob,
  openLink,
  saveFile,
} from '../ui.jsx';
const names = { docs: 'Documentation', drive: 'Drive', links: 'Apps & links' };
function Editor({
  api,
  area,
  folder,
  scope,
  initial,
  members,
  saved,
  onClose,
  canManage,
}) {
  const [v, set] = useState(
      () =>
        initial || {
          id: newId('r'),
          name: '',
          url: '',
          description: '',
          area,
          folder,
          kind: area === 'drive' ? (canManage ? 'folder' : 'file') : 'link',
          category: '',
          tags: '',
          acl: { everyone: true, roles: [], users: [], exclude: [] },
        },
    ),
    [file, choose] = useState(null),
    [pct, progress] = useState(0),
    [task, setTask] = useState(null),
    [paused, pause] = useState(false),
    [pending, setPending] = useState(null),
    job = useJob(),
    patch = (o) => set({ ...v, ...o });
  const submit = () =>
    job.run(async () => {
      if (area === 'links') await api.command('links.save', { ...v, scope });
      else {
        if (v.kind === 'file' && !v.ready && !file)
          throw Error('Choose a file to upload.');
        let key = pending || v.id;
        if (!pending && (!initial || canManage)) {
          key = await api.command('library.save', v);
          setPending(key);
        }
        if (v.kind === 'file' && file) {
          await api.upload(
            { kind: 'library', container: 'library', item: key },
            file,
            progress,
            setTask,
          );
        }
      }
      saved();
    });
  return (
    <Modal
      title={
        initial
          ? 'Edit ' + (area === 'links' ? 'link' : 'resource')
          : 'Add ' + (area === 'links' ? 'link' : 'resource')
      }
      onClose={onClose}
    >
      <div className="form-body scroll">
        <Label name="Name">
          <input
            value={v.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Label>
        {area !== 'links' && (
          <Label name="Resource type">
            <select
              disabled={!!initial || !!pending || !canManage}
              value={v.kind}
              onChange={(e) => patch({ kind: e.target.value })}
            >
              {(area === 'drive'
                ? ['folder', 'file', 'link']
                : ['link', 'file', 'folder']
              ).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Label>
        )}
        {(area === 'links' || v.kind === 'link') && (
          <Label name="Address">
            <input
              type="url"
              placeholder="https://"
              value={v.url || ''}
              onChange={(e) => patch({ url: e.target.value })}
            />
          </Label>
        )}
        {area === 'links' ? (
          <Label name="Description">
            <textarea
              value={v.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Label>
        ) : (
          <>
            {v.kind === 'file' && !v.ready && (
              <Label name="File">
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files[0];
                    choose(f);
                    if (f && !v.name) patch({ name: f.name });
                  }}
                />
              </Label>
            )}
            <div className="form-grid">
              <Label name="Category">
                <input
                  value={v.category}
                  onChange={(e) => patch({ category: e.target.value })}
                />
              </Label>
              <Label name="Tags">
                <input
                  value={v.tags}
                  onChange={(e) => patch({ tags: e.target.value })}
                />
              </Label>
            </div>
            {canManage && initial && <><FolderPicker {...{api,area}} action="library.list" current={v.folder} exclude={v.id}
              change={(folder,location) => patch({folder,location})}/>{v.location && <small>Location · {v.location}</small>}</>}
            {canManage && v.folder && <Check checked={!!v.independent}
              onChange={e => patch({independent:e.target.checked,...(e.target.checked && v.acl.everyone ? {acl:{...v.acl,everyone:false}} : {})})}>
              Set independent access so selected people can open this item without its parent folder
            </Check>}
            {canManage && (
              <Access
                {...{ api, members }}
                acl={v.acl}
                set={(acl) => patch({ acl })}
              />
            )}{' '}
            {canManage && area === 'drive' && v.kind === 'folder' && (
              <Access
                {...{ api, members }}
                title="Who can upload here"
                acl={
                  v.uploadAcl || {
                    everyone: false,
                    roles: [],
                    users: [],
                    exclude: [],
                  }
                }
                set={(uploadAcl) => patch({ uploadAcl })}
              />
            )}
          </>
        )}
        {job.busy && file && (
          <div className="row">
            <progress value={pct} max={100} />
            {pct}%
            {task && (
              <Btn
                onClick={() => {
                  paused ? task.resume() : task.pause();
                  pause(!paused);
                }}
              >
                {paused ? 'Resume' : 'Pause'}
              </Btn>
            )}
          </div>
        )}
        <ErrorText error={job.error} />
      </div>
      <footer>
        <Btn onClick={onClose} disabled={job.busy}>
          Close
        </Btn>
        <Btn kind="primary" disabled={job.busy} onClick={submit}>
          Save
        </Btn>
      </footer>
    </Modal>
  );
}
export default function Resources({ api, me, members, area }) {
  const [scope, setScope] = useState('company'),
    [folders, path] = useState([]),
    [search, find] = useState(''),
    [query, apply] = useState(''),
    [editing, edit] = useState(undefined),
    [remove, confirm] = useState(null),
    job = useJob();
  const folder = folders.at(-1)?.id || '',
    links = area === 'links',
    page = usePages(
      api,
      links ? 'links.list' : 'library.list',
      links ? { scope } : { area, folder, search: query },
    ),
    canEdit = isAdmin(me) || (links && scope === 'personal'),
    canUpload = area === 'drive' && aclAllows(folders.at(-1)?.uploadAcl, me);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Resources</div>
          <h1>{names[area]}</h1>
        </div>
        {(canEdit || canUpload) && (
          <Btn kind="primary" icon={Plus} onClick={() => edit(null)}>
            {links ? 'Add link' : canEdit ? 'Add resource' : 'Upload file'}
          </Btn>
        )}
      </div>
      {links ? (
        <Tabs
          values={[
            ['company', 'Company'],
            ['personal', 'Personal'],
          ]}
          value={scope}
          onChange={setScope}
        />
      ) : (
        <div className="section-line">
          <div className="row">
            <button
              className="text-btn"
              onClick={() => {
                path([]);
                find('');
                apply('');
              }}
            >
              {names[area]}
            </button>
            {folders.map((f, i) => (
              <React.Fragment key={f.id}>
                <ChevronRight size={13} />
                <button
                  className="text-btn"
                  onClick={() => path(folders.slice(0, i + 1))}
                >
                  {f.name}
                </button>
              </React.Fragment>
            ))}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              apply(search);
            }}
          >
            <label className="search">
              <Search size={15} />
              <input
                aria-label="Search resources"
                value={search}
                placeholder="Name, category, or tag…"
                onChange={(e) => {
                  find(e.target.value);
                  if (!e.target.value) apply('');
                }}
              />
            </label>
            <button className="btn">Search</button>
          </form>
        </div>
      )}
      <div className="panel">
        {[...page.items].sort((a,b) => Number(b.kind === 'folder')-Number(a.kind === 'folder') || a.name.localeCompare(b.name)).map((n) => {
          const I =
            n.kind === 'folder' ? Folder : n.kind === 'file' ? FileText : Link2;
          const open = () =>
            job.run(async () => {
              if (n.kind === 'folder') {
                path([
                  ...folders,
                  { id: n.id, name: n.name, uploadAcl: n.uploadAcl },
                ]);
                find('');
                apply('');
              } else if (n.kind === 'file') {
                if (n.ready) await saveFile(api, n.file, n.name);
                else edit(n);
              } else await openLink(n.url);
            });
          return (
            <div className="resource-row" key={n.id}>
              <span className="resource-icon">
                <I size={19} />
              </span>
              <button className="resource-name" onClick={open}>
                <strong>{n.name}</strong>
                <small>
                  {n.description ||
                    [n.category, n.tags].filter(Boolean).join(' · ') ||
                    n.url ||
                    n.kind}
                  {n.kind === 'file' && !n.ready ? ' · Awaiting upload' : ''}
                </small>
              </button>
              {canEdit && (
                <IconButton
                  icon={Settings2}
                  label={'Edit ' + n.name}
                  onClick={() => edit(n)}
                />
              )}{' '}
              {links && canEdit && (
                <IconButton
                  icon={Trash2}
                  label={'Remove ' + n.name}
                  onClick={() => confirm(n)}
                />
              )}
              <IconButton
                icon={
                  n.kind === 'file'
                    ? Download
                    : n.kind === 'folder'
                      ? ChevronRight
                      : ExternalLink
                }
                label={'Open ' + n.name}
                onClick={open}
              />
            </div>
          );
        })}
        {!page.items.length && !page.loading && (
          <Empty>
            {query
              ? 'No matching resources.'
              : links
                ? 'No links in this collection.'
                : 'This folder is empty.'}
          </Empty>
        )}
        <More page={page} />
        <ErrorText error={job.error} />
      </div>
      {editing !== undefined && (
        <Editor
          {...{ api, area, folder, scope, members }}
          canManage={canEdit}
          initial={editing}
          onClose={() => edit(undefined)}
          saved={() => {
            edit(undefined);
            page.refresh();
          }}
        />
      )}
      {remove && (
        <Modal
          title={'Remove ' + remove.name + '?'}
          onClose={() => confirm(null)}
        >
          <footer>
            <Btn onClick={() => confirm(null)}>Cancel</Btn>
            <Btn
              onClick={() =>
                job.run(async () => {
                  await api.command('links.remove', { id: remove.id, scope });
                  confirm(null);
                  page.refresh();
                })
              }
            >
              Remove link
            </Btn>
          </footer>
        </Modal>
      )}
    </div>
  );
}
