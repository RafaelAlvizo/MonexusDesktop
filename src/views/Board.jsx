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
  const [tickets, setTickets] = useState([]),
    [limit, setLimit] = useState(80),
    [mode, setMode] = useState('board'),
    [search, setSearch] = useState(''),
    [priority, setPriority] = useState(''),
    [person, setPerson] = useState(''),
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
  const role = board && level(board, me),
    canMove = board && allows(role, board.policy.move),
    canCreate = board && allows(role, board.policy.create);
  const visible = tickets.filter(
    (t) =>
      (!priority || t.values.priority === priority) &&
      (!person || t.values.assignee === person) &&
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
        <div className="board-page">
          <div className="board-heading">
            <div>
              <div className="eyebrow">
                <FolderClosed size={12} />
                {board.project}
              </div>
              <h1>{board.name}</h1>
              {board.description && <p>{board.description}</p>}
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
            <div className="avatar-stack">
              {people.slice(0, 5).map((m) => (
                <Avatar key={m.id} person={m} small />
              ))}
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
                className={'btn ' + (priority || person ? 'tinted' : '')}
                onClick={() => filters(!filter)}
              >
                <SlidersHorizontal size={15} />
                Filter{(priority || person) && ' •'}
              </button>
            </div>
          </div>
          {filter && (
            <div className="filter-row">
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
              <label>
                Assignee{' '}
                <select
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                >
                  <option value="">All members</option>
                  {people.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="text-btn"
                onClick={() => {
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
                        {search || priority || person
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
                          {search || priority || person
                            ? 'No matches'
                            : 'No tickets'}
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
