import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import { enToLatLon, latLonToEn } from "@/lib/rtk-validation/project-coords";
import {
  bboxLooksLikeWgs84Degrees,
  bboxLooksProjectedMeters,
  defineBundledProj4,
  epsgFromGeoTiffImage,
  readRasterBoundingBox,
} from "@/lib/geotiff-crs";
import { enToVertex, latLonToVertexGeoref, type CadGeorefContext } from "./georef";
import type { CadRasterOverlay } from "./types";

const MAX_DISPLAY_PX = 2048;
const WGS84 = "EPSG:4326";

export type GeoTiffParseOptions = {
  worldFileText?: string;
};

export type RasterImportViewBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function newRasterId() {
  return `raster_${Math.random().toString(36).slice(2, 10)}`;
}

export function isGeotiffOrEcwName(name: string): boolean {
  return /\.(tif|tiff|ecw)$/i.test(name);
}

export function isRasterImportName(name: string): boolean {
  return /\.(tif|tiff|ecw|jpe?g|png)$/i.test(name);
}

export function isWorldFileName(name: string): boolean {
  return /\.(tfw|tifw|tiffw|wld)$/i.test(name);
}

export function worldFileCandidates(tiffName: string): string[] {
  const stem = tiffName.replace(/\.[^.]+$/i, "");
  return [`${stem}.tfw`, `${stem}.tifw`, `${stem}.tiffw`, `${stem}.wld`];
}

export function findWorldFileCompanion(files: File[], raster: File): File | null {
  const wanted = new Set(worldFileCandidates(raster.name).map((n) => n.toLowerCase()));
  const exact = files.find((file) => wanted.has(file.name.toLowerCase()));
  if (exact) return exact;
  const worlds = files.filter((file) => isWorldFileName(file.name));
  return worlds.length === 1 ? worlds[0]! : null;
}

export function pickRasterImportFiles(files: File[]): { raster: File; worldFile: File | null } | null {
  const raster = files.find((file) => isRasterImportName(file.name));
  if (!raster) return null;
  return { raster, worldFile: findWorldFileCompanion(files, raster) };
}

export type WorldFileAffine = {
  A: number;
  D: number;
  B: number;
  E: number;
  C: number;
  F: number;
};

