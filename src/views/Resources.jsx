import FileBrowser from './FileBrowser.jsx';
import {
  Permissions,
  MoveItem,
  ViewAccess,
  accessSummary,
} from './Sharing.jsx';
import React, { useState } from 'react';
import {
  Plus,
  Folder,
  Link2,
  Settings2,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import {
  isAdmin,
  newId,
  aclAllows,
  mayContribute,
} from '../../functions/core/model.mjs';
import {
  Btn,
  IconButton,
  Modal,
  Label,
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
  kind,
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
          kind: kind || 'link',
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
          ? 'Edit details'
          : v.kind === 'folder'
            ? 'New folder'
            : v.kind === 'file'
              ? 'Upload file'
              : 'New link'
      }
      onClose={() => {
        if (!job.busy) onClose();
      }}
    >
      <div className="form-body scroll">
        {v.kind === 'file' && !v.ready && (
          <Label name="Choose a file">
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
        <Label name={v.kind === 'folder' ? 'Folder name' : 'Name'}>
          <input
            value={v.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Label>
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
            {canManage && !initial && (
              <details>
                <summary>Permissions · {accessSummary(v, api.uid)}</summary>
                <ViewAccess {...{ api, members }} value={v} change={patch} />
                <small>
                  Admins retain access to items they create unless explicitly
                  excluded.
                </small>
              </details>
            )}
            <details>
              <summary>Category and tags</summary>
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
            </details>
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
        <Btn
          kind="primary"
          disabled={job.busy || !v.name.trim()}
          onClick={submit}
        >
          {initial
            ? 'Save changes'
            : v.kind === 'file'
              ? 'Upload file'
              : v.kind === 'folder'
                ? 'Create folder'
                : 'Save link'}
        </Btn>
      </footer>
    </Modal>
  );
}
export default function Resources({ api, me, members, area, contributions }) {
  const [scope, setScope] = useState(() =>
      sessionStorage.getItem('monexus.links.' + me.id) === 'personal'
        ? 'personal'
        : 'company',
    ),
    [folders, path] = useState(() => {
      try {
        return (
          JSON.parse(
            sessionStorage.getItem('monexus.folders.' + me.id + '.' + area),
          ) || []
        );
      } catch {
        return [];
      }
    }),
    [search, find] = useState(''),
    [kind, setKind] = useState('link'),
    [permission, setPermission] = useState(null),
    [moving, setMoving] = useState(null),
    [editing, edit] = useState(undefined),
    [remove, confirm] = useState(null),
    job = useJob();
  const folder = folders.at(-1)?.id || '',
    links = area === 'links',
    page = usePages(
      api,
      links ? 'links.list' : 'library.list',
      links ? { scope } : { area, folder },
    ),
    canEdit = isAdmin(me) || (links && scope === 'personal'),
    canUpload =
      mayContribute(
        contributions,
        area === 'drive' ? 'drive' : 'docsFiles',
        me,
      ) ||
      (area === 'drive' &&
        !contributions.drive &&
        aclAllows(folders.at(-1)?.uploadAcl, me)),
    canLink = mayContribute(
      contributions,
      area === 'drive' ? 'drive' : 'docs',
      me,
    );
  React.useEffect(() => {
    sessionStorage.setItem(
      'monexus.folders.' + me.id + '.' + area,
      JSON.stringify(
        folders.map(({ id, name, uploadAcl }) => ({ id, name, uploadAcl })),
      ),
    );
  }, [folders, me.id, area]);
  const create = (k) => {
    setKind(k);
    edit(null);
  };
  const finish = () => {
    edit(undefined);
    setPermission(null);
    setMoving(null);
    page.refresh();
  };
  if (!links)
    return (
      <div className="page files-page">
        <div className="page-head">
          <h1>{names[area]}</h1>
        </div>
        <FileBrowser
          name={names[area]}
          uid={me.id}
          path={folders}
          navigate={(p) => {
            path(p);
            find('');
          }}
          search={search}
          onSearch={find}
          items={page.items}
          page={page}
          permissions={setPermission}
          canManage={(n) =>
            canEdit ||
            (canUpload && n.by === me.id && n.kind === 'file' && !n.independent)
          }
          edit={canEdit ? edit : null}
          move={canEdit ? setMoving : null}
          open={(n) =>
            job.run(async () => {
              if (n.kind === 'folder') {
                path([...folders, n]);
                find('');
              } else if (n.kind === 'link') await openLink(n.url);
              else if (n.ready) await saveFile(api, n.file, n.name);
              else edit(n);
            })
          }
          tools={
            <>
              {canUpload && (
                <Btn kind="primary" icon={Plus} onClick={() => create('file')}>
                  Upload file
                </Btn>
              )}
              {(canLink || canEdit) && (
                <>
                  {canEdit && (
                    <Btn icon={Folder} onClick={() => create('folder')}>
                      New folder
                    </Btn>
                  )}
                  {canLink && (
                    <Btn icon={Link2} onClick={() => create('link')}>
                      New link
                    </Btn>
                  )}
                </>
              )}
            </>
          }
        />
        <ErrorText error={job.error} />
        {editing !== undefined && (
          <Editor
            {...{ api, area, folder, scope, members, kind }}
            initial={editing}
            canManage={canEdit}
            onClose={() => edit(undefined)}
            saved={finish}
          />
        )}
        {permission && (
          <Permissions
            {...{ api, me, members }}
            item={permission}
            allowIndependent={canEdit}
            close={() => setPermission(null)}
            saved={finish}
          />
        )}
        {moving && (
          <MoveItem
            api={api}
            item={moving}
            close={() => setMoving(null)}
            saved={finish}
          />
        )}
      </div>
    );
  return (
    <div className="page">
      <div className="page-head">
        <h1>Apps &amp; links</h1>
        {(scope === 'personal' ||
          mayContribute(contributions, 'links', me)) && (
          <Btn kind="primary" icon={Plus} onClick={() => edit(null)}>
            Add link
          </Btn>
        )}
      </div>
      <Tabs
        values={[
          ['company', 'Company'],
          ['personal', 'Personal'],
        ]}
        value={scope}
        onChange={(s) => {
          setScope(s);
          sessionStorage.setItem('monexus.links.' + me.id, s);
        }}
      />
      <div className="panel">
        {page.items.map((n) => (
          <div className="resource-row" key={n.id}>
            <span className="resource-icon">
              <Link2 size={19} />
            </span>
            <button
              className="resource-name"
              onClick={() => job.run(() => openLink(n.url))}
            >
              <strong>{n.name}</strong>
              <small>{n.description || n.url}</small>
            </button>
            {canEdit && (
              <>
                <IconButton
                  icon={Settings2}
                  label={'Edit ' + n.name}
                  onClick={() => edit(n)}
                />
                <IconButton
                  icon={Trash2}
                  label={'Remove ' + n.name}
                  onClick={() => confirm(n)}
                />
              </>
            )}
            <IconButton
              icon={ExternalLink}
              label={'Open ' + n.name}
              onClick={() => job.run(() => openLink(n.url))}
            />
          </div>
        ))}
        {!page.items.length && !page.loading && (
          <Empty>No links in this collection.</Empty>
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
