import { cadHatchPatternId, resolveLayerHatchPattern, withAlpha } from "@/lib/rtk-validation/cad/layer-styles";
import type { CadLayer } from "@/lib/rtk-validation/cad/types";

function GrassHatchPattern({ layer }: { layer: CadLayer }) {
  const color = layer.fillColor ?? "#4ade80";
  return (
    <pattern
      key={layer.id}
      id={cadHatchPatternId(layer.id)}
      patternUnits="userSpaceOnUse"
      width="18"
      height="18"
    >
      <rect width="18" height="18" fill={color} />
      <rect width="9" height="9" fill="#22c55e" fillOpacity="0.55" />
      <rect x="9" y="9" width="9" height="9" fill="#15803d" fillOpacity="0.38" />
      <rect x="9" y="0" width="9" height="9" fill="#86efac" fillOpacity="0.28" />
      <path d="M1.6 18 C2.4 11 1.1 6 2.2 1" stroke="#14532d" strokeWidth="1.35" fill="none" />
      <path d="M4.8 18 C6.4 12 3.6 7 5.4 0.4" stroke="#166534" strokeWidth="1.25" fill="none" />
      <path d="M8.2 18 C7.2 10 9.4 5 7.5 0.8" stroke="#22c55e" strokeWidth="1.45" fill="none" />
      <path d="M11.6 18 C13.2 11 10.4 6 12.4 0.2" stroke="#15803d" strokeWidth="1.3" fill="none" />
      <path d="M15.1 18 C14 12 16.4 6.5 14.7 1" stroke="#14532d" strokeWidth="1.35" fill="none" />
    </pattern>
  );
}

/** Padrões SVG de hachura para camadas com `hatchPattern`. */
export function CadHatchDefs({ layers }: { layers: CadLayer[] }) {
  const hatched = layers.filter((layer) => resolveLayerHatchPattern(layer) != null);
  if (hatched.length === 0) return null;

  return (
    <defs>
      {hatched.map((layer) => {
        const hatch = resolveLayerHatchPattern(layer);
        const color = layer.fillColor ?? layer.color;
        if (hatch === "grass") {
          return <GrassHatchPattern key={layer.id} layer={layer} />;
        }
        if (hatch === "cross") {
          return (
            <pattern
              key={layer.id}
              id={cadHatchPatternId(layer.id)}
              patternUnits="userSpaceOnUse"
              width="10"
              height="10"
            >
              <rect width="10" height="10" fill={withAlpha(color, 0.08)} />
              <line x1="0" y1="0" x2="10" y2="10" stroke={color} strokeWidth="1.35" />
              <line x1="10" y1="0" x2="0" y2="10" stroke={color} strokeWidth="1.35" />
            </pattern>
          );
        }
        return (
          <pattern
            key={layer.id}
            id={cadHatchPatternId(layer.id)}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill={withAlpha(color, 0.07)} />
            <line x1="0" y1="0" x2="0" y2="8" stroke={color} strokeWidth="1.5" />
          </pattern>
        );
      })}
    </defs>
  );
}
