import type { SurveyPoint } from "../types";

const ID_KEYS = ["id", "codigo", "code", "pt", "point_id", "pointid", "ponto"];
const DESC_KEYS = ["desc", "descr", "description", "descrição", "descricao", "nome", "name", "observacao", "obs"];
const E_KEYS = ["e", "easting", "este", "x", "lon", "longitude", "lng"];
const N_KEYS = ["n", "northing", "norte", "y", "lat", "latitude"];
const Z_KEYS = ["z", "elevation", "elev", "altura", "h", "height", "cota"];

function normalizeHeader(h: string) {
  return h
    .trim()
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
}

function findColumnIndex(headers: string[], keys: string[]) {
  const normalized = headers.map(normalizeHeader);
  for (const key of keys) {
    const idx = normalized.findIndex((h) => h === key);
    if (idx >= 0) return idx;
  }
  for (const key of keys) {
    if (key.length <= 2) continue;
    const idx = normalized.findIndex((h) => h.includes(key));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseNumeric(value: string) {
  const n = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function uid() {
  return `pt_${Math.random().toString(36).slice(2, 10)}`;
}

function isProjectHeader(firstCols: string[]) {
  const idIdx = findColumnIndex(firstCols, ID_KEYS);
  const descIdx = findColumnIndex(firstCols, DESC_KEYS);
  const eIdx = findColumnIndex(firstCols, E_KEYS);
  const nIdx = findColumnIndex(firstCols, N_KEYS);
  return eIdx >= 0 && nIdx >= 0 && (idIdx >= 0 || descIdx >= 0);
}

export function cellToSurveyString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).trim();
}

/** Converte linhas tabulares (CSV, Excel, etc.) em pontos de levantamento. */
export function parseSurveyMatrix(rawRows: unknown[][]) {
  const warnings: string[] = [];
  const rows = rawRows
    .map((row) => row.map(cellToSurveyString))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (rows.length === 0) return { points: [], warnings: ["Arquivo vazio."] };

  const firstCols = rows[0];
  let idIdx = findColumnIndex(firstCols, ID_KEYS);
  let descIdx = findColumnIndex(firstCols, DESC_KEYS);
  let eIdx = findColumnIndex(firstCols, E_KEYS);
  let nIdx = findColumnIndex(firstCols, N_KEYS);
  let zIdx = findColumnIndex(firstCols, Z_KEYS);

  let startLine = 0;
  const hasHeader = isProjectHeader(firstCols) || (eIdx >= 0 && nIdx >= 0);

  if (!hasHeader) {
    const nums = firstCols.map(parseNumeric);
    if (nums.filter((n) => n !== null).length >= 3) {
      idIdx = 0;
      descIdx = 1;
      eIdx = 2;
      nIdx = 3;
      zIdx = nums.length >= 5 ? 4 : -1;
      startLine = 0;
    } else if (nums.filter((n) => n !== null).length >= 2) {
      idIdx = -1;
      descIdx = -1;
      eIdx = 0;
      nIdx = 1;
      zIdx = nums.length >= 3 ? 2 : -1;
      startLine = 0;
    } else {
      warnings.push("Cabeçalho não reconhecido; esperado ID, Descrição, E, N, Z (ou similar).");
      idIdx = 0;
      descIdx = 1;
      eIdx = 2;
      nIdx = 3;
      zIdx = 4;
      startLine = 1;
    }
  } else {
    startLine = 1;
  }

  const points: SurveyPoint[] = [];
  for (let i = startLine; i < rows.length; i++) {
    const cols = rows[i];
    const e = parseNumeric(cols[eIdx] ?? "");
    const n = parseNumeric(cols[nIdx] ?? "");
    if (e === null || n === null) continue;

    const z = zIdx >= 0 ? (parseNumeric(cols[zIdx] ?? "") ?? 0) : 0;
    const code = idIdx >= 0 && cols[idIdx] ? cols[idIdx].replace(/^"|"$/g, "").trim() : undefined;
    const description =
      descIdx >= 0 && cols[descIdx] ? cols[descIdx].replace(/^"|"$/g, "").trim() : undefined;
    const name = description || code || `P${points.length + 1}`;

    points.push({
      id: uid(),
      code,
      name,
      description,
      e,
      n,
      z,
      properties: { code, description },
    });
  }

  if (points.length === 0) warnings.push("Nenhum ponto válido encontrado.");
  return { points, warnings };
}
