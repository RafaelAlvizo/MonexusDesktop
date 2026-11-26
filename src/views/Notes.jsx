import React, { useState } from 'react';
import { NotebookPen, UsersRound, Plus } from 'lucide-react';
import { newId } from '../../functions/core/model.mjs';
import {
  Btn,
  Empty,
  ErrorText,
  Label,
  Tabs,
  Modal,
  useJob,
  useLoad,
} from '../ui.jsx';
import { PeoplePicker } from './Sharing.jsx';

export default function Notes({ api, me, members }) {
  const notes = useLoad(async () => {
    let cursor,
      items = [];
    do {
      const page = await api.command('notes.list', { cursor: cursor || null });
      items.push(...page.items);
      cursor = page.next;
    } while (cursor);
    return items;
  }, [api]);
  const catalog = useLoad(() => api.command('notes.projects'), [api]);
  const [newProject, setNewProject] = useState(null);
  const [tab, chooseTab] = useState('Mine'),
    [project, chooseProject] = useState(''),
    [sort, chooseSort] = useState('updated'),
    [query, search] = useState(''),
    [selected, select] = useState(''),
    [draft, edit] = useState(null),
    job = useJob();
  const mine = tab === 'Mine',
    all = notes.data || [],
    scope = all.filter((n) => (n.owner === me.id) === mine),
    projects = [
      ...new Set([
        ...(mine ? catalog.data || [] : []),
        ...scope.map((n) => n.project).filter(Boolean),
      ]),
    ].sort(),
    list = scope
      .filter(
        (n) =>
          (!project || project === n.project) &&
          (n.title + ' ' + n.body).toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) =>
        sort === 'title' ? a.title.localeCompare(b.title) : b.at - a.at,
      ),
    note = list.find((n) => n.id === selected) || list[0];
  return (
    <div className="page notes-page">
      <div className="page-head">
        <h1>Notes</h1>
        <div className="row">
          <Btn onClick={() => setNewProject('')}>New project</Btn>
          <Btn
            kind="primary"
            icon={Plus}
            onClick={() =>
              edit({
                id: newId('note'),
                owner: me.id,
                title: '',
                body: '',
                project,
                shared: [],
              })
            }
          >
            New note
          </Btn>
        </div>
      </div>
      <Tabs
        values={['Mine', 'Shared with me']}
        value={tab}
        onChange={(v) => {
          chooseTab(v);
          chooseProject('');
        }}
      />
      <div className="notes-layout">
        <aside className="panel stack">
          <input
            type="search"
            aria-label="Search notes"
            placeholder="Search notes"
            value={query}
            onChange={(e) => search(e.target.value)}
          />
          <div className="form-grid">
            <Label name="Project">
              <select
                value={project}
                onChange={(e) => chooseProject(e.target.value)}
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Label>
            <Label name="Sort">
              <select value={sort} onChange={(e) => chooseSort(e.target.value)}>
                <option value="updated">Last edited</option>
                <option value="title">Title A–Z</option>
              </select>
            </Label>
          </div>
          {list.map((n) => (
            <button
              key={n.id}
              className={'note-row ' + (n.id === note?.id ? 'current' : '')}
              onClick={() => select(n.id)}
            >
              <b>{n.title}</b>
              {mine && n.shared.length > 0 && (
                <span title="Shared with others">
                  <UsersRound size={14} /> Shared
                </span>
              )}
              <small>
                {n.project || 'Unfiled'} · {new Date(n.at).toLocaleDateString()}
              </small>
            </button>
          ))}
          {!list.length && !notes.loading && (
            <Empty>No notes in this view.</Empty>
          )}
          <ErrorText error={notes.error || catalog.error} />
        </aside>
        <article className="panel note-reader">
          {note ? (
            <>
              <div className="section-line">
                <small>{note.project || 'Unfiled'}</small>
                {mine && <Btn onClick={() => edit(note)}>Edit or share</Btn>}
              </div>
              <h2>{note.title}</h2>
              {!mine && (
                <small>
                  Shared by{' '}
                  {members.find((m) => m.id === note.owner)?.name ||
                    'a teammate'}
                </small>
              )}
              <p>{note.body}</p>
            </>
          ) : (
            <NotebookPen size={32} />
          )}
        </article>
      </div>
      {newProject !== null && (
        <Modal title="New note project" onClose={() => setNewProject(null)}>
          <div className="form-body">
            <Label name="Project name">
              <input
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
              />
            </Label>
            <ErrorText error={job.error} />
          </div>
          <footer>
            <Btn
              kind="primary"
              disabled={job.busy || !newProject.trim()}
              onClick={() =>
                job.run(async () => {
                  const name = await api.command('notes.project.create', {
                    name: newProject,
                  });
                  setNewProject(null);
                  chooseTab('Mine');
                  chooseProject(name);
                  search('');
                  catalog.refresh();
                })
              }
            >
              Create project
            </Btn>
          </footer>
        </Modal>
      )}
      {draft && (
        <Modal
          wide
          title={draft.rev ? 'Edit note' : 'New note'}
          onClose={() => edit(null)}
        >
          <div className="form-body scroll">
            <Label name="Title">
              <input
                autoFocus
                value={draft.title}
                onChange={(e) => edit({ ...draft, title: e.target.value })}
              />
            </Label>
            <Label name="Project">
              <input
                list="note-projects"
                placeholder="Choose or create a project"
                value={draft.project}
                onChange={(e) => edit({ ...draft, project: e.target.value })}
              />
            </Label>
            <datalist id="note-projects">
              {[
                ...(catalog.data || []),
                ...new Set(
                  all
                    .filter((n) => n.owner === me.id && n.project)
                    .map((n) => n.project),
                ),
              ]
                .filter((p, i, a) => a.indexOf(p) === i)
                .map((p) => (
                  <option key={p}>{p}</option>
                ))}
            </datalist>
            <Label name="Note">
              <textarea
                rows={12}
                value={draft.body}
                onChange={(e) => edit({ ...draft, body: e.target.value })}
              />
            </Label>
            <details>
              <summary>Share with teammates ({draft.shared.length})</summary>
              <PeoplePicker
                label="Can read"
                options={members.filter((m) => m.active && m.id !== me.id)}
                value={draft.shared}
                change={(shared) => edit({ ...draft, shared })}
              />
            </details>
            <ErrorText error={job.error} />
          </div>
          <footer>
            <Btn onClick={() => edit(null)}>Cancel</Btn>
            <Btn
              kind="primary"
              disabled={job.busy || !draft.title.trim()}
              onClick={() =>
                job.run(async () => {
                  const result = await api.command('notes.save', draft);
                  chooseTab('Mine');
                  chooseProject(result.project);
                  search('');
                  select(result.id);
                  edit(null);
                  notes.refresh();
                  catalog.refresh();
                })
              }
            >
              Save note
            </Btn>
          </footer>
        </Modal>
      )}
    </div>
  );
}
