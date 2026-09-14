export type SinapiImportRow = {
  codigo: string;
  descricao: string;
  unidade: string;
  uf?: string | null;
  custoDesonerado: string | null;
  custoNaoDesonerado: string | null;
  tipo: string | null;
};

export type SinapiImportResult = {
  rows: SinapiImportRow[];
  errors: string[];
  skipped: number;
};

const HEADER_ALIASES: Record<string, string[]> = {
  codigo: [
    "codigo",
    "código",
    "cod",
    "code",
    "insumo",
    "composicao",
    "composição",
    "codigo da composicao",
    "código da composição",
    "codigo composicao",
  ],
  descricao: [
    "descricao",
    "descrição",
    "desc",
    "discriminacao",
    "discriminação",
    "nome",
    "descricao da composicao",
    "descrição da composição",
    "descricao da composicao",
  ],
  unidade: ["unidade", "unid", "un", "und"],
  uf: ["uf", "estado", "sigla"],
  custo: [
    "custo",
    "preco",
    "preço",
    "valor",
    "preco unitario",
    "preço unitário",
    "custo unitario",
    "custo total",
    "preco ref",
  ],
  custoDesonerado: ["desonerado", "custo desonerado", "preco desonerado", "preço desonerado"],
  custoNaoDesonerado: [
    "nao desonerado",
    "não desonerado",
    "custo nao desonerado",
    "custo não desonerado",
    "com encargos",
  ],
  tipo: ["tipo", "natureza"],
};

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapHeader(header: string): keyof typeof HEADER_ALIASES | null {
  const n = normalizeHeader(header);
  if (!n) return null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(n)) return field as keyof typeof HEADER_ALIASES;
  }
  if (n.includes("nao desonerado") || n.includes("com encargos")) return "custoNaoDesonerado";
  if (n.includes("desonerado")) return "custoDesonerado";
  if (n.includes("codigo") && !n.includes("referencia")) return "codigo";
  if (n.includes("descricao") || n.includes("discriminacao")) return "descricao";
  if (n === "uf" || n.startsWith("uf ") || n === "estado") return "uf";
  if (n.startsWith("unidade")) return "unidade";
  if (n.includes("custo") || n.includes("preco")) return "custo";
  return null;
}

function parseCusto(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  const text = String(raw).trim();
  if (!text) return null;
  const normalized = text.includes(",") && !text.includes(".")
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(/[^\d,.\-]/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? String(n) : null;
}

export function parseTabularSinapi(matrix: unknown[][], tipoDefault?: string | null): SinapiImportResult {
  const errors: string[] = [];
  if (matrix.length < 2) {
    return { rows: [], errors: ["Arquivo vazio ou sem cabeçalho."], skipped: 0 };
  }

  let headerIdx = 0;
  let mapped: Array<keyof typeof HEADER_ALIASES | null> = [];
  for (let i = 0; i < Math.min(matrix.length, 40); i++) {
    const trial = (matrix[i] ?? []).map((cell) => mapHeader(String(cell ?? "")));
    const hits = trial.filter((cell) => cell === "codigo" || cell === "descricao" || cell === "custo" || cell === "custoDesonerado").length;
    if (hits >= 2) {
      headerIdx = i;
      mapped = trial;
      break;
    }
  }
  if (!mapped.some((cell) => cell === "codigo")) {
    return { rows: [], errors: ["Não foi possível identificar a coluna de código."], skipped: 0 };
  }

  const rows: SinapiImportRow[] = [];
  let skipped = 0;
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const rec: Record<string, unknown> = {};
    mapped.forEach((field, idx) => {
      if (!field) return;
      rec[field] = line[idx];
    });
    const codigo = String(rec.codigo ?? "").trim();
    const descricao = String(rec.descricao ?? "").trim();
    const unidade = String(rec.unidade ?? "un").trim() || "un";
    if (!codigo) {
      skipped += 1;
      continue;
    }
    if (!descricao) {
      errors.push(`Linha ${r + 1}: código ${codigo} sem descrição.`);
      skipped += 1;
      continue;
    }
    const custo = parseCusto(rec.custo);
    const tipoNorm = String(tipoDefault ?? rec.tipo ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    const soDesonerado = tipoNorm.includes("DESONERADO") && !tipoNorm.includes("NAO");
    const soNaoDesonerado = tipoNorm.includes("NAO");
    let desonerado = parseCusto(rec.custoDesonerado);
    let naoDesonerado = parseCusto(rec.custoNaoDesonerado);
    if (soNaoDesonerado) {
      naoDesonerado = naoDesonerado ?? custo;
    } else if (soDesonerado) {
      desonerado = desonerado ?? custo;
    } else {
      desonerado = desonerado ?? custo;
      naoDesonerado = naoDesonerado ?? custo;
    }
    if (desonerado == null && naoDesonerado == null) {
      errors.push(`Linha ${r + 1}: código ${codigo} sem custo.`);
    }
    const ufRow = String(rec.uf ?? "").trim().toUpperCase() || null;
    rows.push({
      codigo,
      descricao,
      unidade,
      uf: ufRow,
      custoDesonerado: desonerado,
      custoNaoDesonerado: naoDesonerado,
      tipo: String(rec.tipo ?? tipoDefault ?? "").trim() || tipoDefault || null,
    });
  }

  return { rows, errors, skipped };
}

export function parseCsv(text: string): unknown[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const sample = lines[0] ?? "";
  const delimiter = (sample.match(/;/g) ?? []).length >= (sample.match(/,/g) ?? []).length ? ";" : ",";
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (ch === delimiter && !quoted) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}
