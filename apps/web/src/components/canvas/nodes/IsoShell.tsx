import type { CSSProperties, ReactNode } from 'react';

import { useCanvasStore } from '../../../store/canvasStore.ts';

export type IsoDepth = { x: number; y: number };

export const ISO_DEPTH = {
  node: { x: 14, y: 14 },
  container: { x: 10, y: 10 },
} satisfies Record<string, IsoDepth>;

/**
 * Returns CSS for two depth faces based on the canvas rotation angle.
 * Visible faces change every 90°:
 *   315°–45°:  bottom + right
 *   45°–135°:  bottom + left
 *   135°–225°: top    + left
 *   225°–315°: top    + right
 */
function getDepthFaces(
  rotation: number,
  depth: number,
  color: string,
): [CSSProperties, CSSProperties] {
  const norm = ((rotation % 360) + 360) % 360;

  const hGrad = (dir: string) => `linear-gradient(${dir}, ${color}50, ${color}28)`;
  const vGrad = (dir: string) => `linear-gradient(${dir}, ${color}30, rgba(6,10,18,0.55) 50%, ${color}18)`;

  if (norm >= 315 || norm < 45) {
    // bottom + right
    return [
      { left: 0, right: 0, bottom: -depth, height: depth + 1, background: hGrad('0deg'), transform: 'skewX(45deg)', transformOrigin: 'top left' },
      { right: -depth, top: 0, bottom: 0, width: depth + 1, background: vGrad('0deg'), transform: 'skewY(45deg)', transformOrigin: 'bottom left' },
    ];
  }
  if (norm >= 45 && norm < 135) {
    // bottom + left
    return [
      { left: 0, right: 0, bottom: -depth, height: depth + 1, background: hGrad('0deg'), transform: 'skewX(-45deg)', transformOrigin: 'top right' },
      { left: -depth, top: 0, bottom: 0, width: depth + 1, background: vGrad('0deg'), transform: 'skewY(-45deg)', transformOrigin: 'bottom right' },
    ];
  }
  if (norm >= 135 && norm < 225) {
    // top + left
    return [
      { left: 0, right: 0, top: -depth, height: depth + 1, background: hGrad('180deg'), transform: 'skewX(45deg)', transformOrigin: 'bottom right' },
      { left: -depth, top: 0, bottom: 0, width: depth + 1, background: vGrad('180deg'), transform: 'skewY(45deg)', transformOrigin: 'top right' },
    ];
  }
  // top + right (225–315)
  return [
    { left: 0, right: 0, top: -depth, height: depth + 1, background: hGrad('180deg'), transform: 'skewX(-45deg)', transformOrigin: 'bottom left' },
    { right: -depth, top: 0, bottom: 0, width: depth + 1, background: vGrad('180deg'), transform: 'skewY(-45deg)', transformOrigin: 'top left' },
  ];
}

interface IsoShellProps {
  enabled: boolean;
  faceColor: string;
  depth?: IsoDepth;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  frontClassName?: string;
  frontStyle?: CSSProperties;
  sheen?: CSSProperties | null;
  children: ReactNode;
}

export function IsoShell({
  enabled,
  faceColor,
  depth = ISO_DEPTH.node,
  wrapperClassName = 'relative overflow-visible',
  wrapperStyle,
  frontClassName = 'relative z-[1] rounded-lg',
  frontStyle,
  sheen,
  children,
}: IsoShellProps) {
  const isoRotation = useCanvasStore((s) => s.isoRotation);

  const d = Math.max(depth.x, depth.y);
  const [face1Style, face2Style] = enabled ? getDepthFaces(isoRotation, d, faceColor) : [null, null];

  // Always render the same DOM structure (wrapper → front) so React Flow
  // handle position cache stays valid when toggling 2D ↔ 3D.
  return (
    <div className={wrapperClassName} style={wrapperStyle}>
      {enabled && (
        <>
          <div className="pointer-events-none absolute z-0" style={{ position: 'absolute', ...face1Style! }} />
          <div className="pointer-events-none absolute z-0" style={{ position: 'absolute', ...face2Style! }} />
          <div
            className="pointer-events-none absolute z-[-1]"
            style={{
              inset: 0,
              transform: `translate(0px, ${d + 4}px)`,
              borderRadius: 12,
              background: 'rgba(0,4,10,0.42)',
              filter: 'blur(14px)',
            }}
          />
        </>
      )}
      <div className={frontClassName} style={frontStyle}>
        {enabled && sheen ? (
          <div className="pointer-events-none absolute inset-[1px] z-[1] rounded-[inherit]" style={sheen} />
        ) : null}
        {children}
      </div>
    </div>
  );
}
