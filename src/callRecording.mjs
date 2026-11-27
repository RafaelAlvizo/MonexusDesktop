export async function prepareAudioRecording(title, onError) {
  const name =
    (title || 'Meeting').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 80) +
    ' ' +
    new Date().toISOString().slice(0, 19).replace(/:/g, '-') +
    '.webm';
  const mimeType = 'audio/webm;codecs=opus';
  if (!window.MediaRecorder?.isTypeSupported(mimeType))
    throw Error('This device cannot record WebM meeting audio.');
  const handle =
    window.showSaveFilePicker &&
    (await window.showSaveFilePicker({
      suggestedName: name,
      types: [{ description: 'WebM audio', accept: { 'audio/webm': ['.webm'] } }],
    }));
  const writer = handle && (await handle.createWritable());
  const parts = [],
    sources = new Map();
  let context,
    dest,
    recorder,
    pending = Promise.resolve(),
    stopped,
    resolve,
    reject,
    writingError;
  function release() {
    sources.forEach((source) => source.disconnect());
    sources.clear();
    dest?.stream.getTracks().forEach((track) => track.stop());
    context?.close().catch(() => {});
  }
  try {
    context = new AudioContext();
    await context.resume();
    dest = context.createMediaStreamDestination();
    recorder = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 96000 });
  } catch (error) {
    release();
    await writer?.abort();
    throw error;
  }
  function sync(tracks) {
    const live = new Set(tracks.filter((track) => track && track.readyState === 'live'));
    for (const [track, node] of sources)
      if (!live.has(track)) {
        node.disconnect();
        sources.delete(track);
      }
    for (const track of live)
      if (!sources.has(track)) {
        const node = context.createMediaStreamSource(new MediaStream([track]));
        node.connect(dest);
        sources.set(track, node);
      }
  }
  const finished = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  finished.catch(() => {});
  recorder.ondataavailable = ({ data }) => {
    if (!data.size) return;
    if (!writer) parts.push(data);
    else
      pending = pending
        .then(() => writer.write(data))
        .catch((error) => {
          if (!writingError) {
            writingError = error;
            onError(error);
          }
        });
  };
  recorder.onerror = (e) => {
    writingError = e.error || Error('The audio recorder stopped.');
    onError(writingError);
  };
  recorder.onstop = async () => {
    try {
      await pending;
      if (writingError) throw writingError;
      if (writer) await writer.close();
      else {
        const url = URL.createObjectURL(new Blob(parts, { type: 'audio/webm' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      resolve();
    } catch (e) {
      await writer?.abort().catch(() => {});
      reject(e);
    } finally {
      release();
    }
  };
  return {
    sync,
    start() {
      recorder.start(1000);
    },
    stop() {
      if (!stopped) {
        stopped = true;
        if (recorder.state !== 'inactive') recorder.stop();
        else {
          release();
          Promise.resolve(writer?.abort()).then(resolve, reject);
        }
      }
      return finished;
    },
  };
}