export function parseWorldFileText(text: string): WorldFileAffine {
  const nums = text
    .split(/[\s,;]+/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
  if (nums.length < 6) {
    throw new Error("Arquivo world (.tfw/.wld) inválido. São necessárias 6 linhas numéricas.");
  }
  return { A: nums[0]!, D: nums[1]!, B: nums[2]!, E: nums[3]!, C: nums[4]!, F: nums[5]! };
}

/** Extensão do raster a partir do world file (centro do pixel superior-esquerdo). */
export function worldFileToBbox(
  wf: WorldFileAffine,
  cols: number,
  rows: number,
): [number, number, number, number] {
  const ulx = wf.C - wf.A / 2 - wf.B / 2;
  const uly = wf.F - wf.D / 2 - wf.E / 2;
  const corners: Array<[number, number]> = [
    [ulx, uly],
    [ulx + cols * wf.A, uly + cols * wf.D],
    [ulx + cols * wf.A + rows * wf.B, uly + cols * wf.D + rows * wf.E],
    [ulx + rows * wf.B, uly + rows * wf.E],
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function utmZoneFromProjectedEpsg(epsg: number | null): number | null {
  if (epsg == null) return null;
  if (epsg >= 31978 && epsg <= 31985) return epsg - 31960;
  if (epsg >= 32718 && epsg <= 32725) return epsg - 32700;
  if (epsg >= 32618 && epsg <= 32625) return epsg - 32600;
  return null;
}

function boundsFromVertices(vertices: Array<{ x: number; y: number }>): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return {
    minX: Math.min(...vertices.map((v) => v.x)),
    minY: Math.min(...vertices.map((v) => v.y)),
    maxX: Math.max(...vertices.map((v) => v.x)),
    maxY: Math.max(...vertices.map((v) => v.y)),
  };
}

function lonLatCornersToCad(
  west: number,
  south: number,
  east: number,
  north: number,
  georef: CadGeorefContext,
) {
  return boundsFromVertices([
    latLonToVertexGeoref(south, west, 0, georef),
    latLonToVertexGeoref(south, east, 0, georef),
    latLonToVertexGeoref(north, east, 0, georef),
    latLonToVertexGeoref(north, west, 0, georef),
  ]);
}

function enCornersToCad(
  minE: number,
  minN: number,
  maxE: number,
  maxN: number,
  georef: CadGeorefContext,
) {
  return boundsFromVertices([
    enToVertex(minE, minN, 0, georef),
    enToVertex(maxE, minN, 0, georef),
    enToVertex(maxE, maxN, 0, georef),
    enToVertex(minE, maxN, 0, georef),
  ]);
}

function isGeographicRaster(epsg: number | null, bbox: number[]): boolean {
  if (!bboxLooksLikeWgs84Degrees(bbox)) return false;
  if (epsg == null) return true;
  return epsg === 4326 || epsg === 4674 || epsg === 4269;
}

/** Converte o bbox do raster (CRS de origem) para coordenadas do projeto CAD. */
export function rasterBoundsToProjectCoords(
  bbox: [number, number, number, number],
  epsg: number | null,
  georef: CadGeorefContext,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const [minA, minB, maxA, maxB] = bbox;
  if (![minA, minB, maxA, maxB].every(Number.isFinite) || minA === maxA || minB === maxB) {
    throw new Error("Georreferência do raster inválida (extensão vazia).");
  }

  if (isGeographicRaster(epsg, bbox)) {
    return lonLatCornersToCad(
      Math.min(minA, maxA),
      Math.min(minB, maxB),
      Math.max(minA, maxA),
      Math.max(minB, maxB),
      georef,
    );
  }

  const tiffZone = utmZoneFromProjectedEpsg(epsg);
  const minE = Math.min(minA, maxA);
  const minN = Math.min(minB, maxB);
  const maxE = Math.max(minA, maxA);
  const maxN = Math.max(minB, maxB);

  if (georef.coordMode === "utm" && (tiffZone === georef.utmZone || (epsg == null && bboxLooksProjectedMeters(bbox)))) {
    return enCornersToCad(minE, minN, maxE, maxN, georef);
  }

  if (tiffZone != null) {
    const corners = [
      enToLatLon(minE, minN, tiffZone),
      enToLatLon(maxE, minN, tiffZone),
      enToLatLon(maxE, maxN, tiffZone),
      enToLatLon(minE, maxN, tiffZone),
    ];
    return lonLatCornersToCad(
      Math.min(...corners.map((c) => c.lon)),
      Math.min(...corners.map((c) => c.lat)),
      Math.max(...corners.map((c) => c.lon)),
      Math.max(...corners.map((c) => c.lat)),
      georef,
    );
  }

  if (epsg != null && defineBundledProj4(epsg)) {
    const src = `EPSG:${epsg}`;
    const latLng = [
      [minE, minN],
      [maxE, minN],
      [maxE, maxN],
      [minE, maxN],
    ].map(([x, y]) => {
      const [lon, lat] = proj4(src, WGS84, [x, y]) as [number, number];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error(`Falha ao converter EPSG:${epsg} para o sistema do CAD.`);
      }
      return { lat, lon };
    });
    return lonLatCornersToCad(
      Math.min(...latLng.map((p) => p.lon)),
      Math.min(...latLng.map((p) => p.lat)),
      Math.max(...latLng.map((p) => p.lon)),
      Math.max(...latLng.map((p) => p.lat)),
      georef,
    );
  }

  if (bboxLooksProjectedMeters(bbox) && georef.coordMode === "utm") {
    return enCornersToCad(minE, minN, maxE, maxN, georef);
  }

  throw new Error(
    epsg
      ? `CRS EPSG:${epsg} não reconhecido. Exporte o raster em SIRGAS 2000 UTM ou WGS 84 (GeoTIFF georreferenciado).`
      : "Este raster não declara o CRS. Exporte como GeoTIFF georreferenciado (SIRGAS UTM ou WGS 84) no QGIS.",
  );
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
    const raw = (await image.readRGB({
      width: outW,
      height: outH,
      resampleMethod: "bilinear",
      interleave: true,
    })) as unknown as (Uint8Array | Uint16Array) & { width?: number; height?: number };
    const w = raw.width ?? outW;
    const h = raw.height ?? outH;
    canvas.width = w;
    canvas.height = h;
    const imgData = ctx.createImageData(w, h);
    const src = raw;
    const triplet = src.length >= w * h * 3 && src.length < w * h * 4;
    const step = triplet ? 3 : 4;
    for (let i = 0, j = 0; i + 2 < src.length && j < imgData.data.length; i += step, j += 4) {
      imgData.data[j] = Number(src[i] ?? 0);
      imgData.data[j + 1] = Number(src[i + 1] ?? 0);
      imgData.data[j + 2] = Number(src[i + 2] ?? 0);
      imgData.data[j + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return { canvas, width: w, height: h };
  } catch {
    /* fallback abaixo */
  }

  const samples = await image.readRasters({ interleave: true, width: outW, height: outH });
  const data = samples as unknown as Uint8Array | Uint16Array | Float32Array;
  const bands = image.getSamplesPerPixel();
  const fd = image.getFileDirectory() as { BitsPerSample?: number[] };
  const bits = fd.BitsPerSample?.[0] ?? 8;
  const imgData = ctx.createImageData(outW, outH);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const srcIdx = (y * outW + x) * bands;
      const dstIdx = (y * outW + x) * 4;
      if (bands >= 3) {
        imgData.data[dstIdx] = normalizeBand(data[srcIdx]!, bits);
        imgData.data[dstIdx + 1] = normalizeBand(data[srcIdx + 1]!, bits);
        imgData.data[dstIdx + 2] = normalizeBand(data[srcIdx + 2]!, bits);
        imgData.data[dstIdx + 3] = bands >= 4 ? normalizeBand(data[srcIdx + 3]!, bits) : 255;
      } else {
        const v = normalizeBand(data[srcIdx]!, bits);
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
  options?: GeoTiffParseOptions,
): Promise<CadRasterOverlay> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();

  let bbox: number[] | null = null;
  let epsg: number | null = null;
  try {
    bbox = readRasterBoundingBox(image);
    epsg = epsgFromGeoTiffImage(image);
    if (epsg === 4326 && bboxLooksProjectedMeters(bbox) && !bboxLooksLikeWgs84Degrees(bbox)) {
      epsg = null;
    }
  } catch {
    bbox = null;
  }

  if ((!bbox || !bbox.every(Number.isFinite)) && options?.worldFileText) {
    const wf = parseWorldFileText(options.worldFileText);
    bbox = worldFileToBbox(wf, image.getWidth(), image.getHeight());
  }

  if (!bbox || !bbox.every(Number.isFinite)) {
    throw new Error(
      "Este TIFF não está georreferenciado. Use GeoTIFF com georreferência embutida ou selecione também o arquivo world (.tfw/.wld).",
    );
  }

  const bounds = rasterBoundsToProjectCoords(bbox as [number, number, number, number], epsg, georef);
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
  bounds: RasterImportViewBounds,
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

async function tiffBufferFromEcwResponse(res: Response, file: File): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const fallbackName = file.name.replace(/\.ecw$/i, ".tif");
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    const data = (await res.json()) as { error?: string; base64?: string; fileName?: string };
    if (!data.base64) {
      throw new Error(data.error ?? "Falha ao converter ECW.");
    }
    const binary = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    return {
      buffer: binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength),
      fileName: data.fileName ?? fallbackName,
    };
  }
  return {
    buffer: await res.arrayBuffer(),
    fileName: res.headers.get("X-Converted-Name") ?? fallbackName,
  };
}

