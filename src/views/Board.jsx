import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  PanelsTopLeft,
  Columns3,
  List,
  Settings2,
  Plus,
  Search,
  SlidersHorizontal,
  Clock3,
  Flag,
  ChevronDown,
  FolderClosed,
  UsersRound,
  Signal,
  GripVertical,
  ArrowRight,
} from 'lucide-react';
import {
  allows,
  level,
  isAdmin,
  ticketKey,
  fieldText,
  empty,
} from '../../functions/core/model.mjs';
import {
  Avatar,
  Btn,
  IconButton,
  Empty,
  ErrorText,
  humanError,
} from '../ui.jsx';
const Ticket = lazy(() => import('./Ticket.jsx')),
  Config = lazy(() => import('./BoardConfig.jsx'));
function TicketCard({ t, board, members, open, canMove }) {
  const fields = board.fields.filter(
      (f) => f.enabled && f.card && !empty(t.values[f.key]),
    ),
    has = (k) => fields.some((f) => f.key === k);
  const person = members.find((m) => m.id === t.values.assignee);
  return (
    <button
      type="button"
      className="ticket-card"
      draggable={canMove}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', t.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => open(t)}
    >
      <div className="card-top">
        <span className="key">{ticketKey(board, t)}</span>
        {has('priority') && (
          <span className={'priority ' + t.values.priority}>
            <i />
            {fieldText(
              fields.find((f) => f.key === 'priority'),
              t.values.priority,
            )}
          </span>
        )}
      </div>
      <h3>{t.values.title}</h3>
      <div className="card-tags">
        {fields
          .filter(
            (f) =>
              !['title', 'assignee', 'estimate', 'priority'].includes(f.key),
          )
          .map((f) => (
            <span
              className={
                'chip ' +
                (f.key === 'type' ? 'type-' + t.values.type : 'neutral')
              }
              key={f.key}
              title={f.label}
            >
              {fieldText(f, t.values[f.key], members)}
            </span>
          ))}
      </div>
      {(has('assignee') || has('estimate')) && (
        <div className="card-bottom">
          {has('assignee') ? (
            <span className="card-person">
              <Avatar person={person} small />
              {person?.name.split(' ')[0] || 'Former member'}
            </span>
          ) : (
            <span />
          )}
          {has('estimate') && (
            <span className="hours">
              <Clock3 size={12} />
              {t.values.estimate}h
            </span>
          )}
        </div>
      )}
    </button>
  );
}
export default function Board({
  api,
  board,
  me,
  members,
  choose,
  newBoard,
  consumeNew,
  jump,
  clearJump,
  tell,
}) {
  const [viewers, setViewers] = useState([]);
  useEffect(
    () => board && api.boardPresence(board.id, setViewers, tell),
    [api, board?.id],
  );
  const [tickets, setTickets] = useState([]),
    [limit, setLimit] = useState(80),
    [mode, setMode] = useState(board?.page?.view || 'board'),
    [search, setSearch] = useState(''),
    [priority, setPriority] = useState(''),
    [person, setPerson] = useState(''),
    [due, setDue] = useState(''),
    [fields, setFields] = useState({}),
    [filter, filters] = useState(false),
    [config, setConfig] = useState(''),
    [ticket, edit] = useState(null),
    [hover, over] = useState(''),
    [err, error] = useState('');
  useEffect(() => {
    if (newBoard) {
      setConfig('new');
      consumeNew();
    }
  }, [newBoard]);
  useEffect(() => {
    if (!board) return;
    return api.watchBoard(board.id, limit, setTickets, (e) => {
      setTickets([]);
      error(humanError(e));
    });
  }, [api, board?.id, limit]);
  useEffect(() => {
    if (
      board &&
      tickets.length &&
      !performance.getEntriesByName('workspace-board-ready').length
    )
      performance.mark('workspace-board-ready');
  }, [board, tickets.length]);
  useEffect(() => {
    let alive = true;
    if (jump && board) {
      api
        .command('ticket.detail', { board: board.id, ticket: jump })
        .then((t) => {
          if (alive) edit({ t });
        })
        .catch(tell)
        .finally(() => {
          if (alive) clearJump();
        });
    }
    return () => {
      alive = false;
    };
  }, [api, jump, board?.id]);
  useEffect(() => setMode(board?.page?.view || 'board'), [board?.page?.view]);
  const role = board && level(board, me),
    canMove = board && allows(role, board.policy.move),
    canCreate = board && allows(role, board.policy.create);
  const today=new Date();
  const day = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const week=new Date(today);week.setDate(week.getDate()+7);
  useEffect(() => {
    const enabled = new Set(
      (board?.fields || []).filter((f) => f.enabled).map((f) => f.key),
    );
    if (!enabled.has('priority')) setPriority('');
    if (!enabled.has('assignee')) setPerson('');
    if (!enabled.has('due')) setDue('');
    setFields((old) =>
      Object.fromEntries(
        Object.entries(old).filter(([key]) => enabled.has(key)),
      ),
    );
  }, [board?.rev]);
  const filtering=!!(priority || person || due || Object.values(fields).some(Boolean));
  const visible = tickets.filter(
    (t) =>
      Object.entries(fields).every(([key, value]) => !value || (Array.isArray(t.values[key]) ? t.values[key].includes(value) : t.values[key] === value)) &&
      (!priority || t.values.priority === priority) &&
      (!due || (due === 'unset' ? !t.values.due : t.values.due && (due === 'late' ? t.values.due < day(today) : t.values.due >= day(today) && t.values.due <= day(week)))) &&
      (!person || (person === '_unassigned' ? !t.values.assignee : t.values.assignee === person)) &&
      (!search ||
        [
          ticketKey(board, t),
          ...board.fields
            .filter((f) => f.enabled)
            .map((f) => fieldText(f, t.values[f.key], members)),
        ]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const total = Object.values(board?.counts || {}).reduce((a, b) => a + b, 0),
    people = members.filter((m) => m.active && board?.memberIds.includes(m.id));
  const move = async (e, col) => {
    e.preventDefault();
    over('');
    const t = tickets.find(
      (t) => t.id === e.dataTransfer.getData('text/plain'),
    );
    if (!t || t.column === col || !canMove) return;
    try {
      await api.command('ticket.save', {
        board: board.id,
        id: t.id,
        rev: t.rev,
        column: col,
      });
    } catch (e) {
      tell(e);
    }
  };
  return (
    <>
      {board ? (
        <div
          className={
            'board-page' + (board.page?.compact ? ' compact-board' : '')
          }
          style={
            board.page?.tint
              ? {
                  '--header-tint': {
                    green: '#50a876',
                    blue: '#438fd2',
                    rose: '#ca6782',
                    gold: '#cda644',
                    violet: '#9571ce',
                    teal: '#3caba2',
                    slate: '#8793a2',
                    orange: '#d18c50',
                  }[board.color],
                }
              : undefined
          }
        >
          <div className="board-heading">
            <div>
              <div className="eyebrow">
                <FolderClosed size={12} />
                {board.project}
              </div>
              <h1>{board.name}</h1>
              {board.page?.description !== false && board.description && (
                <p>{board.description}</p>
              )}
            </div>
            <div className="board-actions">
              {role === 'admin' && (
                <Btn icon={Settings2} onClick={() => setConfig('edit')}>
                  Board settings
                </Btn>
              )}
              {canCreate && (
                <Btn
                  kind="primary"
                  icon={Plus}
                  onClick={() => edit({ column: board.columns[0].id })}
                >
                  New ticket
                </Btn>
              )}
            </div>
          </div>
          <div className="board-meta">
            <div
              className="board-here"
              aria-label="Currently viewing this board"
            >
              <Signal size={15} />
              <strong>Here now</strong>
              {viewers.map((uid) => {
                const m = members.find((p) => p.id === uid);
                return (
                  m && (
                    <span key={uid}>
                      <Avatar person={m} small />
                      {m.name}
                    </span>
                  )
                );
              })}
            </div>

            <span>
              {people.length} member{people.length !== 1 ? 's' : ''}
            </span>
            <i />
            <span>
              {total} ticket{total !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="board-toolbar">
            <div className="view-switch">
              <button
                className={mode === 'board' ? 'on' : ''}
                onClick={() => setMode('board')}
              >
                <Columns3 size={15} />
                Board
              </button>
              <button
                className={mode === 'list' ? 'on' : ''}
                onClick={() => setMode('list')}
              >
                <List size={16} />
                List
              </button>
            </div>
            <div className="tools">
              <label className="search">
                <Search size={15} />
                <input
                  aria-label="Search tickets"
                  placeholder={
                    total > tickets.length
                      ? 'Search loaded tickets…'
                      : 'Search tickets…'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                className={'btn ' + (filtering ? 'tinted' : '')}
                onClick={() => filters(!filter)}
              >
                <SlidersHorizontal size={15} />
                Filter{filtering && ' •'}
              </button>
            </div>
          </div>
          {filter && (
            <div className="filter-row">
              {board.fields.some((f) => f.enabled && f.key === 'priority') && (
                <label>
                  Priority{' '}
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="">All priorities</option>
                    {board.fields
                      .find((f) => f.key === 'priority')
                      ?.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {board.fields.some((f) => f.enabled && f.key === 'assignee') && (
                <label>
                  Assignee{' '}
                  <select
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                  >
                    <option value="">All members</option>
                    <option value="_unassigned">Unassigned</option>
                    {people.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {board.fields.some((f) => f.enabled && f.key === 'due') && (
                <label>
                  Due date
                  <select value={due} onChange={(e) => setDue(e.target.value)}>
                    <option value="">Any date</option>
                    <option value="late">Overdue</option>
                    <option value="week">Next seven days</option>
                    <option value="unset">No due date</option>
                  </select>
                </label>
              )}
              {board.fields
                .filter(
                  (f) =>
                    f.enabled && f.key !== 'priority' && f.options?.length > 0,
                )
                .map((f) => (
                  <label key={f.key}>
                    {f.label}
                    <select
                      aria-label={f.label}
                      value={fields[f.key] || ''}
                      onChange={(e) =>
                        setFields({ ...fields, [f.key]: e.target.value })
                      }
                    >
                      <option value="">All</option>
                      {f.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              <button
                className="text-btn"
                onClick={() => {
                  setDue('');
                  setFields({});
                  setPerson('');
                  setPriority('');
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          <ErrorText error={err} />
          {mode === 'board' ? (
            <div className="kanban">
              {board.columns.map((col) => {
                const items = visible.filter((t) => t.column === col.id);
                return (
                  <section
                    key={col.id}
                    className={'lane ' + (hover === col.id ? 'dragging' : '')}
                    onDragOver={(e) => {
                      if (canMove) {
                        e.preventDefault();
                        over(col.id);
                      }
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) over('');
                    }}
                    onDrop={(e) => move(e, col.id)}
                  >
                    <header>
                      <i className={'dot ' + col.color} />
                      <h2>{col.name}</h2>
                      <span className="count">
                        {search || filtering
                          ? items.length
                          : board.counts[col.id] || 0}
                      </span>
                      {canCreate && (
                        <IconButton
                          label={'Add ticket to ' + col.name}
                          icon={Plus}
                          onClick={() => edit({ column: col.id })}
                        />
                      )}
                    </header>
                    <div className="lane-cards">
                      {items.map((t) => (
                        <TicketCard
                          key={t.id}
                          {...{ t, board, members, canMove }}
                          open={(t) => edit({ t })}
                        />
                      ))}
                      {!items.length && (
                        <div className="empty-lane">
                          {search || filtering ? 'No matches' : 'No tickets'}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="list-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Column</th>
                    {board.fields
                      .filter((f) => f.key !== 'title' && f.enabled && f.card)
                      .map((f) => (
                        <th key={f.key}>{f.label}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <button
                          className="table-ticket"
                          onClick={() => edit({ t })}
                        >
                          <span className="key">{ticketKey(board, t)}</span>
                          {t.values.title}
                        </button>
                      </td>
                      <td>
                        {board.columns.find((c) => c.id === t.column)?.name}
                      </td>
                      {board.fields
                        .filter((f) => f.key !== 'title' && f.enabled && f.card)
                        .map((f) => (
                          <td key={f.key}>
                            {fieldText(f, t.values[f.key], members) || '—'}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && <Empty>No tickets match this view.</Empty>}
            </div>
          )}
          {tickets.length < total && (
            <div className="load-board">
              <Btn onClick={() => setLimit((n) => n + 80)}>
                Load more tickets ({tickets.length} of {total})
              </Btn>
            </div>
          )}
        </div>
      ) : (
        <div className="page">
          <h1>Project boards</h1>
          <Empty>
            {isAdmin(me)
              ? 'Create your first project board.'
              : 'An admin can assign you to a board.'}
          </Empty>
          {isAdmin(me) && (
            <Btn icon={Plus} kind="primary" onClick={() => setConfig('new')}>
              Create board
            </Btn>
          )}
        </div>
      )}
      <Suspense fallback={null}>
        {config && (
          <Config
            {...{ api, me, members, board: config === 'new' ? null : board }}
            onClose={() => setConfig('')}
            onDeleted={() => {
              setConfig('');
              choose('');
              tell('Board deleted.');
            }}
            onSaved={(k) => {
              setConfig('');
              choose(k);
              tell('Board saved.');
            }}
          />
        )}
        {ticket && board && (
          <Ticket
            {...{ api, board, members, me, tickets }}
            initial={ticket.t}
            column={ticket.column}
            onClose={() => edit(null)}
            onOpen={(t) => edit({ t })}
            tell={tell}
            key={ticket.t?.id || 'new'}
          />
        )}
      </Suspense>
    </>
  );
}
