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
function GrantForm({ api, target, initial, tell }) {
  const [all, set] = useState(initial.all),
    [collections, cols] = useState(initial.collections.join(', ')),
    [items, ids] = useState(initial.items.join(', ')),
    job = useJob(),
    split = (v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  return (
    <>
      <Check checked={all} onChange={(e) => set(e.target.checked)}>
        Grant all vault items
      </Check>
      <Label name="Collection identifiers (comma separated)">
        <input value={collections} onChange={(e) => cols(e.target.value)} />
      </Label>
      <Label name="Individual item identifiers (comma separated)">
        <input value={items} onChange={(e) => ids(e.target.value)} />
      </Label>
      <Btn
        kind="primary"
        onClick={() =>
          job.run(async () => {
            await api.command('vault.grant', {
              target,
              all,
              collections: split(collections),
              items: split(items),
            });
            tell('Vault grants saved.');
          })
        }
      >
        Save grants
      </Btn>
      <ErrorText error={job.error} />
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
    [add, setAdd] = useState(false),
    [reveal, show] = useState(null),
    page = usePages(api, 'vault.list', {}),
    job = useJob();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Resources</div>
          <h1>Sensitive data</h1>
        </div>
        {me?.role === 'owner' && (
          <Btn icon={Plus} kind="primary" onClick={() => setAdd(true)}>
            Register item
          </Btn>
        )}
      </div>
      {me?.role === 'owner' && (
        <Tabs
          values={['Items', 'Access grants', 'Access log']}
          value={tab}
          onChange={tabs}
        />
      )}
      {tab === 'Items' ? (
        <div className="panel">
          {page.items.map((i) => (
            <div className="resource-row" key={i.id}>
              <span className="resource-icon">
                <Lock size={18} />
              </span>
              <div className="grow">
                <strong>{i.name}</strong>
                <small>
                  {i.collection} · {i.kind}
                  {me?.role === 'owner' ? ' · ' + i.id : ''}
                </small>
              </div>
              <Btn
                icon={i.kind === 'document' ? Download : Eye}
                onClick={() =>
                  job.run(async () => {
                    if (i.kind === 'document') {
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
                  })
                }
              >
                {i.kind === 'document' ? 'Download' : 'Reveal'}
              </Btn>
            </div>
          ))}
          {!page.items.length && !page.loading && (
            <Empty>No vault items available to your account.</Empty>
          )}
          <More page={page} />
          <ErrorText error={job.error} />
        </div>
      ) : tab === 'Access grants' ? (
        <Grants {...{ api, members, tell }} />
      ) : (
        <Audit api={api} />
      )}
      {add && (
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
        <Modal title={reveal.name} onClose={() => show(null)}>
          <div className="form-body">
            <p className="muted">
              Close this window when you finish using the value.
            </p>
            <pre className="secret">{reveal.value}</pre>
          </div>
        </Modal>
      )}
    </div>
  );
}
