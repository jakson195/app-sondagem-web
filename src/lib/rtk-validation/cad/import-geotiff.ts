import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import { latLonToEn } from "@/lib/rtk-validation/project-coords";
import type { CadGeorefContext } from "./georef";
import type { CadRasterOverlay } from "./types";

const MAX_DISPLAY_PX = 2048;

function newRasterId() {
  return `raster_${Math.random().toString(36).slice(2, 10)}`;
}

function epsgFromGeoKeys(geoKeys: Record<number, unknown> | undefined): number | null {
  if (!geoKeys) return null;
  const code = geoKeys[3072] ?? geoKeys[2048];
  if (typeof code === "number" && code > 0) return code;
  return null;
}

function bboxToUtmBounds(
  bbox: [number, number, number, number],
  epsg: number | null,
  georef: CadGeorefContext,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const [minA, minB, maxA, maxB] = bbox;

  const isGeographic =
    epsg === 4326 ||
    epsg === 4674 ||
    (Math.abs(minA) <= 180 && Math.abs(maxA) <= 180 && Math.abs(minB) <= 90 && Math.abs(maxB) <= 90);

  if (!isGeographic) {
    return { minX: minA, minY: minB, maxX: maxA, maxY: maxB };
  }

  const corners = [
    latLonToEn(minB, minA, georef.utmZone),
    latLonToEn(minB, maxA, georef.utmZone),
    latLonToEn(maxB, maxA, georef.utmZone),
    latLonToEn(maxB, minA, georef.utmZone),
  ];

  return {
    minX: Math.min(...corners.map((c) => c.e)),
    minY: Math.min(...corners.map((c) => c.n)),
    maxX: Math.max(...corners.map((c) => c.e)),
    maxY: Math.max(...corners.map((c) => c.n)),
  };
}

async function rasterToCanvas(
  image: Awaited<ReturnType<Awaited<ReturnType<typeof fromArrayBuffer>>["getImage"]>>,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const srcW = image.getWidth();
  const srcH = image.getHeight();
  const scale = Math.min(1, MAX_DISPLAY_PX / Math.max(srcW, srcH));
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não disponível.");

  try {
    const rgb = (await image.readRGB()) as unknown as Uint8Array;
    const imgData = ctx.createImageData(outW, outH);
    const stepX = srcW / outW;
    const stepY = srcH / outH;
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const sx = Math.min(srcW - 1, Math.floor(x * stepX));
        const sy = Math.min(srcH - 1, Math.floor(y * stepY));
        const srcIdx = (sy * srcW + sx) * 4;
        const dstIdx = (y * outW + x) * 4;
        imgData.data[dstIdx] = rgb[srcIdx] ?? 0;
        imgData.data[dstIdx + 1] = rgb[srcIdx + 1] ?? 0;
        imgData.data[dstIdx + 2] = rgb[srcIdx + 2] ?? 0;
        imgData.data[dstIdx + 3] = rgb[srcIdx + 3] ?? 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return { canvas, width: outW, height: outH };
  } catch {
    /* fallback below */
  }

  const samples = await image.readRasters({ interleave: true });
  const data = samples as unknown as Uint8Array | Uint16Array | Float32Array;
  const bands = image.getSamplesPerPixel();
  const fd = image.getFileDirectory() as { BitsPerSample?: number[] };
  const bits = fd.BitsPerSample?.[0] ?? 8;
  const imgData = ctx.createImageData(outW, outH);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(srcW - 1, Math.round((x / outW) * (srcW - 1)));
      const sy = Math.min(srcH - 1, Math.round((y / outH) * (srcH - 1)));
      const srcIdx = (sy * srcW + sx) * bands;
      const dstIdx = (y * outW + x) * 4;

      if (bands >= 3) {
        imgData.data[dstIdx] = normalizeBand(data[srcIdx], bits);
        imgData.data[dstIdx + 1] = normalizeBand(data[srcIdx + 1], bits);
        imgData.data[dstIdx + 2] = normalizeBand(data[srcIdx + 2], bits);
        imgData.data[dstIdx + 3] = bands >= 4 ? normalizeBand(data[srcIdx + 3], bits) : 255;
      } else {
        const v = normalizeBand(data[srcIdx], bits);
        imgData.data[dstIdx] = v;
        imgData.data[dstIdx + 1] = v;
        imgData.data[dstIdx + 2] = v;
        imgData.data[dstIdx + 3] = 255;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return { canvas, width: outW, height: outH };
}

function normalizeBand(value: number, bitsPerSample = 8): number {
  if (bitsPerSample <= 8) return Math.max(0, Math.min(255, value));
  if (bitsPerSample <= 16) return Math.max(0, Math.min(255, Math.round((value / 65535) * 255)));
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Importa ortofoto GeoTIFF georreferenciada para sobreposição no CAD. */
export async function parseGeoTiffBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  georef: CadGeorefContext,
): Promise<CadRasterOverlay> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const bbox = image.getBoundingBox() as [number, number, number, number];
  const geoKeys = image.getGeoKeys() as Record<number, unknown> | undefined;
  const epsg = epsgFromGeoKeys(geoKeys);

  if (epsg && epsg !== 4326 && epsg !== 4674) {
    try {
      proj4.defs(`EPSG:${epsg}`, proj4.defs(`EPSG:${epsg}`) ?? "");
    } catch {
      /* proj4 may already know common codes */
    }
  }

  const bounds = bboxToUtmBounds(bbox, epsg, georef);
  const { canvas } = await rasterToCanvas(image);

  return {
    id: newRasterId(),
    name: fileName.replace(/\.(tif|tiff)$/i, ""),
    kind: "orthophoto",
    imageDataUrl: canvas.toDataURL("image/png"),
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
    opacity: 0.85,
    visible: true,
  };
}

/** Imagem raster (JPG/PNG) posicionada na área visível do CAD. */
export async function parseImageFileToRasterOverlay(
  file: File,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): Promise<CadRasterOverlay> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Falha ao ler imagem."));
    };
    reader.onerror = () => reject(new Error("Falha ao ler imagem."));
    reader.readAsDataURL(file);
  });

  return {
    id: newRasterId(),
    name: file.name.replace(/\.[^.]+$/i, ""),
    kind: "orthophoto",
    imageDataUrl: dataUrl,
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
    opacity: 0.85,
    visible: true,
  };
}

/** ECW requer conversão server-side (GDAL). */
export async function parseEcwViaApi(file: File, georef: CadGeorefContext): Promise<CadRasterOverlay> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/cad-map/raster", { method: "POST", body: form });
  const data = (await res.json()) as { error?: string; base64?: string; fileName?: string };

  if (!res.ok || !data.base64) {
    throw new Error(data.error ?? "Falha ao converter ECW.");
  }

  const binary = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
  return parseGeoTiffBuffer(binary.buffer, data.fileName ?? file.name.replace(/\.ecw$/i, ".tif"), georef);
}