/** ECW: conversão no servidor (npx ecw2tiff ou GDAL) e leitura como GeoTIFF. */
export async function parseEcwViaApi(
  file: File,
  georef: CadGeorefContext,
  options?: GeoTiffParseOptions,
): Promise<CadRasterOverlay> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/cad-map/raster", { method: "POST", body: form });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Falha ao converter ECW.");
  }

  const { buffer, fileName } = await tiffBufferFromEcwResponse(res, file);
  return parseGeoTiffBuffer(buffer, fileName, georef, options);
}

/** Ponto único de importação: GeoTIFF, ECW georreferenciado ou JPG/PNG na vista. */
export async function importGeoreferencedRasterFile(
  file: File,
  georef: CadGeorefContext,
  options?: GeoTiffParseOptions & { viewBounds?: RasterImportViewBounds },
): Promise<CadRasterOverlay> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".ecw")) {
    return parseEcwViaApi(file, georef, options);
  }
  if (/\.(tif|tiff)$/i.test(name)) {
    return parseGeoTiffBuffer(await file.arrayBuffer(), file.name, georef, options);
  }
  if (/\.(jpe?g|png)$/i.test(name)) {
    if (!options?.viewBounds) {
      throw new Error(
        "JPG/PNG não trazem georreferência. Importe GeoTIFF (.tif) ou ECW, ou enquadre a vista UTM antes.",
      );
    }
    return parseImageFileToRasterOverlay(file, options.viewBounds);
  }
  throw new Error("Use GeoTIFF (.tif/.tiff) ou ECW (.ecw) georreferenciado, ou JPG/PNG.");
}
