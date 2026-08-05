"use client";

import { HYPSOMETRIC_STOPS } from "@/lib/rtk-validation/cad/hypsometric";
import { worldToScreen, type CadViewport } from "@/lib/rtk-validation/cad/viewport";
import type { CadRasterOverlay } from "@/lib/rtk-validation/cad/types";

type CadRasterLayerProps = {
  rasters: CadRasterOverlay[];
  viewport: CadViewport;
  showHypsometricLegend?: boolean;
};

/** Camadas raster dentro do SVG (sincroniza com pan/zoom). */
export function CadRasterSvgLayer({ rasters, viewport }: CadRasterLayerProps) {
  const visible = rasters.filter((r) => r.visible);
  if (visible.length === 0) return null;

  return (
    <g className="cad-raster-layer" aria-hidden>
      {visible.map((raster) => {
        const tl = worldToScreen(raster.minX, raster.maxY, viewport);
        const br = worldToScreen(raster.maxX, raster.minY, viewport);
        const w = br.sx - tl.sx;
        const h = br.sy - tl.sy;
        if (w <= 0 || h <= 0) return null;

        return (
          <image
            key={raster.id}
            href={raster.imageDataUrl}
            x={tl.sx}
            y={tl.sy}
            width={w}
            height={h}
            opacity={raster.opacity}
            preserveAspectRatio="none"
          />
        );
      })}
    </g>
  );
}

function HypsometricLegend({ raster }: { raster: CadRasterOverlay }) {
  if (raster.zMin == null || raster.zMax == null) return null;

  const gradient = HYPSOMETRIC_STOPS.map((s) => `rgb(${s.r},${s.g},${s.b}) ${s.t * 100}%`).join(", ");

  return (
    <div className="pointer-events-none absolute bottom-14 right-3 z-20 rounded-lg border border-white/20 bg-black/70 px-2 py-2 text-[10px] text-white shadow-lg">
      <p className="mb-1 font-semibold">{raster.name}</p>
      <div className="flex items-stretch gap-2">
        <div
          className="h-24 w-4 rounded-sm border border-white/30"
          style={{ background: `linear-gradient(to top, ${gradient})` }}
        />
        <div className="flex flex-col justify-between font-mono text-[9px] text-[#e2e8f0]">
          <span>{raster.zMax.toFixed(1)} m</span>
          <span>{((raster.zMax + raster.zMin) / 2).toFixed(1)} m</span>
          <span>{raster.zMin.toFixed(1)} m</span>
        </div>
      </div>
    </div>
  );
}

/** Legenda HTML sobreposta ao canvas. */
export function CadRasterLegend({ rasters, showHypsometricLegend = true }: Pick<CadRasterLayerProps, "rasters" | "showHypsometricLegend">) {
  if (!showHypsometricLegend) return null;
  const hypsometric = rasters.find((r) => r.visible && r.kind === "hypsometric");
  if (!hypsometric) return null;
  return <HypsometricLegend raster={hypsometric} />;
}

/** @deprecated Use CadRasterSvgLayer + CadRasterLegend */
export function CadRasterOverlays(props: CadRasterLayerProps) {
  return (
    <>
      <CadRasterLegend rasters={props.rasters} showHypsometricLegend={props.showHypsometricLegend} />
    </>
  );
}
