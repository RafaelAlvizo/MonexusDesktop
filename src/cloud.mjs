import { initializeApp } from 'firebase/app';
import { defaultPrefs } from '../functions/core/model.mjs';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  connectAuthEmulator,
} from 'firebase/auth';
const local = import.meta.env.VITE_USE_EMULATORS === '1',
  projectId = local ? 'demo-monexus' : 'monexus-main-db';
const config = {
  apiKey: local ? 'local-test-key' : 'AIzaSyBbpjuMaYQ0PE85bkRjA1UH5aGanbV2J5Y',
  authDomain: projectId + '.firebaseapp.com',
  databaseURL: 'https://' + projectId + '-default-rtdb.firebaseio.com',
  projectId,
  storageBucket: projectId + '.firebasestorage.app',
  messagingSenderId: '723458450728',
  appId: '1:723458450728:web:a411a04e99dc0f69919c1d',
  measurementId: 'G-NX2HSXKKQQ',
};
const app = initializeApp(config),
  auth = getAuth(app);
if (local)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
export async function authenticate(mode, email, password) {
  if (mode === 'reset') {
    await sendPasswordResetEmail(auth, email);
    return 'Check your email for the password reset link.';
  }
  if (mode === 'register') {
    const { user } = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    await sendEmailVerification(user);
    await signOut(auth);
    return 'Check your email to verify your account, then ask your workspace admin for access.';
  }
  if (mode === 'signIn')
    await signInWithEmailAndPassword(auth, email, password);
  else await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw Error('Sign in to continue.');
  await user.reload();
  if (!user.emailVerified) {
    await sendEmailVerification(user);
    await signOut(auth);
    throw Error('Verify your email first. A verification link has been sent.');
  }
  await user.getIdToken(true);
  return getWorkspace(user);
}
let services;
async function load() {
  if (!services)
    services = Promise.all([
      import('firebase/firestore'),
      import('firebase/database'),
      import('firebase/functions'),
      import('firebase/storage'),
    ]).then(([f, r, c, s]) => {
      const db = f.getFirestore(app),
        rt = r.getDatabase(app),
        calls = c.getFunctions(app, 'us-central1'),
        store = s.getStorage(app);
      if (local) {
        f.connectFirestoreEmulator(db, '127.0.0.1', 8080);
        r.connectDatabaseEmulator(rt, '127.0.0.1', 9000);
        c.connectFunctionsEmulator(calls, '127.0.0.1', 5001);
        s.connectStorageEmulator(store, '127.0.0.1', 9199);
      }
      return { f, r, c, s, db, rt, calls, store };
    });
  return services;
}
async function getWorkspace(user) {
  const { f, r, c, s, db, rt, calls, store } = await load(),
    uid = user.uid;
  const access = f.doc(db, 'members', uid),
    me = (await f.getDoc(access)).data();
  if (!me?.active) {
    await signOut(auth);
    throw Error(
      'Your account is verified. Ask a workspace admin to approve ' +
        user.email +
        '.',
    );
  }
  const command = async (action, p = {}) =>
    (
      await c.httpsCallable(
        calls,
        action.startsWith('vault.') ? 'vault' : 'workspace',
        { timeout: 300000 },
      )({ action, p })
    ).data;
  const endpoint = local
    ? 'http://127.0.0.1:5001/' + projectId + '/us-central1/'
    : 'https://us-central1-' + projectId + '.cloudfunctions.net/';
  async function response(name, key, signal) {
    const part = async (offset) => {
      const res = await fetch(
        endpoint +
          name +
          '?id=' +
          encodeURIComponent(key) +
          '&offset=' +
          offset,
        {
          headers: { Authorization: 'Bearer ' + (await user.getIdToken()) },
          cache: 'no-store',
          signal,
        },
      );
      if (!res.ok) throw Error((await res.text()) || 'Access denied.');
      return res;
    };
    let current = await part(0),
      offset = 0;
    if (current.status !== 206) return current;
    const total = Number(current.headers.get('Content-Range')?.split('/')[1]);
    if (!Number.isSafeInteger(total) || total <= 0)
      throw Error('Invalid file size.');
    return new Response(
      new ReadableStream({
        async pull(controller) {
          if (!current) current = await part(offset);
          const bytes = new Uint8Array(await current.arrayBuffer());
          if (!bytes.length || offset + bytes.length > total)
            throw Error('Incomplete file download.');
          offset += bytes.length;
          controller.enqueue(bytes);
          current = null;
          if (offset === total) controller.close();
        },
      }),
      {
        headers: {
          'Content-Length': String(total),
          'Cache-Control': 'no-store',
        },
      },
    );
  }
  let releasePresence = async () => {};
  r.goOnline(rt);
  return {
    uid,
    command,
    async meetingExit(id, session) {
      const token = await user.getIdToken();
      return () => fetch(endpoint + 'workspace', {
        method: 'POST', keepalive: true,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({data:{action:'meeting.leave',p:{id,session}}}),
      }).catch(() => {});
    },
    watchSession(ended) {
      return onAuthStateChanged(auth, current => { if (current?.uid !== uid) ended(); });
    },
    watchIdeas(board, count, update, fail) {
      const ideas = f.collection(db, 'boards', board, 'ideas');
      return f.onSnapshot(f.query(ideas, f.orderBy('at', 'desc'), f.limit(count + 1)),
        snap => update(snap.docs.slice(0, count).map(doc => doc.data()), snap.size > count), fail);
    },
    watchSettings(update, fail) {
      return f.onSnapshot(f.doc(db, 'members', uid, 'private', 'settings'),
        snap => update({ ...defaultPrefs, ...snap.data() }), fail);
    },
    mcpUrl: endpoint + 'assistantMcp',
    async logout() {
      let timer;
      try {
        await Promise.race([
          // Disconnect also runs the server-side removal when a write cannot be acknowledged.
          releasePresence().catch(() => {}),
          new Promise((resolve) => {
            timer = setTimeout(resolve, 2500);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        r.goOffline(rt);
        await signOut(auth);
      }
    },
    watchWorkspace(cb, fail) {
      let members = [],
        boards = [],
        boardSub = () => {},
        role = null,
        peopleReady = false,
        boardsReady = false;
      const notify = () => {
        if (peopleReady && boardsReady) cb({ members, boards });
      };
      const self = f.onSnapshot(
        access,
        (snap) => {
          const current = snap.data();
          if (!current?.active) {
            fail(Error('Workspace access has ended.'));
            return;
          }
          if (role === current.role) return;
          role = current.role;
          boardSub();
          boards = [];
          boardsReady = false;
          cb({ members: [], boards: [] });
          const all = f.collection(db, 'boards'),
            q = ['owner', 'admin'].includes(role)
              ? all
              : f.query(all, f.where('memberIds', 'array-contains', uid));
          boardSub = f.onSnapshot(
            q,
            (s) => {
              boardsReady = true;
              boards = s.docs.map((d) => d.data());
              notify();
            },
            fail,
          );
        },
        fail,
      );
      const people = f.onSnapshot(
        f.collection(db, 'members'),
        (s) => {
          peopleReady = true;
          members = s.docs.map((d) => d.data());
          notify();
        },
        fail,
      );
      return () => {
        self();
        people();
        boardSub();
      };
    },
    boardPresence(board, cb, fail) {
      const base = f.collection(db, 'boards', board, 'viewers'),
        ref = f.doc(base);
      let live = true,
        rows = [],
        visible = false;
      const publish = () => {
        if (live)
          cb([
            ...new Set(
              rows.filter((x) => x.at > Date.now() - 75000).map((x) => x.uid),
            ),
          ]);
      };
      const beat = () => {
        if (!live) return;
        const here = !document.hidden;
        if (here) {
          visible = true;
          f.setDoc(ref, { uid, at: f.serverTimestamp() }).catch((e) => {
            if (live) fail(e);
          });
        } else if (visible) {
          visible = false;
          f.deleteDoc(ref).catch(() => {});
        }
        publish();
      };
      const off = f.onSnapshot(
        f.query(
          base,
          f.where('at', '>', f.Timestamp.fromMillis(Date.now() - 75000)),
        ),
        (snap) => {
          rows = snap.docs.map((d) => {
            const x = d.data({ serverTimestamps: 'estimate' });
            return { uid: x.uid, at: x.at?.toMillis() || 0 };
          });
          publish();
        },
        (e) => {
          if (live) fail(e);
        },
      );
      const timer = setInterval(beat, 22000);
      beat();
      window.addEventListener('focus', beat);
      document.addEventListener('visibilitychange', beat);
      return () => {
        live = false;
        off();
        clearInterval(timer);
        window.removeEventListener('focus', beat);
        document.removeEventListener('visibilitychange', beat);
        f.deleteDoc(ref).catch(() => {});
      };
    },
    watchMeetings(cb, fail) {
      return f.onSnapshot(
        f.query(
          f.collection(db, 'meetings'),
          f.where('invited', 'array-contains', uid),
        ),
        (snap) => cb(snap.docs.map((d) => d.data())),
        fail,
      );
    },
    watchRoom(id, cb, fail) {
      return f.onSnapshot(
        f.collection(db, 'meetings', id, 'peers'),
        (snap) => cb(snap.docs.map((d) => d.data())),
        fail,
      );
    },
    watchSignals(id, session, cb, fail) {
      return f.onSnapshot(
        f.collection(
          db,
          'meetings',
          id,
          'peers',
          uid,
          'sessions',
          session,
          'rtcSignals',
        ),
        (snap) => {
          for (const change of snap.docChanges())
            if (change.type !== 'removed') cb(change.doc.data());
        },
        fail,
      );
    },
    watchClock(cb) {
      return r.onValue(r.ref(rt, '.info/serverTimeOffset'), (snap) =>
        cb(snap.val() || 0),
      );
    },
    watchBoard(board, count, cb, fail, stages) {
      const base = f.collection(db, 'boards', board, 'tickets');
      const groupIds = [];
      for (let i = 0; i < stages.length; i += 30)
        groupIds.push(stages.slice(i, i + 30));
      const results = groupIds.map(() => []);
      if (!groupIds.length) {
        cb([]);
        return () => {};
      }
      const subs = groupIds.map((ids, index) =>
        f.onSnapshot(
          f.query(
            base,
            f.where('column', 'in', ids),
            f.orderBy('seq', 'desc'),
            f.limit(count),
          ),
          (snap) => {
            results[index] = snap.docs.map((d) => d.data());
            cb(
              results
                .flat()
                .sort((a, b) => b.seq - a.seq)
                .slice(0, count),
            );
          },
          fail,
        ),
      );
      return () => subs.forEach((off) => off());
    },
    watchContributions(cb, fail) {
      return f.onSnapshot(
        f.doc(db, 'config', 'contributions'),
        (s) => cb(s.data() || {}),
        fail,
      );
    },
    watchUnread(cb, fail) {
      return f.onSnapshot(
        f.query(
          f.collection(db, 'members', uid, 'inbox'),
          f.where('read', '==', false),
          f.limit(100),
        ),
        (snap) => cb(snap.size),
        fail,
      );
    },
    watchUnreadConversations(cb, fail) {
      return f.onSnapshot(f.query(f.collection(db, 'members', uid, 'conversationActivity'),
        f.where('unread', '==', true)), snap => cb(snap.docs.map(d => ({ channel: d.id, peer: d.data().peer }))), fail);
    },
    watchMessages(key, cb, fail, { pinned = false, limit = 50 } = {}) {
      const base = r.ref(rt, 'messages/' + key),
        q = pinned
          ? r.query(
              base,
              r.orderByChild('pinned'),
              r.equalTo(true),
              r.limitToLast(limit),
            )
          : r.query(base, r.orderByChild('at'), r.limitToLast(50));
      return r.onValue(
        q,
        (snap) => {
          const arr = [];
          snap.forEach((x) => {
            arr.push(x.val());
          });
          cb(arr.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)));
        },
        fail,
      );
    },
    watchMessage(channel, key, cb, fail) {
      return r.onValue(
        r.ref(rt, 'messages/' + channel + '/' + key),
        (s) => cb(s.val()),
        fail,
      );
    },
    watchTyping(key, cb, fail) {
      return r.onValue(
        r.ref(rt, 'typing/' + key),
        (s) => cb(s.val() || {}),
        fail,
      );
    },
    typing(key) {
      const ref = r.ref(rt, 'typing/' + key + '/' + uid);
      const disconnect = r.onDisconnect(ref);
      let last = 0,
        timer;
      function clear() {
        clearTimeout(timer);
        last = 0;
        return r.remove(ref).catch(() => {});
      }
      return {
        update() {
          if (Date.now() - last > 1800) {
            last = Date.now();
            disconnect
              .remove()
              .then(() => r.set(ref, r.serverTimestamp()))
              .catch(() => {});
          }
          clearTimeout(timer);
          timer = setTimeout(clear, 3500);
        },
        clear,
      };
    },
    watchPresence(cb, fail) {
      return r.onValue(
        r.ref(rt, 'presence'),
        (snap) => {
          const map = {};
          snap.forEach((m) => {
            const v = Object.values(m.val()).map((s) =>
              s.state === 'Idle' ? 'Online' : s.state,
            );
            map[m.key] =
              ['Do Not Disturb', 'Online', 'Idle'].find((k) => v.includes(k)) ||
              'Offline';
          });
          cb(map);
        },
        fail,
      );
    },
    watchAlerts(cb, fail) {
      const after = Date.now(),
        seen = new Set();
      let live = true;
      const off = f.onSnapshot(
        f.query(
          f.collection(db, 'members', uid, 'signals'),
          f.where('at', '>=', after),
          f.orderBy('at', 'desc'),
          f.limit(40),
        ),
        (snap) => {
          for (const change of snap.docChanges())
            if (change.type === 'added' && !seen.has(change.doc.id)) {
              seen.add(change.doc.id);
              const e = change.doc.data();
              if (Date.now() - e.at < 120000) {
                if (e.message)
                  command('notification.detail', { id: e.id })
                    .then((n) => {
                      if (n && live) cb(n);
                    })
                    .catch(fail);
                else cb(e);
              }
            }
        },
        fail,
      );
      return () => {
        live = false;
        off();
      };
    },
    presence(mode, onState, onError) {
      const session = r.ref(rt, 'presence/' + uid + '/' + crypto.randomUUID()),
        disc = r.onDisconnect(session);
      let connected = false,
        closed = false,
        state = mode === 'Idle' ? 'Online' : mode;
      const publish = (next) => {
        state = next;
        onState(next);
        if (connected && !closed)
          r.set(session, { state: next, at: r.serverTimestamp() }).catch(
            onError,
          );
      };
      const off = r.onValue(r.ref(rt, '.info/connected'), async (snap) => {
        connected = false;
        if (!snap.val()) return;
        try {
          await disc.remove();
          if (closed) return;
          connected = true;
          publish(state);
        } catch (e) {
          if (!closed) onError(e);
        }
      });
      onState(state);
      const release = async () => {
        if (closed) return;
        closed = true;
        off();
        if (connected) {
          await r.remove(session);
          await disc.cancel();
        }
      };
      releasePresence = release;
      return () => {
        release().catch(() => {});
      };
    },
    async upload(scope, file, onProgress, onTask) {
      const key = 'f_' + crypto.randomUUID(),
        mime = file.type || 'application/octet-stream';
      const path = await command('file.start', {
        id: key,
        scope,
        name: file.name,
        size: file.size,
        mime,
      });
      const task = s.uploadBytesResumable(s.ref(store, path), file, {
        contentType: mime,
      });
      onTask?.(task);
      await new Promise((ok, no) =>
        task.on(
          'state_changed',
          (s) =>
            onProgress?.(Math.round((100 * s.bytesTransferred) / s.totalBytes)),
          no,
          ok,
        ),
      );
      await command('file.finish', { id: key });
      return key;
    },
    fileBlob: async (key, signal) => (await response('fileDownload', key, signal)).blob(),
    fileResponse: (key) => response('fileDownload', key),
    vaultResponse: (key) => response('vaultAccess', key),
    vaultRead: async (key) => (await response('vaultAccess', key)).blob(),
  };
}
