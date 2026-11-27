import React, { useState } from 'react';
import { Avatar, Btn, ErrorText, Label, Modal, useJob } from '../ui.jsx';
export function PollForm({ submit, close }) {
  const [question, ask] = useState(''),
    [choices, setChoices] = useState(['', '']),
    job = useJob();
  return (
    <Modal title="Create poll" onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          job.run(() => submit(question, choices));
        }}
      >
        <div className="form-body stack">
          <Label name="Question">
            <input
              autoFocus
              required
              value={question}
              onChange={(e) => ask(e.target.value)}
              maxLength={300}
            />
          </Label>
          {choices.map((c, i) => (
            <Label key={i} name={'Choice ' + (i + 1)}>
              <input
                required
                maxLength={100}
                value={c}
                onChange={(e) =>
                  setChoices(
                    choices.map((x, j) => (i === j ? e.target.value : x)),
                  )
                }
              />
            </Label>
          ))}
          {choices.length < 10 && (
            <Btn onClick={() => setChoices([...choices, ''])}>Add choice</Btn>
          )}
          <ErrorText error={job.error} />
        </div>
        <footer>
          <Btn onClick={close}>Cancel</Btn>
          <button className="btn primary" disabled={job.busy}>
            Post poll
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function PollResult({ poll, me, enabled, vote }) {
  const votes = Object.values(poll.votes || {});
  return (
    <div className="poll-result" aria-label="Poll choices">
      {poll.options.map((o, i) => {
        const count = votes.filter((x) => x === i).length;
        return (
          <button
            key={i}
            disabled={!enabled}
            aria-pressed={poll.votes?.[me.id] === i}
            onClick={() => vote(i)}
          >
            <span>{o}</span>
            <b>{count}</b>
          </button>
        );
      })}
      <small>
        {votes.length} {votes.length === 1 ? 'vote' : 'votes'}
      </small>
    </div>
  );
}
export function Roster({ members, presence, close }) {
  const [query, set] = useState('');
  return (
    <Modal title="Channel members" onClose={close}>
      <div className="form-body stack">
        <input
          type="search"
          aria-label="Find a channel member"
          placeholder="Find a member…"
          value={query}
          onChange={(e) => set(e.target.value)}
        />
        {['Online', 'Do Not Disturb', 'Offline'].map((state) => {
          const rows = members
            .filter(
              (m) =>
                (presence[m.id] || 'Offline') === state &&
                m.name.toLowerCase().includes(query.toLowerCase()),
            )
            .sort((a, b) => a.name.localeCompare(b.name));
          return (
            rows.length > 0 && (
              <section key={state}>
                <h3>
                  {state} · {rows.length}
                </h3>
                {rows.map((m) => (
                  <div className="roster-row" key={m.id}>
                    <Avatar person={m} small />
                    <b>{m.name}</b>
                    <small>{m.role}</small>
                  </div>
                ))}
              </section>
            )
          );
        })}
      </div>
    </Modal>
  );
}
