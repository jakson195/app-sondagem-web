import type { SurveyPoint } from "../types";

function uid() {
  return `pt_${Math.random().toString(36).slice(2, 10)}`;
}

export function parseDxf(content: string) {
  const warnings: string[] = [];
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const points: SurveyPoint[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === "0" && (lines[i + 1] === "POINT" || lines[i + 1] === "INSERT")) {
      let e = 0;
      let n = 0;
      let z = 0;
      let name = `P${points.length + 1}`;
      let j = i + 2;
      while (j < lines.length - 1 && lines[j] !== "0") {
        const c = lines[j];
        const v = lines[j + 1];
        if (c === "10") e = Number(v);
        if (c === "20") n = Number(v);
        if (c === "30") z = Number(v);
        if (c === "2" || c === "1") name = v;
        j += 2;
      }
      if (Number.isFinite(e) && Number.isFinite(n)) {
        points.push({ id: uid(), name, e, n, z: Number.isFinite(z) ? z : 0 });
      }
    }
  }

  if (points.length === 0) warnings.push("Nenhuma entidade POINT encontrada no DXF.");
  return { points, warnings };
}
