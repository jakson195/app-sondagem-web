import type { ParseResult } from "../types";
import { parseCsvOrTxt } from "./csv";
import { parseDxf } from "./dxf";
import { parseExcelBuffer } from "./excel";
import { parseGeoJson } from "./geojson";

export type SupportedFormat = "csv" | "txt" | "dxf" | "geojson" | "xlsx" | "xls";

export function detectFormat(filename: string, content: string): SupportedFormat {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "txt") return "txt";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";
  if (ext === "dxf") return "dxf";
  if (ext === "geojson" || ext === "json") return "geojson";
  if (content.trim().startsWith("{")) return "geojson";
  if (content.includes("SECTION") && content.includes("ENTITIES")) return "dxf";
  return "csv";
}

export function isExcelFilename(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "xlsx" || ext === "xls";
}

export function parseSurveyFile(filename: string, content: string): ParseResult {
  const format = detectFormat(filename, content);
  if (format === "dxf") {
    const { points, warnings } = parseDxf(content);
    return { points, format, warnings };
  }
  if (format === "geojson") {
    const { points, warnings, crs } = parseGeoJson(content);
    return { points, format, warnings, crs };
  }
  if (format === "xlsx" || format === "xls") {
    return {
      points: [],
      format,
      warnings: ["Use a importação de arquivo Excel pelo seletor de planilha (.xlsx/.xls)."],
    };
  }
  const { points, warnings } = parseCsvOrTxt(content, format);
  return { points, format, warnings };
}

export async function parseSurveyUpload(filename: string, data: string | ArrayBuffer): Promise<ParseResult> {
  if (isExcelFilename(filename)) {
    const buffer = data instanceof ArrayBuffer ? data : new TextEncoder().encode(data).buffer;
    const { points, warnings } = await parseExcelBuffer(buffer, filename);
    const ext = filename.split(".").pop()?.toLowerCase();
    return { points, format: ext === "xls" ? "xls" : "xlsx", warnings };
  }

  const content = typeof data === "string" ? data : new TextDecoder("utf-8").decode(data);
  return parseSurveyFile(filename, content);
}

export { parseSurveyMatrix } from "./survey-matrix";
