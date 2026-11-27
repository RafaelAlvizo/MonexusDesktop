import { quickMenu } from '../Navigation.jsx';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronRight,
  MessagesSquare,
  ArrowUp,
  ArrowDown,
  Trash2,
  Pencil,
  Phone,
  CalendarPlus,
} from 'lucide-react';
import { PeoplePicker } from './Sharing.jsx';
import { PollForm, PollResult, Roster } from './ChatTools.jsx';
import { saveFile } from '../ui.jsx';
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
          <PeoplePicker
            label="Selected members"
            options={members
              .filter((m) => m.active)
              .sort((a, b) => a.name.localeCompare(b.name))}
            value={c.users}
            change={(users) => patch({ users })}
          />
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
  const labels = (message.mentions || [])
    .map((id) => members.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => '@' + m.name)
    .sort((a, b) => b.length - a.length);
  const parts = [];
  let offset = 0;
  while (offset < message.body.length) {
    const matches = labels
      .map((label) => ({ label, at: message.body.indexOf(label, offset) }))
      .filter((match) => match.at >= offset)
      .sort((a, b) => a.at - b.at);
    const next = matches[0];
    if (!next) {
      parts.push(message.body.slice(offset));
      break;
    }
    parts.push(
      message.body.slice(offset, next.at),
      <mark key={next.at}>{next.label}</mark>,
    );
    offset = next.at + next.label.length;
  }
  return (
    <p>
      {parts.map((part, index) =>
        typeof part === 'string'
          ? part.split(/(https?:\/\/[^\s<>]+)/g).map((piece, i) =>
              /^https?:\/\//.test(piece) ? (
                <button
                  key={index + '-' + i}
                  className="inline-chat-link"
                  onClick={() => openLink(piece)}
                >
                  {piece}
                </button>
              ) : (
                piece
              ),
            )
          : part,
      )}
    </p>
  );
}

function PersonIcon({ person, state = 'Offline' }) {
  const Icon = { Online: Tick, Idle: Clock3, 'Do Not Disturb': Minus }[state];
  return (
    <span className="chat-avatar">
      <Avatar person={person} small />
      <span
        className="presence-icon"
        data-state={state}
        role="img"
        aria-label={state}
        title={state}
      >
        {Icon && <Icon size={9} strokeWidth={3} />}
      </span>
    </span>
  );
}

