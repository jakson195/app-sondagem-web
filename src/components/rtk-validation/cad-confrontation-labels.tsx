"use client";

import type { ConfrontationScreenLabel } from "@/lib/rtk-validation/cad/polygon-utils";

type CadConfrontationLabelsProps = {
  labels: ConfrontationScreenLabel[];
  fill: string;
  fontSize: number;
  fontWeight?: number;
  stroke?: string;
  strokeWidth?: number;
};

export function CadConfrontationLabels({
  labels,
  fill,
  fontSize,
  fontWeight = 700,
  stroke,
  strokeWidth,
}: CadConfrontationLabelsProps) {
  if (labels.length === 0) return null;
  return (
    <g>
      {labels.map((lab, index) => (
        <text
          key={`${lab.text}-${index}`}
          x={lab.sx}
          y={lab.sy}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={fill}
          fontSize={fontSize}
          fontWeight={fontWeight}
          fontFamily="Arial, sans-serif"
          stroke={stroke}
          strokeWidth={strokeWidth}
          paintOrder={stroke ? "stroke" : undefined}
          transform={`rotate(${lab.angleDeg} ${lab.sx} ${lab.sy})`}
        >
          {lab.text}
        </text>
      ))}
    </g>
  );
}
