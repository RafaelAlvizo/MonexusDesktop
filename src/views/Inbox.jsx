import React from 'react';
import { Inbox as Tray, RotateCw } from 'lucide-react';
import { Btn, Empty, More, usePages, useJob, ErrorText } from '../ui.jsx';
import { eventNames } from '../../functions/core/model.mjs';
export default function Inbox({ api, open }) {
  const page = usePages(api, 'inbox.list', {}),
    job = useJob();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Inbox</h1>
        </div>
        <Btn icon={RotateCw} onClick={page.refresh}>
          Refresh
        </Btn>
      </div>
      <div className="panel">
        {page.items.map((n) => (
          <article className="resource-row" key={n.id}>
            <Tray size={18} />
            <div className="grow">
              <small>
                {eventNames[n.type]} · {new Date(n.at).toLocaleString()}
              </small>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </div>
            {(n.board || n.channel || n.eodDay) && <Btn onClick={() => open(n)}>Open</Btn>}
            {!n.read && (
              <Btn
                onClick={() =>
                  job.run(async () => {
                    await api.command('inbox.read', { id: n.id });
                    page.refresh();
                  })
                }
              >
                Mark read
              </Btn>
            )}
          </article>
        ))}
        {!page.items.length && !page.loading && (
          <Empty>Your inbox is clear.</Empty>
        )}
        <More page={page} />
        <ErrorText error={job.error} />
      </div>
    </div>
  );
}
