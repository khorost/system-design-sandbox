import { type InternalNode,Position } from '@xyflow/react';

function getNodeCenter(node: InternalNode) {
  const w = node.measured.width ?? 0;
  const h = node.measured.height ?? 0;
  return {
    x: node.internals.positionAbsolute.x + w / 2,
    y: node.internals.positionAbsolute.y + h / 2,
  };
}

function getNodeIntersection(node: InternalNode, targetX: number, targetY: number) {
  const center = getNodeCenter(node);
  const hw = (node.measured.width ?? 0) / 2;
  const hh = (node.measured.height ?? 0) / 2;

  const dx = targetX - center.x;
  const dy = targetY - center.y;

  if (dx === 0 && dy === 0) {
    return { x: center.x, y: center.y };
  }

  const tx = hw / Math.abs(dx || 1);
  const ty = hh / Math.abs(dy || 1);
  const t = Math.min(tx, ty);

  return {
    x: center.x + t * dx,
    y: center.y + t * dy,
  };
}

function getEdgePosition(node: InternalNode, point: { x: number; y: number }): Position {
  const center = getNodeCenter(node);
  const hw = (node.measured.width ?? 0) / 2;
  const hh = (node.measured.height ?? 0) / 2;

  const dx = (point.x - center.x) / (hw || 1);
  const dy = (point.y - center.y) / (hh || 1);

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? Position.Right : Position.Left;
  }
  return dy > 0 ? Position.Bottom : Position.Top;
}

export function getFloatingEdgeParams(sourceNode: InternalNode, targetNode: InternalNode) {
  const targetCenter = getNodeCenter(targetNode);
  const sourceCenter = getNodeCenter(sourceNode);

  const sourceIntersection = getNodeIntersection(sourceNode, targetCenter.x, targetCenter.y);
  const targetIntersection = getNodeIntersection(targetNode, sourceCenter.x, sourceCenter.y);

  const sourcePos = getEdgePosition(sourceNode, sourceIntersection);
  const targetPos = getEdgePosition(targetNode, targetIntersection);

  return {
    sx: sourceIntersection.x,
    sy: sourceIntersection.y,
    tx: targetIntersection.x,
    ty: targetIntersection.y,
    sourcePos,
    targetPos,
  };
}
