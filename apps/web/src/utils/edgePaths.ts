import { getBezierPath,type Position } from '@xyflow/react';

export function buildBezierPath(
  sx: number, sy: number, tx: number, ty: number,
  sourcePos: Position, targetPos: Position,
): [string, number, number, number, number] {
  return getBezierPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty, sourcePosition: sourcePos, targetPosition: targetPos });
}

// ── Orthogonal (Manhattan) routing ──────────────────────────────────────────

const STUB = 24; // minimum extension from a port before first turn
const BEND_R = 6; // rounded corner radius at 90° bends

/** Direction vector for a handle position. */
function exitDir(pos: Position): { dx: number; dy: number } {
  switch (pos) {
    case 'right':  return { dx: 1, dy: 0 };
    case 'left':   return { dx: -1, dy: 0 };
    case 'bottom': return { dx: 0, dy: 1 };
    case 'top':    return { dx: 0, dy: -1 };
    default:       return { dx: 1, dy: 0 };
  }
}

/**
 * Build an orthogonal (Manhattan) path between two handles.
 * Supports optional user waypoints that force the route through specific points.
 */
export function buildOrthogonalPath(
  sx: number, sy: number,
  tx: number, ty: number,
  sourcePos: Position,
  targetPos: Position,
  waypoints?: Array<{ x: number; y: number }>,
): [string, number, number] {
  // Build list of points the route must pass through
  let points: Array<{ x: number; y: number }>;

  if (waypoints && waypoints.length > 0) {
    points = buildOrthogonalWithWaypoints(sx, sy, tx, ty, sourcePos, targetPos, waypoints);
  } else {
    points = buildOrthogonalAuto(sx, sy, tx, ty, sourcePos, targetPos);
  }

  // Build SVG path with rounded corners
  const path = buildRoundedOrthogonalSvg(points, BEND_R);

  // Label at midpoint of longest segment
  let maxLen = 0;
  let labelX = (sx + tx) / 2;
  let labelY = (sy + ty) / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const segLen = dx * dx + dy * dy;
    if (segLen > maxLen) {
      maxLen = segLen;
      labelX = (points[i].x + points[i + 1].x) / 2;
      labelY = (points[i].y + points[i + 1].y) / 2;
    }
  }

  return [path, labelX, labelY];
}

/**
 * Auto-route: universal algorithm for any (sourcePos, targetPos) combination.
 *
 * Strategy:
 * 1. Extend stubs from both ports in their exit directions.
 * 2. Connect the two stub endpoints with a simple orthogonal connector:
 *    - Same axis & aligned → direct line (rare)
 *    - Perpendicular axes → L-shape (1 bend)
 *    - Parallel axes → Z-shape (2 bends) via midpoint
 * 3. Deduplicate consecutive identical points.
 */
