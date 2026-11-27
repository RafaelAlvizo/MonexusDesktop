import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, MonitorUp, PhoneOff, Settings2, Users, Video, VideoOff, Volume2, X, ImagePlus, Blend, Ban, Check as Tick, ChevronUp } from 'lucide-react';
import { Avatar, Btn, ErrorText, Check, Label, Modal, WindowPin, useJob } from '../ui.jsx';
import { voiceRoom } from '../voice.mjs';
import { callVideo } from '../callVideo.mjs';
import { prepareBackground, processCamera } from '../cameraEffects.mjs';
import '../call.css';
import { meetingSoundEnabled, setMeetingSound } from '../meetingAudio.mjs';
import { desktop, nativeAction } from '../native.mjs';

function Media({ stream }) {
  const ref = useRef();
  const track = stream?.getVideoTracks()[0];
  useEffect(() => {
    const el = ref.current;
    el.srcObject = track ? new MediaStream([track]) : null;
    if (track) el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [track]);
  return <video ref={ref} muted autoPlay playsInline />;
}

function RoomAudio({ remote, volume }) {
  const players = useRef(new Map());
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const current = players.current;
    let live = true;
    for (const [id, audio] of current) {
      if (audio.srcObject?.getAudioTracks()[0] !== remote[id]?.getAudioTracks()[0]) {
        audio.pause(); audio.srcObject = null; current.delete(id);
      }
    }
    for (const [id, stream] of Object.entries(remote)) {
      const track = stream?.getAudioTracks()[0];
      if (!track || current.has(id)) continue;
      const audio = new Audio();
      audio.srcObject = new MediaStream([track]);
      current.set(id, audio);
    }
    function play() {
      const attempts = [...current.values()].map(audio => {
        audio.volume = volume;
        return audio.paused ? audio.play() : Promise.resolve();
      });
      Promise.allSettled(attempts).then(results => {
        if (live) setBlocked(results.some(r => r.status === 'rejected' && r.reason?.name === 'NotAllowedError'));
      });
    }
    play();
    document.addEventListener('click', play);
    return () => { live = false; document.removeEventListener('click', play); };
  }, [remote, volume]);
  useEffect(() => () => {
    players.current.forEach(audio => { audio.pause(); audio.srcObject = null; });
    players.current.clear();
  }, []);
  return blocked && <Btn icon={Volume2}>Listen to meeting</Btn>;
}
function Participant({ person, name, self, stream, visual, source, muted, state, context, mirror }) {
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
  return <div className={'call-tile' + (talking ? ' speaking' : '')} data-source={source || 'off'}
    data-mirror={self && source === 'camera' && mirror || undefined}>
    {visual && source ? <Media stream={visual} /> : <Avatar person={person} />}
    <div className="tile-name">
      {muted ? <MicOff size={14} aria-label="Muted"/> : <Mic size={14} aria-label="Microphone on"/>}
      <strong>{name}{self ? ' (you)' : ''}</strong>
      <small className="tile-status">{talking ? 'Speaking' : muted ? 'Muted' : self || state === 'connected' ? 'Listening' :
        state === 'failed' ? 'Reconnecting' : 'Connecting'}</small>
    </div>
  </div>;
}
function Tool({ icon: Icon, label, children, tone = '', ...props }) {
  return <button type="button" className={'call-tool ' + tone} aria-label={label} title={label} {...props}>
    <Icon size={22} strokeWidth={1.7}/><span>{children}</span>
  </button>;
}
function cameraPreferences(uid) {
  try {
    const saved = JSON.parse(localStorage.getItem('monexus.camera.' + uid)) || {};
    const image = typeof saved.image === 'string' && saved.image.startsWith('data:image/jpeg;base64,') ? saved.image : '';
    return { mirror: saved.mirror === true, image, mode: saved.mode === 'blur' || (image && saved.mode === 'image') ? saved.mode : 'none' };
  } catch { return { mirror:false, mode:'none', image:'' }; }
}
export default function Call({ api, me, members, m, entry, exit, now, onAttendance }) {
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
  const [noise, setNoise] = useState(() => meetingSoundEnabled(me.id, 'noise'));
  const supportsNoise = !!navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression;
  const [selectedShare, selectShare] = useState('');
  const media = useRef(null),
    voice = useRef(null),
    video = useRef(null),
    pulses = useRef(Promise.resolve()),
    alive = useRef(true),
    facts = useRef({ muted: true, sharing: false, camera: false }),
    job = useJob();
  const [appearance, setAppearance] = useState(() => cameraPreferences(me.id));
  const [applyingBackground, setApplyingBackground] = useState(false);
  const pref = useRef(appearance), upload = useRef(), panel = useRef(), settingsTrigger = useRef();
  function remember(next) {
    pref.current = next;
    setAppearance(next);
    try { localStorage.setItem('monexus.camera.' + me.id, JSON.stringify(next)); }
    catch { fail('Your camera settings apply to this call. This device could not save them for next time.'); }
  }
  async function chooseBackground(mode, image = pref.current.image) {
    setApplyingBackground(true);
    try {
      await video.current.background({ mode, image });
      remember({ ...pref.current, mode, image });
    } finally { setApplyingBackground(false); }
  }
  function openSettings(event, focus) {
    settingsTrigger.current = event.currentTarget;
    showSettings(focus || 'panel');
  }
  function closeSettings() { showSettings(false); settingsTrigger.current?.focus(); }
  useEffect(() => {
    if (!settings) return;
    const target = settings === 'panel' ? panel.current : panel.current?.querySelector('[data-device="' + settings + '"]');
    target?.focus();
  }, [settings]);
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
  const attending = admitted && !m.ended && m.end > now;
  useEffect(() => {
    onAttendance(attending);
    return () => onAttendance(false);
  }, [attending, onAttendance]);
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
  const sourceFor = x => x.uid === me.id ? visual.source : x.sharing ? 'screen' : x.camera ? 'camera' : '';
  const shares = active.filter(x => sourceFor(x) === 'screen');
  const presenter = shares.find(x => x.uid === selectedShare) || shares[0];
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
          devices: navigator.mediaDevices, initialEffect: pref.current, processCamera,
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
  async function captureMicrophone(deviceId, enabled, suppressNoise = noise, changingNoise = false) {
    const audio = { echoCancellation: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) };
    if (supportsNoise) audio.noiseSuppression = { exact: suppressNoise };
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio, video: false }); }
    catch (e) {
      if (e.name !== 'OverconstrainedError' || e.constraint !== 'noiseSuppression') throw e;
      if (changingNoise) throw Error('This microphone cannot use that noise cancellation setting.');
      delete audio.noiseSuppression;
      stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    }
    const track = stream.getAudioTracks()[0];
    track.enabled = enabled;
    try {
      if (!alive.current) return;
      try { await media.current.microphone(track); }
      catch (e) {
        if (alive.current) await media.current?.microphone(voice.current?.getAudioTracks()[0] || null);
        throw e;
      }
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
  useEffect(() => {
    if (!desktop || visual.source !== 'screen') return;
    nativeAction('share_controls', { sharing: true, mic, busy: job.busy });
  }, [visual.source, mic, job.busy]);
  useEffect(() => {
    if (!desktop || visual.source !== 'screen') return;
    function receive(e) {
      if (e.data?.kind !== 'share_control') return;
      switch (e.data.action) {
        case 'mic': if (!job.busy) job.run(toggleMic); break;
        case 'stop': if (!job.busy) job.run(() => video.current.share()); break;
        case 'settings': showSettings('mic'); break;
        case 'end': setConfirmClose(host ? 'end' : 'leave'); break;
      }
    }
    desktop.addEventListener('message', receive);
    return () => desktop.removeEventListener('message', receive);
  });
  useEffect(() => {
    if (visual.source === 'screen') return () => nativeAction('share_controls', { sharing: false });
  }, [visual.source]);
  return createPortal(
    <div
      className="call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={m.title}
    >
      <header className="call-header">
        <div className="meeting-identity"><span className="meeting-mark" aria-hidden="true">M</span><h2>{m.title}</h2></div>
        <div className="meeting-info"><span aria-label={active.length + ' in call'}><Users size={15}/>{active.length}</span><WindowPin /></div>
      </header>
      <main className={'call-main' + (settings ? ' with-settings' : '')}>
        {settings && admitted && <section className="call-settings" aria-label="Call settings" ref={panel} tabIndex={-1}
          onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); closeSettings(); } }}>
          <header><h3>Call settings</h3><button className="call-icon" type="button" aria-label="Done" title="Close settings" onClick={closeSettings}><X size={19}/></button></header>
          <div className="call-settings-body">
          <h4>Camera &amp; background</h4>
          <div className="camera-preview" data-mirror={appearance.mirror || undefined}>
            {visual.source === 'camera' ? <Media stream={visual.stream}/> : <><Avatar person={me}/><small>{visual.source === 'screen' ? 'Sharing your screen' : 'Camera is off'}</small></>}
          </div>
          <Label name="Camera">
            <select data-device="camera" value={cameraId} disabled={!ready || job.busy} onChange={e => {
              const id = e.target.value;
              job.run(async () => { await video.current.select(id); setCameraId(id); });
            }}>
              <option value="">System default</option>
              {devices.filter(d => d.kind === 'videoinput').map((d,i) =>
                <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera ' + (i+1)}</option>)}
            </select>
          </Label>
          <Check checked={appearance.mirror} onChange={e => remember({ ...pref.current, mirror:e.target.checked })}>Mirror my self-view</Check>
          <fieldset className="background-choices" disabled={!ready || job.busy}><legend>Background</legend>
            {[['none','None',Ban],['blur','Blur',Blend],...(appearance.image ? [['image','My image',null]] : [])].map(([mode,name,Icon]) =>
              <button type="button" key={mode} aria-pressed={appearance.mode === mode} onClick={() => job.run(() => chooseBackground(mode))}>
                <span className={'effect-swatch ' + mode}>{Icon ? <Icon size={21}/> : <img alt="" src={appearance.image}/>}
                  {appearance.mode === mode && <i><Tick size={11}/></i>}</span>{name}
              </button>)}
            <button type="button" onClick={() => upload.current.click()} aria-label="Upload background image"><span className="effect-swatch upload"><ImagePlus size={21}/></span>Upload</button>
          </fieldset>
          {applyingBackground && <small role="status">Applying background…</small>}
          <input type="file" hidden ref={upload} accept="image/jpeg,image/png,image/webp" aria-label="Background image file" onChange={e => {
            const file=e.target.files?.[0]; e.target.value='';
            if (file) job.run(async () => chooseBackground('image', await prepareBackground(file)));
          }}/>
          <h4>Audio</h4>
          <Label name="Microphone">
            <select data-device="mic" value={input} disabled={job.busy} onChange={e => {
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
          <Check checked={noise && supportsNoise} disabled={job.busy || !supportsNoise} onChange={e => {
            const next = e.target.checked;
            job.run(async () => {
              setNoise(next);
              try {
                if (voice.current?.getAudioTracks()[0]?.readyState === 'live')
                  await captureMicrophone(input, mic, next, true);
                setMeetingSound(me.id, 'noise', next);
              } catch (e) { setNoise(!next); throw e; }
            });
          }}>Noise cancellation</Check>
          <Label name={'Speaker volume · ' + Math.round(volume * 100) + '%'}>
            <input type="range" min="0" max="1" step=".01" value={volume}
              onChange={e => setVolume(Number(e.target.value))}/>
          </Label>
          {host && <h4>Admission</h4>}
          {host && <Check checked={m.auto} onChange={e =>
            command('policy', { auto: e.target.checked }).catch(e => fail(e.message))}>
            Automatically admit invited people
          </Check>}
          <ErrorText error={error || job.error} />
          </div>
        </section>}
        <div className={"meeting-stage" + (presenter ? " presenting" : "")}>
        {!admitted ? (
          <div className="lobby">
            <Users size={40} />
            <h2>Waiting for admission</h2>
            <p>{peerName(m.host)} can let you into this meeting.</p>
          </div>
        ) : (
          <>
            <div className="call-tiles" style={{
              '--people': active.length || 1,
              '--cols': active.length > 4 ? 3 : 2, '--rows': Math.ceil(active.length / (active.length > 4 ? 3 : 2)),
              '--narrow-rows': Math.ceil(active.length / 2),
            }} data-count={active.length} data-sharing={!!presenter || undefined}>
              {active.map((x) => (
                <Participant key={x.session} person={members.find(p => p.id === x.uid)}
                  name={peerName(x.uid)} self={x.uid === me.id} mirror={appearance.mirror} context={context}
                  stream={x.uid === me.id ? voice.current : remote[x.uid]}
                  visual={x.uid === me.id ? visual.stream : remote[x.uid]}
                  source={sourceFor(x) === 'screen' ? '' : sourceFor(x)}
                  muted={x.uid === me.id ? !mic : x.muted} state={states[x.uid]} />
              ))}
            </div>
            {presenter && <section className="shared-content" aria-label="Shared screen">
              <div className="share-sources">
                {shares.length === 1 ? <span><MonitorUp size={14}/>{presenter.uid === me.id ? 'Your screen' : peerName(presenter.uid) + '’s screen'}</span> :
                  shares.map(x => <button key={x.session} aria-pressed={presenter.uid === x.uid} onClick={() => selectShare(x.uid)}>
                    <MonitorUp size={14}/>{x.uid === me.id ? 'Your screen' : peerName(x.uid) + '’s screen'}</button>)}
              </div>
              <div className="call-tile presentation-video" data-source="screen">
                <Media stream={presenter.uid === me.id ? visual.stream : remote[presenter.uid]} />
              </div>
            </section>}
            <RoomAudio remote={remote} volume={volume} />
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
        {!settings && <ErrorText error={error || job.error} />}
        </div>
      </main>
      <footer className="call-controls">
        {admitted && <>
          <div className="device-tools">
            <div className="split-tool"><Tool icon={mic ? Mic : MicOff} label={mic ? 'Mute' : 'Unmute'} tone={mic ? '' : 'device-off'}
              disabled={!ready || job.busy} onClick={() => job.run(toggleMic)}>Audio</Tool>
              <button className="device-chevron" aria-label="Microphone settings" title="Microphone settings" onClick={e => openSettings(e,'mic')}><ChevronUp size={14}/></button></div>
            <div className="split-tool"><Tool icon={visual.source === 'camera' ? Video : VideoOff} tone={visual.source === 'camera' ? '' : 'device-off'}
              label={visual.source === 'camera' ? 'Turn camera off' : 'Turn camera on'} disabled={!ready || job.busy || visual.source === 'screen'}
              onClick={() => job.run(() => video.current.camera())}>Video</Tool>
              <button className="device-chevron" aria-label="Video settings" title="Video settings" onClick={e => openSettings(e,'camera')}><ChevronUp size={14}/></button></div>
          </div>
          <div className="meeting-tools">
            <Tool icon={MonitorUp} label={visual.source === 'screen' ? 'Stop sharing' : 'Share screen'} tone="share-tool" aria-pressed={visual.source === 'screen'}
              disabled={!ready || job.busy} onClick={() => job.run(() => video.current.share())}>{visual.source === 'screen' ? 'Stop share' : 'Share'}</Tool>
            <Tool icon={Settings2} label="Call settings" aria-expanded={!!settings} onClick={e => settings ? closeSettings() : openSettings(e)}>Settings</Tool>
          </div>
        </>}
        <Tool icon={PhoneOff} tone="exit-tool" label={host ? 'End for everyone' : 'Leave meeting'} disabled={job.busy}
          onClick={() => setConfirmClose(host ? 'end' : 'leave')}>{host ? 'End' : 'Leave'}</Tool>
      </footer>
      {confirmClose && <Modal title={confirmClose === 'end' ? 'End meeting for everyone?' : 'Leave this meeting?'}
        onClose={() => !job.busy && setConfirmClose('')}>
        <div className="form-body"><p>{confirmClose === 'end' ? 'The meeting will end for every participant and this window will close.' : 'Your camera, microphone and screen sharing will stop, and this window will close.'}</p><ErrorText error={job.error}/></div>
        <footer>{host && confirmClose === 'end' && <Btn disabled={job.busy} onClick={() => setConfirmClose('leave')}>Leave without ending</Btn>}
        <Btn autoFocus disabled={job.busy} onClick={() => setConfirmClose('')}>Stay in meeting</Btn>
        <Btn kind="danger" disabled={job.busy} onClick={() => job.run(finish)}>{confirmClose === 'end' ? 'End meeting and close' : 'Leave and close'}</Btn></footer>
      </Modal>}
    </div>,
    document.body,
  );
}
