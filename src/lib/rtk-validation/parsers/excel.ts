import { parseSurveyMatrix } from "./survey-matrix";

export async function parseExcelBuffer(buffer: ArrayBuffer, filename?: string) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { points: [], warnings: ["Planilha Excel vazia."] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const result = parseSurveyMatrix(rows);
  if (result.points.length === 0 && !result.warnings.some((w) => w.includes("vazio"))) {
    result.warnings.push(
      filename
        ? `Nenhum ponto válido na planilha ${filename}. Use colunas: Código, Descrição, E, N, Z.`
        : "Nenhum ponto válido na planilha. Use colunas: Código, Descrição, E, N, Z.",
    );
  }
  return result;
}