function buildOrthogonalAuto(
  sx: number, sy: number,
  tx: number, ty: number,
  sourcePos: Position,
  targetPos: Position,
): Array<{ x: number; y: number }> {
  const sDir = exitDir(sourcePos);
  const tDir = exitDir(targetPos);
  const isSourceH = sDir.dx !== 0;
  const isTargetH = tDir.dx !== 0;

  // Stub endpoints
  const s1 = { x: sx + sDir.dx * STUB, y: sy + sDir.dy * STUB };
  const t1 = { x: tx + tDir.dx * STUB, y: ty + tDir.dy * STUB };

  // Check if the stub goes toward the target (good) or away from it (needs U-shape)
  const sDotX = (t1.x - s1.x) * sDir.dx;
  const sDotY = (t1.y - s1.y) * sDir.dy;
  const sourceGoesToward = (sDotX + sDotY) >= 0;

  const tDotX = (s1.x - t1.x) * tDir.dx;
  const tDotY = (s1.y - t1.y) * tDir.dy;
  const targetGoesToward = (tDotX + tDotY) >= 0;

  const points: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];

  if (isSourceH !== isTargetH) {
    // Perpendicular: one exits H, other exits V → L-shape through stubs
    points.push(s1);
    // Connect s1 to t1: they differ on both axes.
    // The meeting point is where source's axis meets target's axis.
    if (isSourceH) {
      // Source goes horizontal, target goes vertical
      // Meet at (s1.x extended to t1.x, s1.y) then vertical, OR
      // at (t1.x, s1.y) if source can reach it
      points.push({ x: t1.x, y: s1.y });
    } else {
      // Source goes vertical, target goes horizontal
      points.push({ x: s1.x, y: t1.y });
    }
    points.push(t1);
    points.push({ x: tx, y: ty });
    return deduplicatePoints(points);
  }

  // Parallel exits (both H or both V)
  // Also use Z-shape when stubs are close (within 2*STUB) even if dot-product is negative —
  // this avoids ugly "tail" protrusions for nearly-aligned nodes.
  const stubDist = isSourceH ? Math.abs(s1.x - t1.x) : Math.abs(s1.y - t1.y);
  const useZShape = (sourceGoesToward && targetGoesToward) || stubDist < STUB * 2;

  if (useZShape) {
    // Z-shape: connect stubs via midpoint
    if (isSourceH) {
      const midX = (s1.x + t1.x) / 2;
      points.push(s1);
      points.push({ x: midX, y: s1.y });
      points.push({ x: midX, y: t1.y });
      points.push(t1);
    } else {
      const midY = (s1.y + t1.y) / 2;
      points.push(s1);
      points.push({ x: s1.x, y: midY });
      points.push({ x: t1.x, y: midY });
      points.push(t1);
    }
  } else {
    // U-shape: stubs go in same direction or away from each other
    // Need to go around: use a detour perpendicular to the exit direction
    if (isSourceH) {
      const midY = (sy + ty) / 2;
      // If stubs overlap vertically, offset more
      const detourY = Math.abs(sy - ty) < STUB ? Math.min(sy, ty) - STUB * 2 : midY;
      points.push(s1);
      points.push({ x: s1.x, y: detourY });
      points.push({ x: t1.x, y: detourY });
      points.push(t1);
    } else {
      const midX = (sx + tx) / 2;
      const detourX = Math.abs(sx - tx) < STUB ? Math.min(sx, tx) - STUB * 2 : midX;
      points.push(s1);
      points.push({ x: detourX, y: s1.y });
      points.push({ x: detourX, y: t1.y });
      points.push(t1);
    }
  }

  points.push({ x: tx, y: ty });
  return deduplicatePoints(points);
}

/** Route through user waypoints, making orthogonal connections between each pair. */
function buildOrthogonalWithWaypoints(
  sx: number, sy: number,
  tx: number, ty: number,
  sourcePos: Position,
  targetPos: Position,
  waypoints: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  const sDir = exitDir(sourcePos);
  const tDir = exitDir(targetPos);
  const isSourceH = sDir.dx !== 0;
  const _isTargetH = tDir.dx !== 0;

  const points: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];

  // Add stub from source
  const s1 = { x: sx + sDir.dx * STUB, y: sy + sDir.dy * STUB };
  points.push(s1);

  // Connect through waypoints with L-shapes
  let prev = s1;
  let prevHorizontal = isSourceH; // last segment direction

  for (const wp of waypoints) {
    if (Math.abs(prev.x - wp.x) < 1 && Math.abs(prev.y - wp.y) < 1) continue;

    if (prevHorizontal) {
      // Come from horizontal → go horizontal to wp.x, then vertical to wp.y
      if (Math.abs(prev.y - wp.y) > 1) {
        points.push({ x: wp.x, y: prev.y });
        points.push({ x: wp.x, y: wp.y });
        prevHorizontal = false;
      } else {
        points.push({ x: wp.x, y: wp.y });
      }
    } else {
      // Come from vertical → go vertical to wp.y, then horizontal to wp.x
      if (Math.abs(prev.x - wp.x) > 1) {
        points.push({ x: prev.x, y: wp.y });
        points.push({ x: wp.x, y: wp.y });
        prevHorizontal = true;
      } else {
        points.push({ x: wp.x, y: wp.y });
      }
    }
    prev = wp;
  }

  // Connect to target stub
  const t1 = { x: tx + tDir.dx * STUB, y: ty + tDir.dy * STUB };
  if (prevHorizontal) {
    if (Math.abs(prev.y - t1.y) > 1) {
      points.push({ x: t1.x, y: prev.y });
    }
  } else {
    if (Math.abs(prev.x - t1.x) > 1) {
      points.push({ x: prev.x, y: t1.y });
    }
  }
  points.push(t1);
  points.push({ x: tx, y: ty });

  return deduplicatePoints(points);
}

/** Remove consecutive duplicate points. */
/** Exported for WaypointOverlay segment computation. */
export function buildOrthogonalRoutePoints(
  sx: number, sy: number, tx: number, ty: number,
  sourcePos: Position, targetPos: Position,
  waypoints?: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  let pts: Array<{ x: number; y: number }>;
  if (waypoints && waypoints.length > 0) {
    pts = buildOrthogonalWithWaypoints(sx, sy, tx, ty, sourcePos, targetPos, waypoints);
  } else {
    pts = buildOrthogonalAuto(sx, sy, tx, ty, sourcePos, targetPos);
  }
  // Snap all points to integer grid to prevent sub-pixel "waterfall" offsets
  return pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

function deduplicatePoints(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i].x - result[result.length - 1].x) > 0.5 ||
        Math.abs(pts[i].y - result[result.length - 1].y) > 0.5) {
      result.push(pts[i]);
    }
  }
  return result;
}

