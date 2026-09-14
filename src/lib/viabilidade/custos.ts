import { D, type Decimal } from "./money";
import { mesmaCompetencia } from "./sinapi-caixa";
import type {
  FontePreco,
  ParametroCatalogo,
  PriceHit,
  PriceQuery,
  TipoCustoSinapi,
} from "./types";

export type SinapiRow = {
  codigo: string;
  descricao: string;
  unidade: string;
  uf: string;
  competencia: string;
  custoDesonerado: Decimal | string | number | null;
  custoNaoDesonerado: Decimal | string | number | null;
  ativo?: boolean;
};

export type SicroRow = {
  codigo: string;
  descricao: string;
  unidade: string;
  uf: string;
  competencia: string;
  custo: Decimal | string | number | null;
  ativo?: boolean;
};

export type PriceCatalog = {
  sinapi: SinapiRow[];
  sicro: SicroRow[];
  parametros: ParametroCatalogo[];
  tipoSinapi: TipoCustoSinapi;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function matchCodigo(rowCodigo: string, query: string): boolean {
  return norm(rowCodigo) === norm(query);
}

export function filtrarSinapi(
  rows: SinapiRow[],
  filtros: { uf?: string; competencia?: string; codigo?: string; q?: string },
): SinapiRow[] {
  const uf = filtros.uf ? norm(filtros.uf) : "";
  const competencia = filtros.competencia?.trim() ?? "";
  const codigo = filtros.codigo ? norm(filtros.codigo) : "";
  const q = (filtros.q ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (row.ativo === false) return false;
    if (uf && norm(row.uf) !== uf) return false;
    if (competencia && !mesmaCompetencia(row.competencia, competencia)) return false;
    if (codigo && !matchCodigo(row.codigo, codigo)) return false;
    if (q) {
      const hay = `${row.codigo} ${row.descricao}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function filtrarSicro(
  rows: SicroRow[],
  filtros: { uf?: string; competencia?: string; codigo?: string; q?: string },
): SicroRow[] {
  const uf = filtros.uf ? norm(filtros.uf) : "";
  const competencia = filtros.competencia?.trim() ?? "";
  const codigo = filtros.codigo ? norm(filtros.codigo) : "";
  const q = (filtros.q ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (row.ativo === false) return false;
    if (uf && norm(row.uf) !== uf) return false;
    if (competencia && !mesmaCompetencia(row.competencia, competencia)) return false;
    if (codigo && !matchCodigo(row.codigo, codigo)) return false;
    if (q) {
      const hay = `${row.codigo} ${row.descricao}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sinapiCusto(row: SinapiRow, tipo: TipoCustoSinapi): Decimal | null {
  const raw = tipo === "NAO_DESONERADO" ? row.custoNaoDesonerado : row.custoDesonerado;
  if (raw == null || raw === "") {
    const other = tipo === "NAO_DESONERADO" ? row.custoDesonerado : row.custoNaoDesonerado;
    if (other == null || other === "") return null;
    return D(other);
  }
  return D(raw);
}

function findParametro(catalog: PriceCatalog, categoria: string, codigo?: string | null): ParametroCatalogo | undefined {
  const list = catalog.parametros.filter((row) => row.ativo !== false && row.categoria === categoria);
  if (codigo) {
    return list.find((row) => row.codigo && matchCodigo(row.codigo, codigo));
  }
  return undefined;
}

function fromSinapi(catalog: PriceCatalog, codigo: string, uf: string, competencia?: string | null): PriceHit | null {
  const hits = filtrarSinapi(catalog.sinapi, { uf, competencia: competencia ?? undefined, codigo });
  const row = hits[0];
  if (!row) return null;
  const custo = sinapiCusto(row, catalog.tipoSinapi);
  if (custo == null) return null;
  return {
    encontrado: true,
    custoUnitario: custo,
    fonte: "SINAPI",
    codigo: row.codigo,
    competencia: row.competencia,
    uf: row.uf,
    descricao: row.descricao,
    unidade: row.unidade,
  };
}

function fromSicro(catalog: PriceCatalog, codigo: string, uf: string, competencia?: string | null): PriceHit | null {
  const hits = filtrarSicro(catalog.sicro, { uf, competencia: competencia ?? undefined, codigo });
  const row = hits[0];
  if (!row || row.custo == null || row.custo === "") return null;
  return {
    encontrado: true,
    custoUnitario: D(row.custo),
    fonte: "SICRO",
    codigo: row.codigo,
    competencia: row.competencia,
    uf: row.uf,
    descricao: row.descricao,
    unidade: row.unidade,
  };
}

/**
 * Prioridade: SINAPI → SICRO → parâmetro cadastrado → valor manual.
 * Terraplenagem pode preferir SICRO. Nunca usa preço hardcoded.
 * Não substitui competência indisponível por outra.
 */
export function buscarPreco(catalog: PriceCatalog, query: PriceQuery): PriceHit {
  if (query.valorManual != null && query.valorManual !== "") {
    return {
      encontrado: true,
      custoUnitario: D(query.valorManual),
      fonte: "MANUAL",
      codigo: query.codigo ?? undefined,
      competencia: query.competencia ?? undefined,
      uf: query.uf,
    };
  }

  const parametro = findParametro(catalog, query.categoria, query.codigo);
  const codigos = [parametro?.codigoReferencia, query.codigo, parametro?.codigo]
    .filter((codigo): codigo is string => Boolean(codigo && codigo.trim()))
    .map((codigo) => codigo.trim());
  const uniqueCodigos = [...new Set(codigos)];
  const uf = query.uf;
  const competencia = query.competencia ?? parametro?.competencia ?? null;

  const trySinapi = () => {
    for (const codigo of uniqueCodigos) {
      const hit = fromSinapi(catalog, codigo, uf, competencia);
      if (hit) return hit;
    }
    return null;
  };
  const trySicro = () => {
    for (const codigo of uniqueCodigos) {
      const hit = fromSicro(catalog, codigo, uf, competencia);
      if (hit) return hit;
    }
    return null;
  };

  const order: Array<() => PriceHit | null> = query.preferirSicro
    ? [trySicro, trySinapi]
    : [trySinapi, trySicro];

  if (query.fonte === "SINAPI") order.splice(0, order.length, trySinapi, trySicro);
  if (query.fonte === "SICRO") order.splice(0, order.length, trySicro, trySinapi);

  for (const step of order) {
    const hit = step();
    if (hit) return hit;
  }

  if (parametro?.valorUnitario != null) {
    return {
      encontrado: true,
      custoUnitario: D(parametro.valorUnitario),
      fonte: "PARAMETRICO",
      codigo: parametro.codigoReferencia ?? parametro.codigo ?? undefined,
      competencia: parametro.competencia ?? competencia ?? undefined,
      uf: parametro.uf ?? uf,
      descricao: parametro.descricao,
      unidade: parametro.unidade,
    };
  }

  return { encontrado: false, motivo: "Composição não encontrada" };
}

export function competenciaTemPrecos(
  catalog: PriceCatalog,
  uf: string,
  competencia: string | null | undefined,
): boolean {
  if (!competencia) return catalog.sinapi.some((row) => norm(row.uf) === norm(uf) && row.ativo !== false);
  return (
    filtrarSinapi(catalog.sinapi, { uf, competencia }).length > 0 ||
    filtrarSicro(catalog.sicro, { uf, competencia }).length > 0
  );
}

export function rotuloFonteCustos(uf: string, competencia: string | null | undefined): string {
  if (competencia) return `Fonte dos custos: SINAPI — ${uf} — competência ${competencia}`;
  return `Fonte dos custos: SINAPI — ${uf} — competência não selecionada`;
}

export function emptyPriceCatalog(tipoSinapi: TipoCustoSinapi = "DESONERADO"): PriceCatalog {
  return { tipoSinapi, sinapi: [], sicro: [], parametros: [] };
}
