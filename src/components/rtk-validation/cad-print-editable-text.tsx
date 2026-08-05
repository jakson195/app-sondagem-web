"use client";

import { useEffect, useRef, useState } from "react";
import { resolvePrintLabel, type PrintTextOverrides } from "@/components/rtk-validation/cad-print-shared";
import { splitSvgLabelLines } from "@/lib/rtk-validation/cad/polygon-utils";

type PrintEditableSvgTextProps = {
  textKey: string;
  x: number;
  y: number;
  defaultValue: string;
  overrides: PrintTextOverrides;
  editMode: boolean;
  onChange: (key: string, value: string) => void;
  fontSize?: number;
  fontWeight?: number | string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  paintOrder?: "stroke" | "fill" | "markers" | "normal";
};

export function PrintEditableSvgText({
  textKey,
  x,
  y,
  defaultValue,
  overrides,
  editMode,
  onChange,
  fontSize = 9,
  fontWeight = 700,
  fill = "#111827",
  stroke = "#fff",
  strokeWidth = 2.5,
  paintOrder = "stroke",
}: PrintEditableSvgTextProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = resolvePrintLabel(overrides, textKey, defaultValue);
  const editValue = overrides[textKey] ?? defaultValue;
  const displayLines = splitSvgLabelLines(display);
  const lineHeight = Math.max(fontSize * 1.15, fontSize + 2);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editMode && editing) {
    const inputW = Math.max(56, editValue.length * fontSize * 0.7 + 16);
    return (
      <foreignObject x={x} y={y - fontSize - 2} width={inputW} height={fontSize + 14}>
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => onChange(textKey, e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setEditing(false);
          }}
          style={{
            width: "100%",
            fontSize: `${fontSize}px`,
            fontFamily: "Arial, sans-serif",
            fontWeight: 700,
            border: "1px solid #2563eb",
            borderRadius: 2,
            padding: "1px 4px",
            background: "#fff",
            color: "#111827",
          }}
        />
      </foreignObject>
    );
  }

  const hitW = Math.max(24, Math.max(...displayLines.map((l) => l.length), 1) * fontSize * 0.58 + 10);
  const hitH = displayLines.length * lineHeight + 4;

  return (
    <g
      onClick={
        editMode
          ? (event) => {
              event.stopPropagation();
              setEditing(true);
            }
          : undefined
      }
      style={{ cursor: editMode ? "text" : undefined }}
    >
      {editMode ? (
        <rect
          x={x - 2}
          y={y - fontSize - 1}
          width={hitW}
          height={hitH}
          fill="rgba(37,99,235,0.1)"
          stroke="#2563eb"
          strokeWidth={0.45}
          rx={1}
        />
      ) : null}
      <text
        x={x}
        y={y}
        fill={fill}
        fontSize={fontSize}
        fontFamily="Arial, sans-serif"
        fontWeight={fontWeight}
        stroke={stroke}
        strokeWidth={strokeWidth}
        paintOrder={paintOrder}
      >
        {displayLines.map((line, index) => (
          <tspan key={index} x={x} dy={index === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
