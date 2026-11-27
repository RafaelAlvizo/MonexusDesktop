import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  NotebookPen,
  Folder,
  FolderPlus,
  SquarePen,
  UsersRound,
  Share2,
  Search,
  ChevronLeft,
} from 'lucide-react';
import { newId, mayContribute } from '../../functions/core/model.mjs';
import { Btn, ErrorText, Label, Modal, useJob, useLoad } from '../ui.jsx';
import { quickMenu } from '../Navigation.jsx';
import NoteBody from './NoteBody.jsx';
import { PeoplePicker } from './Sharing.jsx';

// Keep pending writes alive across workspace navigation, scoped to this sign-in session.
const sessions = new WeakMap();
function notebook(api) {
  if (sessions.has(api)) return sessions.get(api);
  const records = new Map(),
    listeners = new Set();
  let snapshot = [],
    generation = 0;
  function notify() {
    snapshot = [...records.values()];
    listeners.forEach((fn) => fn());
  }
  async function reload() {
    const token = ++generation,
      found = new Map(),
      previous = new Map([...records].map(([id, r]) => [id, r.note.rev]));
    let cursor = null;
    do {
      const page = await api.command('notes.list', { cursor });
      page.items.forEach((n) => found.set(n.id, n));
      cursor = page.next;
    } while (cursor);
    if (token !== generation) return;
    for (const [id, r] of records)
      if (
        !found.has(id) &&
        previous.get(id) === r.note.rev &&
        !r.dirty &&
        !r.writing
      )
        records.delete(id);
    for (const [id, n] of found) {
      const r = records.get(id);
      if (!r) records.set(id, { note: n });
      else if (!r.dirty && !r.writing && n.rev >= r.note.rev) r.note = n;
    }
    notify();
  }
  async function flush(r) {
    clearTimeout(r.timer);
    const emptyDraft = !r.note.rev && !r.note.title.trim() && !r.note.body.trim();
    if (r.writing || !r.dirty || emptyDraft)
      return;
    r.writing = true;
    r.error = '';
    notify();
    try {
      while (r.dirty) {
        const sent = r.note;
        const saved = await api.command('notes.save', {
          ...sent,
          title: sent.title || 'Untitled note',
        });
        if (r.note === sent) {
          r.note = saved;
          r.dirty = false;
        } else r.note = { ...r.note, rev: saved.rev };
      }
    } catch (e) {
      r.error = e.message;
    } finally {
      r.writing = false;
      notify();
    }
  }
  const book = {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get: () => snapshot,
    reload,
    add(note) {
      records.set(note.id, { note, dirty: true });
      notify();
    },
    change(id, patch) {
      const r = records.get(id);
      r.note = { ...r.note, ...patch, at: Date.now() };
      r.dirty = true;
      r.error = '';
      clearTimeout(r.timer);
      r.timer = setTimeout(() => flush(r), 650);
      notify();
    },
    flush(id) {
      const r = records.get(id);
      if (r) return flush(r);
    },
    recover(id) {
      const r = records.get(id);
      const copy = {
        ...r.note,
        id: newId('note'),
        title: (r.note.title || 'Untitled note') + ' (copy)',
        shared: [],
        rev: 0,
      };
      records.delete(id);
      book.add(copy);
      book.flush(copy.id);
      return copy.id;
    },
    async remove(id) {
      const r = records.get(id);
      if (!r) return;
      clearTimeout(r.timer);
      while (r.writing) await new Promise((resolve) => setTimeout(resolve, 30));
      if (r.note.rev)
        await api.command('notes.delete', { id, rev: r.note.rev });
      records.delete(id);
      generation++;
      notify();
    },
    dropEmpty(id) {
      const r = records.get(id);
      if (
        r &&
        !r.note.rev &&
        !r.writing &&
        !r.note.title.trim() &&
        !r.note.body.trim()
      ) {
        clearTimeout(r.timer);
        records.delete(id);
        notify();
      }
    },
  };
  sessions.set(api, book);
  return book;
}
function ShareNote({ note, members, close, apply }) {
  const [shared, set] = useState(note.shared),
    [search, find] = useState('');
  return (
    <Modal
      title="Share note"
      subtitle={note.title || 'Untitled note'}
      onClose={close}
    >
      <div className="form-body scroll">
        <b>People with access</b>
        <p>
          {members.find((m) => m.id === note.owner)?.name} (owner)
          {shared.map(
            (id) =>
              ' · ' +
              (members.find((m) => m.id === id)?.name || 'Former member') +
              ' (viewer)',
          )}
        </p>
        <input
          aria-label="Find a teammate"
          type="search"
          placeholder="Find a teammate…"
          value={search}
          onChange={(e) => find(e.target.value)}
        />
        <PeoplePicker
          label="Teammates"
          value={shared}
          change={set}
          options={members.filter(
            (m) =>
              m.active &&
              m.id !== note.owner &&
              m.name.toLowerCase().includes(search.toLowerCase()),
          )}
        />
      </div>
      <footer>
        <Btn onClick={close}>Cancel</Btn>
        <Btn kind="primary" onClick={() => apply(shared)}>
          Apply sharing
        </Btn>
      </footer>
    </Modal>
  );
}
export default function Notes({ api, me, members, contributions, initialNote, initialScope, popOut }) {
  const book = notebook(api),
    records = useSyncExternalStore(book.subscribe, book.get);
  const [scope, setScope] = useState(initialScope === 'shared' ? 'shared' : 'mine'),
    [project, setProject] = useState(''),
    [selected, select] = useState(initialNote || ''),
    [search, find] = useState(''),
    [sort, setSort] = useState('updated'),
    [sharing, share] = useState(false),
    [expanded, expand] = useState(false),
    [deletion, confirm] = useState(null),
    [projectName, createProject] = useState(null),
    [mobile, showEditor] = useState(!!initialNote),
    [loadError, setError] = useState(''),
    [loaded, setLoaded] = useState(false);
  const job = useJob(),
    catalog = useLoad(() => api.command('notes.projects'), [api]),
    titleRef = useRef(null);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      book.reload().then(
        () => {
          if (live) {
            setLoaded(true);
            setError('');
          }
        },
        (e) => {
          if (live) setError(e.message);
        },
      );
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      window.removeEventListener('focus', refresh);
    };
  }, [book]);
  const notes = records.map((r) => r.note),
    mine = notes.filter((n) => n.owner === me.id);
  const projects = [
    ...new Set([
      ...(catalog.data || []),
      ...mine.map((n) => n.project).filter(Boolean),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  const source =
    scope === 'shared' ? notes.filter((n) => n.owner !== me.id) : mine;
  const collection =
    project || (scope === 'shared' ? 'Shared with me' : 'My notes');
  const list = source
    .filter(
      (n) =>
        (!project || n.project === project) &&
        (n.id === selected ||
          (n.title + ' ' + n.body)
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort((a, b) =>
      sort === 'title' ? a.title.localeCompare(b.title) : b.at - a.at,
    );
  const note = list.find((n) => n.id === selected) || list[0],
    record = records.find((r) => r.note.id === note?.id);
  const canCreate = mayContribute(contributions, 'notes', me);
  const owner = note?.owner === me.id;
  useEffect(() => {
    const id = note?.id;
    return () => {
      if (id) {
        book.flush(id);
        book.dropEmpty(id);
      }
    };
  }, [book, note?.id]);
  function choose(s, p = '') {
    setScope(s);
    setProject(p);
    select('');
    find('');
    showEditor(false);
  }
  function compose() {
    if (note && owner && !note.rev && !note.title && !note.body) {
      showEditor(true);
      requestAnimationFrame(() => titleRef.current?.focus());
      return;
    }
    const id = newId('note');
    book.add({
      id,
      owner: me.id,
      title: '',
      body: '',
      project: scope === 'mine' ? project : '',
      at: Date.now(),
      shared: [],
      rev: 0,
    });
    setScope('mine');
    find('');
    select(id);
    showEditor(true);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function sidebarButton(name, Icon, count, active, onClick) {
    return (
      <button
        key={name}
        onContextMenu={(e) =>
          quickMenu(e, [
            { label: 'Open ' + name, run: onClick },
            Icon === Folder && {
              label: 'Delete project',
              run: () => confirm({ project: name }),
            },
          ])
        }
        className={'notebook-location ' + (active ? 'active' : '')}
        onClick={onClick}
      >
        <Icon size={17} />
        <span>{name}</span>
        <small>{count}</small>
      </button>
    );
  }
  return (
    <div
      className={
        'notebook ' + (expanded ? 'expanded ' : '') + (mobile ? 'reading' : '')
      }
    >
      <aside className="notebook-folders">
        <h1>Notes</h1>
        {sidebarButton(
          'My notes',
          NotebookPen,
          mine.length,
          scope === 'mine' && !project,
          () => choose('mine'),
        )}
        {sidebarButton(
          'Shared with me',
          UsersRound,
          notes.length - mine.length,
          scope === 'shared',
          () => choose('shared'),
        )}
        <div className="section-line notebook-section">
          <h2>Projects</h2>
        </div>
        <button
          className="notebook-location new-project"
          disabled={!canCreate}
          onClick={() => createProject('')}
        >
          <FolderPlus size={16} />
          New project
        </button>
        {projects.map((p) =>
          sidebarButton(
            p,
            Folder,
            mine.filter((n) => n.project === p).length,
            project === p,
            () => choose('mine', p),
          ),
        )}
      </aside>
      <section className="notebook-list">
        <div className="section-line">
          <h2>{collection}</h2>
          {project && (
            <Btn onClick={() => confirm({ project })}>Delete project</Btn>
          )}
          <Btn
            kind="primary compact"
            icon={SquarePen}
            disabled={!canCreate}
            onClick={compose}
          >
            New note
          </Btn>
        </div>
        <label className="notebook-search">
          <Search size={15} />
          <input
            aria-label="Search notes"
            placeholder="Search notes"
            value={search}
            onChange={(e) => {
              find(e.target.value);
              select('');
            }}
          />
        </label>
        <div className="note-sort">
          <span>
            {list.length} {list.length === 1 ? 'note' : 'notes'}
          </span>
          <select
            aria-label="Sort notes"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="updated">Last edited</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
        <div className="note-index">
          {list.map((n) => (
            <button
              key={n.id}
              onContextMenu={(e) =>
                quickMenu(e, [
                  {
                    label: 'Open note',
                    run: () => {
                      select(n.id);
                      showEditor(true);
                    },
                  },
                  popOut && n.rev && {
                    label: 'Open note in new window',
                    run: () => popOut('notes', { note: n.id, scope }, n.title || 'Notes'),
                  },
                  n.owner === me.id && {
                    label: 'Share note',
                    run: () => {
                      select(n.id);
                      share(true);
                    },
                  },
                  n.owner === me.id && {
                    label: 'Delete note',
                    run: () => confirm({ id: n.id, title: n.title }),
                  },
                ])
              }
              className={'note-summary ' + (note?.id === n.id ? 'active' : '')}
              onClick={() => {
                select(n.id);
                showEditor(true);
              }}
            >
              <strong>{n.title || 'Untitled note'}</strong>
              <span>{n.body.trim().split('\n')[0] || 'Empty note'}</span>
              <small>
                {new Date(n.at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
                {n.owner === me.id && n.shared.length > 0 && (
                  <span>
                    <UsersRound size={12} /> Shared
                  </span>
                )}
              </small>
            </button>
          ))}
        </div>
        <ErrorText error={loadError || catalog.error} />
        {!list.length && (
          <small>{loaded ? 'No notes here yet.' : 'Loading notes…'}</small>
        )}
      </section>
      <section className="note-sheet">
        {note ? (
          <>
            <div className="note-sheet-tools">
              <Btn onClick={() => expand(!expanded)}>
                {expanded ? 'Show My Notes' : 'Hide My Notes'}
              </Btn>
              {popOut && !!note.rev && <Btn onClick={() => popOut('notes', { note: note.id, scope }, note.title || 'Notes')}>
                Pop out note
              </Btn>}
              {owner && (
                <Btn
                  onClick={() => confirm({ id: note.id, title: note.title })}
                >
                  Delete note
                </Btn>
              )}
              <button className="note-back" onClick={() => showEditor(false)}>
                <ChevronLeft size={16} /> Notes
              </button>
              <span>
                {owner
                  ? record.error
                    ? 'Unsaved changes'
                    : record.writing ||
                        (record.dirty && (note.title || note.body))
                      ? 'Saving…'
                      : note.rev
                        ? 'Saved'
                        : 'New note'
                  : 'Shared by ' +
                    (members.find((m) => m.id === note.owner)?.name ||
                      'a teammate')}
              </span>
              {owner && (
                <Btn
                  icon={Share2}
                  disabled={!note.title.trim() && !note.body.trim()}
                  onClick={() => share(true)}
                >
                  {note.shared.length
                    ? 'Shared · ' + note.shared.length
                    : 'Share'}
                </Btn>
              )}
            </div>
            {note.shared.length > 0 && (
              <small className="note-audience">
                Access ·{' '}
                {[note.owner, ...note.shared]
                  .map(
                    (id) =>
                      members.find((m) => m.id === id)?.name || 'Former member',
                  )
                  .join(', ')}
              </small>
            )}
            {owner ? (
              <div className="note-paper">
                <label className="note-project">
                  <Folder size={15} />
                  <select
                    aria-label="Note project"
                    value={note.project}
                    onChange={(e) => {
                      book.change(note.id, { project: e.target.value });
                      if (project) setProject(e.target.value);
                    }}
                  >
                    <option value="">Unfiled</option>
                    {projects.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <input
                  className="note-title-input"
                  spellCheck={false}
                  autoCorrect="off"
                  autoComplete="off"
                  ref={titleRef}
                  aria-label="Note title"
                  placeholder="Untitled note"
                  maxLength={160}
                  value={note.title}
                  onChange={(e) => {
                    select(note.id);
                    book.change(note.id, { title: e.target.value });
                  }}
                />
                <NoteBody
                  key={note.id}
                  note={note}
                  change={(patch) => book.change(note.id, patch)}
                />
                {record.error && (
                  <div>
                    <ErrorText error={record.error} />
                    <Btn onClick={() => book.flush(note.id)}>Retry</Btn>
                    <Btn
                      onClick={() => {
                        select(book.recover(note.id));
                        book.reload().catch((e) => setError(e.message));
                      }}
                    >
                      Keep as a new note
                    </Btn>
                  </div>
                )}
              </div>
            ) : (
              <article className="note-paper">
                <h2>{note.title}</h2>
                <NoteBody key={note.id} note={note} />
              </article>
            )}
          </>
        ) : (
          <div className="resource-empty">
            <NotebookPen size={32} />
            <h3>
              {scope === 'shared' ? 'Shared notes appear here' : 'Start a note'}
            </h3>
            {scope === 'mine' && (
              <Btn icon={SquarePen} disabled={!canCreate} onClick={compose}>
                Create a note
              </Btn>
            )}
          </div>
        )}
      </section>
      {deletion && (
        <Modal
          title={deletion.project ? 'Delete project?' : 'Delete note?'}
          onClose={() => confirm(null)}
        >
          <div className="form-body">
            {deletion.project
              ? 'Notes in ' + deletion.project + ' will move to My notes.'
              : 'Delete “' +
                (deletion.title || 'Untitled note') +
                '” for everyone who has access?'}
            <ErrorText error={job.error} />
          </div>
          <footer>
            <Btn onClick={() => confirm(null)}>Cancel</Btn>
            <Btn
              disabled={job.busy}
              onClick={() =>
                job.run(async () => {
                  if (deletion.project) {
                    await Promise.all(
                      records.map((r) => book.flush(r.note.id)),
                    );
                    await api.command('notes.project.delete', {
                      name: deletion.project,
                    });
                    await book.reload();
                    catalog.refresh();
                    choose('mine');
                  } else {
                    await book.remove(deletion.id);
                    select('');
                  }
                  confirm(null);
                })
              }
            >
              {deletion.project ? 'Delete project' : 'Delete note'}
            </Btn>
          </footer>
        </Modal>
      )}
      {sharing && note && (
        <ShareNote
          {...{ note, members }}
          close={() => share(false)}
          apply={(shared) => {
            book.change(note.id, { shared });
            book.flush(note.id);
            share(false);
          }}
        />
      )}
      {projectName !== null && (
        <Modal title="New project" onClose={() => createProject(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              job.run(async () => {
                const name = await api.command('notes.project.create', {
                  name: projectName,
                });
                catalog.refresh();
                createProject(null);
                choose('mine', name);
              });
            }}
          >
            <div className="form-body">
              <Label name="Project name">
                <input
                  required
                  value={projectName}
                  onChange={(e) => createProject(e.target.value)}
                />
              </Label>
              <ErrorText error={job.error} />
            </div>
            <footer>
              <Btn onClick={() => createProject(null)}>Cancel</Btn>
              <button
                className="btn primary"
                disabled={job.busy || !projectName.trim()}
              >
                Create project
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}
