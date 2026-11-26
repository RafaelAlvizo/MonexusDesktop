import FileBrowser from './FileBrowser.jsx';
import {
  Permissions,
  PeoplePicker,
  MoveItem,
  ViewAccess,
  accessSummary,
} from './Sharing.jsx';
import { Folder, Settings2 } from 'lucide-react';
import React, { useState } from 'react';
import { Plus, KeyRound, ShieldCheck, Lock, Eye, Download } from 'lucide-react';
import { newId } from '../../functions/core/model.mjs';
import {
  Btn,
  Modal,
  Label,
  Check,
  Tabs,
  Empty,
  More,
  ErrorText,
  useJob,
  useLoad,
  usePages,
  saveFile,
} from '../ui.jsx';
function Register({ api, saved, onClose }) {
  const [v, set] = useState({
      id: newId('item'),
      name: '',
      collection: '',
      kind: 'credential',
      reference: '',
    }),
    job = useJob();
  const update = (k) => (e) => set({ ...v, [k]: e.target.value });
  return (
    <Modal title="Register vault reference" onClose={onClose}>
      <div className="form-body">
        <Label name="Display name">
          <input value={v.name} onChange={update('name')} />
        </Label>
        <Label name="Collection identifier">
          <input value={v.collection} onChange={update('collection')} />
        </Label>
        <Label name="Item type">
          <select value={v.kind} onChange={update('kind')}>
            <option value="credential">Password or shared account</option>
            <option value="environment">Environment file</option>
            <option value="document">Confidential document</option>
          </select>
        </Label>
        <Label
          name={
            v.kind === 'document'
              ? 'Object path in the private vault bucket'
              : 'Secret Manager version resource name'
          }
        >
          <input
            placeholder={
              v.kind === 'document'
                ? 'vault/contracts/document.pdf'
                : 'projects/PROJECT/secrets/NAME/versions/latest'
            }
            value={v.reference}
            onChange={update('reference')}
          />
        </Label>
        <ErrorText error={job.error} />
      </div>
      <footer>
        <Btn
          kind="primary"
          disabled={job.busy}
          onClick={() =>
            job.run(async () => {
              await api.command('vault.save', v);
              saved();
            })
          }
        >
          Register reference
        </Btn>
      </footer>
    </Modal>
  );
}
function Entry({ api, me, members, folder, kind, onClose, saved }) {
  const [v, set] = useState(() => ({
      id: newId('item'),
      kind,
      name: '',
      text: '',
      folder,
      independent: false,
      acl: {
        everyone: !!folder,
        users: folder ? [] : [me.id],
        roles: [],
        groups: [],
        exclude: [],
      },
    })),
    [file, pick] = useState(null),
    job = useJob(),
    update = (o) => set((current) => ({ ...current, ...o }));
  function chooseFile(f) {
    if (!f) return;
    pick(f);
    update({ kind: 'upload', name: v.name || f.name });
  }
  const save = () =>
    job.run(async () => {
      let content = v.text || '';
      if (v.kind === 'upload') {
        if (!file || file.size > 3 * 1024 * 1024)
          throw Error('Choose a file up to 3 MiB.');
        content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      await api.command('vault.create', {
        id: v.id,
        name: v.name,
        folder: v.folder,
        kind: v.kind,
        rev: v.rev || 0,
        acl: v.acl,
        independent: v.independent,
        content: v.kind === 'folder' ? '' : content,
        mime: file?.type || 'application/octet-stream',
      });
      saved();
    });
  return (
    <Modal
      wide={v.kind === 'text'}
      title={
        v.kind === 'folder'
          ? 'New folder'
          : v.kind === 'upload'
            ? 'Upload sensitive file'
            : 'New secure text'
      }
      onClose={() => {
        if (!job.busy) onClose();
      }}
    >
      <div
        className="form-body scroll"
        onPaste={(e) => {
          if (v.kind !== 'folder' && e.clipboardData.files.length) {
            e.preventDefault();
            chooseFile(e.clipboardData.files[0]);
          }
        }}
      >
        {v.kind === 'upload' && (
          <Label name="Choose a file or paste a screenshot · up to 3 MiB">
            <input
              type="file"
              onChange={(e) => chooseFile(e.target.files[0])}
            />
            {file && <span>{file.name}</span>}
          </Label>
        )}
        <Label name={v.kind === 'folder' ? 'Folder name' : 'Name'}>
          <input
            value={v.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Label>
        {v.kind === 'text' && (
          <Label name="Sensitive text">
            <textarea
              rows={9}
              placeholder="Type here, or paste a screenshot…"
              value={v.text}
              onChange={(e) => update({ text: e.target.value })}
            />
          </Label>
        )}
        <details>
          <summary>Permissions · {accessSummary(v, me.id)}</summary>
          <ViewAccess {...{ api, members }} value={v} change={update} />
        </details>
        <ErrorText error={job.error} />
      </div>
      <footer>
        <Btn disabled={job.busy} onClick={onClose}>
          Cancel
        </Btn>
        <Btn
          kind="primary"
          disabled={job.busy || !v.name.trim()}
          onClick={save}
        >
          {v.kind === 'folder'
            ? 'Create folder'
            : v.kind === 'upload'
              ? 'Upload file'
              : 'Save secure text'}
        </Btn>
      </footer>
    </Modal>
  );
}
function GrantForm({ api, target, initial, tell }) {
  const [grant, set] = useState(initial),
    job = useJob();
  const references = useLoad(async () => {
    const items = [];
    let cursor = null;
    do {
      const page = await api.command('vault.list', { cursor });
      items.push(...page.items.filter((i) => !i.managed && !i.acl));
      cursor = page.next;
    } while (cursor);
    return items;
  }, [api]);
  const refs = references.data || [];
  const collections = [
    ...new Set([...refs.map((i) => i.collection), ...grant.collections]),
  ].filter(Boolean);
  return (
    <>
      <Check
        checked={grant.all}
        onChange={(e) => set({ ...grant, all: e.target.checked })}
      >
        Allow all registered references
      </Check>
      {!grant.all && (
        <>
          <PeoplePicker
            label="Collections"
            options={collections.map((id) => ({ id, name: id }))}
            value={grant.collections}
            change={(collections) => set({ ...grant, collections })}
          />
          <PeoplePicker
            label="Individual references"
            options={refs}
            value={grant.items}
            change={(items) => set({ ...grant, items })}
          />
        </>
      )}
      <Btn
        disabled={job.busy}
        kind="primary"
        onClick={() =>
          job.run(async () => {
            await api.command('vault.grant', { ...grant, target });
            tell('Reference access saved.');
          })
        }
      >
        Save grants
      </Btn>
      <ErrorText error={references.error || job.error} />
    </>
  );
}
function Grants({ api, members, tell }) {
  const [target, set] = useState(api.uid),
    loaded = useLoad(
      () => api.command('vault.grant.get', { target }),
      [api, target],
    );
  return (
    <div className="panel stack">
      <Label name="Member">
        <select value={target} onChange={(e) => set(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Label>
      {loaded.data && (
        <GrantForm
          key={target}
          {...{ api, target, tell }}
          initial={loaded.data}
        />
      )}
      <ErrorText error={loaded.error} />
    </div>
  );
}
function Audit({ api }) {
  const p = usePages(api, 'vault.audit', {});
  return (
    <div className="panel">
      {p.items.map((e, i) => (
        <div className="resource-row" key={i}>
          <span>{new Date(e.at).toLocaleString()}</span>
          <strong>{e.action}</strong>
          <small>
            {e.by} · {e.item || e.target}
          </small>
        </div>
      ))}
      <More page={p} />
    </div>
  );
}
export default function Vault({ api, me, members, tell }) {
  const [tab, tabs] = useState('Items'),
    [add, setAdd] = useState(''),
    [path, setPath] = useState([]),
    [access, editAccess] = useState(null),
    [reveal, show] = useState(null),
    [search, find] = useState(''),
    [moving, setMoving] = useState(null),
    page = usePages(api, 'vault.list', { folder: path.at(-1)?.id || '' }),
    job = useJob();
  React.useEffect(
    () => () => {
      if (reveal?.url) URL.revokeObjectURL(reveal.url);
    },
    [reveal],
  );
  const owner = me.role === 'owner';
  const finish = () => {
    setAdd('');
    editAccess(null);
    setMoving(null);
    page.refresh();
  };
  const open = (i) =>
    job.run(async () => {
      if (i.kind === 'folder') {
        setPath([...path, i]);
        find('');
        return;
      }
      if (
        i.kind === 'upload' &&
        /^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(i.mime)
      ) {
        const blob = await api.vaultRead(i.id);
        show({
          name: i.name,
          url: URL.createObjectURL(blob.slice(0, blob.size, i.mime)),
        });
        return;
      }
      if (['document', 'upload'].includes(i.kind)) {
        await saveFile(
          {
            fileResponse: api.vaultResponse,
            fileBlob: api.vaultRead,
          },
          i.id,
          i.name,
        );
      } else {
        const b = await api.vaultRead(i.id);
        show({ name: i.name, value: await b.text() });
      }
    });
  return (
    <div className="page files-page">
      <div className="page-head">
        <h1>Sensitive data</h1>
        {owner && (
          <Btn onClick={() => setAdd('reference')}>Register reference</Btn>
        )}
      </div>
      {owner && (
        <Tabs
          values={['Items', 'Reference grants', 'Access log']}
          value={tab}
          onChange={tabs}
        />
      )}
      {tab === 'Items' ? (
        <FileBrowser
          name="Sensitive data"
          uid={me.id}
          path={path}
          navigate={(p) => {
            setPath(p);
            find('');
          }}
          search={search}
          onSearch={find}
          items={page.items}
          page={page}
          open={open}
          canManage={() => owner}
          permissions={editAccess}
          move={owner ? setMoving : null}
          tools={
            owner && (
              <>
                <Btn kind="primary" icon={Plus} onClick={() => setAdd('text')}>
                  New secure text
                </Btn>
                <Btn onClick={() => setAdd('upload')}>Upload file</Btn>
                <Btn icon={Folder} onClick={() => setAdd('folder')}>
                  New folder
                </Btn>
              </>
            )
          }
        />
      ) : tab === 'Reference grants' ? (
        <Grants {...{ api, members, tell }} />
      ) : (
        <Audit api={api} />
      )}
      <ErrorText error={job.error} />
      {['text', 'upload', 'folder'].includes(add) && (
        <Entry
          {...{ api, me, members }}
          kind={add}
          folder={path.at(-1)?.id || ''}
          onClose={() => setAdd('')}
          saved={finish}
        />
      )}
      {access && (
        <Permissions
          {...{ api, me, members }}
          vault
          item={access}
          close={() => editAccess(null)}
          saved={finish}
        />
      )}
      {moving && (
        <MoveItem
          api={api}
          vault
          item={moving}
          close={() => setMoving(null)}
          saved={finish}
        />
      )}
      {add === 'reference' && (
        <Register
          api={api}
          onClose={() => setAdd(false)}
          saved={() => {
            setAdd(false);
            page.refresh();
          }}
        />
      )}
      {reveal && (
        <Modal wide title={reveal.name} onClose={() => show(null)}>
          <div className="form-body">
            <p className="muted">
              Close this window when you finish using the value.
            </p>
            {reveal.url ? (
              <img className="vault-image" src={reveal.url} alt={reveal.name} />
            ) : (
              <pre className="secret">{reveal.value}</pre>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
