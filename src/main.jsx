import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Layers3,
  PanelsTopLeft,
  MessagesSquare,
  Inbox,
  BookOpen,
  NotebookPen,
  CalendarCheck,
  CalendarDays,
  Phone,
  Figma as FigmaIcon,
  FolderClosed,
  Link2,
  KeyRound,
  SlidersHorizontal,
  Settings2,
  ChevronRight,
  Plus,
  PanelLeftClose,
  Menu,
  LogIn,
  ChevronDown,
  LayoutGrid,
  ShieldCheck,
  ArrowUpRight,
  Download,
} from 'lucide-react';
import '@fontsource-variable/inter/wght.css';
import './style.css';

import { QuickActions, useNavigationOrder } from './Navigation.jsx';
import { desktop, nativeAction } from './native.mjs';
import { defaultPrefs, isAdmin } from '../functions/core/model.mjs';
import {
  Avatar,
  Btn,
  IconButton,
  Modal,
  Label,
  ErrorText,
  useJob,
  humanError,
} from './ui.jsx';
import Board from './views/Board.jsx';
import Directory from './views/Directory.jsx';
const Admin = lazy(() => import('./views/Admin.jsx')),
  Channels = lazy(() => import('./views/Channels.jsx')),
  Canvas = lazy(() => import('./views/Canvas.jsx')),
  FigmaResource = lazy(() => import('./views/Figma.jsx')),
  Meetings = lazy(() => import('./views/Meetings.jsx')),
  Eod = lazy(() => import('./views/Eod.jsx')),
  Notes = lazy(() => import('./views/Notes.jsx')),
  Resources = lazy(() => import('./views/Resources.jsx')),
  Preferences = lazy(() => import('./views/Preferences.jsx')),
  Vault = lazy(() => import('./views/Vault.jsx')),
  InboxPage = lazy(() => import('./views/Inbox.jsx'));
