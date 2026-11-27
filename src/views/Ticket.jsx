import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Link2,
  ExternalLink,
  X,
  MessageSquare,
  History,
  RotateCw,
} from 'lucide-react';
import {
  allows,
  level,
  ticketKey,
  newId,
  empty,
} from '../../functions/core/model.mjs';
import {
  Btn,
  Modal,
  Label,
  Tabs,
  Check,
  IconButton,
  Attachments,
  Avatar,
  ErrorText,
  useJob,
  usePages,
  More,
  openLink,
} from '../ui.jsx';
function FieldLabel({ group, name, children, ...rest }) {
  const labelId = React.useId();
  if (!group) return <Label name={name} {...rest}>{children}</Label>;
  return <div className="label"><span id={labelId}>{name}</span>
    {React.cloneElement(children, { 'aria-labelledby': labelId })}</div>;
}
function RecordedTime({ board, ticket, 'aria-labelledby': labelId }) {
  const tracking = board.timing,
    epoch = tracking.since ?? board.createdAt;
  const timer =
    ticket?.timer && ticket.timer.epoch === epoch ? ticket.timer : null;
  const since =
    timer?.running ??
    (!timer && ticket?.column === tracking.start && ticket.updatedAt <= epoch
      ? epoch
      : null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (since == null) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [since]);
  const ms = timer?.elapsed ?? (ticket?.values.actual || 0) * 3600000;
  const seconds = Math.floor(
    (ms + (since === null ? 0 : Math.max(0, now - since))) / 1000,
  );
  const duration =
    Math.floor(seconds / 3600) +
    'h ' +
    (Math.floor(seconds / 60) % 60) +
    'm ' +
    (seconds % 60) +
    's';
  const column = (key) => board.columns.find((c) => c.id === key)?.name || key;
  return (
    <div className="recorded-time">
      <output aria-labelledby={labelId}>{duration}</output>
      <small>
        {since !== null
          ? 'Recording until ' + column(tracking.finish)
          : 'Automatic · ' +
            column(tracking.start) +
            ' → ' +
            column(tracking.finish)}
      </small>
    </div>
  );
}
function Input({ f, v, change, disabled, people, 'aria-labelledby': labelId }) {
  const shared = { disabled, required: f.required, 'aria-labelledby': labelId };
  if (f.kind === 'longtext')
    return (
      <textarea
        rows={4}
        {...shared}
        value={v ?? ''}
        onChange={(e) => change(e.target.value)}
      />
    );
  if (f.kind === 'select' || f.kind === 'person')
    return (
      <select
        {...shared}
        value={v ?? ''}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Choose…</option>
        {(f.kind === 'person'
          ? people.map((m) => ({ id: m.id, label: m.name, active: m.active }))
          : f.options
        )
          .filter((o) => o.active || o.id === v)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
              {o.active ? '' : ' (retired)'}
            </option>
          ))}
      </select>
    );
  if (f.kind === 'multi')
    return (
      <details className="choice-menu">
        <summary aria-labelledby={labelId}>
          {f.options.filter(o => v?.includes(o.id)).map(o => o.label).join(', ') || 'Choose options…'}
        </summary>
        <div role="group" aria-labelledby={labelId}>
          {f.options.filter(o => o.active || v?.includes(o.id)).map(o =>
            <label key={o.id}><input type="checkbox" disabled={disabled}
              checked={!!v?.includes(o.id)} onChange={e => change(e.target.checked
                ? [...(v || []), o.id] : v.filter(k => k !== o.id))} />{o.label}{o.active ? '' : ' (retired)'}</label>
          )}
        </div>
      </details>
    );
  if (f.kind === 'check')
    return (
      <input
        type="checkbox"
        disabled={disabled}
        checked={v === true}
        onChange={(e) => change(e.target.checked)}
      />
    );
  return (
    <input
      {...shared}
      type={
        f.kind === 'number'
          ? 'number'
          : ['date', 'url'].includes(f.kind)
            ? f.kind
            : 'text'
      }
      step={f.kind === 'number' ? 'any' : undefined}
      min={['actual', 'estimate'].includes(f.key) ? 0 : undefined}
      value={v ?? ''}
      onChange={(e) =>
        change(
          f.kind === 'number' && e.target.value !== ''
            ? Number(e.target.value)
            : e.target.value,
        )
      }
    />
  );
}
function Discussion({ api, board, t, members, can }) {
  const args = { board: board.id, ticket: t.id },
    page = usePages(api, 'ticket.comments', args),
    [text, set] = useState(''),
    [mention, at] = useState(''),
    job = useJob();
  return (
    <div className="stack">
      {can && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            job.run(async () => {
              await api.command('ticket.comment', {
                ...args,
                text,
                mentions: mention ? [mention] : [],
              });
              set('');
              at('');
              page.refresh();
            });
          }}
        >
          <Label name="New comment">
            <textarea
              required
              value={text}
              onChange={(e) => set(e.target.value)}
            />
          </Label>
          <div className="row spread">
            <select
              aria-label="Mention a teammate"
              value={mention}
              onChange={(e) => at(e.target.value)}
            >
              <option value="">Mention a teammate…</option>
              {members
                .filter((m) => m.active && board.memberIds.includes(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
            <button className="btn primary" disabled={job.busy}>
              Post comment
            </button>
          </div>
        </form>
      )}
      <ErrorText error={job.error} />
      <div className="section-line">
        <h3>Comments</h3>
        <IconButton
          icon={RotateCw}
          label="Refresh comments"
          onClick={page.refresh}
        />
      </div>
      {page.items.map((c) => (
        <article className="post" key={c.id}>
          <strong>
            {members.find((m) => m.id === c.by)?.name || 'Member'}
          </strong>
          <small>{new Date(c.at).toLocaleString()}</small>
          <p>{c.text}</p>
        </article>
      ))}
      {!page.loading && !page.items.length && (
        <p className="muted">No comments yet.</p>
      )}
      <More page={page} />
    </div>
  );
}
function HistoryList({ api, board, t, members }) {
  const page = usePages(api, 'ticket.history', {
    board: board.id,
    ticket: t.id,
  });
  return (
    <>
      {page.items.map((h) => (
        <article className="post" key={h.id}>
          <strong>{h.text}</strong>
          <small>
            {members.find((m) => m.id === h.by)?.name} ·{' '}
            {new Date(h.at).toLocaleString()}
          </small>
        </article>
      ))}
      <More page={page} />
    </>
  );
}
export default function Ticket({
  api,
  board,
  initial,
  column,
  members,
  me,
  tickets,
  onOpen,
  onClose,
  tell,
}) {
  const [t, setTicket] = useState(initial), [saveState, setSaveState] = useState(initial ? 'Saved' : 'Enter a title to start');
  const [tab, setTab] = useState('Details'),
    [vals, setVals] = useState({ ...t?.values }),
    [status, move] = useState(t?.column || column),
    [parent, setParent] = useState(t?.parent || ''),
    [links, setLinks] = useState(t?.links || []),
    job = useJob();
  const role = level(board, me),
    canEdit = allows(role, board.policy[t ? 'edit' : 'create']),
    canMove = t ? allows(role, board.policy.move) : canEdit,
    canAttach = allows(role, board.policy.attach),
    people = members.filter(
      (m) =>
        board.memberIds.includes(m.id) || Object.values(vals).includes(m.id),
    );
  const [parentNumber, setParentNumber] = useState(''),
    [foundParent, setFoundParent] = useState(null);
  const identity = useRef(initial?.id || newId('t'));
  const saved = useRef(initial);
  const queue = useRef(Promise.resolve());
  const draft = {values:vals,column:status,parent,links};
  const signature = JSON.stringify(draft);
  const latest = useRef(draft);
  latest.current = draft;
  const persisted = useRef(signature);
  const [saveError, setSaveError] = useState('');
  function flush() {
    const write = async () => {
      const current = latest.current, key = JSON.stringify(current);
      if (persisted.current === key) return;
      const missing = board.fields.find(f => f.enabled && f.required && empty(current.values[f.key]));
      if (missing) throw Error('Enter ' + missing.label + ' to save this ticket.');
      const prior = saved.current;
      const values = Object.fromEntries(
        Object.entries(current.values).filter(
          ([field, value]) =>
            !(board.timing?.enabled && field === 'actual') &&
            JSON.stringify(value) !== JSON.stringify(prior?.values[field]),
        ),
      );
      setSaveState('Saving…');
      const result = await api.command('ticket.save', { ...current, values, board:board.id,
        id:identity.current, rev:prior?.rev ?? null, returnTicket:true });
      saved.current = typeof result === 'string' ? await api.command('ticket.detail',{board:board.id,ticket:result}) : result;
      persisted.current = key;
      setTicket(saved.current);
      setSaveError('');
      setSaveState('Saved');
    };
    const work = queue.current.catch(() => {}).then(write);
    queue.current = work;
    return work;
  }
  function failed(e) {setSaveError(e.message); setSaveState('Unsaved changes');}
  useEffect(() => {
    if (persisted.current === signature) return;
    setSaveError('');
    setSaveState('Unsaved changes');
    const timer = setTimeout(() => flush().catch(failed), 700);
    return () => clearTimeout(timer);
  }, [signature]);
  const close = async () => {
    try {
      do { await flush(); } while (persisted.current !== JSON.stringify(latest.current));
      onClose();
    } catch(e) {failed(e);}
  };
  return (
    <Modal
      wide
      title={t ? t.values.title : 'New ticket'}
      subtitle={t ? ticketKey(board, t) + '  /  ' + board.name : board.name}
      onClose={close}
    >
      {t && (
        <Tabs
          values={[
            'Details',
            ...(board.features.comments ? ['Comments'] : []),
            'History',
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      <div className="form-body scroll">
        {tab === 'Details' ? (
          <>
            <div className="form-grid ticket-fields">
              {board.fields
                .filter((f) => f.enabled)
                .map((f) => (
                  <FieldLabel
                    group={f.kind === 'multi'}
                    key={f.key}
                    name={f.label + (f.required ? ' *' : '')}
                    wide={
                      ['title', 'longtext'].includes(f.key) ||
                      f.kind === 'longtext'
                    }
                  >
                    {f.key === 'actual' && board.timing?.enabled ? (
                      <RecordedTime board={board} ticket={t} />
                    ) : (
                      <Input
                        f={f}
                        v={vals[f.key]}
                        change={(v) => setVals((s) => ({ ...s, [f.key]: v }))}
                        disabled={!canEdit || !allows(role, f.editRole)}
                        people={people}
                      />
                    )}
                  </FieldLabel>
                ))}
            </div>
            <section className="ticket-workflow">
              <h3>Workflow</h3>
              <div className="form-grid">
                <Label name="Column">
                  <select
                    value={status}
                    disabled={!canMove}
                    onChange={(e) => move(e.target.value)}
                  >
                    {[
                      ...board.columns.filter((c) => c.id !== 'backlog'),
                      ...(['owner', 'admin'].includes(me.role)
                        ? [
                            board.columns.find((c) => c.id === 'backlog') || {
                              id: 'backlog',
                              name: 'Private backlog',
                            },
                          ]
                        : []),
                    ].map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Label>
                {board.features.parents && (
                  <Label name="Parent ticket">
                    <select
                      disabled={!canEdit}
                      value={parent}
                      onChange={(e) => setParent(e.target.value)}
                    >
                      <option value="">No parent</option>
                      {parent && !tickets.some((t) => t.id === parent) && (
                        <option value={parent}>Linked parent</option>
                      )}
                      {tickets
                        .filter((x) => x.id !== t?.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {ticketKey(board, x)} · {x.values.title}
                          </option>
                        ))}
                    </select>
                  </Label>
                )}
              </div>
            </section>
            {board.features.parents &&
              canEdit &&
              Object.values(board.counts).reduce((a, b) => a + b, 0) >
                tickets.length && (
                <div className="row">
                  <Label name="Find older parent by ticket number">
                    <input
                      type="number"
                      min="1"
                      value={parentNumber}
                      onChange={(e) => setParentNumber(e.target.value)}
                    />
                  </Label>
                  <Btn
                    onClick={() =>
                      job.run(async () => {
                        const match = await api.command('ticket.lookup', {
                          board: board.id,
                          seq: Number(parentNumber),
                        });
                        if (match.id === t?.id)
                          throw Error('Choose a different parent ticket.');
                        setParent(match.id);
                        setFoundParent(match);
                      })
                    }
                  >
                    Use as parent
                  </Btn>
                </div>
              )}
            {parent && board.features.parents && (
              <Btn
                onClick={() =>
                  job.run(async () => {
                    await flush();
                    onOpen(
                      await api.command('ticket.detail', {
                        board: board.id,
                        ticket: parent,
                      }),
                    );
                  })
                }
              >
                Open parent ticket
                {foundParent?.id === parent
                  ? ' · ' + foundParent.values.title
                  : ''}
              </Btn>
            )}
            {board.features.links && (
              <section className="attachments">
                <div className="section-line">
                  <h3>
                    <Link2 size={15} /> Links
                  </h3>
                  {canEdit && (
                    <Btn
                      kind="compact"
                      icon={Plus}
                      onClick={() =>
                        setLinks([...links, { label: '', url: '' }])
                      }
                    >
                      Add link
                    </Btn>
                  )}
                </div>
                {links.map((l, i) => (
                  <div className="link-line" key={i}>
                    <input
                      aria-label="Link label"
                      placeholder="Label"
                      disabled={!canEdit}
                      value={l.label}
                      onChange={(e) =>
                        setLinks(
                          links.map((x, n) =>
                            n === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <input
                      aria-label="Link URL"
                      type="url"
                      placeholder="https://"
                      disabled={!canEdit}
                      value={l.url}
                      onChange={(e) =>
                        setLinks(
                          links.map((x, n) =>
                            n === i ? { ...x, url: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <IconButton
                      label="Open link"
                      icon={ExternalLink}
                      onClick={() => job.run(() => openLink(l.url))}
                    />
                    {canEdit && (
                      <IconButton
                        label="Remove link"
                        icon={X}
                        onClick={() =>
                          setLinks(links.filter((_, n) => n !== i))
                        }
                      />
                    )}
                  </div>
                ))}
                {!links.length && <span className="muted">No links yet.</span>}
              </section>
            )}
            {board.features.media &&
              (t ? (
                <Attachments
                  api={api}
                  scope={{ kind: 'ticket', container: board.id, item: t.id }}
                  canAdd={canAttach}
                />
              ) : (
                <p className="muted">
                  Attachments become available when the required fields are
                  filled in.
                </p>
              ))}
            {t && (
              <div className="audit-line">
                Created by{' '}
                {members.find((m) => m.id === t.createdBy)?.name || 'Member'} ·
                Last edited by{' '}
                {members.find((m) => m.id === t.updatedBy)?.name || 'Member'}
              </div>
            )}
          </>
        ) : tab === 'Comments' ? (
          <Discussion
            {...{ api, board, t, members }}
            can={allows(role, board.policy.comment)}
          />
        ) : (
          <HistoryList {...{ api, board, t, members }} />
        )}
        <ErrorText error={job.error} />
      </div>
      <footer>
        <div className="grow" role="status">
          {saveError || saveState}
        </div>
        {saveError && (
          <>
            <Btn onClick={() => flush().catch(failed)}>Retry</Btn>
            <Btn onClick={onClose}>Discard unsaved changes</Btn>
          </>
        )}
        <Btn kind="primary" onClick={close}>
          Done
        </Btn>
      </footer>
    </Modal>
  );
}
