// A single audio and screen transceiver per peer keeps mute and sharing changes in the same call.
export function voiceRoom({
  api,
  room,
  session,
  ice,
  onRemote,
  onState,
  onError,
}) {
  const peers = new Map(),
    pending = new Map();
  let closed = false,
    mic = null,
    screen = null;
  function dispose(p) {
    clearTimeout(p.retry);
    p.pc.onconnectionstatechange = null;
    p.pc.close();
    peers.delete(p.uid);
    onRemote(p.uid, null);
  }
  async function gather(pc) {
    if (pc.iceGatheringState === 'complete') return;
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', change);
        resolve();
      };
      const change = () => {
        if (pc.iceGatheringState === 'complete') done();
      };
      const timer = setTimeout(done, 9000);
      pc.addEventListener('icegatheringstatechange', change);
      change();
    });
  }
  async function send(p) {
    await gather(p.pc);
    if (closed || peers.get(p.uid) !== p) return;
    const { type, sdp } = p.pc.localDescription;
    await api.command('meeting.signal', {
      id: room,
      session,
      target: p.uid,
      targetSession: p.session,
      type,
      sdp,
      generation: p.generation,
    });
  }
  function queue(p, fn) {
    p.queue = p.queue
      .then(async () => {
        if (!closed && peers.get(p.uid) === p) await fn();
      })
      .catch((e) => {
        if (!closed && peers.get(p.uid) === p) onError(e);
      });
  }
  function offer(p, restart = false) {
    return queue(p, async () => {
      p.generation = crypto.randomUUID();
      await p.pc.setLocalDescription(
        await p.pc.createOffer({ iceRestart: restart }),
      );
      await send(p);
    });
  }
  function signal(msg) {
    const p = peers.get(msg.from);
    if (!p || p.session !== msg.session) {
      pending.set(msg.session, msg);
      return;
    }
    queue(p, async () => {
      if (msg.type === 'offer' && !p.initiator) {
        if (p.generation === msg.generation) return;
        p.generation = msg.generation;
        await p.pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        // Answer on the offered media lines. Creating additional transceivers here
        // would attach outgoing tracks to lines the offer never negotiated.
        for (const transceiver of p.pc.getTransceivers()) {
          const kind = transceiver.receiver.track.kind;
          if (kind !== 'audio' && kind !== 'video') continue;
          p[kind] = transceiver;
          transceiver.direction = 'sendrecv';
          await transceiver.sender.replaceTrack(kind === 'audio' ? mic : screen);
        }
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        await send(p);
      } else if (
        msg.type === 'answer' &&
        p.initiator &&
        msg.generation === p.generation &&
        p.pc.signalingState === 'have-local-offer'
      ) {
        await p.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      }
    });
  }
  const off = api.watchSignals(room, session, signal, (e) => {
    if (!closed) onError(e);
  });
  function add(row) {
    const pc = new RTCPeerConnection({ iceServers: ice }),
      remote = new MediaStream();
    const initiator = session < row.session;
    const audio = initiator ? pc.addTransceiver('audio', { direction: 'sendrecv' }) : null,
      video = initiator ? pc.addTransceiver('video', { direction: 'sendrecv' }) : null;
    const p = {
      pc,
      session: row.session,
      uid: row.uid,
      remote,
      audio,
      video,
      queue: Promise.resolve(),
      initiator,
    };
    peers.set(row.uid, p);
    pc.ontrack = (e) => {
      if (!remote.getTracks().includes(e.track)) remote.addTrack(e.track);
      onRemote(row.uid, remote);
    };
    pc.onconnectionstatechange = () => {
      onState(row.uid, pc.connectionState);
      if (p.initiator && pc.connectionState === 'failed') {
        clearTimeout(p.retry);
        p.retry = setTimeout(() => offer(p, true), 1200);
      }
    };
    queue(p, async () => {
      await audio?.sender.replaceTrack(mic);
      await video?.sender.replaceTrack(screen);
    });
    if (p.initiator) offer(p);
    if (pending.has(row.session)) {
      signal(pending.get(row.session));
      pending.delete(row.session);
    }
  }
  return {
    sync(rows) {
      const live = rows.filter(
        (x) => x.uid !== api.uid && x.status === 'admitted',
      );
      for (const p of peers.values())
        if (!live.some((row) => row.uid === p.uid && row.session === p.session))
          dispose(p);
      for (const row of live) if (!peers.has(row.uid)) add(row);
    },
    async microphone(track) {
      mic = track;
      await Promise.all(
        [...peers.values()].map((p) => p.audio?.sender.replaceTrack(track)),
      );
    },
    async display(track) {
      screen = track;
      await Promise.all(
        [...peers.values()].map((p) => p.video?.sender.replaceTrack(track)),
      );
    },
    close() {
      closed = true;
      off();
      for (const p of peers.values()) dispose(p);
      pending.clear();
    },
  };
}
