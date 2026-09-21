import {
  isLoteamentoLotEntity,
  isLoteamentoQuadraEntity,
  listLoteamentoQuadraPolylines,
  parseLoteamentoLotName,
  summarizeLoteamento,
} from "@/lib/rtk-validation/cad/loteamento-tools";
import { formatLotDisplayNumber } from "@/lib/rtk-validation/cad/loteamento-nomenclature";
import { listReurbLots } from "@/lib/rtk-validation/cad/reurb";
import type { CadPolylineEntity, CadProject } from "@/lib/rtk-validation/cad/types";

export function normalizeQuadraKey(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^quadra\s+/i, "")
    .replace(/^q(?:uadra)?\s+/i, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function normalizeLotNumero(numero: string): string {
  const digits = numero.replace(/^lote\s+/i, "").replace(/\D/g, "");
  if (!digits) return numero.trim().toLowerCase();
  return digits.padStart(2, "0");
}

export function parseLotRef(raw: string): { quadra: string; numero: string } | null {
  const text = raw.trim();
  if (!text) return null;
  const labeled = text.match(/^(?:quadra\s+)?([A-Za-z0-9]+)\s*[-–—]\s*(?:lote\s+)?(\d+)$/i);
  if (labeled?.[1] && labeled[2]) {
    return { quadra: labeled[1], numero: labeled[2] };
  }
  const compact = text.match(/^(?:lote\s+)?([A-Za-z]+)[-\s]?(\d+)$/i);
  if (compact?.[1] && compact[2] && !/^lote$/i.test(compact[1])) {
    return { quadra: compact[1], numero: compact[2] };
  }
  const parsed = parseLoteamentoLotName(text);
  if (parsed.numero && parsed.quadra && parsed.quadra.toLowerCase() !== "quadra") {
    return parsed;
  }
  return null;
}

export function sameQuadra(a: string, b: string): boolean {
  const ka = normalizeQuadraKey(a);
  const kb = normalizeQuadraKey(b);
  return Boolean(ka) && ka === kb;
}

export function sameLotNumero(a: string, b: string): boolean {
  return normalizeLotNumero(a) === normalizeLotNumero(b);
}

export type ResolvedLot = {
  entity: CadPolylineEntity;
  quadra: string;
  numero: string;
};

export type ResolvedQuadra = {
  name: string;
  entity: CadPolylineEntity | null;
  lots: CadPolylineEntity[];
  entityId: string;
};

export function listProjectLots(project: CadProject): ResolvedLot[] {
  return listReurbLots(project)
    .filter(isLoteamentoLotEntity)
    .map((entity) => {
      const parsed = parseLoteamentoLotName(entity.name);
      const quadra = entity.lote?.quadra ? `Quadra ${entity.lote.quadra}` : parsed.quadra;
      const numero =
        typeof entity.lote?.numero === "number" ? formatLotDisplayNumber(entity.lote.numero) : parsed.numero;
      return { entity, quadra, numero };
    });
}

export function resolveLotRef(
  project: CadProject,
  ref: string,
  selectedId?: string | null,
): ResolvedLot | null {
  const parsed = parseLotRef(ref);
  const lots = listProjectLots(project);
  if (parsed) {
    const match = lots.find(
      (lot) => sameQuadra(lot.quadra, parsed.quadra) && sameLotNumero(lot.numero, parsed.numero),
    );
    if (match) return match;
  }
  const exact = lots.find((lot) => (lot.entity.name ?? "").trim().toLowerCase() === ref.trim().toLowerCase());
  if (exact) return exact;
  const byId = lots.find((lot) => lot.entity.id === ref);
  if (byId) return byId;

  const onlyNumero = ref.match(/^(?:lote\s+)?0*(\d{1,3})$/i);
  if (onlyNumero) {
    const matches = lots.filter((lot) => sameLotNumero(lot.numero, onlyNumero[1]));
    if (selectedId) {
      const selected = matches.find((lot) => lot.entity.id === selectedId);
      if (selected) return selected;
    }
    if (matches.length >= 1) return matches[0];
  }
  return null;
}

export function resolveQuadraRef(project: CadProject, ref: string | undefined | null): ResolvedQuadra | null {
  const key = (ref ?? "").trim();
  if (!key) return null;
  const lots = listProjectLots(project);
  const quadras = listLoteamentoQuadraPolylines(project);
  const namedLots = lots.filter((lot) => sameQuadra(lot.quadra, key));
  const namedEntity =
    quadras.find((entity) => sameQuadra(entity.name ?? "", key)) ??
    quadras.find((entity) => normalizeQuadraKey(entity.name ?? "") === normalizeQuadraKey(key));

  if (namedLots.length > 0) {
    return {
      name: namedLots[0].quadra,
      entity: namedEntity ?? null,
      lots: namedLots.map((lot) => lot.entity),
      entityId: namedEntity?.id ?? namedLots[0].entity.id,
    };
  }
  if (namedEntity) {
    const inside = lots.filter((lot) => sameQuadra(lot.quadra, namedEntity.name ?? key));
    return {
      name: namedEntity.name?.trim() || key,
      entity: namedEntity,
      lots: inside.map((lot) => lot.entity),
      entityId: namedEntity.id,
    };
  }
  return null;
}

export function resolveSelectedQuadra(
  project: CadProject,
  selectedId: string | null | undefined,
): ResolvedQuadra | null {
  if (!selectedId) {
    const summary = summarizeLoteamento(project);
    if (summary.quadras.length === 1) return resolveQuadraRef(project, summary.quadras[0].name);
    return null;
  }
  const entity = project.entities.find((item) => item.id === selectedId);
  if (!entity || entity.type !== "polyline") return null;
  if (isLoteamentoQuadraEntity(entity)) {
    return resolveQuadraRef(project, entity.name) ?? {
      name: entity.name?.trim() || "Quadra",
      entity,
      lots: listProjectLots(project)
        .filter((lot) => sameQuadra(lot.quadra, entity.name ?? ""))
        .map((lot) => lot.entity),
      entityId: entity.id,
    };
  }
  if (isLoteamentoLotEntity(entity)) {
    const { quadra } = parseLoteamentoLotName(entity.name);
    return resolveQuadraRef(project, quadra);
  }
  return null;
}

export function formatLotId(lot: ResolvedLot): string {
  const letter = normalizeQuadraKey(lot.quadra).toUpperCase();
  const numero = normalizeLotNumero(lot.numero);
  if (letter && numero) return `${letter}-${numero}`;
  return lot.entity.name?.trim() || lot.entity.id;
}

export function formatQuadraId(name: string): string {
  const key = normalizeQuadraKey(name).toUpperCase();
  return key || name.trim();
}
