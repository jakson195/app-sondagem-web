import { splitSvgLabelLines } from "@/lib/rtk-validation/cad/polygon-utils";

type CadSvgMultilineTextProps = {
  x: number;
  y: number;
  label: string;
  fill?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | string;
  textAnchor?: "start" | "middle" | "end";
  lineHeight?: number;
  stroke?: string;
  strokeWidth?: number;
  paintOrder?: "stroke" | "fill" | "markers" | "normal";
};

export function CadSvgMultilineText({
  x,
  y,
  label,
  fill = "#e2e8f0",
  fontSize = 10,
  fontFamily = "ui-monospace, monospace",
  fontWeight,
  textAnchor = "start",
  lineHeight,
  stroke,
  strokeWidth,
  paintOrder,
}: CadSvgMultilineTextProps) {
  const lines = splitSvgLabelLines(label);
  if (lines.length === 0) return null;

  const dy = lineHeight ?? Math.max(fontSize * 1.15, fontSize + 2);

  return (
    <text
      x={x}
      y={y}
      fill={fill}
      fontSize={fontSize}
      fontFamily={fontFamily}
      fontWeight={fontWeight}
      textAnchor={textAnchor}
      stroke={stroke}
      strokeWidth={strokeWidth}
      paintOrder={paintOrder}
    >
      {lines.map((line, index) => (
        <tspan key={index} x={textAnchor === "middle" ? x : x} dy={index === 0 ? 0 : dy}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
