import React, { useState } from 'react';
import {
  FolderClosed,
  Plus,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Btn, Empty, Check, Label } from '../ui.jsx';
import { isAdmin } from '../../functions/core/model.mjs';
export default function Directory({ boards, me, choose, create }) {
  const [search, set] = useState('');
  const storageKey = 'monexus.boardDirectory.' + me.id;
  const [options, showOptions] = useState(false);
  const [appearance, setAppearance] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch {
      return {};
    }
  });
  function change(patch) {
    const next = { ...appearance, ...patch };
    setAppearance(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }
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
      <div className="directory-tools">
        <label className="search">
          <Search size={15} />
          <input
            aria-label="Find a project or board"
            placeholder="Find project or board…"
            value={search}
            onChange={(e) => set(e.target.value)}
          />
        </label>
        <Btn
          icon={SlidersHorizontal}
          aria-expanded={options}
          onClick={() => showOptions(!options)}
        >
          View options
        </Btn>
      </div>
      {options && (
        <div className="panel directory-options">
          <Label name="Board layout">
            <select
              value={appearance.layout || 'list'}
              onChange={(e) => change({ layout: e.target.value })}
            >
              <option value="list">List</option>
              <option value="grid">Cards</option>
            </select>
          </Label>
          <Check
            checked={appearance.description !== false}
            onChange={(e) => change({ description: e.target.checked })}
          >
            Show descriptions
          </Check>
          <Check
            checked={appearance.counts !== false}
            onChange={(e) => change({ counts: e.target.checked })}
          >
            Show ticket and member counts
          </Check>
        </div>
      )}
      {[...projects]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([project, items]) => (
          <section className="panel" key={project}>
            <h2 className="row">
              <FolderClosed size={18} />
              {project}
            </h2>
            <div
              className={appearance.layout === 'grid' ? 'directory-cards' : ''}
            >
              {items
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((b) => (
                  <button
                    key={b.id}
                    className="resource-row"
                    onClick={() => choose(b.id)}
                  >
                    <i className={'dot ' + b.color} />
                    <span className="grow">
                      <strong>{b.name}</strong>
                      {appearance.description !== false && (
                        <small>{b.description}</small>
                      )}
                    </span>
                    {appearance.counts !== false && (
                      <small>
                        {Object.values(b.counts).reduce((a, b) => a + b, 0)}{' '}
                        tickets · {b.memberIds.length} members
                      </small>
                    )}
                    <ArrowUpRight size={16} />
                  </button>
                ))}
            </div>
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
