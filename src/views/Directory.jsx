import React, { useState } from 'react';
import { FolderClosed, Plus, ArrowUpRight, Search } from 'lucide-react';
import { Btn, Empty } from '../ui.jsx';
import { isAdmin } from '../../functions/core/model.mjs';
export default function Directory({ boards, me, choose, create }) {
  const [search, set] = useState('');
  const projects = new Map();
  for (const b of boards) {
    if (
      ![b.name, b.project]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      continue;
    if (!projects.has(b.project)) projects.set(b.project, []);
    projects.get(b.project).push(b);
  }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Project boards</h1>
        </div>
        {isAdmin(me) && (
          <Btn kind="primary" icon={Plus} onClick={create}>
            Create board
          </Btn>
        )}
      </div>
      <label className="search">
        <Search size={15} />
        <input
          aria-label="Find a project or board"
          placeholder="Find project or board…"
          value={search}
          onChange={(e) => set(e.target.value)}
        />
      </label>
      {[...projects]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([project, items]) => (
          <section className="panel" key={project}>
            <h2 className="row">
              <FolderClosed size={18} />
              {project}
            </h2>
            {items.map((b) => (
              <button
                key={b.id}
                className="resource-row"
                onClick={() => choose(b.id)}
              >
                <i className={'dot ' + b.color} />
                <span className="grow">
                  <strong>{b.name}</strong>
                  <small>{b.description}</small>
                </span>
                <small>
                  {Object.values(b.counts).reduce((a, b) => a + b, 0)} tickets ·{' '}
                  {b.memberIds.length} members
                </small>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </section>
        ))}
      {!projects.size && (
        <Empty>
          {search
            ? 'No projects or boards match your search.'
            : 'No boards available yet.'}
        </Empty>
      )}
    </div>
  );
}
