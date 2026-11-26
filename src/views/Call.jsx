import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, MonitorUp, PhoneOff, Users, Volume2 } from 'lucide-react';
import { Avatar, Btn, ErrorText, Check, useJob } from '../ui.jsx';
import { voiceRoom } from '../voice.mjs';

function Media({ stream, video = false, muted = false }) {
  const ref = useRef(),
    [blocked, block] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream || null;
    if (stream)
      el.play()
        .then(() => block(false))
        .catch(() => block(true));
    return () => {
      el.srcObject = null;
    };
  }, [stream]);
  return (
    <>
      {video ? (
        <video ref={ref} muted={muted} autoPlay playsInline />
      ) : (
        <audio ref={ref} autoPlay />
      )}
      {blocked && !video && (
        <Btn
          icon={Volume2}
          onClick={() =>
            ref.current
              .play()
              .then(() => block(false))
              .catch(() => {})
          }
        >
          Enable audio
        </Btn>
      )}
    </>
  );
}
export default function Call({ api, me, members, m, entry, exit, now }) {
  const [rows, setRows] = useState([]),
    [remote, setRemote] = useState({}),
    [states, setStates] = useState({}),
    [mic, setMic] = useState(false),
    [screen, setScreen] = useState(null),
    [error, fail] = useState(''),
    [ready, setReady] = useState(false);
  const media = useRef(null),
    voice = useRef(null),
    display = useRef(null),
    alive = useRef(true),
    facts = useRef({ muted: true, sharing: false }),
    job = useJob();
  const session = entry.session,
    command = (action, data = {}) =>
      api.command('meeting.' + action, { id: m.id, session, ...data });
  const self = rows.find((x) => x.uid === me.id && x.session === session);
  const admitted = (self?.status || entry.status) === 'admitted';
  const active = rows.filter(
      (x) => x.status === 'admitted' && x.seen > now - 90000,
    ),
    host = me.id === m.host;
  const peerName = (id) =>
    members.find((x) => x.id === id)?.name || 'Team member';
  function pulse() {
    return command('pulse', facts.current);
  }
  useEffect(() => {
    alive.current = true;
    const off = api.watchRoom(
      m.id,
      (list) => {
        setRows(list);
        const own = list.find((x) => x.uid === me.id);
        if ((own && own.session !== session) || own?.status === 'declined')
          exit(
            own?.status === 'declined'
              ? 'The host declined your request.'
              : 'Your meeting session has changed.',
          );
      },
      (e) => fail(e.message),
    );
    const timer = setInterval(
      () =>
        pulse().catch((e) => {
          if (alive.current) exit(e.message);
        }),
      20000,
    );
    return () => {
      alive.current = false;
      off();
      clearInterval(timer);
      voice.current?.getTracks().forEach((t) => t.stop());
      display.current?.getTracks().forEach((t) => t.stop());
      command('leave').catch(() => {});
    };
  }, [api, m.id, session]);
  useEffect(() => {
    if (m.ended || m.end <= now) exit('Meeting ended.');
  }, [m.ended, m.end, now]);
  useEffect(() => {
    if (!admitted) return;
    let live = true,
      engine;
    (entry.ice?.length ? Promise.resolve(entry.ice) : command('ice'))
      .then((ice) => {
        if (!live) return;
        engine = voiceRoom({
          api,
          room: m.id,
          session,
          ice,
          onRemote: (uid, stream) => {
            if (live) setRemote((old) => ({ ...old, [uid]: stream }));
          },
          onState: (uid, status) => {
            if (live) setStates((old) => ({ ...old, [uid]: status }));
          },
          onError: (e) => {
            if (live) fail(e.message);
          },
        });
        media.current = engine;
        setReady(true);
      })
      .catch((e) => {
        if (live) fail(e.message);
      });
    return () => {
      live = false;
      engine?.close();
      media.current = null;
    };
  }, [api, m.id, admitted, session]);
  useEffect(() => {
    if (ready) media.current?.sync(active);
  }, [rows, ready, now]);
  async function toggleMic() {
    if (
      !voice.current ||
      voice.current.getAudioTracks()[0]?.readyState === 'ended'
    ) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (!alive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      voice.current = stream;
    }
    const track = voice.current.getAudioTracks()[0];
    track.enabled = !mic;
    await media.current.microphone(track);
    facts.current.muted = !track.enabled;
    setMic(track.enabled);
    await pulse();
  }
  async function stopShare() {
    const stream = display.current;
    display.current = null;
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    if (!alive.current) return;
    setScreen(null);
    facts.current.sharing = false;
    await media.current?.display(null);
    await pulse();
  }
  async function share() {
    if (display.current) return stopShare();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    if (!alive.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const track = stream.getVideoTracks()[0];
    track.onended = () => stopShare().catch((e) => fail(e.message));
    display.current = stream;
    setScreen(stream);
    facts.current.sharing = true;
    await media.current.display(track);
    await pulse();
  }
  const sharing = active.filter(
    (x) => x.sharing && (x.uid === me.id ? screen : remote[x.uid]),
  );
  return createPortal(
    <div
      className="call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={m.title}
    >
      <header>
        <div>
          <small>Voice meeting</small>
          <h2>{m.title}</h2>
        </div>
        <span>
          <Users size={16} /> {active.length} in call
        </span>
      </header>
      <main>
        {!admitted ? (
          <div className="lobby">
            <Users size={40} />
            <h2>Waiting for admission</h2>
            <p>{peerName(m.host)} can let you into this meeting.</p>
          </div>
        ) : (
          <>
            {sharing.map((x) => (
              <section className="screen-stage" key={x.session}>
                <Media
                  stream={x.uid === me.id ? screen : remote[x.uid]}
                  video
                  muted
                />
                <small>{peerName(x.uid)} is sharing</small>
              </section>
            ))}
            <div className="call-tiles">
              {active.map((x) => (
                <div className="call-tile" key={x.session}>
                  <Avatar person={members.find((p) => p.id === x.uid)} />
                  <strong>
                    {peerName(x.uid)}
                    {x.uid === me.id ? ' (you)' : ''}
                  </strong>
                  <small>
                    {x.muted ? <MicOff size={14} /> : <Mic size={14} />}{' '}
                    {x.uid === me.id
                      ? ''
                      : states[x.uid] === 'connected'
                        ? 'Connected'
                        : states[x.uid] === 'failed'
                          ? 'Reconnecting'
                          : 'Connecting'}
                  </small>
                  {x.uid !== me.id && remote[x.uid] && (
                    <Media stream={remote[x.uid]} />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {host && (
          <div className="meeting-admission">
            <Check
              checked={m.auto}
              onChange={(e) =>
                command('policy', { auto: e.target.checked }).catch((e) =>
                  fail(e.message),
                )
              }
            >
              Automatically admit invited people
            </Check>
            {rows
              .filter((x) => x.status === 'waiting' && x.seen > now - 90000)
              .map((x) => (
                <div className="row" key={x.uid}>
                  <b>{peerName(x.uid)}</b> is waiting
                  <Btn
                    disabled={job.busy}
                    onClick={() =>
                      job.run(() =>
                        command('admit', {
                          target: x.uid,
                          targetSession: x.session,
                        }),
                      )
                    }
                  >
                    Admit
                  </Btn>
                  <Btn
                    disabled={job.busy}
                    onClick={() =>
                      job.run(() =>
                        command('admit', {
                          target: x.uid,
                          targetSession: x.session,
                          accept: false,
                        }),
                      )
                    }
                  >
                    Decline request
                  </Btn>
                </div>
              ))}
          </div>
        )}
        <ErrorText error={error || job.error} />
      </main>
      <footer>
        {admitted && (
          <>
            <Btn
              icon={mic ? Mic : MicOff}
              disabled={!ready || job.busy}
              onClick={() => job.run(toggleMic)}
            >
              {mic ? 'Mute' : 'Unmute'}
            </Btn>
            <Btn
              icon={MonitorUp}
              disabled={!ready || job.busy}
              onClick={() => job.run(share)}
            >
              {screen ? 'Stop sharing' : 'Share screen'}
            </Btn>
          </>
        )}
        <Btn kind="danger" icon={PhoneOff} onClick={() => exit()}>
          Leave meeting
        </Btn>
        {host && (
          <Btn
            disabled={job.busy}
            onClick={() =>
              job.run(async () => {
                await command('end');
                exit();
              })
            }
          >
            End for everyone
          </Btn>
        )}
      </footer>
    </div>,
    document.body,
  );
}
