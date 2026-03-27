import { useCallback, useMemo, useRef } from 'react';

import { useCanvasStore } from '../../../store/canvasStore.ts';

interface WaypointOverlayProps {
  edgeId: string;
  sx: number; sy: number;
  tx: number; ty: number;
  waypoints: Array<{ x: number; y: number }>;
}

const WP_SIZE = 14;
const ADD_SIZE = 22;

export function WaypointOverlay({ edgeId, sx, sy, tx, ty, waypoints }: WaypointOverlayProps) {
  const updateEdgeWaypoints = useCanvasStore((s) => s.updateEdgeWaypoints);
  const dragRef = useRef<{ wpIndex: number; startX: number; startY: number; startWpX: number; startWpY: number } | null>(null);

  const pts = useMemo(() => [{ x: sx, y: sy }, ...waypoints, { x: tx, y: ty }], [sx, sy, tx, ty, waypoints]);

  // Drag handlers for existing waypoints
  const onPointerDown = useCallback((e: React.PointerEvent, wpIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      wpIndex,
      startX: e.clientX,
      startY: e.clientY,
      startWpX: waypoints[wpIndex].x,
      startWpY: waypoints[wpIndex].y,
    };
  }, [waypoints]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const { wpIndex, startX, startY, startWpX, startWpY } = dragRef.current;

    // Get the React Flow viewport transform to convert screen delta to flow delta
    const rfPane = document.querySelector('.react-flow__viewport') as SVGGElement | null;
    const scale = rfPane ? parseFloat(rfPane.style.transform?.match(/scale\(([^)]+)\)/)?.[1] ?? '1') : 1;

    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;

    const newWps = [...waypoints];
    newWps[wpIndex] = { x: startWpX + dx, y: startWpY + dy };

    // Live update without history push
    useCanvasStore.setState((s) => ({
      edges: s.edges.map(edge =>
        edge.id === edgeId ? { ...edge, data: { ...edge.data!, waypoints: newWps } } : edge,
      ),
    }));
  }, [waypoints, edgeId]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
    // Commit with history
    const currentEdge = useCanvasStore.getState().edges.find(edge => edge.id === edgeId);
    if (currentEdge?.data?.waypoints) {
      updateEdgeWaypoints(edgeId, currentEdge.data.waypoints as Array<{ x: number; y: number }>);
    }
  }, [edgeId, updateEdgeWaypoints]);

  // Double-click to remove waypoint
  const onDoubleClick = useCallback((e: React.MouseEvent, wpIndex: number) => {
    e.stopPropagation();
    const newWps = waypoints.filter((_, i) => i !== wpIndex);
    updateEdgeWaypoints(edgeId, newWps);
  }, [waypoints, edgeId, updateEdgeWaypoints]);

  // Click "+" to add waypoint
  const addWaypoint = useCallback((segmentIndex: number) => {
    const p1 = pts[segmentIndex];
    const p2 = pts[segmentIndex + 1];
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    // Insert at the correct position in waypoints array (segmentIndex 0 is before first wp)
    const insertIdx = segmentIndex; // segment 0 → insert at waypoints[0], segment 1 → waypoints[1], etc.
    const newWps = [...waypoints];
    newWps.splice(insertIdx, 0, mid);
    updateEdgeWaypoints(edgeId, newWps);
  }, [pts, waypoints, edgeId, updateEdgeWaypoints]);

  return (
    <>
      {/* Existing waypoint handles */}
      {waypoints.map((wp, i) => (
        <div
          key={`wp-${i}`}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
            width: WP_SIZE,
            height: WP_SIZE,
            borderRadius: '50%',
            background: '#38bdf8',
            border: '2px solid #fff',
            cursor: 'grab',
            zIndex: 1100,
            pointerEvents: 'all',
          }}
          onPointerDown={(e) => onPointerDown(e, i)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(e) => onDoubleClick(e, i)}
        />
      ))}
      {/* "+" affordances on segment midpoints */}
      {pts.slice(0, -1).map((p1, i) => {
        const p2 = pts[i + 1];
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        return (
          <div
            key={`add-${i}`}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)`,
              width: ADD_SIZE,
              height: ADD_SIZE,
              borderRadius: '50%',
              background: 'rgba(56,189,248,0.3)',
              border: '2px solid rgba(56,189,248,0.7)',
              cursor: 'pointer',
              zIndex: 1050,
              pointerEvents: 'all',
              opacity: 0.7,
              transition: 'opacity 0.15s, background 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 'bold',
              color: '#fff',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { const el = e.currentTarget; el.style.opacity = '1'; el.style.background = 'rgba(56,189,248,0.6)'; }}
            onMouseLeave={(e) => { const el = e.currentTarget; el.style.opacity = '0.7'; el.style.background = 'rgba(56,189,248,0.3)'; }}
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); addWaypoint(i); }}
            title="Add waypoint"
          >+</div>
        );
      })}
    </>
  );
}
