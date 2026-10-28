"use client";

import { OSNAP_LABELS, type OsnapType, type SnapResult } from "@/lib/rtk-validation/cad/snap-engine";
import { worldToScreen, type CadViewport } from "@/lib/rtk-validation/cad/viewport";

const MARK: Record<OsnapType, string> = {
  ENDPOINT: "□",
  MIDPOINT: "△",
  CENTER: "○",
  INTERSECTION: "X",
  NEAREST: "◇",
  PERPENDICULAR: "⊥",
  TANGENT: "⊙",
  QUADRANT: "◇",
  NODE: "●",
  INSERTION: "+",
  EXTENSION: "□",
  APPARENT_INTERSECTION: "✕",
};

export function CadOsnapOverlay({
  snap,
  viewport,
}: {
  snap: SnapResult | null;
  viewport: CadViewport;
}) {
  if (!snap?.snapped) return null;
  const { sx, sy } = worldToScreen(snap.point.x, snap.point.y, viewport);
  const guide = snap.guide
    ? {
        a: worldToScreen(snap.guide.from.x, snap.guide.from.y, viewport),
        b: worldToScreen(snap.guide.to.x, snap.guide.to.y, viewport),
      }
    : null;
  return (
    <g pointerEvents="none" className="cad-osnap-overlay">
      {guide ? (
        <line
          x1={guide.a.sx}
          y1={guide.a.sy}
          x2={guide.b.sx}
          y2={guide.b.sy}
          stroke="#f59e0b"
          strokeWidth={1}
          strokeDasharray="5 4"
        />
      ) : null}
      <g transform={`translate(${sx} ${sy})`}>
        <rect x={-11} y={-11} width={22} height={22} fill="none" stroke="#fbbf24" strokeWidth={1.5} />
        <text
          x={0}
          y={5}
          textAnchor="middle"
          fill="#fbbf24"
          fontSize={14}
          fontFamily="ui-monospace, monospace"
        >
          {MARK[snap.type]}
        </text>
        <text
          x={0}
          y={26}
          textAnchor="middle"
          fill="#fde68a"
          fontSize={8}
          fontFamily="ui-sans-serif, system-ui"
        >
          {OSNAP_LABELS[snap.type].toUpperCase()}
        </text>
      </g>
    </g>
  );
}

const QUICK_SNAPS: OsnapType[] = [
  "ENDPOINT",
  "MIDPOINT",
  "CENTER",
  "INTERSECTION",
  "PERPENDICULAR",
  "NEAREST",
];

export function CadOsnapContextMenu({
  x,
  y,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  onPick: (type: OsnapType) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose} role="presentation">
      <div
        className="absolute min-w-[160px] rounded-md border border-[#1e293b] bg-[#0b1220] py-1 shadow-lg"
        style={{ left: x, top: y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-[#64748b]">Snap temporário</p>
        {QUICK_SNAPS.map((type) => (
          <button
            key={type}
            type="button"
            className="block w-full px-3 py-1.5 text-left text-xs text-[#e2e8f0] hover:bg-[#1e293b]"
            onClick={() => {
              onPick(type);
              onClose();
            }}
          >
            {OSNAP_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  );
}
