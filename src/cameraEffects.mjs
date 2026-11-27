import visionModuleUrl from '../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs?url';
import wasmLoaderPath from '../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?url';
import wasmBinaryPath from '../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url';
import modelAssetPath from './models/selfie_segmenter_landscape.tflite?url';

export async function prepareBackground(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type))
    throw Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw Error('Choose an image smaller than 20 MB.');
  let image;
  try { image = await createImageBitmap(file); }
  catch { throw Error('This image could not be opened. Choose another JPG, PNG or WebP image.'); }
  try {
    const scale = Math.min(1, 1600 / image.width, 1200 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#17191c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally { image.close(); }
}

export async function processCamera(stream, effect, signal, onFailure) {
  signal.throwIfAborted();
  const track = stream.getVideoTracks()[0];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let worker, reader, output, image, closed = false, ready = false, firstFrame, rejectFirst, timer;
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    reader?.cancel().catch(() => {});
    worker?.terminate();
    output?.getTracks().forEach(t => t.stop());
    image?.close();
  }
  function abort() { rejectFirst?.(new DOMException('Camera stopped.', 'AbortError')); close(); }
  function fail(error) {
    if (closed) return;
    if (ready) onFailure(error);
    else rejectFirst(error);
    close();
  }
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (effect.mode === 'image') {
      const source = new Image();
      source.src = effect.image;
      await source.decode();
      signal.throwIfAborted();
      image = await createImageBitmap(source);
      if (closed) { image.close(); signal.throwIfAborted(); }
    }
    const started = new Promise((resolve, reject) => { firstFrame = resolve; rejectFirst = reject; });
    reader = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 }).readable.getReader();
    worker = new Worker(new URL('./background.worker.mjs', import.meta.url));
    async function next() {
      try {
        const { value: frame, done } = await reader.read();
        if (closed) { frame?.close(); return; }
        if (done) throw Error('The camera disconnected.');
        worker.postMessage({ frame }, [frame]);
      } catch (e) { fail(e); }
    }
    worker.onmessage = ({ data }) => {
      if (closed) { data.picture?.close(); return; }
      if (data.type === 'error') { fail(Error(data.message)); return; }
      if (data.picture) {
        const frame = data.picture;
        if (canvas.width !== frame.width || canvas.height !== frame.height) {
          canvas.width = frame.width; canvas.height = frame.height;
        }
        ctx.drawImage(frame, 0, 0); frame.close();
        if (!ready) {
          output = canvas.captureStream(0);
          ready = true; clearTimeout(timer); firstFrame();
        }
        output.getVideoTracks()[0].requestFrame();
      }
      next();
    };
    worker.onerror = e => fail(Error(e.message || 'The background effect could not start.'));
    timer = setTimeout(() => fail(Error('The background effect took too long to start.')), 20000);
    worker.postMessage({
      type: 'init', image, visionModuleUrl, wasmLoaderPath, wasmBinaryPath, modelAssetPath,
    }, image ? [image] : []);
    image = null;
    await started;
    return { stream: output, close };
  } catch (e) { close(); throw e; }
}
