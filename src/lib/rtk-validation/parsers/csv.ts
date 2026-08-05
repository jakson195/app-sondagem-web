import { parseSurveyMatrix } from "./survey-matrix";

function parseDelimitedLine(line: string, delimiter: string) {
  if (delimiter === "\t") return line.split("\t");
  if (delimiter === ";") return line.split(";");
  if (delimiter === "|") return line.split("|");
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

function detectDelimiter(firstLine: string) {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  for (const d of Object.keys(counts)) counts[d] = firstLine.split(d).length;
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 1 ? best[0] : ",";
}

export function parseCsvOrTxt(content: string, format: "csv" | "txt") {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));

  if (lines.length === 0) return { points: [], warnings: ["Arquivo vazio."] };

  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map((line) => parseDelimitedLine(line, delimiter));
  const result = parseSurveyMatrix(rows);
  if (result.points.length === 0 && result.warnings.length === 1 && result.warnings[0] === "Nenhum ponto válido encontrado.") {
    result.warnings[0] = `Nenhum ponto válido no ${format.toUpperCase()}.`;
  }
  return result;
}
