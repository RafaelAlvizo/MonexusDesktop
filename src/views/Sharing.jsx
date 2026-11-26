import React, { useState } from 'react';
import {
  Btn,
  Check,
  ErrorText,
  Label,
  Modal,
  useJob,
  useLoad,
} from '../ui.jsx';
import { newId } from '../../functions/core/model.mjs';

export function PeoplePicker({ label, options, value = [], change }) {
  return (
    <fieldset className="choice-list">
      <legend>{label}</legend>
      {options.map((option) => (
        <Check
          key={option.id}
          checked={value.includes(option.id)}
          onChange={(e) =>
            change(
              e.target.checked
                ? [...value, option.id]
                : value.filter((id) => id !== option.id),
            )
          }
        >
          {option.name}
        </Check>
      ))}
      {!options.length && <small>None available</small>}
    </fieldset>
  );
}
const blankAcl = () => ({
  everyone: false,
  roles: [],
  groups: [],
  users: [],
  exclude: [],
});
function preset(acl, uid) {
  if (acl.everyone) return 'everyone';
  const { roles = [], users = [], groups = [] } = acl;
  if (
    !users.length &&
    !groups.length &&
    roles.length === 2 &&
    roles.includes('owner') &&
    roles.includes('admin')
  )
    return 'admins';
  if (users.length === 1 && users[0] === uid && !groups.length && !roles.length)
    return 'me';
  return 'selected';
}
export function accessSummary(item, uid) {
  if (!item.acl) return 'Reference grants';
  const acl = item.acl,
    mode = preset(acl, uid);
  if (acl.exclude?.length) return 'Custom access';
  if (mode === 'everyone')
    return item.folder && !item.independent ? 'Folder access' : 'Everyone';
  if (mode === 'admins') return 'Admins only';
  if (mode === 'me') return 'Only me';
  return 'Selected people & roles';
}
export function Access({
  api,
  acl,
  set,
  members,
  title = 'Who can view',
  folder = false,
  independent = false,
}) {
  const groups = useLoad(() => api.command('roles.list'), [api]),
    [search, find] = useState('');
  const [custom, setCustom] = useState(false);
  const mode = custom ? 'selected' : preset(acl, api.uid);
  const candidates = members.filter(
    (m) => m.active && m.name.toLowerCase().includes(search.toLowerCase()),
  );
  function choose(v) {
    const next = { ...blankAcl(), exclude: acl.exclude || [] };
    setCustom(v === 'selected');
    if (v === 'everyone') next.everyone = true;
    if (v === 'admins') next.roles = ['owner', 'admin'];
    if (v === 'me') next.users = [api.uid];
    if (v === 'selected') {
      next.roles = acl.roles || [];
      next.users = acl.users || [];
      next.groups = acl.groups || [];
    }
    set(next);
  }
  return (
    <section className="access-control">
      <Label name={title}>
        <select value={mode} onChange={(e) => choose(e.target.value)}>
          <option value="everyone">
            {folder && !independent
              ? 'Everyone with folder access'
              : 'Everyone in the workspace'}
          </option>
          <option value="admins">Admins only</option>
          <option value="me">Only me</option>
          <option value="selected">Specific people or roles</option>
        </select>
      </Label>
      {mode === 'selected' && (
        <div className="access-pickers">
          <PeoplePicker
            label="Team roles"
            options={groups.data || []}
            value={acl.groups}
            change={(groups) => set({ ...acl, groups })}
          />
          <input
            type="search"
            aria-label="Find people"
            placeholder="Find people…"
            value={search}
            onChange={(e) => find(e.target.value)}
          />
          <PeoplePicker
            label="People"
            options={candidates}
            value={acl.users}
            change={(users) => set({ ...acl, users })}
          />
          <details>
            <summary>Workspace roles</summary>
            <PeoplePicker
              label="Include roles"
              options={['owner', 'admin', 'member'].map((id) => ({
                id,
                name: id,
              }))}
              value={acl.roles}
              change={(roles) => set({ ...acl, roles })}
            />
          </details>
          <ErrorText error={groups.error} />
        </div>
      )}
      <details>
        <summary>
          Exclude people
          {acl.exclude?.length ? ' (' + acl.exclude.length + ')' : ''}
        </summary>
        <PeoplePicker
          label="Always exclude"
          options={members.filter((m) => m.active)}
          value={acl.exclude}
          change={(exclude) => set({ ...acl, exclude })}
        />
      </details>
    </section>
  );
}
export function ViewAccess({
  api,
  members,
  value,
  change,
  allowIndependent = true,
}) {
  return (
    <>
      <Access
        {...{ api, members }}
        folder={!!value.folder}
        independent={value.independent}
        acl={value.acl}
        set={(acl) => change({ acl })}
      />
      {!!value.folder && (
        <div className="inheritance">
          {allowIndependent && (
            <Check
              checked={!!value.independent}
              onChange={(e) => change({ independent: e.target.checked })}
            >
              Grant access outside the parent folder
            </Check>
          )}
          <small>
            {value.independent
              ? 'Selected viewers can open this item even when its parent folder is hidden.'
              : 'Viewers also need access to the parent folder.'}
          </small>
        </div>
      )}
    </>
  );
}
export function Permissions({
  api,
  me,
  members,
  item,
  vault = false,
  close,
  saved,
  allowIndependent = true,
}) {
  const [v, set] = useState({
      ...item,
      acl: item.acl || { ...blankAcl(), users: [me.id] },
    }),
    job = useJob();
  const patch = (o) => set((prev) => ({ ...prev, ...o }));
  return (
    <Modal
      title="Permissions"
      subtitle={item.name}
      onClose={() => {
        if (!job.busy) close();
      }}
    >
      <div className="form-body scroll">
        {vault && !item.acl && (
          <p>Saving replaces the existing reference grants for this item.</p>
        )}
        <ViewAccess
          {...{ api, members, allowIndependent }}
          value={v}
          change={patch}
        />
        {item.area === 'drive' && item.kind === 'folder' && (
          <details>
            <summary>Who can upload to this folder</summary>
            <Access
              {...{ api, members }}
              title="Additional upload access"
              folder
              acl={v.uploadAcl || blankAcl()}
              set={(uploadAcl) => patch({ uploadAcl })}
            />
            <small>Workspace admins can upload to managed folders.</small>
          </details>
        )}
        <ErrorText error={job.error} />
      </div>
      <footer>
        <Btn onClick={close} disabled={job.busy}>
          Cancel
        </Btn>
        <Btn
          kind="primary"
          disabled={job.busy}
          onClick={() =>
            job.run(async () => {
              await api.command(
                vault ? 'vault.permissions' : 'library.access',
                {
                  id: item.id,
                  rev: item.rev || 0,
                  acl: v.acl,
                  independent: !!v.independent,
                  folder: item.folder || '',
                  ...(v.uploadAcl ? { uploadAcl: v.uploadAcl } : {}),
                },
              );
              saved();
            })
          }
        >
          Save permissions
        </Btn>
      </footer>
    </Modal>
  );
}
export function Roles({ api, members }) {
  const groups = useLoad(() => api.command('roles.list'), [api]),
    [edit, set] = useState(null),
    job = useJob();
  return (
    <>
      <div className="section-line">
        <h2>Team roles</h2>
        <Btn
          kind="primary"
          onClick={() => set({ id: newId('role'), name: '', users: [] })}
        >
          Create role
        </Btn>
      </div>
      {groups.data?.map((g) => (
        <button className="resource-row" key={g.id} onClick={() => set(g)}>
          <strong>{g.name}</strong>
          <small>{g.users.length} members</small>
        </button>
      ))}
      <ErrorText error={groups.error} />
      {edit && (
        <Modal title="Team role" onClose={() => set(null)}>
          <div className="form-body scroll">
            <Label name="Role name">
              <input
                autoFocus
                value={edit.name}
                onChange={(e) => set({ ...edit, name: e.target.value })}
              />
            </Label>
            <PeoplePicker
              label="Assign members"
              options={members.filter((m) => m.active)}
              value={edit.users}
              change={(users) => set({ ...edit, users })}
            />
            <ErrorText error={job.error} />
          </div>
          <footer>
            <Btn
              disabled={job.busy || !edit.name.trim()}
              kind="primary"
              onClick={() =>
                job.run(async () => {
                  await api.command('roles.save', edit);
                  set(null);
                  groups.refresh();
                })
              }
            >
              Save role
            </Btn>
          </footer>
        </Modal>
      )}
    </>
  );
}

