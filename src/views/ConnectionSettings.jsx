import React, { useState } from 'react';
import { Access } from './Sharing.jsx';
import { Btn, Label, ErrorText, useJob, useLoad } from '../ui.jsx';
import { contributionLabels, cleanAcl } from '../../functions/core/model.mjs';
export function Contributions({ api, me, members, contributions }) {
  const [key, choose] = useState('docs'),
    [draft, set] = useState(null),
    job = useJob();
  const acl =
    draft ||
    contributions[key] ||
    cleanAcl(
      ['notes', 'whiteboard'].includes(key)
        ? { everyone: true }
        : key === 'vault'
          ? { roles: ['owner'] }
          : { roles: ['admin', 'owner'] },
    );
  return (
    <section className="panel stack">
      <h2>Resource contributions</h2>
      <Label name="Permission">
        <select
          value={key}
          onChange={(e) => {
            choose(e.target.value);
            set(null);
          }}
        >
          {Object.entries(contributionLabels)
            .filter(([id]) => id !== 'vault' || me.role === 'owner')
            .map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </select>
      </Label>
      <Access
        key={key}
        api={api}
        members={members}
        acl={acl}
        set={set}
        title="Who can contribute"
      />
      <Btn
        kind="primary"
        disabled={!draft || job.busy}
        onClick={() =>
          job.run(async () => {
            await api.command('contributions.set', { key, acl });
            set(null);
          })
        }
      >
        Save permission
      </Btn>
      <ErrorText error={job.error} />
    </section>
  );
}
export function AssistantConnection({ api }) {
  const [write, allowWrite] = useState(false);
  const [token, set] = useState(''),
    job = useJob(),
    status = useLoad(() => api.command('mcp.status'), [api]);
  return (
    <section className="panel stack">
      <h2>Connect an AI assistant</h2>
      <p>
        In your assistant’s MCP settings, add a remote Streamable HTTP server
        with the address below. Use your personal token as a Bearer
        authorization header.
      </p>
      <Label name="MCP server URL">
        <input readOnly value={api.mcpUrl} onFocus={(e) => e.target.select()} />
      </Label>
      <small>
        The assistant can read your accessible boards, tickets, notes, documents
        and whiteboards. A token lasts 30 days. Generating a new token revokes
        the previous one.
      </small>
      <label className="check">
        <input
          type="checkbox"
          checked={write}
          onChange={(e) => allowWrite(e.target.checked)}
        />
        Allow the next token to create or edit my notes and tickets and add
        document links
      </label>
      {token && (
        <Label name="Personal access token">
          <input readOnly value={token} onFocus={(e) => e.target.select()} />
        </Label>
      )}
      {status.data?.expires > Date.now() && (
        <p>
          {status.data.write ? 'Read and write' : 'Read-only'} token expires{' '}
          {new Date(status.data.expires).toLocaleDateString()}.
        </p>
      )}
      <div className="row">
        <Btn
          kind="primary"
          disabled={job.busy}
          onClick={() =>
            job.run(async () => {
              set((await api.command('mcp.create', { write })).token);
              status.refresh();
            })
          }
        >
          Generate token
        </Btn>
        {(token || status.data?.expires > Date.now()) && (
          <Btn
            disabled={job.busy}
            onClick={() =>
              job.run(async () => {
                await api.command('mcp.revoke');
                set('');
                status.refresh();
              })
            }
          >
            Revoke token
          </Btn>
        )}
      </div>
      <ErrorText error={job.error || status.error} />
    </section>
  );
}
export async function profileImage(file) {
  if (
    !file ||
    !/^image\/(jpeg|png|webp)$/.test(file.type) ||
    file.size > 12 * 1048576
  )
    throw Error('Choose a PNG, JPEG or WebP image up to 12 MB.');
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 112;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 112, 112);
    const size = Math.min(image.width, image.height);
    ctx.drawImage(
      image,
      (image.width - size) / 2,
      (image.height - size) / 2,
      size,
      size,
      0,
      0,
      112,
      112,
    );
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    image.close();
  }
}