function Preview({ api, file }) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  const kind = /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.mime)
    ? 'image'
    : /^video\/(mp4|webm|ogg)$/.test(file.mime)
      ? 'video'
      : /^audio\/(mpeg|mp4|ogg|wav|webm)$/.test(file.mime)
        ? 'audio'
        : '';
  const [load, start] = useState(file.size <= 24 * 1024 * 1024);
  useEffect(() => {
    if (!kind || !load) return;
    let live = true,
      object;
    api
      .fileBlob(file.id)
      .then((blob) => {
        if (live) {
          object = URL.createObjectURL(blob.slice(0, blob.size, file.mime));
          setUrl(object);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      if (object) URL.revokeObjectURL(object);
    };
  }, [api, file.id, kind, load]);
  return (
    <div className="chat-preview">
      {url &&
        (kind === 'image' ? (
          <img src={url} alt={file.name} />
        ) : kind === 'video' ? (
          <video controls preload="metadata" src={url} />
        ) : (
          <audio controls src={url} />
        ))}
      {kind && !load && (
        <Btn onClick={() => start(true)}>Preview {file.name}</Btn>
      )}
      <button
        className="text-btn"
        onClick={() =>
          saveFile(api, file.id, file.name).catch((e) => setError(e.message))
        }
      >
        {file.name}
      </button>
      <ErrorText error={error} />
    </div>
  );
}
function MessageMedia({ api, channel, message }) {
  const files = useLoad(
    () =>
      api.command('file.list', {
        scope: { kind: 'channel', container: channel, item: message.id },
      }),
    [api, channel, message.id, message.mediaVersion],
  );
  return (
    <>
      {(files.data?.items || []).map((file) => (
        <Preview key={file.id} {...{ api, file }} />
      ))}
      {files.loading && <small>Loading attachment…</small>}
      <ErrorText error={files.error} />
    </>
  );
}
const previews = new WeakMap();
function recentMessages(api) {
  if (!previews.has(api)) previews.set(api, new Map());
  return previews.get(api);
}
function Feed({
  api,
  ch,
  me,
  members,
  tell,
  configure,
  presence,
  meeting,
  initialDraft = '',
  consumeDraft,
}) {
  const [recent, setRecent] = useState(
      () => recentMessages(api).get(ch.id) || [],
    ),
    [poll, makePoll] = useState(false),
    [roster, showRoster] = useState(false),
    [typing, setTyping] = useState({}),
    [clock, tick] = useState(Date.now),
    typingWriter = useRef(null),
    [older, setOlder] = useState([]),
    [end, setEnd] = useState(false),
    [body, text] = useState(initialDraft),
    [tags, setTags] = useState([]),
    [caret, setCaret] = useState(-1),
    [choice, setChoice] = useState(0),
    [reply, to] = useState(null),
    [file, attach] = useState(null),
    [editing, setEditing] = useState(null),
    [clearing, setClearing] = useState(false),
    [deleting, confirmDelete] = useState(null),
    [media, showMedia] = useState(''),
    [pinned, onlyPins] = useState(false),
    [progress, setProgress] = useState(0),
    job = useJob();
  const stream = useRef(null),
    follow = useRef(true),
    composer = useRef(null);
  useEffect(() => {
    composer.current?.focus();
    consumeDraft?.();
  }, [ch.id]);
  const query =
    caret < 0 ? null : body.slice(0, caret).match(/(?:^|\s)@([^@\s]*)$/u);
  const candidates = query
    ? members
        .filter(
          (m) =>
            channelAllows(ch, m) &&
            m.name.toLowerCase().includes(query[1].toLowerCase()),
        )
        .slice(0, 8)
    : [];
  function editBody(next) {
    let start = 0,
      end = body.length,
      tail = next.length;
    while (start < end && start < tail && body[start] === next[start]) start++;
    while (end > start && tail > start && body[end - 1] === next[tail - 1]) {
      end--;
      tail--;
    }
    setTags(
      tags.flatMap((tag) =>
        tag.end <= start
          ? [tag]
          : tag.start >= end
            ? [
                {
                  ...tag,
                  start: tag.start + tail - end,
                  end: tag.end + tail - end,
                },
              ]
            : [],
      ),
    );
    text(next);
    if (next.trim()) typingWriter.current?.update();
    else typingWriter.current?.clear();
    setChoice(0);
  }
  function tagPerson(person) {
    const start = caret - query[1].length - 1;
    const label = '@' + person.name;
    const next = body.slice(0, start) + label + ' ' + body.slice(caret);
    const delta = next.length - body.length;
    setTags([
      ...tags.filter((t) => t.end <= start),
      { id: person.id, start, end: start + label.length },
      ...tags
        .filter((t) => t.start >= caret)
        .map((t) => ({ ...t, start: t.start + delta, end: t.end + delta })),
    ]);
    text(next);
    setCaret(-1);
    requestAnimationFrame(() => {
      const el = composer.current;
      el?.focus();
      el?.setSelectionRange(start + label.length + 1, start + label.length + 1);
    });
  }
  useEffect(() => {
    typingWriter.current = api.typing(ch.id);
    const off = api.watchTyping(ch.id, setTyping, tell);
    const interval = setInterval(() => tick(Date.now()), 1200);
    return () => {
      off();
      clearInterval(interval);
      typingWriter.current.clear();
    };
  }, [api, ch.id]);
  const typingNames = members
    .filter((m) => m.id !== me.id && typing[m.id] > clock - 6000)
    .map((m) => m.name);
  const latest = recent[recent.length - 1]?.id;
  useEffect(() => {
    if (follow.current && stream.current)
      stream.current.scrollTop = stream.current.scrollHeight;
  }, [latest]);
  const [pinLimit, setPinLimit] = useState(50);
  useEffect(() => {
    setRecent(pinned ? [] : recentMessages(api).get(ch.id) || []);
    return api.watchMessages(
      ch.id,
      (rows) => {
        if (!pinned) {
          const cache = recentMessages(api);
          cache.delete(ch.id);
          cache.set(ch.id, rows);
          if (cache.size > 20) cache.delete(cache.keys().next().value);
        }
        setRecent(rows);
      },
      (e) => {
        recentMessages(api).delete(ch.id);
        setRecent([]);
        setOlder([]);
        tell(e);
      },
      { pinned, limit: pinLimit },
    );
  }, [api, ch.id, pinned, pinLimit]);
  const prefetched = useRef(false);
  useEffect(() => {
    if (pinned || prefetched.current || recent.length < 50) return;
    let live = true;
    const first = recent[0];
    api
      .command('channel.older', { channel: ch.id, id: first.id, at: first.at })
      .then((rows) => {
        if (live) {
          prefetched.current = true;
          setOlder(rows);
          setEnd(rows.length < 50);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ch.id, pinned, recent[0]?.id]);
  const olderIds = older.map((m) => m.id).join(',');
  useEffect(() => {
    if (!olderIds) return;
    const offs = olderIds.split(',').map((id) =>
      api.watchMessage(
        ch.id,
        id,
        (message) => {
          setOlder((xs) =>
            message
              ? xs.map((x) => (x.id === id ? message : x))
              : xs.filter((x) => x.id !== id),
          );
        },
        (e) => {
          setOlder([]);
          tell(e);
        },
      ),
    );
    return () => offs.forEach((off) => off());
  }, [api, ch.id, olderIds]);
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
        mentions: [...new Set(tags.map((t) => t.id))],
        hasMedia: !!file,
      });
      typingWriter.current?.clear();
      follow.current = true;
      text((current) => (current === body ? '' : current));
      composer.current?.focus();
      setTags([]);
      setCaret(-1);
      to(null);
      if (file) {
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
          {ch.kind === 'direct' ? (
            <UsersRound size={20} />
          ) : ch.kind === 'announcement' ? (
            <Megaphone size={20} />
          ) : (
            <Hash size={20} />
          )}{' '}
          {ch.name}
        </h2>
        <div className="row wrap">
          <IconButton
            label="Channel members"
            icon={UsersRound}
            onClick={() => showRoster(true)}
          />
          <Btn icon={Phone} onClick={() => meeting(ch, 'now')}>
            Call
          </Btn>
          <IconButton
            icon={CalendarPlus}
            label="Schedule a meeting"
            onClick={() => meeting(ch, 'schedule')}
          />
          {isAdmin(me) && (
            <IconButton
              icon={Trash2}
              label="Clear chat"
              onClick={() => setClearing(true)}
            />
          )}
          {configure && (
            <IconButton
              icon={Settings2}
              label="Channel settings"
              onClick={configure}
            />
          )}
          <Btn
            kind={pinned ? 'tinted' : ''}
            icon={Pin}
            onClick={() => onlyPins(!pinned)}
          >
            Pinned
          </Btn>
        </div>
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
      <div
        className="feed-posts"
        ref={stream}
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {all
          .filter((m) => !pinned || m.pinned)
          .map((m, i, shown) => {
            const person = members.find((x) => x.id === m.by);
            return (
              <React.Fragment key={m.id}>
                {(!i ||
                  new Date(shown[i - 1].at).toDateString() !==
                    new Date(m.at).toDateString()) && (
                  <div className="chat-day">
                    {new Date(m.at).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                )}
                <article
                  className={
                    'post chat-message ' + (m.by === me?.id ? 'own' : '')
                  }
                  key={m.id}
                >
                  <div className="row">
                    <PersonIcon person={person} state={presence[m.by]} />
                    <strong>{person?.name || 'Member'}</strong>
                    <small>
                      {new Date(m.at).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </small>
                    {m.editedAt && !m.deleted && <small>Edited</small>}
                    {m.pinned && <Pin size={13} />}
                  </div>
                  {m.deleted ? (
                    <p className="deleted-post">Message deleted</p>
                  ) : (
                    <>
                      {m.reply && (
                        <button
                          className="quoted"
                          onClick={() =>
                            command('message', { id: m.reply }).then(
                              (x) =>
                                x &&
                                tell(
                                  x.deleted
                                    ? 'Message deleted'
                                    : x.body || 'Attachment',
                                ),
                            )
                          }
                        >
                          ↳{' '}
                          {all.find((x) => x.id === m.reply)?.body ||
                            'View replied-to message'}
                        </button>
                      )}
                      {m.body && <MessageBody message={m} members={members} />}
                      {m.poll && (
                        <PollResult
                          poll={m.poll}
                          me={me}
                          enabled={channelAllows(ch, me, 'react')}
                          vote={(choice) =>
                            job.run(() =>
                              api.command('channel.vote', {
                                channel: ch.id,
                                id: m.id,
                                choice,
                              }),
                            )
                          }
                        />
                      )}
                      {m.hasMedia && (
                        <MessageMedia api={api} channel={ch.id} message={m} />
                      )}
                      {(m.mentions || [])
                        .filter(
                          (k) =>
                            !m.body?.includes(
                              '@' + members.find((p) => p.id === k)?.name,
                            ),
                        )
                        .map((k) => (
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
                            className={
                              Object.keys(m.reactions?.[r] || {}).length
                                ? 'has-reactions'
                                : ''
                            }
                            disabled={!can('react')}
                            onClick={() =>
                              command('react', { id: m.id, emoji: r })
                            }
                          >
                            {r}{' '}
                            {Object.keys(m.reactions?.[r] || {}).length || ''}
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
                        {(m.by === me.id || isAdmin(me)) && (
                          <IconButton
                            icon={Trash2}
                            label="Delete message for everyone"
                            onClick={() => confirmDelete(m.id)}
                          />
                        )}
                        {m.by === me.id && (
                          <IconButton
                            icon={Pencil}
                            label="Edit message"
                            onClick={() =>
                              setEditing({
                                id: m.id,
                                body: m.body || '',
                                rev: m.editRev || 0,
                              })
                            }
                          />
                        )}
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
                          scope={{
                            kind: 'channel',
                            container: ch.id,
                            item: m.id,
                          }}
                          canAdd={m.by === me?.id && can('post')}
                        />
                      )}
                    </>
                  )}
                </article>
              </React.Fragment>
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
          {candidates.length > 0 && (
            <div
              className="mention-results"
              role="listbox"
              aria-label="Mention teammate"
            >
              {candidates.map((m, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={i === choice % candidates.length}
                  key={m.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => tagPerson(m)}
                >
                  <PersonIcon person={m} state={presence[m.id]} />
                  {m.name}
                  <small>{m.email}</small>
                </button>
              ))}
            </div>
          )}
          <textarea
            rows={2}
            aria-label="Message"
            ref={composer}
            placeholder={
              'Message ' +
              (ch.kind === 'direct' ? '' : '#') +
              ch.name +
              ' · @ to mention'
            }
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (candidates.length && !e.shiftKey) {
                const index = choice % candidates.length;
                if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
                  e.preventDefault();
                  setChoice(
                    (index +
                      candidates.length +
                      (e.key === 'ArrowDown' ? 1 : -1)) %
                      candidates.length,
                  );
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setCaret(-1);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  tagPerson(candidates[index]);
                  return;
                }
              }
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                if (!job.busy && (body.trim() || file)) post();
              }
            }}
            value={body}
            readOnly={job.busy}
            onSelect={(e) => {
              if (
                e.currentTarget.selectionStart === e.currentTarget.selectionEnd
              )
                setCaret(e.currentTarget.selectionStart);
              else setCaret(-1);
            }}
            onChange={(e) => {
              editBody(e.target.value);
              setCaret(e.target.selectionStart);
            }}
          />
          <small role="status" className="typing-indicator">
            {typingNames.length
              ? typingNames.join(', ') +
                (typingNames.length === 1 ? ' is typing…' : ' are typing…')
              : ''}
          </small>
          <div className="row wrap composer-tools">
            <Btn onClick={() => makePoll(true)}>Poll</Btn>
            <label className="btn compact">
              <Paperclip size={14} />
              {file ? file.name : 'Attach'}
              <input
                hidden
                type="file"
                onChange={(e) => attach(e.target.files[0])}
              />
            </label>
            <Btn
              kind="primary"
              icon={Send}
              title="Send (Enter). Shift+Enter for a new line."
              disabled={job.busy || !(body.trim() || file)}
              onClick={post}
            >
              {job.busy && progress ? 'Uploading ' + progress + '%' : 'Send'}
            </Btn>
          </div>
        </div>
      )}
      {roster && (
        <Roster
          members={members.filter(
            (m) => m.active && (ch.everyone || ch.users?.[m.id]),
          )}
          presence={presence}
          close={() => showRoster(false)}
        />
      )}
      {poll && (
        <PollForm
          close={() => makePoll(false)}
          submit={async (body, options) => {
            await api.command('channel.post', {
              id: newId('msg'),
              channel: ch.id,
              body,
              options,
            });
            makePoll(false);
          }}
        />
      )}
      {editing && (
        <Modal title="Edit message" onClose={() => setEditing(null)}>
          <div className="form-body">
            <Label name="Message text">
              <textarea
                autoFocus
                rows={4}
                maxLength={8000}
                value={editing.body}
                onChange={(e) =>
                  setEditing({ ...editing, body: e.target.value })
                }
              />
            </Label>
            <ErrorText error={job.error} />
          </div>
          <footer>
            <Btn onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn
              kind="primary"
              disabled={job.busy}
              onClick={() =>
                job.run(async () => {
                  await api.command('channel.edit', {
                    channel: ch.id,
                    ...editing,
                  });
                  setEditing(null);
                })
              }
            >
              Save changes
            </Btn>
          </footer>
        </Modal>
      )}
      {clearing && (
        <Modal
          title="Clear this chat for everyone?"
          subtitle={ch.name}
          onClose={() => setClearing(false)}
        >
          <div className="form-body">
            All messages, pins and chat attachments will disappear from this
            conversation. This cannot be undone.
            <ErrorText error={job.error} />
          </div>
          <footer>
            <Btn onClick={() => setClearing(false)}>Keep messages</Btn>
            <Btn
              kind="danger"
              disabled={job.busy}
              onClick={() =>
                job.run(async () => {
                  await api.command('channel.clear', {
                    channel: ch.id,
                    confirm: ch.id,
                  });
                  setOlder([]);
                  setEnd(false);
                  to(null);
                  setClearing(false);
                })
              }
            >
              Clear chat
            </Btn>
          </footer>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Delete this message for everyone?"
          onClose={() => confirmDelete(null)}
        >
          <footer>
            <Btn onClick={() => confirmDelete(null)}>Cancel</Btn>
            <Btn
              disabled={job.busy}
              onClick={() =>
                job.run(async () => {
                  await api.command('channel.delete', {
                    channel: ch.id,
                    id: deleting,
                  });
                  setOlder((xs) =>
                    xs.map((x) =>
                      x.id === deleting
                        ? { id: x.id, at: x.at, by: x.by, deleted: true }
                        : x,
                    ),
                  );
                  confirmDelete(null);
                })
              }
            >
              Delete message
            </Btn>
          </footer>
          <ErrorText error={job.error} />
        </Modal>
      )}
      <ErrorText error={job.error} />
    </div>
  );
}
export default function Channels({
  meeting,
  api,
  me,
  members,
  selected,
  showing,
  onSelect,
  tell,
}) {
  const [list, setList] = useState([]),
    [listError, listFailed] = useState(''),
    [generation, refresh] = useState(0),
    [edit, setEdit] = useState(null),
    [presence, setPresence] = useState({}),
    [direct, setDirect] = useState(null),
    [query, search] = useState(''),
    job = useJob();
  useEffect(() => {
    let live = true,
      sequence = 0;
    const reload = async () => {
      const request = ++sequence;
      try {
        const result = await api.command('channel.list');
        if (live && sequence === request) {
          setList(result);
          listFailed('');
        }
      } catch (e) {
        if (live && sequence === request) listFailed(e.message);
      }
    };
    reload();
    window.addEventListener('focus', reload);
    return () => {
      live = false;
      window.removeEventListener('focus', reload);
    };
  }, [api, generation]);
  const raw =
    list.find((c) => c.id === selected) ||
    (direct?.id === selected ? direct : null) ||
    (selected?.startsWith('pending_')
      ? null
      : list.find((c) => c.kind !== 'direct'));
  const peerId =
    raw?.kind === 'direct'
      ? Object.keys(raw.users).find((uid) => uid !== me?.id)
      : '';
  const ch = peerId
    ? { ...raw, name: members.find((m) => m.id === peerId)?.name || 'Teammate' }
    : raw;
  const matches = (name) =>
    name.toLowerCase().includes(query.trim().toLowerCase());
  const people = members.filter(
    (m) => m.active && m.id !== me?.id && matches(m.name),
  );
  const visible = list.filter((c) => c.kind !== 'direct' && matches(c.name));
  useEffect(() => api.watchPresence(setPresence, tell), [api]);
  const drafts = useRef({}),
    openRequest = useRef(0);
  function openDirect(target) {
    const request = ++openRequest.current;
    const existing =
      list.find((c) => c.kind === 'direct' && c.users?.[target]) ||
      (direct?.users?.[target] ? direct : null);
    if (existing) {
      onSelect(existing.id);
      return;
    }
    onSelect('pending_' + target);
    job.run(async () => {
      const c = await api.command('channel.direct', { target });
      setDirect(c);
      setList((old) => (old.some((x) => x.id === c.id) ? old : [...old, c]));
      if (request === openRequest.current) onSelect(c.id);
    });
  }
  const [expanded, expand] = useState(false),
    [ordering, reorder] = useState(false);
  const storageKey = 'monexus.conversations.' + me.id;
  const [order, setOrder] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch {
      return {};
    }
  });
  const [orderReady, ready] = useState(false),
    writes = useRef(Promise.resolve());
  useEffect(() => {
    let live = true;
    api
      .command('conversations.order')
      .then((remote) => {
        if (live && Object.keys(remote).length) {
          setOrder(remote);
          localStorage.setItem(storageKey, JSON.stringify(remote));
        }
      })
      .catch(tell)
      .finally(() => {
        if (live) ready(true);
      });
    return () => {
      live = false;
    };
  }, [api, storageKey]);
  const sorted = (items, group) => {
    const ids = order[group] || [];
    const rank = (id) =>
      ids.includes(id) ? ids.indexOf(id) : Number.MAX_SAFE_INTEGER;
    return [...items].sort((a, b) => rank(a.id) - rank(b.id));
  };
  function shift(items, group, index, offset) {
    const ids = items.map((x) => x.id),
      target = index + offset;
    if (target < 0 || target >= ids.length) return;
    ids.splice(target, 0, ids.splice(index, 1)[0]);
    const next = { ...order, [group]: ids };
    localStorage.setItem(storageKey, JSON.stringify(next));
    setOrder(next);
    writes.current = writes.current
      .then(() => api.command('conversations.arrange', { group, ids }))
      .catch(tell);
  }
  useEffect(() => {
    if (showing) expand(true);
  }, [showing]);
  const rail = document.getElementById('conversation-navigation');
  const groupList = (items, group, dm) => {
    const rows = sorted(items, group);
    return (
      <>
        <h4>{group}</h4>
        {rows.map((item, i) => (
          <div
            className="conversation-row"
            onContextMenu={(e) =>
              quickMenu(e, [
                {
                  label: 'Open ' + item.name,
                  run: () => (dm ? openDirect(item.id) : onSelect(item.id)),
                },
                orderReady &&
                  !query &&
                  i > 0 && {
                    label: 'Move up',
                    run: () => shift(rows, group, i, -1),
                  },
                orderReady &&
                  !query &&
                  i < rows.length - 1 && {
                    label: 'Move down',
                    run: () => shift(rows, group, i, 1),
                  },
              ])
            }
            key={item.id}
            draggable={orderReady && !query}
            onDragStart={(e) =>
              e.dataTransfer.setData(
                'monexus/chat',
                JSON.stringify([group, item.id]),
              )
            }
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('monexus/chat'))
                e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const data = e.dataTransfer.getData('monexus/chat');
              if (!data) return;
              const [g, id] = JSON.parse(data);
              const from = rows.findIndex((x) => x.id === id);
              if (g === group && from >= 0) shift(rows, group, from, i - from);
            }}
          >
            <button
              className={
                'nav-item sub ' +
                (showing && (dm ? peerId === item.id : ch?.id === item.id)
                  ? 'selected'
                  : '')
              }
              disabled={dm && job.busy}
              onClick={() => {
                if (dm) openDirect(item.id);
                else {
                  openRequest.current++;
                  onSelect(item.id);
                }
              }}
            >
              {dm ? (
                <PersonIcon person={item} state={presence[item.id]} />
              ) : item.kind === 'announcement' ? (
                <Megaphone />
              ) : (
                <Hash />
              )}
              <span>{item.name}</span>
            </button>
            {ordering && !query && (
              <>
                <IconButton
                  icon={ArrowUp}
                  label={'Move ' + item.name + ' up'}
                  disabled={!i}
                  onClick={() => shift(rows, group, i, -1)}
                />
                <IconButton
                  icon={ArrowDown}
                  label={'Move ' + item.name + ' down'}
                  disabled={i === rows.length - 1}
                  onClick={() => shift(rows, group, i, 1)}
                />
              </>
            )}
          </div>
        ))}
      </>
    );
  };
  return (
    <>
      {rail &&
        createPortal(
          <>
            <div className="conversation-heading">
              <button
                className={'nav-item ' + (showing ? 'selected' : '')}
                aria-expanded={expanded}
                onClick={() => {
                  expand(!expanded);
                  if (!expanded) refresh((n) => n + 1);
                }}
              >
                <MessagesSquare />
                Channels{expanded ? <ChevronDown /> : <ChevronRight />}
              </button>
              {isAdmin(me) && (
                <IconButton
                  icon={Plus}
                  label="New channel"
                  onClick={() => setEdit({})}
                />
              )}
            </div>
            {expanded && (
              <div className="conversation-list">
                <input
                  type="search"
                  aria-label="Find conversations"
                  placeholder="Find a conversation"
                  value={query}
                  onChange={(e) => search(e.target.value)}
                />
                {groupList(visible, 'Channels', false)}
                {groupList(people, 'Direct messages', true)}
                <button
                  disabled={!orderReady}
                  className="rail-order"
                  onClick={() => {
                    search('');
                    reorder(!ordering);
                  }}
                >
                  {ordering ? 'Done arranging' : 'Arrange conversations'}
                </button>
                <ErrorText error={listError || job.error} />
              </div>
            )}
          </>,
          rail,
        )}
      {showing && (
        <div className="chat-page">
          <div className="channel-layout conversation-only">
            {ch ? (
              <Feed
                key={ch.id}
                {...{ api, ch, me, members, tell, presence, meeting }}
                initialDraft={drafts.current[peerId] || ''}
                consumeDraft={() => delete drafts.current[peerId]}
                configure={isAdmin(me) && !peerId ? () => setEdit(ch) : null}
              />
            ) : selected?.startsWith('pending_') ? (
              <div className="feed">
                <h2>{members.find((m) => m.id === selected.slice(8))?.name}</h2>
                <div className="feed-posts" aria-busy="true" />
                <div className="composer">
                  <textarea
                    autoFocus
                    aria-label="Message"
                    placeholder="Write a message…"
                    onChange={(e) => {
                      drafts.current[selected.slice(8)] = e.target.value;
                    }}
                  />
                </div>
              </div>
            ) : (
              <Empty>Choose a channel or teammate in the sidebar.</Empty>
            )}
          </div>
        </div>
      )}
      {edit && (
        <ChannelSettings
          {...{ api, members }}
          initial={edit.id ? edit : null}
          onClose={() => setEdit(null)}
          saved={(id) => {
            setEdit(null);
            refresh((n) => n + 1);
            onSelect(id);
          }}
        />
      )}
    </>
  );
}
