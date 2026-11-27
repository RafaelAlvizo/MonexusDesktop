let segmenter, backdrop, mask, input, output;
function surface(width, height) {
  return new OffscreenCanvas(width, height).getContext('2d');
}
function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale, h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}
function composite(frame) {
  const width = frame.displayWidth, height = frame.displayHeight;
  if (!output || output.canvas.width !== width || output.canvas.height !== height)
    output = surface(width, height);
  input.drawImage(frame, 0, 0, input.canvas.width, input.canvas.height);
  segmenter.segmentForVideo(input.canvas, performance.now(), result => {
    // The binary selfie model returns one foreground probability per pixel.
    const foreground = result.confidenceMasks.at(-1);
    const probabilities = foreground.getAsFloat32Array();
    if (!mask || mask.canvas.width !== foreground.width || mask.canvas.height !== foreground.height)
      mask = surface(foreground.width, foreground.height);
    const alpha = mask.createImageData(foreground.width, foreground.height);
    for (let i = 0; i < probabilities.length; i++)
      alpha.data[i * 4 + 3] = Math.min(1, Math.max(0, (probabilities[i] - 0.15) / 0.7)) * 255;
    mask.putImageData(alpha, 0, 0);
  });
  output.clearRect(0, 0, width, height);
  output.drawImage(frame, 0, 0, width, height);
  output.globalCompositeOperation = 'destination-in';
  output.drawImage(mask.canvas, 0, 0, width, height);
  output.globalCompositeOperation = 'destination-over';
  if (backdrop) drawCover(output, backdrop, width, height);
  else {
    const radius = Math.max(8, Math.round(width / 40));
    output.filter = 'blur(' + radius + 'px)';
    output.drawImage(frame, -radius * 2, -radius * 2, width + radius * 4, height + radius * 4);
    output.filter = 'none';
  }
  output.globalCompositeOperation = 'source-over';
  return output.canvas.transferToImageBitmap();
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      // The WASM loader uses importScripts, so this worker runs in classic mode.
      const { ImageSegmenter } = await import(/* @vite-ignore */ data.visionModuleUrl);
      const { wasmLoaderPath, wasmBinaryPath, modelAssetPath } = data;
      backdrop = data.image;
      segmenter = await ImageSegmenter.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, {
        baseOptions: { modelAssetPath, delegate: 'CPU' },
        canvas: new OffscreenCanvas(256, 144),
        runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
      });
      input = surface(256, 144);
      self.postMessage({ type: 'ready' });
    } else {
      const picture = composite(data.frame);
      self.postMessage({ type: 'frame', picture }, [picture]);
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || 'Camera background processing failed.' });
  } finally {
    data.frame?.close();
  }
};
