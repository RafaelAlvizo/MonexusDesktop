import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, MonitorUp, PhoneOff, Settings2, Users, Video, VideoOff, Volume2 } from 'lucide-react';
import { Avatar, Btn, ErrorText, Check, Label, Modal, WindowPin, useJob } from '../ui.jsx';
import { voiceRoom } from '../voice.mjs';
import { callVideo } from '../callVideo.mjs';
import { desktop, nativeAction } from '../native.mjs';

function Media({ stream, video = false, muted = false, volume = 1 }) {
  const ref = useRef(),
    [blocked, block] = useState(false);
  const track = video ? stream?.getVideoTracks()[0] : stream?.getAudioTracks()[0];
  useEffect(() => { if (ref.current) ref.current.volume = volume; }, [volume]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = track ? new MediaStream([track]) : null;
    if (track)
      el.play()
        .then(() => block(false))
        .catch(() => block(true));
    return () => {
      el.srcObject = null;
    };
  }, [track]);
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
function Participant({ person, name, self, stream, visual, source, muted, state, context, volume }) {
  const [speaking, setSpeaking] = useState(false);
  const track = stream?.getAudioTracks()[0];
  useEffect(() => {
    setSpeaking(false);
    if (!context || !track || muted || track.readyState === 'ended') return;
    const source = context.createMediaStreamSource(new MediaStream([track]));
    const meter = context.createAnalyser();
    meter.fftSize = 1024;
    source.connect(meter);
    const samples = new Float32Array(meter.fftSize);
    let lastSpeech = -Infinity;
    const timer = setInterval(() => {
      meter.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      if (Math.sqrt(sum / samples.length) > 0.019) lastSpeech = performance.now();
      setSpeaking(performance.now() - lastSpeech < 350);
    }, 100);
    return () => { clearInterval(timer); source.disconnect(); meter.disconnect(); };
  }, [track, muted, context]);
  const talking = speaking && !muted;
  return <div className={'call-tile' + (talking ? ' speaking' : '')} data-source={source || 'off'}>
    {visual && source ? <Media stream={visual} video muted /> : <Avatar person={person} />}
    {source === 'screen' && <small className="tile-share"><MonitorUp size={14}/> Sharing screen</small>}
    <strong>{name}{self ? ' (you)' : ''}</strong>
    <small>{muted ? <MicOff size={14}/> : <Mic size={14}/>}
      {talking ? 'Speaking' : muted ? 'Muted' : self || state === 'connected' ? 'Listening' :
        state === 'failed' ? 'Reconnecting' : 'Connecting'}
    </small>
    {!self && stream && <Media stream={stream} volume={volume} />}
  </div>;
}
export default function Call({ api, me, members, m, entry, exit, now }) {
  const [rows, setRows] = useState([]),
    [remote, setRemote] = useState({}),
    [states, setStates] = useState({}),
    [mic, setMic] = useState(false),
    [visual, setVisual] = useState({ stream: null, source: '' }),
    [confirmClose, setConfirmClose] = useState(''),
    [cameraId, setCameraId] = useState(''),
    [error, fail] = useState(''),
    [ready, setReady] = useState(false);
  const [settings, showSettings] = useState(false),
    [input, setInput] = useState(''),
    [devices, setDevices] = useState([]),
    [volume, setVolume] = useState(1),
    [context, setContext] = useState(null);
  const media = useRef(null),
    voice = useRef(null),
    video = useRef(null),
    pulses = useRef(Promise.resolve()),
    alive = useRef(true),
    facts = useRef({ muted: true, sharing: false, camera: false }),
    job = useJob();
  const session = entry.session,
    command = (action, data = {}) =>
      api.command('meeting.' + action, { id: m.id, session, ...data });
  const self = rows.find((x) => x.uid === me.id && x.session === session);
  const leaving = useRef(false);
  async function leave() {
    if (leaving.current) return;
    leaving.current = true;
    try { await command('leave'); exit(); }
    catch (e) { leaving.current = false; throw e; }
  }
  useEffect(() => {
    let live = true, release;
    const refresh = () => api.meetingExit(m.id, session).then(fn => { if (live) release = fn; }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 30 * 60 * 1000);
    const unload = () => { if (!leaving.current) release?.(); };
    const close = e => { if (e.data?.kind === 'close_call') setConfirmClose(me.id === m.host ? 'end' : 'leave'); };
    const beforeUnload = e => { if (!leaving.current) { e.preventDefault(); e.returnValue = ''; } };
    if (!desktop) window.addEventListener('beforeunload', beforeUnload);
    nativeAction('call_active', { active: true });
    desktop?.addEventListener('message', close);
    window.addEventListener('pagehide', unload);
    return () => {
      live = false; clearInterval(timer); window.removeEventListener('pagehide', unload);
      desktop?.removeEventListener('message', close);
      window.removeEventListener('beforeunload', beforeUnload);
      nativeAction('call_active', { active: false });
    };
  }, [session]);
  const admitted = (self?.status || entry.status) === 'admitted';
  useEffect(() => {
    if (!admitted || !window.AudioContext) return;
    const audio = new AudioContext();
    const resume = () => { if (audio.state === 'suspended') audio.resume().catch(() => {}); };
    resume();
    document.addEventListener('click', resume);
    setContext(audio);
    return () => { document.removeEventListener('click', resume); audio.close().catch(() => {}); };
  }, [admitted]);
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!settings || !mediaDevices?.enumerateDevices) return;
    let live = true;
    const refresh = () => mediaDevices.enumerateDevices().then(all => {
      if (live) setDevices(all.filter(d => d.deviceId && d.deviceId !== 'default'));
    }).catch(e => { if (live) fail(e.message); });
    refresh();
    mediaDevices.addEventListener('devicechange', refresh);
    return () => { live = false; mediaDevices.removeEventListener('devicechange', refresh); };
  }, [settings, mic, visual.source]);
  const active = rows.filter(
      (x) => x.status === 'admitted' && x.seen > now - 90000,
    ),
    host = me.id === m.host;
  const peerName = (id) =>
    members.find((x) => x.id === id)?.name || 'Team member';
  function pulse() {
    const next = () => alive.current && !leaving.current ? command('pulse', { ...facts.current }) : undefined;
    pulses.current = pulses.current.catch(() => {}).then(next);
    return pulses.current;
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
    const heartbeat = () => pulse().catch(e => {
      if (!alive.current || leaving.current) return;
      if (['functions/permission-denied','functions/failed-precondition','functions/unauthenticated'].includes(e.code)) exit(e.message);
    });
    const timer = setInterval(heartbeat, 20000);
    window.addEventListener('online', heartbeat);
    return () => {
      alive.current = false;
      off();
      clearInterval(timer);
      voice.current?.getTracks().forEach((t) => t.stop());
      window.removeEventListener('online', heartbeat);
      if (!leaving.current) command('leave').catch(() => {});
    };
  }, [api, m.id, session]);
  useEffect(() => {
    if ((m.ended || m.end <= now) && !leaving.current) { leaving.current = true; command('leave').catch(() => {}); exit(); }
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
        video.current = callVideo({
          devices: navigator.mediaDevices,
          send: track => engine.video(track),
          changed: next => {
            if (!live) return;
            setVisual(next);
            facts.current.camera = next.source === 'camera';
            facts.current.sharing = next.source === 'screen';
            pulse().catch(e => { if (live) fail(e.message); });
          },
          failed: e => { if (live) fail(e.message); },
        });
        setReady(true);
      })
      .catch((e) => {
        if (live) fail(e.message);
      });
    return () => {
      live = false;
      video.current?.close();
      video.current = null;
      engine?.close();
      setReady(false);
      media.current = null;
    };
  }, [api, m.id, admitted, session]);
  useEffect(() => {
    if (ready) media.current?.sync(active);
  }, [rows, ready, now]);
  async function captureMicrophone(deviceId, enabled) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
      video: false,
    });
    const track = stream.getAudioTracks()[0];
    track.enabled = enabled;
    try {
      if (!alive.current) return;
      await media.current.microphone(track);
      if (!alive.current) return;
      voice.current?.getTracks().forEach(t => t.stop());
      voice.current = stream;
    } finally {
      if (voice.current !== stream) stream.getTracks().forEach(t => t.stop());
    }
  }
  async function toggleMic() {
    if (
      !voice.current ||
      voice.current.getAudioTracks()[0]?.readyState === 'ended'
    ) {
      await captureMicrophone(input, !mic);
      if (!alive.current) return;
    }
    const track = voice.current.getAudioTracks()[0];
    track.enabled = !mic;
    facts.current.muted = !track.enabled;
    setMic(track.enabled);
    await pulse();
  }
  async function finish() {
    if (confirmClose === 'leave') return leave();
    leaving.current = true;
    try { await command('end'); exit(); }
    catch (e) { leaving.current = false; throw e; }
  }
  return createPortal(
    <div
      className="call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={m.title}
    >
      <header>
        <div>
          <small>Meeting</small>
          <h2>{m.title}</h2>
        </div>
        <span>
          <Users size={16} /> {active.length} in call <WindowPin />
        </span>
      </header>
      <main>
        {settings && admitted && <section className="call-settings" aria-label="Call settings">
          <div className="section-line"><h3>Audio and video</h3><Btn onClick={() => showSettings(false)}>Done</Btn></div>
          <Label name="Microphone">
            <select value={input} disabled={job.busy} onChange={e => {
              const device = e.target.value;
              job.run(async () => {
                if (voice.current) await captureMicrophone(device, mic);
                setInput(device);
              });
            }}>
              <option value="">System default</option>
              {devices.filter(d => d.kind === 'audioinput').map((d, i) => <option value={d.deviceId} key={d.deviceId}>{d.label || 'Microphone ' + (i + 1)}</option>)}
            </select>
          </Label>
          <Label name="Camera">
            <select value={cameraId} disabled={!ready || job.busy} onChange={e => {
              const id = e.target.value;
              job.run(async () => { await video.current.select(id); setCameraId(id); });
            }}>
              <option value="">System default</option>
              {devices.filter(d => d.kind === 'videoinput').map((d,i) =>
                <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera ' + (i+1)}</option>)}
            </select>
          </Label>
          <Label name={'Speaker volume · ' + Math.round(volume * 100) + '%'}>
            <input type="range" min="0" max="1" step=".01" value={volume}
              onChange={e => setVolume(Number(e.target.value))}/>
          </Label>
          {host && <Check checked={m.auto} onChange={e =>
            command('policy', { auto: e.target.checked }).catch(e => fail(e.message))}>
            Automatically admit invited people
          </Check>}
        </section>}
        {!admitted ? (
          <div className="lobby">
            <Users size={40} />
            <h2>Waiting for admission</h2>
            <p>{peerName(m.host)} can let you into this meeting.</p>
          </div>
        ) : (
          <>
            <div className="call-tiles">
              {active.map((x) => (
                <Participant key={x.session} person={members.find(p => p.id === x.uid)}
                  name={peerName(x.uid)} self={x.uid === me.id} context={context} volume={volume}
                  stream={x.uid === me.id ? voice.current : remote[x.uid]}
                  visual={x.uid === me.id ? visual.stream : remote[x.uid]}
                  source={x.uid === me.id ? visual.source : x.sharing ? 'screen' : x.camera ? 'camera' : ''}
                  muted={x.uid === me.id ? !mic : x.muted} state={states[x.uid]} />
              ))}
            </div>
          </>
        )}
        {host && rows.some(x => x.status === 'waiting' && x.seen > now - 90000) && (
          <div className="meeting-admission">
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
            <Btn icon={Settings2} aria-expanded={settings} onClick={() => showSettings(!settings)}>Call settings</Btn>
            <Btn
              icon={mic ? Mic : MicOff}
              disabled={!ready || job.busy}
              onClick={() => job.run(toggleMic)}
            >
              {mic ? 'Mute' : 'Unmute'}
            </Btn>
            <Btn icon={visual.source === 'camera' ? Video : VideoOff}
              disabled={!ready || job.busy || visual.source === 'screen'}
              onClick={() => job.run(() => video.current.camera())}>
              {visual.source === 'camera' ? 'Turn camera off' : 'Turn camera on'}
            </Btn>
            <Btn
              icon={MonitorUp}
              disabled={!ready || job.busy}
              onClick={() => job.run(() => video.current.share())}
            >
              {visual.source === 'screen' ? 'Stop sharing' : 'Share screen'}
            </Btn>
          </>
        )}
        <Btn kind="danger" icon={PhoneOff} disabled={job.busy} onClick={() => setConfirmClose('leave')}>
          Leave meeting
        </Btn>
        {host && <Btn disabled={job.busy} onClick={() => setConfirmClose('end')}>End for everyone</Btn>}
      </footer>
      {confirmClose && <Modal title={confirmClose === 'end' ? 'End meeting for everyone?' : 'Leave this meeting?'}
        onClose={() => !job.busy && setConfirmClose('')}>
        <div className="form-body"><p>{confirmClose === 'end' ? 'The meeting will end for every participant and this window will close.' : 'Your camera, microphone and screen sharing will stop, and this window will close.'}</p><ErrorText error={job.error}/></div>
        <footer><Btn autoFocus disabled={job.busy} onClick={() => setConfirmClose('')}>Stay in meeting</Btn>
        <Btn kind="danger" disabled={job.busy} onClick={() => job.run(finish)}>{confirmClose === 'end' ? 'End meeting and close' : 'Leave and close'}</Btn></footer>
      </Modal>}
    </div>,
    document.body,
  );
}
