import { createPortal } from 'react-dom';
import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  Pencil,
  Settings2,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { isAdmin } from '../../functions/core/model.mjs';
import {
  Btn,
  IconButton,
  Label,
  Modal,
  ErrorText,
  Avatar,
  useJob,
  useLoad,
  usePages,
  More,
} from '../ui.jsx';
import { PeoplePicker } from './Sharing.jsx';
import { desktop, nativeAction } from '../native.mjs';

function dateLabel(day) {
  return new Date(day + 'T12:00:00Z').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
function step(day, n) {
  const value = new Date(day + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + n);
  return value.toISOString().slice(0, 10);
}
function time(at, zone) {
  return new Date(at).toLocaleTimeString(undefined, {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  });
}
function Versions({ api, report, zone, close }) {
  const page = usePages(api, 'eod.history', {
    author: report.author,
    day: report.day,
  });
  return (
    <Modal
      title="Report history"
      subtitle={report.name + ' · ' + dateLabel(report.day)}
      onClose={close}
    >
      <div className="form-body scroll">
        {page.items.map((v) => (
          <section key={v.id} className="report-version">
            <strong>
              {v.rev === 1 ? 'First submission' : 'Revision ' + v.rev}
            </strong>
            <small>
              {new Date(v.at).toLocaleString(undefined, { timeZone: zone })}
            </small>
            <p>{v.body}</p>
          </section>
        ))}
        <More page={page} />
      </div>
    </Modal>
  );
}
function ReminderSettings({ api, members, close, saved }) {
  const config = useLoad(() => api.command('eod.settings'), [api]),
    groups = useLoad(() => api.command('roles.list'), [api]);
  const [draft, set] = useState(null),
    job = useJob(),
    value = draft || config.data;
  const patch = (o) => set({ ...value, ...o });
  return (
    <Modal title="EOD reminders" onClose={close}>
      <div className="form-body scroll">
        <p className="with-icon">
          <Clock3 size={16} /> Daily at 2:20 PM
        </p>
        {value && (
          <>
            <Label name="Who gets the pop-up?">
              <select
                value={value.mode}
                onChange={(e) => patch({ mode: e.target.value })}
              >
                <option value="everyone">Everyone, including admins</option>
                <option value="members">Members only</option>
                <option value="selected">Selected people and roles</option>
                <option value="off">No reminders</option>
              </select>
            </Label>
            {value.mode === 'selected' && (
              <>
                <PeoplePicker
                  label="Team roles"
                  options={groups.data || []}
                  value={value.groups}
                  change={(groups) => patch({ groups })}
                />
                <PeoplePicker
                  label="People"
                  options={members.filter((m) => m.active)}
                  value={value.users}
                  change={(users) => patch({ users })}
                />
              </>
            )}
            <Label name="Reminder time zone">
              <input
                list="eod-zones"
                value={value.zone}
                onChange={(e) => patch({ zone: e.target.value })}
              />
            </Label>
            <datalist id="eod-zones">
              {[
                ...new Set([
                  value.zone,
                  'America/Chihuahua',
                  'America/Mazatlan',
                  Intl.DateTimeFormat().resolvedOptions().timeZone,
                  ...(Intl.supportedValuesOf?.('timeZone') || []),
                ]),
              ].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </datalist>
            <small>All members can write a report from Resources → EOD.</small>
          </>
        )}
        <ErrorText error={config.error || groups.error || job.error} />
      </div>
      <footer>
        <Btn onClick={close}>Cancel</Btn>
        <Btn
          kind="primary"
          disabled={!value || job.busy}
          onClick={() =>
            job.run(async () => {
              await api.command('eod.configure', value);
              saved();
            })
          }
        >
          Save reminders
        </Btn>
      </footer>
    </Modal>
  );
}
function ReportEditor({ api, entry, close, saved, onDraft, discard }) {
  const [body, setBody] = useState(
      entry.draft?.body ?? entry.report?.body ?? '',
    ),
    job = useJob();
  return createPortal(
    <div className="eod-focus">
      <Modal
        wide
        title={entry.report ? 'Edit your EOD' : 'Your end-of-day report'}
        subtitle={dateLabel(entry.day)}
        onClose={() => {
          if (!job.busy) close();
        }}
      >
        <div className="form-body">
          <Label name="What did you work on today?">
            <textarea
              ref={(el) => {
                if (el && !el.dataset.focused) {
                  el.dataset.focused = '1';
                  requestAnimationFrame(() => el.focus());
                }
              }}
              rows={9}
              maxLength={30000}
              value={body}
              placeholder="Write your update here…"
              onChange={(e) => {
                setBody(e.target.value);
                onDraft(e.target.value);
              }}
            />
          </Label>
          <small>
            Shared with workspace admins. You can edit your report after
            sending.
          </small>
          <ErrorText error={job.error} />
          {job.error && <Btn onClick={discard}>Discard draft and close</Btn>}
        </div>
        <footer>
          <Btn disabled={job.busy} onClick={close}>
            Later
          </Btn>
          <Btn
            kind="primary"
            disabled={!body.trim() || job.busy}
            onClick={() =>
              job.run(async () =>
                saved(
                  await api.command('eod.save', {
                    day: entry.day,
                    body,
                    rev: entry.draft?.rev ?? entry.report?.rev ?? 0,
                  }),
                ),
              )
            }
          >
            {job.busy
              ? 'Sending…'
              : entry.report
                ? 'Save changes'
                : 'Send report'}
          </Btn>
        </footer>
      </Modal>
    </div>,
    document.body,
  );
}
export default function Eod({ api, me, members, tell, visible, requested }) {
  const [day, setDay] = useState(''),
    [today, setToday] = useState(''),
    [editor, setEditor] = useState(null),
    [settings, setSettings] = useState(false),
    [history, setHistory] = useState(null),
    [version, bump] = useState(0);
  const opened = useRef(null),
    drafts = useRef(new Map()),
    admin = isAdmin(me),
    job = useJob();
  const activeDay = day || today;
  useEffect(() => {
    if (requested) setDay(requested.day || '');
  }, [requested]);
  useEffect(() => {
    let live = true,
      timer,
      busy = false;
    async function check() {
      if (!live || busy) return;
      busy = true;
      clearTimeout(timer);
      let delay = 60000;
      try {
        const s = await api.command('eod.status');
        if (!live) return;
        setToday(s.today);
        delay = Math.min(s.checkIn, 300000);
        const key = 'monexus.eod.seen.' + me.id;
        if (
          s.eligible &&
          s.due &&
          !s.submitted &&
          !opened.current &&
          localStorage.getItem(key) !== s.today
        ) {
          localStorage.setItem(key, s.today);
          opened.current = s.today;
          setEditor({ day: s.today, draft: drafts.current.get(s.today) });
          if (desktop) nativeAction('restore');
        }
      } catch {
        /* The manual report remains available while reminders reconnect. */
      } finally {
        busy = false;
        if (live) timer = setTimeout(check, delay);
      }
    }
    const wake = () => {
      if (!document.hidden) check();
    };
    check();
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      live = false;
      clearTimeout(timer);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [api, me.id, version]);
  useEffect(() => {
    if (!visible) return;
    const refresh = () => bump((n) => n + 1);
    window.addEventListener('monexus-eod-update', refresh);
    return () => window.removeEventListener('monexus-eod-update', refresh);
  }, [visible]);
  const reports = useLoad(async () => {
    if (!visible) return null;
    let cursor = null,
      items = [],
      page;
    do {
      page = await api.command('eod.day', {
        ...(activeDay ? { day: activeDay } : {}),
        cursor,
      });
      items.push(...page.items);
      cursor = page.next;
    } while (cursor);
    return {
      ...page,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [api, visible, activeDay, version, me.role]);
  const data = reports.data,
    displayDay = data?.day || activeDay;
  const close = () => {
    setEditor(null);
    opened.current = null;
  };
  function showEditor() {
    job.run(async () => {
      const selected = displayDay;
      const report = await api.command('eod.own', { day: selected });
      opened.current = selected;
      if (selected === today)
        localStorage.setItem('monexus.eod.seen.' + me.id, selected);
      setEditor({ day: selected, report, draft: drafts.current.get(selected) });
    });
  }
  const own = data?.items.some((r) => r.author === me.id);
  return (
    <>
      {visible && (
        <div className="page eod-page">
          <div className="page-head">
            <h1>End-of-day reports</h1>
            <div className="row wrap">
              {admin && (
                <Btn icon={Settings2} onClick={() => setSettings(true)}>
                  Reminders
                </Btn>
              )}
              <Btn
                kind="primary"
                icon={Pencil}
                disabled={!data || job.busy}
                onClick={showEditor}
              >
                {own ? 'Edit my report' : 'Write my report'}
              </Btn>
            </div>
          </div>
          <div className="browser-chrome">
            <div className="date-controls">
              <IconButton
                label="Previous day"
                icon={ChevronLeft}
                disabled={!displayDay}
                onClick={() => setDay(step(displayDay, -1))}
              />
              <input
                type="date"
                aria-label="Report date"
                max={today}
                value={displayDay || ''}
                onChange={(e) => setDay(e.target.value)}
              />
              <IconButton
                label="Next day"
                icon={ChevronRight}
                disabled={!displayDay || displayDay >= today}
                onClick={() => setDay(step(displayDay, 1))}
              />
              <Btn onClick={() => setDay('')}>Today</Btn>
            </div>
            <IconButton
              label="Refresh reports"
              icon={RefreshCw}
              onClick={() => bump((n) => n + 1)}
            />
          </div>
          {displayDay && (
            <div className="report-day">
              <h2>{dateLabel(displayDay)}</h2>
              {admin && data && <span>{data.items.length} submitted</span>}
            </div>
          )}
          <ErrorText error={reports.error || job.error} />
          {data?.items.map((r) => (
            <article className="report-card" key={r.author}>
              <div className="section-line">
                <div className="row">
                  <Avatar
                    person={
                      members.find((m) => m.id === r.author) || {
                        id: r.author,
                        name: r.name,
                      }
                    }
                  />
                  <div>
                    <strong>{r.name}</strong>
                    <small>
                      Submitted {time(r.submitted, data.zone)}
                      {r.rev > 1
                        ? ' · Edited ' +
                          new Date(r.at).toLocaleString(undefined, {
                            timeZone: data.zone,
                          })
                        : ''}
                    </small>
                  </div>
                </div>
                {r.rev > 1 && (
                  <Btn icon={History} onClick={() => setHistory(r)}>
                    History
                  </Btn>
                )}
              </div>
              <p>{r.body}</p>
            </article>
          ))}
          {data && !data.items.length && (
            <div className="resource-empty">
              <FileText size={30} />
              <h3>
                {admin ? 'No reports for this day yet' : 'Your report is empty'}
              </h3>
            </div>
          )}
          {reports.loading && <p className="muted">Loading reports…</p>}
        </div>
      )}
      {settings && (
        <ReminderSettings
          {...{ api, members }}
          close={() => setSettings(false)}
          saved={() => {
            setSettings(false);
            bump((n) => n + 1);
            tell('Reminder settings saved.');
          }}
        />
      )}
      {history && (
        <Versions
          api={api}
          report={history}
          zone={data?.zone}
          close={() => setHistory(null)}
        />
      )}
      {editor && (
        <ReportEditor
          key={editor.day}
          api={api}
          entry={editor}
          close={close}
          discard={() => {
            drafts.current.delete(editor.day);
            close();
            bump((n) => n + 1);
          }}
          onDraft={(body) =>
            drafts.current.set(editor.day, {
              body,
              rev: editor.draft?.rev ?? editor.report?.rev ?? 0,
            })
          }
          saved={(r) => {
            drafts.current.delete(r.day);
            if (r.day === today)
              localStorage.setItem('monexus.eod.seen.' + me.id, r.day);
            close();
            bump((n) => n + 1);
            tell('Your EOD report was sent to admins.');
          }}
        />
      )}
    </>
  );
}