/** Build SVG path with rounded 90° corners. */
function buildRoundedOrthogonalSvg(
  points: Array<{ x: number; y: number }>,
  radius: number,
): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Segment lengths to curr and from curr
    const dxIn = curr.x - prev.x;
    const dyIn = curr.y - prev.y;
    const dxOut = next.x - curr.x;
    const dyOut = next.y - curr.y;

    const lenIn = Math.abs(dxIn) + Math.abs(dyIn);
    const lenOut = Math.abs(dxOut) + Math.abs(dyOut);

    // Clamp radius to half the shorter segment
    const r = Math.min(radius, lenIn / 2, lenOut / 2);

    if (r < 1 || (Math.abs(dxIn) < 1 && Math.abs(dxOut) < 1) || (Math.abs(dyIn) < 1 && Math.abs(dyOut) < 1)) {
      // Collinear or too short → sharp corner
      parts.push(`L ${curr.x} ${curr.y}`);
      continue;
    }

    // Point before the bend (use tolerance to ignore sub-pixel offsets)
    const DIR_TOL = 2;
    const inNx = Math.abs(dxIn) < DIR_TOL ? 0 : dxIn > 0 ? 1 : -1;
    const inNy = Math.abs(dyIn) < DIR_TOL ? 0 : dyIn > 0 ? 1 : -1;
    const bx = curr.x - inNx * r;
    const by = curr.y - inNy * r;

    // Point after the bend
    const outNx = Math.abs(dxOut) < DIR_TOL ? 0 : dxOut > 0 ? 1 : -1;
    const outNy = Math.abs(dyOut) < DIR_TOL ? 0 : dyOut > 0 ? 1 : -1;
    const ax = curr.x + outNx * r;
    const ay = curr.y + outNy * r;

    parts.push(`L ${bx} ${by}`);
    parts.push(`Q ${curr.x} ${curr.y} ${ax} ${ay}`);
  }

  // Last point
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);

  return parts.join(' ');
}

// ── Segment-based orthogonal routing (orthoExplicit model) ─────────────────

const MIN_STUB = 12;       // absolute minimum stub length (px)
const COLLINEAR_TOL = 2;   // tolerance for collinear detection (px)
const GRID = 1;            // snap grid size (px) — round all route points

/** Snap a value to the nearest grid point. */
function snap(v: number): number { return Math.round(v / GRID) * GRID; }

/** Snap a point to the grid. */
function snapPt(p: Pt): Pt { return { x: snap(p.x), y: snap(p.y) }; }

type Pt = { x: number; y: number };

/**
 * Remove middle point from any three consecutive collinear points.
 * Preserves first and last points always.
 */
export function mergeCollinearBends(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const result: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const sameX = Math.abs(prev.x - curr.x) < COLLINEAR_TOL && Math.abs(curr.x - next.x) < COLLINEAR_TOL;
    const sameY = Math.abs(prev.y - curr.y) < COLLINEAR_TOL && Math.abs(curr.y - next.y) < COLLINEAR_TOL;
    if (sameX || sameY) continue; // collinear → skip middle point
    result.push(curr);
  }
  result.push(pts[pts.length - 1]);
  return result;
}

/**
 * Enforce minimum stub length.  If the stub is shorter than MIN_STUB,
 * push the stub outward; if the first/last bend is behind the stub, push it too (Rule 8).
 * Mutates the points array in place.
 */
