import { type Position } from '@xyflow/react';
import { useCallback, useMemo, useRef } from 'react';

import { useCanvasStore } from '../../../store/canvasStore.ts';
import { buildOrthogonalFromBendsPoints } from '../../../utils/edgePaths.ts';
import { orthoLog } from '../../../utils/orthoTelemetry.ts';

interface WaypointOverlayProps {
  edgeId: string;
  sx: number; sy: number;
  tx: number; ty: number;
  waypoints: Array<{ x: number; y: number }>;
  sourcePos: Position;
  targetPos: Position;
}

const SEG_GRAB = 12; // half-width of segment grab zone

function getViewportScale(): number {
  const rfPane = document.querySelector('.react-flow__viewport') as SVGGElement | null;
  return rfPane ? parseFloat(rfPane.style.transform?.match(/scale\(([^)]+)\)/)?.[1] ?? '1') : 1;
}

export function WaypointOverlay({
  edgeId, sx, sy, tx, ty, waypoints, sourcePos, targetPos,
}: WaypointOverlayProps) {
  const updateEdgeWaypoints = useCanvasStore((s) => s.updateEdgeWaypoints);

  const segDragRef = useRef<{
    horizontal: boolean;
    startMouse: number;
    frozenWaypoints: Array<{ x: number; y: number }>;
    affectedWpIndices: number[];
  } | null>(null);

  // Compute full route from explicit bends
  const routePoints = useMemo(
    () => buildOrthogonalFromBendsPoints(sx, sy, tx, ty, sourcePos, targetPos, waypoints),
    [sx, sy, tx, ty, sourcePos, targetPos, waypoints],
  );

  // Derive segments from route points
  const segments = useMemo(() => {
    if (routePoints.length < 2) return [];
    const n = routePoints.length;
    const TOL = 4;
    const segs: Array<{
      x1: number; y1: number; x2: number; y2: number;
      horizontal: boolean; index: number;
      draggable: boolean;
    }> = [];
    for (let i = 0; i < n - 1; i++) {
      const p1 = routePoints[i];
      const p2 = routePoints[i + 1];
      const horizontal = Math.abs(p1.y - p2.y) < 1;
      // Draggable only if: not a stub AND has matching stored waypoints on its axis
      let draggable = i >= 1 && i <= n - 3;
      if (draggable && waypoints.length > 0) {
        const hasMatch = !horizontal
          ? waypoints.some(wp => Math.abs(wp.x - Math.round((p1.x + p2.x) / 2)) < TOL)
          : waypoints.some(wp => Math.abs(wp.y - Math.round((p1.y + p2.y) / 2)) < TOL);
        if (!hasMatch) draggable = false;
      }
      segs.push({
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        horizontal, index: i, draggable,
      });
    }
    return segs;
  }, [routePoints, waypoints]);

  // ── Segment drag ──────────────────────────────────────────────────────────

  const onSegPointerDown = useCallback((e: React.PointerEvent, seg: typeof segments[0]) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Match segment axis to stored waypoints.
    // Vertical segment (drag X) → find waypoints with same X.
    // Horizontal segment (drag Y) → find waypoints with same Y.
    const TOL = 4;
    const affected: number[] = [];
    if (!seg.horizontal) {
      const segX = Math.round((seg.x1 + seg.x2) / 2);
      for (let i = 0; i < waypoints.length; i++) {
        if (Math.abs(waypoints[i].x - segX) < TOL) affected.push(i);
      }
    } else {
      const segY = Math.round((seg.y1 + seg.y2) / 2);
      for (let i = 0; i < waypoints.length; i++) {
        if (Math.abs(waypoints[i].y - segY) < TOL) affected.push(i);
      }
    }

    // No fallback: if no waypoints match, the segment is from stubs/connectors
    // and can't be dragged. User needs to double-click to create a break point first.
    if (affected.length === 0) return;

    segDragRef.current = {
      horizontal: seg.horizontal,
      startMouse: seg.horizontal ? e.clientY : e.clientX,
      frozenWaypoints: waypoints.map(wp => ({ ...wp })),
      affectedWpIndices: affected,
    };

    orthoLog('seg-drag-start', edgeId, {
      segIndex: seg.index, horizontal: seg.horizontal,
      segX1: seg.x1, segY1: seg.y1, segX2: seg.x2, segY2: seg.y2,
      affected, wps: waypoints,
    });
  }, [waypoints, edgeId]);

  const onSegPointerMove = useCallback((e: React.PointerEvent) => {
    if (!segDragRef.current) return;
    e.stopPropagation();

    const { horizontal, startMouse, frozenWaypoints, affectedWpIndices } = segDragRef.current;
    if (affectedWpIndices.length === 0) return;

    const scale = getViewportScale();
    const delta = horizontal
      ? (e.clientY - startMouse) / scale
      : (e.clientX - startMouse) / scale;

    const newWps = frozenWaypoints.map(wp => ({ ...wp }));
    for (const idx of affectedWpIndices) {
      if (horizontal) {
        newWps[idx] = { x: frozenWaypoints[idx].x, y: Math.round(frozenWaypoints[idx].y + delta) };
      } else {
        newWps[idx] = { x: Math.round(frozenWaypoints[idx].x + delta), y: frozenWaypoints[idx].y };
      }
    }

    useCanvasStore.setState((s) => ({
      edges: s.edges.map(edge =>
        edge.id === edgeId
          ? { ...edge, data: { ...edge.data!, waypoints: newWps } }
          : edge,
      ),
    }));
  }, [edgeId]);

  const onSegPointerUp = useCallback((e: React.PointerEvent) => {
    if (!segDragRef.current) return;
    e.stopPropagation();
    segDragRef.current = null;

    const currentEdge = useCanvasStore.getState().edges.find(edge => edge.id === edgeId);
    if (!currentEdge?.data?.waypoints) return;

    const wps = currentEdge.data.waypoints as Array<{ x: number; y: number }>;

    // Simple collinear cleanup on waypoints only
    const cleaned: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < wps.length; i++) {
      if (i > 0 && i < wps.length - 1) {
        const prev = wps[i - 1];
        const curr = wps[i];
        const next = wps[i + 1];
        const sameX = Math.abs(prev.x - curr.x) < 2 && Math.abs(curr.x - next.x) < 2;
        const sameY = Math.abs(prev.y - curr.y) < 2 && Math.abs(curr.y - next.y) < 2;
        if (sameX || sameY) continue;
      }
      cleaned.push(wps[i]);
    }

    orthoLog('seg-drag-end', edgeId, { before: wps, after: cleaned });
    updateEdgeWaypoints(edgeId, cleaned);
  }, [edgeId, updateEdgeWaypoints]);

  // ── Double-click → break point (Rule 6) ───────────────────────────────────

  const onSegDoubleClick = useCallback((e: React.MouseEvent, seg: typeof segments[0]) => {
    e.stopPropagation();
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    let breakPt: { x: number; y: number };

    if (seg.horizontal) {
      const minX = Math.min(seg.x1, seg.x2);
      const w = Math.abs(seg.x2 - seg.x1);
      const ratio = w > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0.5;
      breakPt = { x: Math.round(minX + ratio * w), y: Math.round(seg.y1) };
    } else {
      const minY = Math.min(seg.y1, seg.y2);
      const h = Math.abs(seg.y2 - seg.y1);
      const ratio = h > 0 ? Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) : 0.5;
      breakPt = { x: Math.round(seg.x1), y: Math.round(minY + ratio * h) };
    }

    const insertIdx = Math.max(0, seg.index - 2 + 1);
    const clamped = Math.min(insertIdx, waypoints.length);
    const newWps = [...waypoints];
    newWps.splice(clamped, 0, { ...breakPt }, { ...breakPt });

    orthoLog('seg-dblclick', edgeId, {
      segIndex: seg.index, breakPt, insertIdx: clamped,
      before: waypoints, after: newWps,
    });
    updateEdgeWaypoints(edgeId, newWps);
  }, [waypoints, edgeId, updateEdgeWaypoints]);

  // ── Render: only segment grab zones ───────────────────────────────────────

  return (
    <>
      {segments.filter(s => s.draggable).map((seg) => {
        const minX = Math.min(seg.x1, seg.x2);
        const minY = Math.min(seg.y1, seg.y2);
        const w = Math.abs(seg.x2 - seg.x1);
        const h = Math.abs(seg.y2 - seg.y1);

        if (w + h < 6) return null;

        return (
          <div
            key={`seg-${seg.index}`}
            style={{
              position: 'absolute',
              transform: `translate(${minX - (seg.horizontal ? 0 : SEG_GRAB)}px, ${minY - (seg.horizontal ? SEG_GRAB : 0)}px)`,
              width: seg.horizontal ? w : SEG_GRAB * 2,
              height: seg.horizontal ? SEG_GRAB * 2 : h,
              cursor: seg.horizontal ? 'row-resize' : 'col-resize',
              zIndex: 1050,
              pointerEvents: 'all',
            }}
            onPointerDown={(e) => onSegPointerDown(e, seg)}
            onPointerMove={onSegPointerMove}
            onPointerUp={onSegPointerUp}
            onDoubleClick={(e) => onSegDoubleClick(e, seg)}
          />
        );
      })}
    </>
  );
}
