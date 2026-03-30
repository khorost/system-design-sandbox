import { getBezierPath,type Position } from '@xyflow/react';

import { useCanvasStore } from '../store/canvasStore.ts';

const PARALLEL_GAP = 12;

export function buildBezierPath(
  sx: number, sy: number, tx: number, ty: number,
  sourcePos: Position, targetPos: Position,
): [string, number, number, number, number] {
  return getBezierPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition: sourcePos, targetPosition: targetPos });
}

export function buildStraightPath(
  sx: number, sy: number, tx: number, ty: number,
  edgeIndex: number, totalParallel: number,
): [string, number, number] {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  // Perpendicular unit vector
  const px = -dy / len;
  const py = dx / len;

  // Offset from center
  const offset = (edgeIndex - (totalParallel - 1) / 2) * PARALLEL_GAP;

  const x1 = sx + px * offset;
  const y1 = sy + py * offset;
  const x2 = tx + px * offset;
  const y2 = ty + py * offset;

  const path = `M ${x1} ${y1} L ${x2} ${y2}`;
  const labelX = (x1 + x2) / 2;
  const labelY = (y1 + y2) / 2;

  return [path, labelX, labelY];
}

export function buildPolylinePath(
  sx: number, sy: number, tx: number, ty: number,
  waypoints?: Array<{ x: number; y: number }>,
): [string, number, number] {
  const pts = [{ x: sx, y: sy }, ...(waypoints ?? []), { x: tx, y: ty }];

  // Build SVG path
  const segments = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 1; i < pts.length; i++) {
    segments.push(`L ${pts[i].x} ${pts[i].y}`);
  }
  const path = segments.join(' ');

  // Label at midpoint of longest segment
  let maxLen = 0;
  let labelX = (sx + tx) / 2;
  let labelY = (sy + ty) / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const segLen = dx * dx + dy * dy; // skip sqrt for comparison
    if (segLen > maxLen) {
      maxLen = segLen;
      labelX = (pts[i].x + pts[i + 1].x) / 2;
      labelY = (pts[i].y + pts[i + 1].y) / 2;
    }
  }

  return [path, labelX, labelY];
}

/**
 * Non-hook utility: compute parallel edge index for straight mode.
 * Reads edges directly from store (no subscription — avoids infinite re-render).
 */
export function getParallelEdgeInfo(edgeId: string, source: string, target: string): { index: number; total: number } {
  const edges = useCanvasStore.getState().edges;
  const siblings = edges.filter(
    e => (e.source === source && e.target === target) || (e.source === target && e.target === source),
  );
  const idx = siblings.findIndex(e => e.id === edgeId);
  return { index: Math.max(idx, 0), total: Math.max(siblings.length, 1) };
}