function enforceStubs(
  points: Pt[],
  sx: number, sy: number, tx: number, ty: number,
  sourcePos: Position, targetPos: Position,
): void {
  if (points.length < 4) return; // need at least source, stub, stub, target

  const sDir = exitDir(sourcePos);
  const tDir = exitDir(targetPos);

  // Source stub: points[0] = handle, points[1] = stub end
  {
    const axis = sDir.dx !== 0 ? 'x' : 'y';
    const sign = sDir.dx !== 0 ? sDir.dx : sDir.dy;
    const handleCoord = axis === 'x' ? sx : sy;
    const stubCoord = axis === 'x' ? points[1].x : points[1].y;
    const dist = (stubCoord - handleCoord) * sign;

    if (dist < MIN_STUB) {
      const pushed = handleCoord + sign * MIN_STUB;
      if (axis === 'x') points[1].x = pushed; else points[1].y = pushed;
    }

    // Push first bend if it's behind the stub (Rule 8)
    if (points.length > 2) {
      const stubVal = axis === 'x' ? points[1].x : points[1].y;
      const bendVal = axis === 'x' ? points[2].x : points[2].y;
      if ((bendVal - stubVal) * sign < 0) {
        if (axis === 'x') points[2].x = stubVal; else points[2].y = stubVal;
      }
    }
  }

  // Target stub: points[n-1] = target handle, points[n-2] = stub end
  {
    const n = points.length;
    const axis = tDir.dx !== 0 ? 'x' : 'y';
    const sign = tDir.dx !== 0 ? tDir.dx : tDir.dy;
    const handleCoord = axis === 'x' ? tx : ty;
    const stubCoord = axis === 'x' ? points[n - 2].x : points[n - 2].y;
    const dist = (stubCoord - handleCoord) * sign;

    if (dist < MIN_STUB) {
      const pushed = handleCoord + sign * MIN_STUB;
      if (axis === 'x') points[n - 2].x = pushed; else points[n - 2].y = pushed;
    }

    // Push last bend if behind target stub
    if (n > 3) {
      const stubVal = axis === 'x' ? points[n - 2].x : points[n - 2].y;
      const bendVal = axis === 'x' ? points[n - 3].x : points[n - 3].y;
      if ((bendVal - stubVal) * sign < 0) {
        if (axis === 'x') points[n - 3].x = stubVal; else points[n - 3].y = stubVal;
      }
    }
  }
}

/**
 * Build the full route point array for the orthoExplicit model.
 * Waypoints (bends) are the literal bend coordinates stored in edge.data.waypoints.
 */
