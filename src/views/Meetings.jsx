import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Phone,
  Clock3,
} from 'lucide-react';
import {
  Btn,
  IconButton,
  Label,
  Modal,
  Check,
  ErrorText,
  useJob,
  useLoad,
  Tabs,
} from '../ui.jsx';
import { newId } from '../../functions/core/model.mjs';
import { desktop, nativeAction, reserveCallWindow } from '../native.mjs';
import Call from './Call.jsx';
import { meetingSoundEnabled, ringMeeting } from '../meetingAudio.mjs';

const minute = 60000,
  dayKey = (d) =>
    [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
const clock = (at) =>
  new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const localInput = (d) =>
  dayKey(d) +
  'T' +
  String(d.getHours()).padStart(2, '0') +
  ':' +
  String(d.getMinutes()).padStart(2, '0');
function Plan({ api, me, members, context, close, created }) {
  const channel = context.ch,
    instant = context.mode === 'now';
  const first = new Date(Date.now() + 30 * minute);
  first.setSeconds(0, 0);
  if (context.day && context.day > dayKey(first)) {
    const [y, m, d] = context.day.split('-').map(Number);
    first.setFullYear(y, m - 1, d);
    first.setHours(9, 0, 0, 0);
  }
  const [title, setTitle] = useState(
      channel
        ? channel.kind === 'direct'
          ? 'Call with ' + [me.name, channel.name].join(' & ')
          : channel.name + ' meeting'
        : instant ? me.name + '’s meeting' : '',
    ),
    [start, setStart] = useState(localInput(first)),
    [duration, length] = useState(60),
    [auto, admission] = useState(true),
    [invited, invite] = useState([]),
    [query, search] = useState(''),
    [guestType, typeGuests] = useState('People'),
    [roleIds, setRoles] = useState([]),
    [channels, setChannels] = useState([]);
  const groups = useLoad(() => api.command('roles.list'), [api]),
    channelList = useLoad(() => api.command('channel.list'), [api]);
  const guests =
    guestType === 'People'
      ? members.filter((m) => m.active && m.id !== me.id)
      : guestType === 'Roles'
        ? groups.data || []
        : (channelList.data || []).filter(
            (c) => c.kind !== 'direct' && c.id !== channel?.id,
          );
  const selected =
    guestType === 'People'
      ? invited
      : guestType === 'Roles'
        ? roleIds
        : channels;
  const setGuests =
    guestType === 'People'
      ? invite
      : guestType === 'Roles'
        ? setRoles
        : setChannels;

  const key = useRef(newId('meet')),
    job = useJob();
  return (
    <Modal
      title={instant ? 'Start call' : 'Schedule a meeting'}
      subtitle={channel?.name || 'Calendar'}
      onClose={() => !job.busy && close()}
    >
      <form
        className="scheduler-form"
        onSubmit={(e) => {
          e.preventDefault();
          job.run(async () => {
            const popup = instant && reserveCallWindow(key.current, title);
            try {
            const room = await api.command('meeting.create', {
              id: key.current,
              title,
              channel: channel?.id || '',
              instant,
              start: new Date(start).getTime(),
              duration: Number(duration),
              invited,
              roleIds,
              channels,
              auto,
            });
            if (popup) popup.open();
            await created(room);
            } catch (e) {
              if (popup) popup.cancel();
              throw e;
            }
          });
        }}
      >
        <div className="form-body scroll">
          <Label name="Meeting name">
            <input
              autoFocus
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Design review"
            />
          </Label>
          <div className="form-grid">
            {!instant && (
              <>
                <Label name="Date">
                  <input
                    required
                    type="date"
                    value={start.split('T')[0]}
                    onChange={(e) =>
                      setStart(e.target.value + 'T' + start.split('T')[1])
                    }
                  />
                </Label>
                <Label name="Start time">
                  <input
                    required
                    type="time"
                    value={start.split('T')[1]}
                    onChange={(e) =>
                      setStart(start.split('T')[0] + 'T' + e.target.value)
                    }
                  />
                </Label>
              </>
            )}
            <Label name="Duration">
              <select value={duration} onChange={(e) => length(e.target.value)}>
                {[15, 30, 45, 60, 90, 120, 240, 480].map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
              </select>
            </Label>
          </div>
          <section className="guest-section">
            <h3>Guests <small>(optional)</small></h3>
            {channel && (
              <p>
                {channel.name} ·{' '}
                {channel.kind === 'direct'
                  ? 'Both people invited'
                  : 'Entire channel invited'}
              </p>
            )}
            <Tabs
              values={['People', 'Roles', 'Channels']}
              value={guestType}
              onChange={(v) => {
                typeGuests(v);
                search('');
              }}
            />
            <input
              type="search"
              aria-label="Find guests"
              placeholder={'Find ' + guestType.toLowerCase() + '…'}
              value={query}
              onChange={(e) => search(e.target.value)}
            />
            <div className="meeting-people">
              {guests
                .filter((g) =>
                  g.name.toLowerCase().includes(query.toLowerCase()),
                )
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((g) => (
                  <Check
                    key={g.id}
                    checked={selected.includes(g.id)}
                    onChange={(e) =>
                      setGuests(
                        e.target.checked
                          ? [...selected, g.id]
                          : selected.filter((i) => i !== g.id),
                      )
                    }
                  >
                    {g.name}
                  </Check>
                ))}
            </div>
            <small>
              {[
                invited.length +
                  ' ' +
                  (invited.length === 1 ? 'person' : 'people'),
                roleIds.length +
                  ' ' +
                  (roleIds.length === 1 ? 'role' : 'roles'),
                channels.length +
                  (channel ? 1 : 0) +
                  ' ' +
                  (channels.length + (channel ? 1 : 0) === 1
                    ? 'channel'
                    : 'channels'),
              ].join(' · ')}
            </small>
            <ErrorText error={groups.error || channelList.error} />
          </section>
          <Check checked={auto} onChange={(e) => admission(e.target.checked)}>
            Automatically admit invited people
          </Check>
          {!auto && (
            <small>
              You’ll see requests in the call and can admit each person.
            </small>
          )}
          <ErrorText error={job.error} />
        </div>
        <footer>
          <Btn onClick={close}>Cancel</Btn>
          <button
            className="btn primary"
            disabled={job.busy || !title.trim()}
          >
            {instant ? 'Start call' : 'Schedule meeting'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function Month({ day, select, rooms }) {
  const selected = new Date(day + 'T12:00:00'),
    y = selected.getFullYear(),
    m = selected.getMonth(),
    first = new Date(y, m, 1);
  const days = new Date(y, m + 1, 0).getDate(),
    dates = new Set(
      rooms.filter((r) => !r.ended).map((r) => dayKey(new Date(r.start))),
    );
  return (
    <aside className="month-panel">
      <div className="section-line">
        <IconButton
          icon={ChevronLeft}
          label="Previous month"
          onClick={() => select(dayKey(new Date(y, m - 1, 1)))}
        />
        <b>
          {selected.toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </b>
        <IconButton
          icon={ChevronRight}
          label="Next month"
          onClick={() => select(dayKey(new Date(y, m + 1, 1)))}
        />
      </div>
      <div className="month-grid">
        {Array.from({ length: 7 }, (_, i) => (
          <small key={'w' + i}>
            {new Date(2024, 0, 7 + i).toLocaleDateString(undefined, {
              weekday: 'narrow',
            })}
          </small>
        ))}
        {Array.from({ length: first.getDay() }, (_, i) => (
          <span key={'space' + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const key = dayKey(new Date(y, m, i + 1));
          return (
            <button
              key={key}
              aria-label={key}
              aria-pressed={day === key}
              className={dates.has(key) ? 'has-meeting' : ''}
              onClick={() => select(key)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <Btn onClick={() => select(dayKey(new Date()))}>Today</Btn>
    </aside>
  );
}
export default function Meetings({
  api,
  me,
  members,
  tell,
  prefs,
  visible,
  hub,
  request,
  reminders = true,
  callRoom = '',
  onAttendance,
}) {
  const [rooms, setRooms] = useState([]),
    [now, setNow] = useState(Date.now()),
    [day, select] = useState(dayKey(new Date())),
    [plan, setPlan] = useState(null),
    [call, setCall] = useState(null),
    [invite, setInvite] = useState(null),
    [listing, setListing] = useState('Upcoming'),
    [error, fail] = useState('');
  const offset = useRef(0),
    job = useJob(),
    joining = useRef(false);
  const [roomListReady, setRoomListReady] = useState(false);
  const attempted = useRef('');
  useEffect(() => {
    if (request) setPlan(request);
  }, [request]);
  useEffect(
    () =>
      api.watchMeetings(
        (data) => {
          setNow(Date.now() + offset.current);
          setRooms(data.sort((a, b) => a.start - b.start));
          setRoomListReady(true);
          fail('');
        },
        (e) => fail(e.message),
      ),
    [api],
  );
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset.current);
    const off = api.watchClock((x) => {
      offset.current = x;
      tick();
    });
    const wake = (e) => {
      if (e.data?.kind === 'meeting_clock') tick();
    };
    desktop?.addEventListener('message', wake);
    const timer = setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    return () => {
      off();
      desktop?.removeEventListener('message', wake);
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [api]);
  const nextBoundary = rooms.reduce((next, m) => {
    if (m.ended) return next;
    return Math.min(
      next,
      ...[m.start - 5 * minute, m.start, m.instant ? m.start + minute : 0, m.end].filter((at) => at > now),
    );
  }, Infinity);
  useEffect(() => {
    if (!Number.isFinite(nextBoundary)) return;
    const delay = Math.min(
      2147483647,
      Math.max(1, nextBoundary - Date.now() - offset.current + 10),
    );
    const wake = setTimeout(() => setNow(Date.now() + offset.current), delay);
    if (desktop && reminders) nativeAction('meeting_alarm', { delay });
    return () => {
      clearTimeout(wake);
      if (desktop && reminders) nativeAction('meeting_alarm', { delay: 0 });
    };
  }, [nextBoundary, reminders]);
  const seen = (id, phase) =>
    'monexus.meeting.' + me.id + '.' + id + '.' + phase;
  useEffect(() => {
    if (!reminders || ['Do Not Disturb', 'Offline'].includes(prefs.presence)) return;
    for (const m of rooms) {
      if (m.ended || now >= m.end || (m.instant && m.host === me.id)) continue;
      const remaining = m.start - now;
      if (remaining > 5 * minute) continue;
      const phase = remaining > 0 ? 'soon' : 'open',
        key = seen(m.id, phase);
      if (m.instant && now - m.start > minute) continue;
      if (localStorage.getItem(key)) continue;
      if (phase === 'open' && (call || invite)) continue;
      localStorage.setItem(key, '1');
      const minutes = Math.max(1, Math.ceil(remaining / minute));
      const title =
        phase === 'soon'
          ? 'Meeting in ' + minutes + (minutes === 1 ? ' minute' : ' minutes')
          : m.instant ? 'Incoming meeting call' : 'Meeting open now';
      if (
        desktop &&
        prefs.presence !== 'Do Not Disturb' &&
        prefs.presence !== 'Offline'
      )
        nativeAction('deliver_notification', {
          title,
          body: m.title,
          banner: prefs.banners !== false,
          foregroundHandled: phase === 'open',
          sound: !m.instant && !!prefs.sound,
        });
      if (phase === 'open') {
        setInvite(m.id);
        if (desktop && prefs.banners !== false && prefs.presence === 'Online') nativeAction('restore');
        break;
      } else if (!desktop) tell(title + ' · ' + m.title);
    }
  }, [rooms, now, call, invite, me.id, prefs, reminders]);
  function openMeeting(m) {
    reserveCallWindow(m.id, m.title).open();
    localStorage.setItem(seen(m.id, 'open'), '1');
    setInvite(null);
  }
  async function join(m) {
    if (joining.current || call) return;
    joining.current = true;
    const sessionKey = 'monexus.call.' + me.id + '.' + m.id;
    const previousSession = sessionStorage.getItem(sessionKey);
    const session = crypto.randomUUID();
    try {
      const result = await api.command('meeting.join', { id: m.id, session, previousSession });
      sessionStorage.setItem(sessionKey, session);
      localStorage.setItem(seen(m.id, 'open'), '1');
      setInvite(null);
      setCall({ id: m.id, room: m, session, ...result });
    } finally {
      joining.current = false;
    }
  }
  const target = callRoom && rooms.find(m => m.id === callRoom);
  useEffect(() => {
    if (!target || attempted.current === target.id) return;
    attempted.current = target.id;
    join(target).catch(e => fail(e.message));
  }, [target]);
  function closeCall() {
    if (desktop) nativeAction('close_window');
    else window.close();
  }
  const room = call && (rooms.find((x) => x.id === call.id) || call.room);
  const incoming = rooms.find(
    (x) => x.id === invite && !x.ended && x.end > now && (!x.instant || x.start + minute > now),
  );
  const audible = meetingSoundEnabled(me.id, 'ringtone') && !['Offline', 'Do Not Disturb'].includes(prefs.presence);
  useEffect(() => {
    if (!incoming?.instant || !audible || call || !window.AudioContext) return;
    const duration = Math.min(30000, incoming.start + minute - Date.now() - offset.current);
    if (duration > 0) return ringMeeting(duration);
  }, [incoming?.id, audible, call]);
  const history = hub && listing === 'History';
  const upcoming = rooms.filter(x => !x.ended && x.end > now);
  const agenda = history ? rooms.filter(x => x.ended || x.end <= now).reverse() :
    upcoming.filter(x => hub ? x.start > now : dayKey(new Date(x.start)) === day);
  const current = rooms.filter(
    (x) => !x.ended && x.start <= now && x.end > now,
  );
  useEffect(() => {
    if (invite && !incoming) setInvite(null);
  }, [invite, incoming]);
  const joinButton = (m) => (
    <Btn
      icon={Phone}
      kind="primary"
      disabled={job.busy || !!call}
      onClick={() => job.run(() => openMeeting(m))}
    >
      Join meeting
    </Btn>
  );
  return (
    <>
      {callRoom && !call && <section className="page">
        <h1>{target?.title || 'Meeting'}</h1>
        <p role="status">{error || (roomListReady && !target ? 'This meeting is unavailable for your account.' : 'Connecting to the meeting…')}</p>
        {error && target && <Btn disabled={job.busy} onClick={() => job.run(() => join(target))}>Retry</Btn>}
        <Btn onClick={closeCall}>Close window</Btn>
      </section>}
      {visible && !callRoom && (
        <div className="page calendar-view">
          <div className="page-head">
            <h1>{hub ? 'Meetings' : 'Calendar'}</h1>
            <div className="row">
              {hub && (
                <Btn icon={Phone} onClick={() => setPlan({ mode: 'now' })}>
                  Start call
                </Btn>
              )}
              <Btn
                kind="primary"
                icon={CalendarPlus}
                onClick={() => setPlan({ mode: 'schedule', day })}
              >
                Schedule meeting
              </Btn>
            </div>
          </div>
          {hub && <Tabs values={['Upcoming', 'History']} value={listing} onChange={setListing} />}
          {!history && current.length > 0 && (
            <div className="live-meetings">
              <b>Open now</b>
              {current.map((m) => (
                <div key={m.id}>
                  <span>{m.title}</span>
                  {joinButton(m)}
                </div>
              ))}
            </div>
          )}
          <div className={hub ? undefined : 'calendar-columns'}>
            {!hub && <Month day={day} select={select} rooms={upcoming} />}
            <section className="agenda-panel">
              <h2>
                {hub
                  ? history ? 'Meeting history' : 'Upcoming meetings'
                  : new Date(day + 'T12:00').toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
              </h2>
              {agenda.map((m) => (
                <article className="agenda-item" key={m.id}>
                  <Clock3 size={17} />
                  <div>
                    <small>
                      {hub &&
                        new Date(m.start).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        }) + ' · '}
                      {clock(m.start)} – {clock(m.end)}
                    </small>
                    <h3>{m.title}</h3>
                    <small>
                      {members.find((p) => p.id === m.host)?.name} ·{' '}
                      {m.invited.length} invited ·{' '}
                      {m.auto ? 'Auto-admit' : 'Host admits'}
                    </small>
                  </div>
                  <div>
                    {m.ended || now >= m.end ? (
                      <small>Ended</small>
                    ) : now >= m.start ? (
                      joinButton(m)
                    ) : (
                      <span>Scheduled</span>
                    )}
                  </div>
                </article>
              ))}
              {!agenda.length && (
                <div className="resource-empty">
                  <CalendarDays />
                  <h3>{history ? 'No past meetings' : 'No meetings scheduled'}</h3>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
      {(error || job.error) && (visible || invite) && (
        <ErrorText error={error || job.error} />
      )}
      {plan && (
        <Plan
          {...{ api, me, members }}
          context={plan}
          close={() => setPlan(null)}
          created={async (m) => {
            select(dayKey(new Date(m.start)));
            if (m.instant) localStorage.setItem(seen(m.id, 'open'), '1');
            else tell('Meeting scheduled.');
            setPlan(null);
          }}
        />
      )}
      {incoming && prefs.banners !== false && !['Offline', 'Do Not Disturb'].includes(prefs.presence) &&
        !call &&
        createPortal(
          <div
            className="meeting-invite"
            role="alertdialog"
            aria-label={incoming.instant ? 'Incoming meeting call' : 'Meeting open now'}
          >
            <span className="invite-phone"><Phone size={27} /></span>
            <div>
              <small>{incoming.instant ? 'Incoming meeting call' : 'Meeting open now'}</small>
              <h3>{incoming.title}</h3>
              <p>{members.find(person => person.id === incoming.host)?.name || 'A team member'} {incoming.instant ? 'is calling you.' : 'is hosting.'}</p>
              <div className="row">
                {joinButton(incoming)}
                <Btn onClick={() => setInvite(null)}>Decline for now</Btn>
              </div>
              <ErrorText error={job.error} />
            </div>
          </div>,
          document.body,
        )}
      {call && (
        <Call
          key={call.session}
          {...{ api, me, members, now, onAttendance }}
          m={room}
          entry={call}
          exit={(msg) => {
            setCall(null);
            if (msg) fail(msg);
            else closeCall();
          }}
        />
      )}
    </>
  );
}
