"use client";

import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { DrawingConventionDef } from "@/lib/rtk-validation/cad/drawing-conventions";
import { PRINT_BOTTOM_STRIP_TYPO } from "@/components/rtk-validation/cad-print-shared";

type DrawingConventionsListProps = {
  items: DrawingConventionDef[];
  title?: string;
  compact?: boolean;
  className?: string;
};

export function DrawingConventionsList({
  items,
  title,
  compact = false,
  className = "",
}: DrawingConventionsListProps) {
  const t = useTranslations("rtkCad.printLayout.conventions");

  if (items.length === 0) return null;

  return (
    <div className={className}>
      {title ? (
        <p
          style={{
            fontWeight: 700,
            margin: compact ? "0 0 0.7mm" : "0 0 0.8mm",
            fontSize: compact ? PRINT_BOTTOM_STRIP_TYPO.labelSize : PRINT_BOTTOM_STRIP_TYPO.bodySize,
            color: PRINT_BOTTOM_STRIP_TYPO.text,
            letterSpacing: "0.03em",
          }}
        >
          {title}
        </p>
      ) : null}
      <div style={{ display: "grid", gap: compact ? "0.55mm" : "0.6mm" }}>
        {items.map((item) => (
          <ConventionSymbolRow key={item.id} item={item} label={t(item.labelKey)} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function ConventionSymbolRow({
  item,
  label,
  compact,
}: {
  item: DrawingConventionDef;
  label: string;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? "1.2mm" : "1.5mm" }}>
      <ConventionSymbol item={item} compact={compact} />
      <span
        style={{
          fontSize: compact ? PRINT_BOTTOM_STRIP_TYPO.smallSize : PRINT_BOTTOM_STRIP_TYPO.bodySize,
          lineHeight: PRINT_BOTTOM_STRIP_TYPO.lineHeight,
          color: PRINT_BOTTOM_STRIP_TYPO.text,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function ConventionSymbol({ item, compact }: { item: DrawingConventionDef; compact?: boolean }) {
  const w = compact ? "3.5mm" : "4mm";
  const h = compact ? "1.8mm" : "2mm";

  return (
    <span
      style={{
        width: w,
        height: h,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-hidden
    >
      <ConventionSymbolGraphic item={item} />
    </span>
  );
}

function ConventionSymbolGraphic({ item }: { item: DrawingConventionDef }) {
  switch (item.kind) {
    case "dot":
      return (
        <span
          style={{
            width: "1.8mm",
            height: "1.8mm",
            borderRadius: "50%",
            background: item.color,
            border: "0.15mm solid #111827",
            display: "block",
          }}
        />
      );
    case "dot-ring":
      return (
        <span
          style={{
            width: "1.8mm",
            height: "1.8mm",
            borderRadius: "50%",
            background: "#fff",
            border: `0.35mm solid ${item.color}`,
            display: "block",
          }}
        />
      );
    case "hatch":
      return (
        <span
          style={{
            width: "4mm",
            height: "2mm",
            border: "0.15mm solid #111827",
            background: `repeating-linear-gradient(45deg, ${item.color} 0 0.4mm, transparent 0.4mm 0.8mm)`,
            display: "block",
          }}
        />
      );
    case "cross":
      return (
        <svg width="12" height="10" viewBox="0 0 12 10" style={{ display: "block" }}>
          <line x1="6" y1="1" x2="6" y2="9" stroke={item.color} strokeWidth="0.8" />
          <line x1="1" y1="5" x2="11" y2="5" stroke={item.color} strokeWidth="0.8" />
        </svg>
      );
    case "north":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: "block" }}>
          <circle cx="5" cy="5" r="4.5" fill="#fff" stroke="#111827" strokeWidth="0.4" />
          <polygon points="5,1.5 7.2,7.5 2.8,7.5" fill="#111827" />
        </svg>
      );
    case "line-thick":
      return (
        <span style={{ width: "4mm", height: 0, borderTop: `0.55mm solid ${item.color}`, display: "block" }} />
      );
    case "line-dashed":
      return (
        <span style={{ width: "4mm", height: 0, borderTop: `0.35mm dashed ${item.color}`, display: "block" }} />
      );
    default:
      return (
        <span style={{ width: "4mm", height: 0, borderTop: `0.35mm solid ${item.color}`, display: "block" }} />
      );
  }
}

type PrintConventionsOverlayProps = {
  items: DrawingConventionDef[];
  viewW: number;
  viewH: number;
  padding: number;
  title: string;
};

export function PrintConventionsOverlay({
  items,
  viewW,
  viewH,
  padding,
  title,
}: PrintConventionsOverlayProps) {
  const t = useTranslations("rtkCad.printLayout.conventions");

  if (items.length === 0) return null;

  const rowH = 11;
  const titleH = 14;
  const innerPad = 6;
  const boxW = Math.min(viewW * 0.34, 200);
  const boxH = titleH + innerPad + items.length * rowH + innerPad;
  const boxX = padding + 4;
  const boxY = viewH - padding - boxH - 4;

  return (
    <g className="print-conventions-overlay" pointerEvents="none">
      <defs>
        <pattern id="conv-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="#16a34a" strokeWidth="1.2" />
        </pattern>
      </defs>
      <rect
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        fill="#fff"
        fillOpacity={0.94}
        stroke="#111827"
        strokeWidth={0.45}
      />
      <text
        x={boxX + boxW / 2}
        y={boxY + 10}
        textAnchor="middle"
        fontSize={7}
        fontWeight={700}
        fill="#111827"
        fontFamily="Arial, sans-serif"
      >
        {title}
      </text>
      {items.map((item, idx) => {
        const y = boxY + titleH + innerPad / 2 + idx * rowH;
        const symX = boxX + innerPad;
        const textX = boxX + innerPad + 14;
        return (
          <g key={item.id}>
            <ConventionSymbolSvg item={item} x={symX} y={y + 4} />
            <text x={textX} y={y + 6} fontSize={6.2} fill="#111827" fontFamily="Arial, sans-serif">
              {t(item.labelKey)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ConventionSymbolSvg({
  item,
  x,
  y,
}: {
  item: DrawingConventionDef;
  x: number;
  y: number;
}) {
  switch (item.kind) {
    case "dot":
      return <circle cx={x + 4} cy={y} r={2.2} fill={item.color} stroke="#111827" strokeWidth={0.35} />;
    case "dot-ring":
      return <circle cx={x + 4} cy={y} r={2.2} fill="#fff" stroke={item.color} strokeWidth={0.75} />;
    case "hatch":
      return (
        <rect x={x} y={y - 3} width={10} height={6} fill="url(#conv-hatch)" stroke="#111827" strokeWidth={0.25} />
      );
    case "cross":
      return (
        <g stroke={item.color} strokeWidth={0.45}>
          <line x1={x + 5} y1={y - 3} x2={x + 5} y2={y + 3} />
          <line x1={x + 1} y1={y} x2={x + 9} y2={y} />
        </g>
      );
    case "north":
      return (
        <g transform={`translate(${x + 5}, ${y})`}>
          <circle cx={0} cy={0} r={4.5} fill="#fff" stroke="#111827" strokeWidth={0.35} />
          <polygon points="0,-3.5 2.2,3  -2.2,3" fill="#111827" />
        </g>
      );
    case "line-thick":
      return (
        <line x1={x} y1={y} x2={x + 10} y2={y} stroke={item.color} strokeWidth={1.1} strokeLinecap="round" />
      );
    case "line-dashed":
      return (
        <line
          x1={x}
          y1={y}
          x2={x + 10}
          y2={y}
          stroke={item.color}
          strokeWidth={0.65}
          strokeDasharray="2 1.5"
          strokeLinecap="round"
        />
      );
    default:
      return (
        <line x1={x} y1={y} x2={x + 10} y2={y} stroke={item.color} strokeWidth={0.65} strokeLinecap="round" />
      );
  }
}
