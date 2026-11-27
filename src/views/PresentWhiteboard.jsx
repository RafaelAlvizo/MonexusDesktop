import React, { useRef, useState } from 'react';
import { Modal, Btn, Check, ErrorText, Label, More, useJob, usePages } from '../ui.jsx';
import { newCanvas } from './Canvas.jsx';
export default function PresentWhiteboard({ api, me, command, close }) {
  const list = usePages(api, 'canvas.list', {}),
    [choice, setChoice] = useState(''),
    [name, setName] = useState(''),
    [editable, allow] = useState(false),
    job = useJob(),
    created = useRef(null);
  return (
    <Modal title="Share a whiteboard" onClose={() => !job.busy && close()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          job.run(async () => {
            let id = choice;
            if (!id) {
              created.current ||= await newCanvas(api, name);
              id = created.current.id;
            }
            await command('whiteboard', { canvas: id, edit: editable });
            close();
          });
        }}
      >
        <div className="form-body stack">
          <Label name="Whiteboard">
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Create a new whiteboard</option>
              {list.items
                .filter((d) => d.by === me.id || (d.audience || 'team') === 'team')
                .map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </Label>
          <More page={list} />
          {!choice && (
            <Label name="Whiteboard name">
              <input
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="Untitled whiteboard"
              />
            </Label>
          )}
          <Check checked={editable} onChange={(e) => allow(e.target.checked)}>
            Allow meeting participants to edit
          </Check>
          <p className="muted">
            {editable
              ? 'Participant edits are saved to this whiteboard.'
              : 'Participants can view this whiteboard while you share it.'}
          </p>
          <ErrorText error={job.error} />
        </div>
        <footer>
          <Btn onClick={close}>Cancel</Btn>
          <button className="btn primary" disabled={job.busy}>
            Share whiteboard
          </button>
        </footer>
      </form>
    </Modal>
  );
}
