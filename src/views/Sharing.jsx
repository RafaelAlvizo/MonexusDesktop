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
export function Access({ api, acl, set, members, title = 'Who can view' }) {
  const groups = useLoad(() => api.command('roles.list'), [api]);
  const choices = (label, key, options) => (
    <PeoplePicker
      {...{ label, options }}
      value={acl[key] || []}
      change={(list) => set({ ...acl, [key]: list })}
    />
  );
  return (
    <details className="share-options" open>
      <summary>{title}</summary>
      <Check
        checked={!!acl.everyone}
        onChange={(e) => set({ ...acl, everyone: e.target.checked })}
      >
        Everyone in this workspace
      </Check>
      {!acl.everyone && (
        <>
          {choices('Team roles', 'groups', groups.data || [])}
          {choices(
            'People',
            'users',
            members.filter((m) => m.active),
          )}
          <details>
            <summary>Workspace roles</summary>
            {choices(
              'Workspace roles',
              'roles',
              ['owner', 'admin', 'member'].map((id) => ({ id, name: id })),
            )}
          </details>
        </>
      )}
      <details>
        <summary>
          Exclude people
          {acl.exclude?.length ? ' (' + acl.exclude.length + ')' : ''}
        </summary>
        {choices(
          'Always exclude',
          'exclude',
          members.filter((m) => m.active),
        )}
      </details>
      <ErrorText error={groups.error} />
    </details>
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
    [open, show] = useState(false);
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
      <Btn onClick={() => show(!open)}>
        {open ? 'Close folder picker' : 'Change location'}
      </Btn>
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
              show(false);
            }}
          >
            Use this location
          </Btn>
        </div>
      )}
    </div>
  );
}
