import { whiteboardSizeLimits } from '../functions/core/model.mjs';

export const isShape = (item) => !!item && !['pen', 'segment', 'line'].includes(item.kind);

export function shapeSize(item) {
  const [w, h] = item.kind === 'diamond' ? [172, 90] : item.kind === 'ellipse' ? [166, 80] : [156, 78];
  return { width: item.width ?? w, height: item.height ?? h };
}

export function boundsOf(item) {
  if (item.points) {
    const x = item.points.map((p) => p[0]),
      y = item.points.map((p) => p[1]);
    return { left: Math.min(...x), right: Math.max(...x), top: Math.min(...y), bottom: Math.max(...y) };
  }
  const { width, height } = shapeSize(item);
  return {
    left: item.x - width / 2,
    right: item.x + width / 2,
    top: item.y - height / 2,
    bottom: item.y + height / 2,
  };
}

export function resizeFromCorner(item, corner, x, y) {
  const { left, right, top, bottom } = boundsOf(item);
  const west = corner.endsWith('w'),
    north = corner.startsWith('n');
  const anchorX = west ? right : left,
    anchorY = north ? bottom : top;
  const limit = (size) => Math.max(whiteboardSizeLimits.min, Math.min(whiteboardSizeLimits.max, size));
  const width = limit(west ? anchorX - x : x - anchorX),
    height = limit(north ? anchorY - y : y - anchorY);
  const nextLeft = west ? right - width : left,
    nextTop = north ? bottom - height : top;
  if (item.points) {
    return {
      ...item,
      points: item.points.map(([px, py]) => [
        right === left ? left : nextLeft + ((px - left) * width) / (right - left),
        bottom === top ? top : nextTop + ((py - top) * height) / (bottom - top),
      ]),
    };
  }
  return { ...item, width, height, x: nextLeft + width / 2, y: nextTop + height / 2 };
}