export function buildOrthogonalFromBendsPoints(
  sx: number, sy: number,
  tx: number, ty: number,
  sourcePos: Position,
  targetPos: Position,
  bends: Pt[],
): Pt[] {
  const sDir = exitDir(sourcePos);
  const tDir = exitDir(targetPos);
  const isSourceH = sDir.dx !== 0;

  // Snap handle positions and stubs to grid to prevent sub-pixel "waterfall"
  const sxS = snap(sx), syS = snap(sy), txS = snap(tx), tyS = snap(ty);
  const stubS: Pt = { x: snap(sxS + sDir.dx * STUB), y: snap(syS + sDir.dy * STUB) };
  const stubT: Pt = { x: snap(txS + tDir.dx * STUB), y: snap(tyS + tDir.dy * STUB) };

  const isTargetH = tDir.dx !== 0;

  // Step 1: Assemble raw route (all points snapped)
  const points: Pt[] = [
    { x: sxS, y: syS },
    { ...stubS },
    ...bends.map(b => snapPt(b)),
    { ...stubT },
    { x: txS, y: tyS },
  ];

  // Step 1.5: Handle case when node moved PAST a bend (bend is behind stub).
  // Bends are NEVER moved — they stay exactly where stored. User edits are preserved.
  // Only action: if a bend ended up behind the stub on the exit axis, create a
  // U-shape detour so the route doesn't loop backwards.
  // For normal node movement (bend still ahead of stub), connectors in Step 4
  // handle any stub↔bend misalignment by inserting L-shape connections.
  if (bends.length > 0) {
    // ── Source side ──
    {
      const fbIdx = 2;
      const exitAxis = isSourceH ? 'x' : 'y';
      const crossAxis = isSourceH ? 'y' : 'x';
      const sSign = isSourceH ? sDir.dx : sDir.dy;
      const stubVal = points[1][exitAxis];
      const bendVal = points[fbIdx][exitAxis];
      const exitGap = Math.abs(bendVal - stubVal);

      if (exitGap < COLLINEAR_TOL) {
        // Case C: perpendicular turn — don't touch
      } else if ((bendVal - stubVal) * sSign >= MIN_STUB) {
        // Case A: bend is ahead of stub on exit axis.
        // Align cross-axis so stub→bend is a straight segment (no L-shape jog).
        // This only changes Y (for H exit) or X (for V exit) — the user's
        // vertical/horizontal segment position (exit-axis coordinate) is preserved.
        points[fbIdx][crossAxis] = points[1][crossAxis];
      } else {
        // Case B: bend behind or too close → U-shape detour
        const nextPt = points[fbIdx + 1];
        if (nextPt) {
          const midCross = (points[1][crossAxis] + nextPt[crossAxis]) / 2;
          const detourA: Pt = { x: 0, y: 0 };
          const detourB: Pt = { x: 0, y: 0 };
          detourA[exitAxis] = stubVal;
          detourA[crossAxis] = midCross;
          detourB[exitAxis] = bendVal;
          detourB[crossAxis] = midCross;
          points.splice(fbIdx, 1, detourA, detourB);
        }
      }
    }

    // ── Target side ──
    {
      const lbIdx = points.length - 3;
      const exitAxis = isTargetH ? 'x' : 'y';
      const tSign = isTargetH ? tDir.dx : tDir.dy;
      const crossAxis = isTargetH ? 'y' : 'x';
      const stubVal = points[points.length - 2][exitAxis];
      const bendVal = points[lbIdx][exitAxis];
      const exitGap = Math.abs(bendVal - stubVal);

      if (exitGap < COLLINEAR_TOL) {
        // Case C: perpendicular turn — don't touch
      } else if ((bendVal - stubVal) * tSign >= MIN_STUB) {
        // Case A: align cross-axis
        points[lbIdx][crossAxis] = points[points.length - 2][crossAxis];
      } else {
        // Case B: U-shape detour
        const prevPt = points[lbIdx - 1];
        if (prevPt) {
          const midCross = (points[points.length - 2][crossAxis] + prevPt[crossAxis]) / 2;
          const detourA: Pt = { x: 0, y: 0 };
          const detourB: Pt = { x: 0, y: 0 };
          detourA[exitAxis] = bendVal;
          detourA[crossAxis] = midCross;
          detourB[exitAxis] = stubVal;
          detourB[crossAxis] = midCross;
          points.splice(lbIdx, 1, detourA, detourB);
        }
      }
    }
  }

  // Step 2: Enforce minimum stub lengths (may push bend points)
  enforceStubs(points, sxS, syS, txS, tyS, sourcePos, targetPos);

  // Step 3: Deduplicate (enforceStubs may push a bend onto stub position)
  const deduped = deduplicatePoints(points);

  // Step 4: Snap near-collinear pairs and insert connectors for non-orthogonal pairs.
  // First pass: if two consecutive points are "almost" aligned (≤ tolerance on one axis),
  // snap to exact alignment to prevent sub-pixel diagonals.
  for (let i = 0; i < deduped.length - 1; i++) {
    const a = deduped[i];
    const b = deduped[i + 1];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (dx > 0 && dx <= COLLINEAR_TOL && dy > COLLINEAR_TOL) {
      b.x = a.x; // snap to vertical
    } else if (dy > 0 && dy <= COLLINEAR_TOL && dx > COLLINEAR_TOL) {
      b.y = a.y; // snap to horizontal
    }
  }

  // Second pass: insert connectors where still non-orthogonal.
  for (let i = deduped.length - 2; i >= 1; i--) {
    const a = deduped[i];
    const b = deduped[i + 1];
    const diffX = Math.abs(a.x - b.x) > COLLINEAR_TOL;
    const diffY = Math.abs(a.y - b.y) > COLLINEAR_TOL;
    if (diffX && diffY) {
      // Need a connector. Choose direction perpendicular to the incoming segment
      // to avoid backtracking on the same axis.
      const prevPt = i > 0 ? deduped[i - 1] : null;
      const incomingVertical = prevPt && Math.abs(prevPt.x - a.x) < COLLINEAR_TOL;
      // If incoming was vertical (same X), go horizontal first; otherwise vertical first
      const goHorizontalFirst = incomingVertical ?? isSourceH;
      const connector: Pt = goHorizontalFirst
        ? snapPt({ x: b.x, y: a.y })
        : snapPt({ x: a.x, y: b.y });
      deduped.splice(i + 1, 0, connector);
    }
  }

  return deduped;
}

/**
 * Build orthogonal SVG path from explicit bend coordinates.
 * Entry point for orthoExplicit edges in FlowEdge.
 */
export function buildOrthogonalFromBends(
  sx: number, sy: number,
  tx: number, ty: number,
  sourcePos: Position,
  targetPos: Position,
  bends: Pt[],
): [string, number, number] {
  const points = buildOrthogonalFromBendsPoints(sx, sy, tx, ty, sourcePos, targetPos, bends);

  const path = buildRoundedOrthogonalSvg(points, BEND_R);

  // Label at midpoint of longest segment
  let maxLen = 0;
  let labelX = (sx + tx) / 2;
  let labelY = (sy + ty) / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const segLen = dx * dx + dy * dy;
    if (segLen > maxLen) {
      maxLen = segLen;
      labelX = (points[i].x + points[i + 1].x) / 2;
      labelY = (points[i].y + points[i + 1].y) / 2;
    }
  }

  return [path, labelX, labelY];
}
