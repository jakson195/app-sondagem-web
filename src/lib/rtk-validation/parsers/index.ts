import type { ParseResult } from "../types";
import { parseCsvOrTxt } from "./csv";
import { parseDxf } from "./dxf";
import { parseExcelBuffer } from "./excel";
import { parseGeoJson } from "./geojson";
import { parseSurveyMatrix } from "./survey-matrix";

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

export async function parseSurveyUpload(
  filename: string,
  data: string | ArrayBuffer,
  map?: Partial<import("./survey-matrix").SurveyColumnMap>,
): Promise<ParseResult> {
  if (isExcelFilename(filename)) {
    const buffer = data instanceof ArrayBuffer ? data : new TextEncoder().encode(data).buffer;
    if (map) {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const rows = sheetName
        ? XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false })
        : [];
      const { points, warnings } = parseSurveyMatrix(rows, map);
      const ext = filename.split(".").pop()?.toLowerCase();
      return { points, format: ext === "xls" ? "xls" : "xlsx", warnings };
    }
    const { points, warnings } = await parseExcelBuffer(buffer, filename);
    const ext = filename.split(".").pop()?.toLowerCase();
    return { points, format: ext === "xls" ? "xls" : "xlsx", warnings };
  }

  const content = typeof data === "string" ? data : new TextDecoder("utf-8").decode(data);
  const format = detectFormat(filename, content);
  if ((format === "csv" || format === "txt") && map) {
    const { parseDelimitedPreview } = await import("./csv");
    const { points, warnings } = parseSurveyMatrix(parseDelimitedPreview(content), map);
    return { points, format, warnings };
  }
  return parseSurveyFile(filename, content);
}

export async function peekSurveyTable(filename: string, data: string | ArrayBuffer) {
  const { suggestSurveyColumns, stringifySurveyRows } = await import("./survey-matrix");
  if (isExcelFilename(filename)) {
    const buffer = data instanceof ArrayBuffer ? data : new TextEncoder().encode(data).buffer;
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const raw = sheetName
      ? XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false })
      : [];
    const rows = stringifySurveyRows(raw);
    return { format: filename.split(".").pop()?.toLowerCase() ?? "xlsx", ...suggestSurveyColumns(rows), rows };
  }
  const content = typeof data === "string" ? data : new TextDecoder("utf-8").decode(data);
  const { parseDelimitedPreview } = await import("./csv");
  const rows = parseDelimitedPreview(content);
  return { format: detectFormat(filename, content), ...suggestSurveyColumns(rows), rows };
}

export { parseSurveyMatrix, suggestSurveyColumns, stringifySurveyRows, type SurveyColumnMap } from "./survey-matrix";
export { parseDelimitedPreview } from "./csv";
