import React, { useState } from 'react';
import { Plus, ArrowUp, ArrowDown, X, ChevronDown } from 'lucide-react';
import {
  boardTemplate,
  newId,
  field,
  colors,
  kinds,
  roles,
  actions,
} from '../../functions/core/model.mjs';
import {
  Btn,
  Modal,
  Label,
  Tabs,
  Check,
  IconButton,
  ErrorText,
  useJob,
} from '../ui.jsx';
const roleNames = { viewer: 'Viewer', editor: 'Editor', admin: 'Board admin' };
function selectRole(value, change) {
  return (
    <select value={value} onChange={(e) => change(e.target.value)}>
      {roles.map((k) => (
        <option key={k} value={k}>
          {roleNames[k]}
        </option>
      ))}
    </select>
  );
}
function reordered(a, i, j) {
  const b = [...a];
  if (j >= 0 && j < b.length) [b[i], b[j]] = [b[j], b[i]];
  return b;
}
export default function BoardConfig({
  api,
  board,
  me,
  members,
  onClose,
  onSaved,
}) {
  const [cfg, set] = useState(() =>
      structuredClone(board || boardTemplate('', '', 'MX')),
    ),
    [people, assign] = useState({ ...board?.members }),
    [tab, tabSet] = useState('General'),
    [focus, setFocus] = useState(''),
    job = useJob();
  const patch = (o) => set((s) => ({ ...s, ...o })),
    fieldPatch = (key, o) =>
      patch({
        fields: cfg.fields.map((f) => (f.key === key ? { ...f, ...o } : f)),
      }),
    person = (k, v) => {
      const x = { ...people };
      if (v) x[k] = v;
      else delete x[k];
      assign(x);
    };
  const save = () =>
    job.run(async () => {
      const key = board?.id || newId('b');
      if (board)
        await api.command('board.save', {
          board: key,
          rev: board.rev,
          config: cfg,
          members: people,
        });
      else
        await api.command('board.create', {
          id: key,
          config: cfg,
          members: people,
        });
      onSaved(key);
    });
  return (
    <Modal
      title={board ? 'Board settings' : 'Create board'}
      subtitle={board?.name || 'Project boards'}
      wide
      onClose={onClose}
    >
      <Tabs
        values={['General', 'Columns', 'Fields', 'Members', 'Permissions']}
        value={tab}
        onChange={tabSet}
      />
      <div className="form-body scroll">
        {tab === 'General' && (
          <div className="form-grid">
            <Label name="Board name" wide>
              <input
                value={cfg.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Label>
            <Label name="Project">
              <input
                value={cfg.project}
                placeholder="Game development"
                onChange={(e) => patch({ project: e.target.value })}
              />
            </Label>
            <Label name="Ticket prefix">
              <input
                value={cfg.prefix}
                maxLength={8}
                onChange={(e) =>
                  patch({ prefix: e.target.value.toUpperCase() })
                }
              />
            </Label>
            <Label name="Description" wide>
              <textarea
                value={cfg.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </Label>
            <Label name="Board color">
              <select
                value={cfg.color}
                onChange={(e) => patch({ color: e.target.value })}
              >
                {colors.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Label>
            <div className="span">
              <h3>Ticket features</h3>
              {Object.entries(cfg.features).map(([k, v]) => (
                <Check
                  key={k}
                  checked={v}
                  onChange={(e) =>
                    patch({
                      features: { ...cfg.features, [k]: e.target.checked },
                    })
                  }
                >
                  {
                    {
                      parents: 'Parent tickets',
                      links: 'Links',
                      comments: 'Comments',
                      media: 'Media and attachments',
                    }[k]
                  }
                </Check>
              ))}
            </div>
          </div>
        )}
        {tab === 'Columns' && (
          <>
            <p className="muted">
              The first column is the default for new tickets. Empty columns can
              be removed.
            </p>
            {cfg.columns.map((c, i) => (
              <div className="config-row" key={c.id}>
                <i className={'dot ' + c.color} />
                <input
                  aria-label={'Column ' + (i + 1) + ' name'}
                  value={c.name}
                  onChange={(e) =>
                    patch({
                      columns: cfg.columns.map((x) =>
                        x.id === c.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <select
                  aria-label="Column color"
                  value={c.color}
                  onChange={(e) =>
                    patch({
                      columns: cfg.columns.map((x) =>
                        x.id === c.id ? { ...x, color: e.target.value } : x,
                      ),
                    })
                  }
                >
                  {colors.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <IconButton
                  icon={ArrowUp}
                  label="Move column up"
                  disabled={!i}
                  onClick={() =>
                    patch({ columns: reordered(cfg.columns, i, i - 1) })
                  }
                />
                <IconButton
                  icon={ArrowDown}
                  label="Move column down"
                  disabled={i === cfg.columns.length - 1}
                  onClick={() =>
                    patch({ columns: reordered(cfg.columns, i, i + 1) })
                  }
                />
                <IconButton
                  icon={X}
                  label="Remove column"
                  disabled={cfg.columns.length === 1 || board?.counts[c.id] > 0}
                  onClick={() =>
                    patch({ columns: cfg.columns.filter((x) => x.id !== c.id) })
                  }
                />
              </div>
            ))}
            <Btn
              icon={Plus}
              onClick={() =>
                patch({
                  columns: [
                    ...cfg.columns,
                    { id: newId('col'), name: 'New column', color: 'slate' },
                  ],
                })
              }
            >
              Add column
            </Btn>
          </>
        )}
        {tab === 'Fields' && (
          <>
            {cfg.fields.map((f, i) => (
              <div className="field-box" key={f.key}>
                <div className="section-line">
                  <button
                    className="field-head"
                    onClick={() => setFocus(focus === f.key ? '' : f.key)}
                  >
                    <ChevronDown size={15} />
                    {f.label}
                    <small>
                      {f.kind}
                      {!f.enabled ? ' · Hidden' : ''}
                    </small>
                  </button>
                  <div className="row tight">
                    <IconButton
                      icon={ArrowUp}
                      label={'Move ' + f.label + ' up'}
                      disabled={!i}
                      onClick={() =>
                        patch({ fields: reordered(cfg.fields, i, i - 1) })
                      }
                    />
                    <IconButton
                      icon={ArrowDown}
                      label={'Move ' + f.label + ' down'}
                      disabled={i === cfg.fields.length - 1}
                      onClick={() =>
                        patch({ fields: reordered(cfg.fields, i, i + 1) })
                      }
                    />
                  </div>
                </div>
                {focus === f.key && (
                  <div className="field-editor">
                    <div className="form-grid">
                      <Label name="Field label">
                        <input
                          value={f.label}
                          onChange={(e) =>
                            fieldPatch(f.key, { label: e.target.value })
                          }
                        />
                      </Label>
                      <Label name="Minimum role to set value">
                        {selectRole(f.editRole, (editRole) =>
                          fieldPatch(f.key, { editRole }),
                        )}
                      </Label>
                      <Label name="Data type">
                        <select
                          value={f.kind}
                          disabled={
                            !!board?.fields.find((x) => x.key === f.key) ||
                            !f.key.startsWith('custom_')
                          }
                          onChange={(e) =>
                            fieldPatch(f.key, {
                              kind: e.target.value,
                              options: [],
                            })
                          }
                        >
                          {kinds.map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </Label>
                    </div>
                    <div className="row wrap">
                      {[
                        ['enabled', 'Enabled'],
                        ['required', 'Required'],
                        ['card', 'Show on card'],
                      ].map(([k, n]) => (
                        <Check
                          key={k}
                          disabled={f.key === 'title'}
                          checked={f[k]}
                          onChange={(e) =>
                            fieldPatch(f.key, { [k]: e.target.checked })
                          }
                        >
                          {n}
                        </Check>
                      ))}
                    </div>
                    {['select', 'multi'].includes(f.kind) && (
                      <>
                        <h4>Choices</h4>
                        {f.options.map((o) => (
                          <div key={o.id} className="config-row">
                            <input
                              aria-label="Choice label"
                              value={o.label}
                              onChange={(e) =>
                                fieldPatch(f.key, {
                                  options: f.options.map((v) =>
                                    v.id === o.id
                                      ? { ...v, label: e.target.value }
                                      : v,
                                  ),
                                })
                              }
                            />
                            <Check
                              checked={o.active}
                              disabled={f.key === 'priority'}
                              onChange={(e) =>
                                fieldPatch(f.key, {
                                  options: f.options.map((v) =>
                                    v.id === o.id
                                      ? { ...v, active: e.target.checked }
                                      : v,
                                  ),
                                })
                              }
                            >
                              Active
                            </Check>
                          </div>
                        ))}
                        {f.key !== 'priority' && (
                          <Btn
                            icon={Plus}
                            onClick={() =>
                              fieldPatch(f.key, {
                                options: [
                                  ...f.options,
                                  {
                                    id: newId('opt'),
                                    label: 'New choice',
                                    active: true,
                                  },
                                ],
                              })
                            }
                          >
                            Add choice
                          </Btn>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <Btn
              icon={Plus}
              onClick={() => {
                const k = newId('custom');
                patch({
                  fields: [...cfg.fields, field(k, 'Custom field', 'text')],
                });
                setFocus(k);
              }}
            >
              Add custom field
            </Btn>
          </>
        )}
        {tab === 'Members' && (
          <>
            <p className="muted">
              Assign approved workspace members to this board. Workspace owners
              and admins can manage all boards.
            </p>
            {members
              .filter((m) => m.active)
              .map((m) => (
                <div className="config-row" key={m.id}>
                  <strong>{m.name}</strong>
                  <select
                    aria-label={'Board access for ' + m.name}
                    value={
                      people[m.id] || (!board && m.id === me?.id ? 'admin' : '')
                    }
                    onChange={(e) => person(m.id, e.target.value)}
                  >
                    <option value="">No membership</option>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {roleNames[r]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </>
        )}
        {tab === 'Permissions' &&
          actions.map((k) => (
            <div className="config-row" key={k}>
              <strong>
                {
                  {
                    create: 'Create tickets',
                    edit: 'Edit tickets',
                    move: 'Move tickets',
                    comment: 'Post comments',
                    attach: 'Attach media',
                  }[k]
                }
              </strong>
              {selectRole(cfg.policy[k], (v) =>
                patch({ policy: { ...cfg.policy, [k]: v } }),
              )}
            </div>
          ))}
        <ErrorText error={job.error} />
      </div>
      <footer>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" onClick={save} disabled={job.busy}>
          {board ? 'Save board' : 'Create board'}
        </Btn>
      </footer>
    </Modal>
  );
}