export function FolderPicker({ api, action, area, current, exclude, change }) {
  const [path, setPath] = useState([]),
    [open, show] = useState(initiallyOpen);
  const folder = path.at(-1)?.id || '';
  const folders = useLoad(async () => {
    if (!open) return [];
    let cursor = null,
      options = [];
    do {
      const page = await api.command(action, {
        ...(area ? { area } : {}),
        folder,
        cursor,
      });
      options.push(
        ...page.items.filter((n) => n.kind === 'folder' && n.id !== exclude),
      );
      cursor = page.next;
    } while (cursor);
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [api, open, folder, area]);
  return (
    <div>
      {!initiallyOpen && (
        <Btn onClick={() => show(!open)}>
          {open ? 'Close folder picker' : 'Change location'}
        </Btn>
      )}
      {open && (
        <div className="panel stack">
          <div className="folder-path">
            <button onClick={() => setPath([])}>Top level</button>
            {path.map((n, i) => (
              <button key={n.id} onClick={() => setPath(path.slice(0, i + 1))}>
                {' '}
                › {n.name}
              </button>
            ))}
          </div>
          {folders.data?.map((n) => (
            <button
              key={n.id}
              className="resource-row"
              onClick={() => setPath([...path, n])}
            >
              {n.name} ›
            </button>
          ))}
          <ErrorText error={folders.error} />
          <Btn
            disabled={folder === current}
            onClick={() => {
              change(folder, path.at(-1)?.name || 'Top level');
              if (!initiallyOpen) show(false);
            }}
          >
            Use this location
          </Btn>
        </div>
      )}
    </div>
  );
}

export function MoveItem({ api, item, vault = false, close, saved }) {
  const job = useJob();
  return (
    <Modal
      title="Move to folder"
      subtitle={item.name}
      onClose={() => {
        if (!job.busy) close();
      }}
    >
      <div className="form-body scroll">
        <FolderPicker
          api={api}
          area={item.area}
          current={item.folder}
          exclude={item.id}
          initiallyOpen
          action={vault ? 'vault.list' : 'library.list'}
          change={(folder) =>
            job.run(async () => {
              await api.command(vault ? 'vault.permissions' : 'library.save', {
                ...item,
                folder,
              });
              saved();
            })
          }
        />
        <ErrorText error={job.error} />
      </div>
    </Modal>
  );
}