const nav = [
  ['boards', 'Boards', PanelsTopLeft],
  ['channels', 'Channels', MessagesSquare],
  ['inbox', 'Inbox', Inbox],
  ['docs', 'Documentation', BookOpen],
  ['notes', 'Notes', NotebookPen],
  ['eod', 'EOD', CalendarCheck],
  ['drive', 'Drive', FolderClosed],
  ['links', 'Apps & links', Link2],
  ['vault', 'Sensitive data', KeyRound],
  ['figma', 'Figma', FigmaIcon],
  ['whiteboard', 'Whiteboards', LayoutGrid],
  ['meetings', 'Meetings', Phone],
  ['calendar', 'Calendar', CalendarDays],
];
function SignIn({ onClose, connect }) {
  const [mode, set] = useState('signIn'),
    [email, setEmail] = useState(''),
    [password, setPass] = useState(''),
    [info, setInfo] = useState(''),
    job = useJob();
  return (
    <Modal
      title={
        mode === 'register'
          ? 'Create an account'
          : mode === 'reset'
            ? 'Reset password'
            : 'Sign in to Monexus'
      }
      subtitle="Company workspace"
      onClose={onClose}
    >
      <form
        className="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          job.run(async () => {
            const { authenticate } = await import('./cloud.mjs');
            const result = await authenticate(mode, email, password);
            if (typeof result === 'string') {
              setInfo(result);
              set('signIn');
            } else connect(result);
          });
        }}
      >
        <Label name="Email">
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Label>
        {mode !== 'reset' && (
          <Label name="Password">
            <input
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === 'register' ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(e) => setPass(e.target.value)}
            />
          </Label>
        )}
        <ErrorText error={job.error} />
        {info && <p role="status">{info}</p>}
        <button className="btn primary" disabled={job.busy}>
          {job.busy
            ? 'Connecting…'
            : mode === 'register'
              ? 'Register'
              : mode === 'reset'
                ? 'Send reset email'
                : 'Sign in'}
        </button>
        <div className="row spread">
          <button
            type="button"
            className="text-btn"
            onClick={() => set(mode === 'register' ? 'signIn' : 'register')}
          >
            {mode === 'register' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => set(mode === 'reset' ? 'signIn' : 'reset')}
          >
            {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function App() {
  const [meetingRequest, requestMeeting] = useState(null);
  const [eodDate,setEodDate]=useState(null);
  const [api, setApi] = useState(null),
    [space, setSpace] = useState({ members: [], boards: [] }),
    [activeBoard, selectBoard] = useState(''),
    [view, setView] = useState('boards'),
    [showAuth, authDialog] = useState(false),
    [prefs, setPrefs] = useState(defaultPrefs),
    [notice, setNotice] = useState(''),
    [rail, setRail] = useState(false),
    [jump, setJump] = useState(null),
    [newBoard, newBoardSet] = useState(0),
    [channelId, setChannelId] = useState('');
  const presence = useRef('Online'),
    settings = useRef(prefs);
  settings.current = prefs;
  const timer = useRef(),
    mounted = useRef(true),
    restore = useRef(0);
  const tell = (msg) => {
    setNotice(msg?.kind === 'workspace_banner' || typeof msg === 'string' ? msg : humanError(msg));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(''), 6000);
  };
  const navigateOrder = useNavigationOrder(api, tell);
  const [contributions, setContributions] = useState({}),
    [unread, setUnread] = useState(0);
  useEffect(() => api?.watchContributions(setContributions, tell), [api]);
  useEffect(() => {
    setUnread(0);
    return api?.watchUnread(setUnread, tell);
  }, [api]);
  useEffect(() => {
    nativeAction('unread_badge', { count: unread });
  }, [unread]);
  const connect = (next) => {
    restore.current++;
    localStorage.setItem('monexus.live', '1');
    setChannelId('');
    setSpace({ members: [], boards: [] });
    selectBoard('');
    const previous = localStorage.getItem('monexus.resource.' + next.uid);
    setView(nav.some(([k]) => k === previous) ? previous : 'boards');
    requestMeeting(null);
    setApi(next);
    authDialog(false);
  };
  const leave = () => {
    restore.current++;
    localStorage.removeItem('monexus.live');
    setChannelId('');
    setSpace({ members: [], boards: [] });
    setApi(null);
    setPrefs(defaultPrefs);
    selectBoard('');
    setView('boards');
  };
  useEffect(() => {
    mounted.current = true;
    localStorage.removeItem('monexus.sample.v1');
    indexedDB.deleteDatabase('monexus-sample-media');
    const token = restore.current;
    if (localStorage.getItem('monexus.live')) {
      import('./cloud.mjs')
        .then((x) => x.authenticate('restore'))
        .then((x) => {
          if (mounted.current && restore.current === token) connect(x);
        })
        .catch((e) => {
          if (mounted.current && restore.current === token) {
            localStorage.removeItem('monexus.live');
            tell(e);
          }
        });
    }
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!api) return;
    let live = true;
    const off = api.watchWorkspace(
      (s) => {
        if (live) setSpace(s);
      },
      (e) => {
        if (live) {
          tell(e);
          api.logout().catch(() => {});
          leave();
        }
      },
    );
    api
      .command('settings.get')
      .then((p) => {
        if (live) setPrefs(p);
      })
      .catch(tell);
    return () => {
      live = false;
      off();
    };
  }, [api]);
  const me = space.members.find((m) => m.id === api?.uid),
    boards = navigateOrder.sorted(space.boards, 'Boards', (b) => b.id),
    board = boards.find((b) => b.id === activeBoard) || boards[0];
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.palette = prefs.palette || 'forest';
  }, [prefs.theme,prefs.palette]);
  useEffect(() => {
    if (!desktop) return;
    const event = (e) => {
      if (typeof e.data === 'string' || e.data?.kind === 'workspace_banner') tell(e.data);
    };
    desktop.addEventListener('message', event);
    return () => desktop.removeEventListener('message', event);
  }, []);
  useEffect(() => {
    presence.current = prefs.presence;
    return api?.presence(
      prefs.presence,
      (v) => {
        presence.current = v;
      },
      tell,
    );
  }, [api, prefs.presence]);
  useEffect(
    () =>
      api?.watchAlerts((e) => {
        if(e.eodDay)window.dispatchEvent(new Event('monexus-eod-update'));
        if (!['Online', 'Idle'].includes(presence.current)) return;
        const p = settings.current;
        if (desktop) {
          nativeAction('deliver_notification', {
            title: e.title,
            body: e.body,
            banner: !!e.banner && p.banners,
            sound: !!e.sound && p.sound,
          });
          return;
        }
        if (e.banner && p.banners) tell({kind:'workspace_banner',title:e.title,body:e.body});
        if (e.sound && p.sound) {
          try {
            const ctx = new AudioContext(),
              osc = ctx.createOscillator(),
              gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.value = 0.06;
            osc.start();
            osc.stop(ctx.currentTime + 0.14);
            osc.onended = () => ctx.close();
          } catch {}
        }
      }, tell),
    [api],
  );
  const go = (v) => {
      setView(v);
      if (api) localStorage.setItem('monexus.resource.' + api.uid, v);
      if(v==='eod')setEodDate({day:''});
      setRail(false);
      setJump(null);
    },
    choose = (k) => {
      selectBoard(k);
      go('boards');
    };
  const openNotice = (n) => {
    if (n.eodDay) {go('eod');setEodDate({day:n.eodDay});}
    else if (n.board) {
      selectBoard(n.board);
      setJump(n.ticket);
      setView('boards');
    } else if (n.channel) {
      setChannelId(n.channel);
      go('channels');
    }
  };
  const title =
    nav.find((n) => n[0] === view)?.[1] ||
    (view === 'directory'
      ? 'Boards'
      : view === 'admin'
        ? 'Administration'
        : 'Settings');
  const resources = navigateOrder.sorted(
    nav.slice(3),
    'Resources',
    (r) => r[0],
  );
  const shared = {
    contributions,
    api,
    me,
    members: space.members,
    prefs,
    onPrefs: setPrefs,
    tell,
  };
  return !api ? (
    <main className="welcome">
      <section>
        <span className="mark">M</span>
        <h1>Monexus Workspace</h1>
        <p>Sign in with your work email to open your team’s workspace.</p>
        <div className="row">
          <Btn kind="primary" icon={LogIn} onClick={() => authDialog(true)}>
            Sign in
          </Btn>
          {desktop && (
            <Btn icon={Download} onClick={() => nativeAction('update')}>
              Update
            </Btn>
          )}
        </div>
        {notice && <p role="status">{notice?.title || notice}</p>}
      </section>
      {showAuth && (
        <SignIn onClose={() => authDialog(false)} connect={connect} />
      )}
    </main>
  ) : !me ? (
    <main className="welcome">
      <p role="status">Opening your workspace…</p>
    </main>
  ) : (
    <div className="shell">
      <aside className={'sidebar ' + (rail ? 'expanded' : '')}>
        <div className="brand">
          <span className="mark">M</span>
          <span>Monexus</span>
        </div>
        <div className="nav-group">
          <div className="nav-label">Workspace</div>
          {nav.slice(0, 3).map(([k, n, I]) =>
            k === 'channels' ? (
              <div key={k} id="conversation-navigation" />
            ) : (
              <button
                className={
                  'nav-item ' +
                  (view === k || (k === 'boards' && view === 'directory')
                    ? 'selected'
                    : '')
                }
                key={k}
                onClick={() => go(k === 'boards' ? 'directory' : k)}
              >
                <I />
                {n}
                {k === 'inbox' && unread > 0 && (
                  <small className="unread-count">
                    {unread > 99 ? '99+' : unread}
                  </small>
                )}
              </button>
            ),
          )}
        </div>
        <div className="nav-group projects">
          <div className="nav-label">
            Project boards{' '}
            {me && isAdmin(me) && (
              <button
                aria-label="Create board"
                onClick={() => {
                  go('boards');
                  newBoardSet((v) => v + 1);
                }}
              >
                <Plus size={15} />
              </button>
            )}
          </div>
          {boards.map((b) => (
            <button
              key={b.id}
              {...navigateOrder.props(
                'Boards',
                b.id,
                boards.map((b) => b.id),
              )}
              className={
                'nav-item sub ' +
                (view === 'boards' && b.id === board?.id ? 'current' : '')
              }
              onClick={() => choose(b.id)}
            >
              <i className={'dot ' + b.color} />
              {b.name}
            </button>
          ))}
        </div>
        <div className="nav-group">
          <div className="nav-label">Resources</div>
          {resources.map(([k, n, I]) => (
            <button
              className={'nav-item ' + (view === k ? 'selected' : '')}
              key={k}
              {...navigateOrder.props(
                'Resources',
                k,
                resources.map((r) => r[0]),
              )}
              onClick={() => go(k)}
            >
              <I />
              {n}
            </button>
          ))}
        </div>
        <QuickActions />
        <div className="side-bottom">
          {isAdmin(me) && (
            <button
              className={'nav-item ' + (view === 'admin' ? 'selected' : '')}
              onClick={() => go('admin')}
            >
              <ShieldCheck />
              Administration
            </button>
          )}
          <button
            className={'nav-item ' + (view === 'settings' ? 'selected' : '')}
            onClick={() => go('settings')}
          >
            <Settings2 />
            Settings
          </button>
          <button className="profile" onClick={() => go('settings')}>
            <Avatar person={me} />
            <span>
              <b>{me?.name || 'Workspace'}</b>
              <small>{me?.role}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <div className="crumb">
            <span className="mobile-menu">
              <IconButton
                icon={Menu}
                label="Toggle navigation"
                onClick={() => setRail(!rail)}
              />
            </span>
            <Layers3 size={16} />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            {desktop && (
              <Btn icon={Download} onClick={() => nativeAction('update')}>
                Update
              </Btn>
            )}
            <IconButton
              icon={Inbox}
              label="Notification inbox"
              onClick={() => go('inbox')}
            />
          </div>
        </div>
        <Suspense fallback={<p className="page">Loading…</p>}>
          {view === 'directory' ? (
            <Directory
              navigateOrder={navigateOrder}
              {...{ boards, me, choose }}
              create={() => {
                go('boards');
                newBoardSet((v) => v + 1);
              }}
            />
          ) : view === 'boards' ? (
            <Board
              key={api.uid + ':' + (board?.id || '')}
              {...shared}
              board={board}
              choose={choose}
              newBoard={newBoard}
              consumeNew={() => newBoardSet(0)}
              jump={jump}
              clearJump={() => setJump(null)}
            />
          ) : view === 'settings' ? (
            <Preferences
              {...shared}
              signOut={async () => {
                await api.logout();
                leave();
              }}
            />
          ) : view === 'admin' && isAdmin(me) ? (
            <Admin {...shared} navigate={go} />
          ) : view === 'inbox' ? (
            <InboxPage {...shared} open={openNotice} />
          ) : view === 'whiteboard' ? (
            <Canvas {...shared} />
          ) : view === 'figma' ? (
            <FigmaResource {...shared} />
          ) : view === 'notes' ? (
            <Notes {...shared} />
          ) : view === 'vault' ? (
            <Vault {...shared} />
          ) : ['docs', 'drive', 'links'].includes(view) ? (
            <Resources key={view} {...shared} area={view} />
          ) : null}
        </Suspense>
        <Suspense fallback={null}>
          <Meetings
            key={api.uid}
            {...shared}
            prefs={prefs}
            hub={view === 'meetings'}
            visible={view === 'calendar' || view === 'meetings'}
            request={meetingRequest}
          />
        </Suspense>
        <Suspense fallback={null}>
          <Eod
            key={api.uid}
            {...shared}
            visible={view === 'eod'}
            requested={eodDate}
          />
        </Suspense>
        <Suspense fallback={null}>
          <Channels
            key={api.uid}
            {...shared}
            showing={view === 'channels'}
            meeting={(ch, mode) => requestMeeting({ ch, mode })}
            selected={channelId}
            onSelect={(id) => {
              setChannelId(id);
              go('channels');
            }}
          />
        </Suspense>
      </main>
      {showAuth && (
        <SignIn onClose={() => authDialog(false)} connect={connect} />
      )}
      {notice && (
        <div
          className="toast"
          role="status"
          style={{
            borderLeftColor:
              prefs.preset === 'custom'
                ? prefs.color
                : prefs.preset === 'indigo'
                  ? '#7161ae'
                  : '#3b916f',
          }}
        >
          {notice.kind === 'workspace_banner' ? (
            <div className="notice-message">
              <strong>{notice.title}</strong>
              <p>{notice.body}</p>
            </div>
          ) : (
            notice
          )}
          <button
            onClick={() => setNotice('')}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
