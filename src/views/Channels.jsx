import React, { useEffect, useState, useRef } from 'react';
import {
  Plus,
  Hash,
  Megaphone,
  Settings2,
  Send,
  Pin,
  Reply,
  Paperclip,
  Link2,
  Check as Tick,
  Minus,
  Clock3,
  UsersRound,
} from 'lucide-react';
import {
  channelActions,
  channelAllows,
  isAdmin,
  newId,
} from '../../functions/core/model.mjs';
import {
  Avatar,
  Btn,
  IconButton,
  Modal,
  Label,
  Check,
  ErrorText,
  useJob,
  useLoad,
  Empty,
  Attachments,
  openLink,
} from '../ui.jsx';
function ChannelSettings({ api, initial, members, onClose, saved }) {
  const [c, set] = useState(
      initial
        ? { ...initial, users: Object.keys(initial.users || {}) }
        : {
            id: newId('ch'),
            name: '',
            kind: 'text',
            everyone: true,
            users: [],
            permissions: {
              post: 'member',
              react: 'member',
              pin: 'admin',
            },
          },
    ),
    job = useJob(),
    patch = (o) => set({ ...c, ...o });
  return (
    <Modal
      title={initial ? 'Channel settings' : 'Create channel'}
      onClose={onClose}
    >
      <div className="form-body scroll">
        <Label name="Channel name">
          <input
            value={c.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Label>
        <Label name="Channel type">
          <select
            value={c.kind}
            onChange={(e) =>
              patch({
                kind: e.target.value,
                permissions: {
                  ...c.permissions,
                  post: e.target.value === 'announcement' ? 'admin' : 'member',
                },
              })
            }
          >
            <option value="text">Text</option>
            <option value="announcement">Announcement</option>
          </select>
        </Label>
        <Check
          checked={c.everyone}
          onChange={(e) => patch({ everyone: e.target.checked })}
        >
          Visible to all workspace members
        </Check>
        {!c.everyone && (
          <Label name="Selected members">
            <select
              multiple
              value={c.users}
              onChange={(e) =>
                patch({
                  users: [...e.target.selectedOptions].map((x) => x.value),
                })
              }
            >
              {members
                .filter((m) => m.active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </Label>
        )}
        {channelActions.map((k) => (
          <Label key={k} name={'Who can ' + k + '?'}>
            <select
              value={c.permissions[k]}
              onChange={(e) =>
                patch({
                  permissions: { ...c.permissions, [k]: e.target.value },
                })
              }
            >
              <option value="member">Channel members</option>
              <option value="admin">Workspace admins</option>
              <option value="none">Nobody</option>
            </select>
          </Label>
        ))}
        <ErrorText error={job.error} />
      </div>
      <footer>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          kind="primary"
          disabled={job.busy}
          onClick={() =>
            job.run(async () => {
              await api.command('channel.save', c);
              saved(c.id);
            })
          }
        >
          Save channel
        </Btn>
      </footer>
    </Modal>
  );
}
function MessageBody({ message, members }) {
  const labels = (message.mentions || []).map(id => members.find(m => m.id === id))
    .filter(Boolean).map(m => '@' + m.name).sort((a,b) => b.length - a.length);
  const parts = [];
  let offset = 0;
  while (offset < message.body.length) {
    const matches = labels.map(label => ({label, at:message.body.indexOf(label,offset)}))
      .filter(match => match.at >= offset).sort((a,b) => a.at - b.at);
    const next = matches[0];
    if (!next) {parts.push(message.body.slice(offset));break;}
    parts.push(message.body.slice(offset,next.at), <mark key={next.at}>{next.label}</mark>);
    offset = next.at + next.label.length;
  }
  return <p>{parts.map((part,index) => typeof part === 'string' ?
    part.split(/(https?:\/\/[^\s<>]+)/g).map((piece,i) => /^https?:\/\//.test(piece)
      ? <button key={index+'-'+i} className="inline-chat-link" onClick={() => openLink(piece)}>{piece}</button> : piece) : part)}</p>;
}

function PersonIcon({ person, state = 'Offline' }) {
  const Icon = { Online: Tick, Idle: Clock3, 'Do Not Disturb': Minus }[state];
  return <span className="chat-avatar"><Avatar person={person} small />
    <span className="presence-icon" data-state={state} role="img" aria-label={state} title={state}>
      {Icon && <Icon size={9} strokeWidth={3} />}
    </span></span>;
}

function Feed({ api, ch, me, members, tell, configure, presence }) {
  const [recent, setRecent] = useState([]),
    [older, setOlder] = useState([]),
    [end, setEnd] = useState(false),
    [body, text] = useState(''),
    [tags, setTags] = useState([]),
    [caret, setCaret] = useState(-1),
    [choice, setChoice] = useState(0),
    [reply, to] = useState(null),
    [file, attach] = useState(null),
    [media, showMedia] = useState(''),
    [pinned, onlyPins] = useState(false),
    [progress, setProgress] = useState(0),
    job = useJob();
  const stream = useRef(null), follow = useRef(true), composer = useRef(null);
  const query = caret < 0 ? null : body.slice(0, caret).match(/(?:^|\s)@([^@\s]*)$/u);
  const candidates = query ? members.filter(m => channelAllows(ch, m) &&
    m.name.toLowerCase().includes(query[1].toLowerCase())).slice(0, 8) : [];
  function editBody(next) {
    let start = 0, end = body.length, tail = next.length;
    while (start < end && start < tail && body[start] === next[start]) start++;
    while (end > start && tail > start && body[end-1] === next[tail-1]) { end--; tail--; }
    setTags(tags.flatMap(tag => tag.end <= start ? [tag] : tag.start >= end
      ? [{...tag, start:tag.start+tail-end, end:tag.end+tail-end}] : []));
    text(next);
    setChoice(0);
  }
  function tagPerson(person) {
    const start = caret - query[1].length - 1;
    const label = '@' + person.name;
    const next = body.slice(0,start) + label + ' ' + body.slice(caret);
    const delta = next.length - body.length;
    setTags([...tags.filter(t => t.end <= start), {id:person.id, start, end:start+label.length},
      ...tags.filter(t => t.start >= caret).map(t => ({...t,start:t.start+delta,end:t.end+delta}))]);
    text(next);
    setCaret(-1);
    requestAnimationFrame(() => {
      const el = composer.current;
      el?.focus();
      el?.setSelectionRange(start + label.length + 1, start + label.length + 1);
    });
  }
  const latest = recent[recent.length - 1]?.id;
  useEffect(() => {
    if (follow.current && stream.current) stream.current.scrollTop = stream.current.scrollHeight;
  }, [latest]);
  const [pinLimit, setPinLimit] = useState(50);
  useEffect(() => {
    setRecent([]);
    return api.watchMessages(
      ch.id,
      setRecent,
      (e) => {
        setRecent([]);
        setOlder([]);
        tell(e);
      },
      { pinned, limit: pinLimit },
    );
  }, [api, ch.id, pinned, pinLimit]);
  const all = [
      ...new Map(
        [...(pinned ? [] : older), ...recent].map((m) => [m.id, m]),
      ).values(),
    ].sort((a, b) => a.at - b.at),
    can = (k) => channelAllows(ch, me, k);
  const command = (op, p) =>
    job.run(() => api.command('channel.' + op, { channel: ch.id, ...p }));
  const post = () =>
    job.run(async () => {
      const key = newId('msg');
      await api.command('channel.post', {
        channel: ch.id,
        id: key,
        body,
        reply: reply?.id || '',
        mentions: [...new Set(tags.map(t => t.id))],
        hasMedia: !!file,
      });
      follow.current = true;
      text(current => current === body ? '' : current);
      composer.current?.focus();
      setTags([]);
      setCaret(-1);
      to(null);
      if (file) {
        showMedia(key);
        await api.upload(
          { kind: 'channel', container: ch.id, item: key },
          file,
          setProgress,
        );
        attach(null);
      }
    });
  return (
    <div className="feed">
      <div className="section-line">
        <h2>
          {ch.kind === 'direct' ? <UsersRound size={20} /> : ch.kind === 'announcement' ? (
            <Megaphone size={20} />
          ) : (
            <Hash size={20} />
          )}{' '}
          {ch.name}
        </h2>
        <div className="row">{configure && <IconButton icon={Settings2} label="Channel settings" onClick={configure} />}<Btn
          kind={pinned ? 'tinted' : ''}
          icon={Pin}
          onClick={() => onlyPins(!pinned)}
        >
          Pinned
        </Btn></div>
      </div>
      {pinned && recent.length === pinLimit && (
        <Btn onClick={() => setPinLimit((n) => n + 50)}>
          Load more pinned posts
        </Btn>
      )}
      {!pinned && (recent.length >= 50 || older.length > 0) && !end && (
        <Btn
          onClick={() =>
            job.run(async () => {
              const first = all[0],
                p = await api.command('channel.older', {
                  channel: ch.id,
                  id: first.id,
                  at: first.at,
                });
              setOlder([...p, ...older]);
              setEnd(p.length < 50);
            })
          }
        >
          Load earlier posts
        </Btn>
      )}
      <div className="feed-posts" ref={stream} onScroll={e => {
        const el = e.currentTarget;
        follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}>
        {all
          .filter((m) => !pinned || m.pinned)
          .map((m, i, shown) => {
            const person = members.find((x) => x.id === m.by);
            return (
              <React.Fragment key={m.id}>{(!i || new Date(shown[i-1].at).toDateString() !== new Date(m.at).toDateString()) &&
                <div className="chat-day">{new Date(m.at).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</div>}
              <article className={'post chat-message ' + (m.by === me?.id ? 'own' : '')} key={m.id}>
                <div className="row">
                  <PersonIcon person={person} state={presence[m.by]} />
                  <strong>{person?.name || 'Member'}</strong>
                  <small>{new Date(m.at).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</small>
                  {m.pinned && <Pin size={13} />}
                </div>
                {m.reply && (
                  <button
                    className="quoted"
                    onClick={() =>
                      command('message', { id: m.reply }).then(
                        (x) => x && tell(x.body || 'Attachment'),
                      )
                    }
                  >
                    ↳{' '}
                    {all.find((x) => x.id === m.reply)?.body ||
                      'View replied-to message'}
                  </button>
                )}
                {m.body && <MessageBody message={m} members={members} />}
                {m.hasMedia && <Btn kind="compact" icon={Paperclip} onClick={() => showMedia(media === m.id ? '' : m.id)}>View attachment</Btn>}
                {(m.mentions || []).filter(k => !m.body?.includes('@' + members.find(p => p.id === k)?.name)).map((k) => (
                  <span className="chip type-design" key={k}>
                    @{members.find((p) => p.id === k)?.name}
                  </span>
                ))}
                {(m.links || []).map((u) => (
                  <button
                    className="text-btn"
                    key={u}
                    onClick={() => openLink(u)}
                  >
                    {u}
                  </button>
                ))}
                <div className="post-actions">
                  {['👍', '❤️', '🎉'].map((r) => (
                    <button
                      key={r}
                      aria-label={'React ' + r}
                      className={Object.keys(m.reactions?.[r] || {}).length ? 'has-reactions' : ''}
                      disabled={!can('react')}
                      onClick={() => command('react', { id: m.id, emoji: r })}
                    >
                      {r} {Object.keys(m.reactions?.[r] || {}).length || ''}
                    </button>
                  ))}
                  {can('post') && (
                    <IconButton
                      icon={Reply}
                      label="Reply"
                      onClick={() => to(m)}
                    />
                  )}
                  <IconButton
                    icon={Paperclip}
                    label="Message attachments"
                    onClick={() => showMedia(media === m.id ? '' : m.id)}
                  />
                  {can('pin') && (
                    <IconButton
                      icon={Pin}
                      label={m.pinned ? 'Unpin' : 'Pin'}
                      onClick={() =>
                        command('pin', { id: m.id, value: !m.pinned })
                      }
                    />
                  )}
                </div>
                {media === m.id && (
                  <Attachments
                    api={api}
                    scope={{ kind: 'channel', container: ch.id, item: m.id }}
                    canAdd={m.by === me?.id && can('post')}
                  />
                )}
              </article></React.Fragment>
            );
          })}
        {!all.some((m) => !pinned || m.pinned) && (
          <Empty>{pinned ? 'No pinned posts.' : 'No messages yet.'}</Empty>
        )}
      </div>
      {can('post') && (
        <div className="composer">
          {reply && (
            <button className="quoted" onClick={() => to(null)}>
              Replying to {reply.body.slice(0, 65)} ×
            </button>
          )}
          {candidates.length > 0 && <div className="mention-results" role="listbox" aria-label="Mention teammate">
            {candidates.map((m,i) => <button type="button" role="option" aria-selected={i === choice % candidates.length}
              key={m.id} onMouseDown={e => e.preventDefault()} onClick={() => tagPerson(m)}>
              <PersonIcon person={m} state={presence[m.id]} />{m.name}<small>{m.email}</small></button>)}
          </div>}
          <textarea
            rows={2}
            aria-label="Message"
            ref={composer}
            placeholder={'Message ' + (ch.kind === 'direct' ? '' : '#') + ch.name + ' · @ to mention'}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing) return;
              if (candidates.length && !e.shiftKey) {
                const index = choice % candidates.length;
                if (['ArrowDown','ArrowUp'].includes(e.key)) {
                  e.preventDefault(); setChoice((index + candidates.length + (e.key === 'ArrowDown' ? 1 : -1)) % candidates.length); return;
                }
                if (e.key === 'Escape') { e.preventDefault(); setCaret(-1); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); tagPerson(candidates[index]); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!job.busy && (body.trim() || file)) post();
              }
            }}
            value={body}
            readOnly={job.busy}
            onSelect={e => {if(e.currentTarget.selectionStart === e.currentTarget.selectionEnd) setCaret(e.currentTarget.selectionStart); else setCaret(-1);}}
            onChange={e => { editBody(e.target.value); setCaret(e.target.selectionStart); }}
          />
          <div className="row wrap composer-tools">
            <label className="btn compact">
              <Paperclip size={14} />
              {file ? file.name : 'Attach'}
              <input
                hidden
                type="file"
                onChange={(e) => attach(e.target.files[0])}
              />
            </label>
          <Btn kind="primary" icon={Send} title="Send (Enter). Shift+Enter for a new line." disabled={job.busy || !(body.trim() || file)} onClick={post}>
            {job.busy && progress
              ? 'Uploading ' + progress + '%'
              : 'Send'}
          </Btn>
          </div>


        </div>
      )}
      <ErrorText error={job.error} />
    </div>
  );
}
export default function Channels({
  api,
  me,
  members,
  selected,
  onSelect,
  tell,
}) {
  const channels = useLoad(() => api.command('channel.list'), [api]),
    [edit, setEdit] = useState(null),
    [presence, setPresence] = useState({}),
    [direct, setDirect] = useState(null),
    [query, search] = useState(''),
    job = useJob();
  const list = channels.data || [];
  const raw = list.find(c => c.id === selected) || (direct?.id === selected ? direct : null) || list.find(c => c.kind !== 'direct');
  const peerId = raw?.kind === 'direct' ? Object.keys(raw.users).find(uid => uid !== me?.id) : '';
  const ch = peerId ? { ...raw, name: members.find(m => m.id === peerId)?.name || 'Teammate' } : raw;
  const matches = name => name.toLowerCase().includes(query.trim().toLowerCase());
  const people = members.filter(m => m.active && m.id !== me?.id && matches(m.name));
  const visible = list.filter(c => c.kind !== 'direct' && matches(c.name));
  useEffect(() => api.watchPresence(setPresence, tell), [api]);
  function openDirect(target) {
    job.run(async () => {
      const c = await api.command('channel.direct', { target });
      setDirect(c);
      onSelect(c.id);
    });
  }
  return (
    <div className="chat-page">
      <div className="channel-layout">
        <aside className="channel-nav">
          <div className="section-line"><h1>Chat</h1>
          {isAdmin(me) && <IconButton icon={Plus} label="New channel" onClick={() => setEdit({})} />}</div>
          <input type="search" aria-label="Find channels or people" placeholder="Find channels or people" value={query} onChange={e => search(e.target.value)} />
          <h4>Channels</h4>
          {visible.map(c => <button key={c.id} className={ch?.id === c.id ? 'on' : ''} onClick={() => onSelect(c.id)}>
            {c.kind === 'announcement' ? <Megaphone size={16} /> : <Hash size={16} />}{c.name}</button>)}
          {!visible.length && !channels.loading && <small>No channels found</small>}
          <h4>Direct messages</h4>
          {people.map(m => <button key={m.id} className={'teammate ' + (peerId === m.id ? 'on' : '')}
            disabled={job.busy} onClick={() => openDirect(m.id)}>
            <PersonIcon person={m} state={presence[m.id]} /><span>{m.name}<small>{presence[m.id] || 'Offline'}</small></span></button>)}
          {!people.length && <small>No teammates found</small>}
          <ErrorText error={channels.error || job.error} />
        </aside>
        {ch ? <Feed key={ch.id} {...{ api, ch, me, members, tell, presence }}
          configure={isAdmin(me) && !peerId ? () => setEdit(ch) : null} /> :
          <Empty>{channels.loading ? 'Loading conversations…' : 'Choose a channel or teammate to start a conversation.'}</Empty>}
      </div>
      {edit && (
        <ChannelSettings
          {...{ api, members }}
          initial={edit.id ? edit : null}
          onClose={() => setEdit(null)}
          saved={(id) => {
            setEdit(null);
            channels.refresh();
            onSelect(id);
          }}
        />
      )}
    </div>
  );
}
