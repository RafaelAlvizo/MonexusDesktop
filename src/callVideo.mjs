// Camera and presentation use the same negotiated video sender on every peer.
export function callVideo({ devices, send, changed, failed }) {
  let current = null, source = '', deviceId = '', restoreCamera = false;
  let closed = false, pending = Promise.resolve();
  function queue(operation) {
    const result = pending.then(() => { if (!closed) return operation(); });
    pending = result.catch(() => {});
    return result;
  }
  function release(stream) {
    for (const track of stream?.getTracks() || []) {
      track.onended = null;
      track.stop();
    }
  }
  function capture(id) {
    return devices.getUserMedia({ audio: false, video: {
      width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 24 },
      ...(id ? { deviceId: { exact: id } } : {}),
    } });
  }
  async function replace(next, kind) {
    const track = next?.getVideoTracks()[0];
    try {
      if (closed) return;
      if (next && (!track || track.readyState === 'ended')) throw Error('The video device stopped.');
      await send(track || null);
      if (closed) return;
      release(current);
      current = next;
      source = kind;
      if (track) track.onended = () => queue(async () => {
        if (current !== next) return;
        if (kind === 'screen') await stopSharing();
        else await replace(null, '');
      }).catch(failed);
      changed({ stream: current, source });
    } catch (e) {
      if (!closed) await send(current?.getVideoTracks()[0] || null).catch(() => {});
      throw e;
    } finally {
      if (next !== current) release(next);
    }
  }
  async function stopSharing() {
    const restore = restoreCamera;
    restoreCamera = false;
    release(current);
    if (restore && !closed) {
      try { await replace(await capture(deviceId), 'camera'); return; }
      catch (error) { await replace(null, ''); throw error; }
    }
    await replace(null, '');
  }
  return {
    camera: () => queue(async () => {
      if (source === 'screen') return;
      if (source === 'camera') await replace(null, '');
      else await replace(await capture(deviceId), 'camera');
    }),
    select: id => queue(async () => {
      if (source === 'camera' && id !== deviceId) await replace(await capture(id), 'camera');
      deviceId = id;
    }),
    share: () => queue(async () => {
      if (source === 'screen') return stopSharing();
      const stream = await devices.getDisplayMedia({ video: true, audio: false });
      restoreCamera = source === 'camera';
      await replace(stream, 'screen');
    }),
    close() { closed = true; release(current); current = null; },
  };
}
