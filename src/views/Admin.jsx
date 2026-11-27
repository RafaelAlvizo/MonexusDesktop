import {Roles} from './Sharing.jsx';
import React, { useState } from 'react';
import { Plus, Settings2, Trash2, ShieldCheck } from 'lucide-react';
import { events, eventNames } from '../../functions/core/model.mjs';
import {
  Btn,
  Label,
  Check,
  Tabs,
  Modal,
  IconButton,
  Avatar,
  ErrorText,
  useJob,
  useLoad,
  openLink,
} from '../ui.jsx';
import { Matrix } from './Preferences.jsx';
function Member({ api, me, initial, onClose, saved }) {
  const [email, set] = useState(initial?.email || ''),
    [role, choose] = useState(initial?.role || 'member'),
    [active, enable] = useState(initial?.active ?? true),
    job = useJob();
  return (
    <Modal
      title={initial ? 'Manage member' : 'Approve member'}
      onClose={onClose}
    >
      <div className="form-body">
        <p className="muted">
          Members register and verify their email before approval.
        </p>
        <Label name="Verified email">
          <input
            type="email"
            value={email}
            disabled={!!initial}
            onChange={(e) => set(e.target.value)}
          />
        </Label>
        <Label name="Workspace role">
          <select value={role} onChange={(e) => choose(e.target.value)}>
            <option value="member">Member</option>
            {me.role === 'owner' && <option value="admin">Admin</option>}
          </select>
        </Label>
        <Check checked={active} onChange={(e) => enable(e.target.checked)}>
          Workspace access enabled
        </Check>
        <ErrorText error={job.error} />
      </div>
      <footer>
        <Btn
          kind="primary"
          disabled={job.busy}
          onClick={() =>
            job.run(async () => {
              await api.command('member.save', { email, active, role });
              saved();
            })
          }
        >
          Save membership
        </Btn>
      </footer>
    </Modal>
  );
}
function PolicyForm({ api, target, initial, tell }) {
  const [v, set] = useState(initial),
    job = useJob();
  return (
    <>
      <Matrix value={v} onChange={set} inherit={!!target} />
      <Btn
        kind="primary"
        disabled={job.busy}
        onClick={() =>
          job.run(async () => {
            await api.command('policy.set', { target, value: v });
            tell('Delivery policy saved.');
          })
        }
      >
        Save policy
      </Btn>
      <ErrorText error={job.error} />
    </>
  );
}
function Policies({ api, members, tell }) {
  const [target, choose] = useState(''),
    value = useLoad(() => api.command('policy.get', { target }), [api, target]);
  return (
    <>
      <Label name="Delivery policy">
        <select value={target} onChange={(e) => choose(e.target.value)}>
          <option value="">Workspace defaults</option>
          {members
            .filter((m) => m.active)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </Label>
      {value.data && (
        <PolicyForm
          key={target}
          {...{ api, target, tell }}
          initial={value.data}
        />
      )}
      <ErrorText error={value.error} />
    </>
  );
}
function RepositoryEvents({ api, repo, tell }) {
  const [selected, setSelected] = useState(repo.events), job = useJob();
  return <section className="field-box stack"><h3>{repo.name}</h3>
    <div className="row wrap">{events.slice(0,5).map(e =>
      <Check key={e} checked={selected.includes(e)} onChange={v => setSelected(v.target.checked
        ? [...selected,e] : selected.filter(k => k !== e))}>{eventNames[e]}</Check>)}</div>
    <div><Btn onClick={() => job.run(async () => {
      await api.command('repositories.events', { repo: repo.repo, installation: repo.installation, events: selected });
      tell('Notification events saved.');
    })} disabled={job.busy}>Save events</Btn></div><ErrorText error={job.error} />
  </section>;
}
function Repositories({ api, initial, tell, refresh }) {
  return <>
    <h2>Repository notifications</h2>
    <p className="muted">Connect the company GitHub App and choose repositories on GitHub. Your teammates receive updates in Monexus using their workspace accounts.</p>
    {initial.url ? <div className="row"><Btn kind="primary" onClick={() => openLink(initial.url)}>Connect on GitHub ↗</Btn>
      <Btn onClick={refresh}>Refresh repositories</Btn></div> :
      <div className="stack"><p className="muted">Register the company GitHub App, then enter its slug and owner ID in the Firebase Functions environment as GITHUB_APP_SLUG and GITHUB_OWNER_ID.</p>
        <div><Btn onClick={() => openLink('https://github.com/settings/apps')}>Open GitHub App settings ↗</Btn></div></div>}
    {initial.repos.length === 0 && <p className="muted">No repositories connected. After choosing repositories on GitHub, return here and refresh.</p>}
    {initial.repos.map(r => <RepositoryEvents key={r.installation + '/' + r.repo} api={api} repo={r} tell={tell} />)}
  </>;
}
function Limits({ api, tell, initial }) {
  const [v, set] = useState(initial.maxMiB),
    job = useJob();
  return (
    <>
      <Label name="Maximum upload size (MiB)">
        <input
          type="number"
          min="1"
          max="5120"
          value={v}
          onChange={(e) => set(e.target.value)}
        />
      </Label>
      <Btn
        kind="primary"
        onClick={() =>
          job.run(async () => {
            await api.command('limits.save', { maxMiB: Number(v) });
            tell('Upload limit saved.');
          })
        }
      >
        Save limit
      </Btn>
      <ErrorText error={job.error} />
    </>
  );
}
export default function Admin({ api, me, members, tell, navigate, onProfile }) {
  const [tab, set] = useState('Members'),
    [edit, choose] = useState(undefined),
    loaded = useLoad(
      () =>
        tab === 'GitHub'
          ? api.command('repositories.connection')
          : tab === 'Uploads'
            ? api.command('limits.get')
            : null,
      [api, tab],
    );
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Administration</h1>
        </div>
        {tab === 'Members' && (
          <Btn kind="primary" icon={Plus} onClick={() => choose(null)}>
            Approve member
          </Btn>
        )}
      </div>
      <Tabs
        values={[
          'Members',
          'Team roles',
          'Access controls',
          'Notification policy',
          'GitHub',
          'Uploads',
        ]}
        value={tab}
        onChange={set}
      />
      <div className="panel stack">
        {tab === 'Members' ? (
          members.map((m) => (
            <div className="resource-row" key={m.id}>
              <button className="person-link" aria-label={'View profile of ' + m.name} onClick={() => onProfile(m)}>
                <Avatar person={m} /></button>
              <button className="person-link grow" onClick={() => onProfile(m)}>
                <strong>{m.name}</strong>
                <small>{m.email}</small>
              </button>
              <span className="chip neutral">
                {m.active ? m.role : 'Disabled'}
              </span>
              {m.id !== me.id &&
                m.role !== 'owner' &&
                (me.role === 'owner' || m.role === 'member') && (
                  <IconButton
                    icon={Settings2}
                    label={'Manage ' + m.name}
                    onClick={() => choose(m)}
                  />
                )}
            </div>
          ))
        ) : tab === 'Team roles' ? <Roles {...{api,members}}/> : tab === 'Access controls' ? (
          [
            [
              'directory',
              'Project boards',
              'Board membership, columns, fields and ticket permissions',
            ],
            [
              'channels',
              'Channels',
              'Visibility, posting, reactions and pins',
            ],
            ['docs', 'Documentation', 'Document and folder visibility'],
            ['drive', 'Drive', 'Folder contributors and file access'],
            ...(me.role === 'owner'
              ? [['vault', 'Sensitive data', 'Vault grants and access log']]
              : []),
          ].map(([route, title, description]) => (
            <button
              key={route}
              className="resource-row"
              onClick={() => navigate(route)}
            >
              <ShieldCheck size={17} />
              <span className="grow">
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))
        ) : tab === 'Notification policy' ? (
          <Policies {...{ api, members, tell }} />
        ) : tab === 'GitHub' && Array.isArray(loaded.data?.repos) ? (
          <Repositories refresh={loaded.refresh} {...{ api, tell }} initial={loaded.data} />
        ) : tab === 'Uploads' && loaded.data?.maxMiB ? (
          <Limits {...{ api, tell }} initial={loaded.data} />
        ) : null}
        <ErrorText error={loaded.error} />
      </div>
      {edit !== undefined && (
        <Member
          {...{ api, me }}
          initial={edit}
          onClose={() => choose(undefined)}
          saved={() => {
            choose(undefined);
            tell('Membership saved.');
          }}
        />
      )}
    </div>
  );
}
