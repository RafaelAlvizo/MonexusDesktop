// Keep the physical camera separate from the optional processed WebRTC track.
export function callVideo({ devices, send, changed, failed, initialEffect = { mode:'none' }, processCamera }) {
  let current = null, source = '', deviceId = '', restoreCamera = false;
  let effect = initialEffect, pending = Promise.resolve();
  const lifetime = new AbortController();
  const stopped = () => lifetime.signal.aborted;
  function queue(operation) {
    const result = pending.then(() => { if (!stopped()) return operation(); });
    pending = result.catch(() => {});
    return result;
  }
  function release(item, keepInput) {
    if (!item) return;
    item.processed?.close();
    if (item.input !== keepInput) for (const track of item.input.getTracks()) {
      track.onended = null; track.stop();
    }
  }
  const capture = id => devices.getUserMedia({ audio:false, video:{
    width:{ideal:640}, height:{ideal:360}, frameRate:{ideal:15,max:24}, ...(id ? { deviceId:{exact:id} } : {}),
  } });
  async function replace(input, kind, background = effect) {
    const next = input && { input, output:input };
    try {
      if (stopped()) return;
      if (kind === 'camera' && background.mode !== 'none') {
        next.processed = await processCamera(input, background, lifetime.signal, error => {
          queue(async () => {
            if (current === next) { await replace(null, ''); failed(error); }
          }).catch(failed);
        });
        next.output = next.processed.stream;
      }
      if (stopped()) return;
      const track = next?.output.getVideoTracks()[0];
      if (input && (!track || track.readyState === 'ended' || input.getVideoTracks()[0].readyState === 'ended'))
        throw Error('The video device stopped.');
      await send(track || null);
      if (stopped()) return;
      release(current, input);
      current = next;
      source = kind;
      if (input) input.getVideoTracks()[0].onended = () => queue(async () => {
        if (current !== next) return;
        if (kind === 'screen') await stopSharing();
        else await replace(null, '');
      }).catch(failed);
      changed({ stream:next?.output || null, source });
    } catch (e) {
      if (!stopped()) await send(current?.output.getVideoTracks()[0] || null).catch(() => {});
      throw e;
    } finally {
      if (next !== current) release(next, current?.input);
    }
  }
  async function stopSharing() {
    const restore = restoreCamera;
    restoreCamera = false;
    release(current);
    if (restore && !stopped()) {
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
    background: value => queue(async () => {
      if (source === 'camera') await replace(current.input, 'camera', value);
      effect = value;
    }),
    share: () => queue(async () => {
      if (source === 'screen') return stopSharing();
      const stream = await devices.getDisplayMedia({ video:true, audio:false });
      restoreCamera = source === 'camera';
      await replace(stream, 'screen');
    }),
    close() { lifetime.abort(); release(current); current = null; },
  };
}
