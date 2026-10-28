import type { CadAiCommand, CadCommandExecutionResult } from "@/lib/rtk-validation/cad/ai-command-types";
import {
  applyLoteamentoLotSize,
  AREA_REMANESCENTE_LAYER_ID,
  isLoteamentoLotEntity,
  listLoteamentoQuadraPolylines,
  parseLoteamentoLotName,
  summarizeLoteamento,
} from "@/lib/rtk-validation/cad/loteamento-tools";
import {
  formatSingleLotBlocked,
  snapshotLotGeometries,
  tryAdjustSingleLot,
  validateSingleLotModification,
} from "@/lib/rtk-validation/cad/lot-single-adjust";
import {
  createRedistributionPending,
  redistributionDoneMessage,
  type CadPendingRedistribution,
} from "./pending-action";
import { LoteamentoError, polygonAreaPlanarM2 } from "@/lib/rtk-validation/cad/lot-subdivision";
import { formatAreaBr } from "@/lib/rtk-validation/cad/polygon-utils";
import type { CadPolylineEntity, CadProject } from "@/lib/rtk-validation/cad/types";
import { buildCadContext } from "./context";
import {
  formatLotId,
  formatQuadraId,
  listProjectLots,
  resolveLotRef,
  resolveQuadraRef,
  resolveSelectedQuadra,
  sameQuadra,
} from "./resolve";
import { formatValidacao, validarLoteamento } from "./validate";

export type OtimizarQuadraParams = {
  quadra?: string;
  areaAlvo?: number;
  areaMinima?: number;
  areaMaxima?: number;
  testadaMinima?: number;
  profundidade?: number;
  preservarRuas?: boolean;
  preservarLimites?: boolean;
  minimizarRemanescente?: boolean;
  lotesEsquinaMaiores?: boolean;
  excecoes?: Array<{ lote: string; areaAlvo: number }>;
  selectedId?: string | null;
};

function ok(
  project: CadProject,
  message: string,
  extra?: Partial<CadCommandExecutionResult>,
): CadCommandExecutionResult {
  return { ok: true, project, message, ...extra };
}

function fail(project: CadProject, message: string): CadCommandExecutionResult {
  return { ok: false, project, message };
}

function closedOnLayer(project: CadProject, layerId: string): CadPolylineEntity[] {
  return project.entities.filter(
    (entity): entity is CadPolylineEntity =>
      entity.type === "polyline" &&
      Boolean(entity.closed) &&
      entity.vertices.length >= 3 &&
      entity.layerId === layerId,
  );
}

export function consultarProjeto(project: CadProject): CadCommandExecutionResult {
  const ctx = buildCadContext(project);
  const q = ctx.quadras.length;
  const l = ctx.lotes.length;
  if (q === 0 && l === 0) {
    return ok(
      project,
      `Projeto ${ctx.projeto.nome} (${ctx.projeto.sistemaCoordenadas}). Ainda não há loteamento no desenho.`,
    );
  }
  return ok(
    project,
    `${ctx.projeto.nome} · ${ctx.projeto.sistemaCoordenadas}. ${q} quadra(s), ${l} lote(s), ${ctx.ruas.length} via(s). Remanescente: ${formatAreaBr(ctx.remanescenteM2)}.`,
  );
}

export function consultarQuadras(project: CadProject): CadCommandExecutionResult {
  const ctx = buildCadContext(project);
  if (ctx.quadras.length === 0) {
    return ok(project, "Ainda não há quadras no loteamento.");
  }
  const lines = ctx.quadras.map(
    (quadra) =>
      `Quadra ${quadra.id}: ${formatAreaBr(quadra.area)}, ${quadra.quantidadeLotes} lote(s), média ${formatAreaBr(quadra.areaMedia)}.`,
  );
  return ok(project, lines.join("\n"));
}

export function consultarQuadra(
  project: CadProject,
  ref: string | undefined,
  selectedId?: string | null,
): CadCommandExecutionResult {
  const host = (ref ? resolveQuadraRef(project, ref) : null) ?? resolveSelectedQuadra(project, selectedId ?? null);
  if (!host) {
    return fail(
      project,
      ref
        ? `Não encontrei a quadra ${ref.toUpperCase()} no loteamento atual.`
        : "Informe a quadra (ex.: G) ou selecione uma no desenho.",
    );
  }
  const ctx = buildCadContext(project);
  const row = ctx.quadras.find((item) => item.id === formatQuadraId(host.name));
  const lotes = ctx.lotes.filter((item) => item.quadra === formatQuadraId(host.name));
  const area = row?.area ?? lotes.reduce((sum, item) => sum + item.area, 0);
  const media = row?.areaMedia ?? (lotes.length ? area / lotes.length : 0);
  return ok(
    project,
    `Quadra ${formatQuadraId(host.name)}: ${formatAreaBr(area)}, ${lotes.length} lote(s), área média ${formatAreaBr(media)}.`,
    { selectedId: host.entityId },
  );
}

export function consultarLotes(
  project: CadProject,
  options?: { quadra?: string; areaMax?: number; areaMin?: number },
): CadCommandExecutionResult {
  const ctx = buildCadContext(project);
  let lotes = ctx.lotes;
  if (options?.quadra) {
    const key = formatQuadraId(options.quadra);
    lotes = lotes.filter((lote) => lote.quadra === key);
  }
  if (options?.areaMax != null) lotes = lotes.filter((lote) => lote.area + 0.05 < options.areaMax!);
  if (options?.areaMin != null) lotes = lotes.filter((lote) => lote.area + 0.05 >= options.areaMin!);
  if (lotes.length === 0) {
    return ok(project, "Nenhum lote corresponde ao filtro.");
  }
  const ids = lotes.map((lote) => {
    const resolved = resolveLotRef(project, lote.id);
    return resolved?.entity.id;
  }).filter((id): id is string => Boolean(id));
  const lines = lotes
    .slice(0, 24)
    .map((lote) => `${lote.id}: ${formatAreaBr(lote.area)} · testada ${lote.testada.toFixed(1)} m`);
  const extra = lotes.length > 24 ? `\n… +${lotes.length - 24} lote(s)` : "";
  return ok(project, `${lotes.length} lote(s):\n${lines.join("\n")}${extra}`, {
    selectedId: ids[0] ?? null,
    sideEffects: ids.length ? [{ type: "fit_view", entities: project.entities.filter((e) => ids.includes(e.id)) }] : undefined,
  });
}

export function consultarLote(
  project: CadProject,
  ref: string,
  selectedId?: string | null,
): CadCommandExecutionResult {
  const lot = resolveLotRef(project, ref, selectedId);
  if (!lot) return fail(project, `Não encontrei o lote ${ref}.`);
  const ctx = buildCadContext(project);
  const row = ctx.lotes.find((item) => item.id === formatLotId(lot));
  return ok(
    project,
    `Lote ${formatLotId(lot)} (quadra ${formatQuadraId(lot.quadra)}): ${formatAreaBr(row?.area ?? 0)}, testada ${row?.testada.toFixed(2) ?? "—"} m, profundidade ${row?.profundidade.toFixed(2) ?? "—"} m${row?.tipo ? `, ${row.tipo.toLowerCase()}` : ""}.`,
    { selectedId: lot.entity.id },
  );
}

export function calcularTestada(project: CadProject, ref?: string): CadCommandExecutionResult {
  if (ref) {
    const lot = resolveLotRef(project, ref);
    if (lot) {
      const ctx = buildCadContext(project);
      const row = ctx.lotes.find((item) => item.id === formatLotId(lot));
      return ok(project, `Testada de ${formatLotId(lot)}: ${row?.testada.toFixed(2) ?? "0.00"} m.`, {
        selectedId: lot.entity.id,
      });
    }
  }
  return fail(project, "Informe o lote (ex.: G-01) para calcular a testada.");
}

export function calcularAreaRemanescente(
  project: CadProject,
  quadra?: string,
): CadCommandExecutionResult {
  const leftover = closedOnLayer(project, AREA_REMANESCENTE_LAYER_ID);
  const total = leftover.reduce(
    (sum, entity) => sum + polygonAreaPlanarM2(entity.vertices.map((v) => [v.x, v.y] as [number, number])),
    0,
  );
  if (quadra) {
    const host = resolveQuadraRef(project, quadra);
    if (!host) return fail(project, `Não encontrei a quadra ${quadra.toUpperCase()}.`);
    const summary = summarizeLoteamento(project);
    const row = summary.quadras.find((item) => item.name === host.name);
    return ok(
      project,
      `Quadra ${formatQuadraId(host.name)}: ${row?.lotCount ?? host.lots.length} lote(s). Área remanescente no projeto: ${formatAreaBr(total)}.`,
    );
  }
  return ok(project, `Área remanescente: ${formatAreaBr(total)}.`);
}

export function formatOtimizarPreview(
  before: ReturnType<typeof summarizeLoteamento>,
  after: ReturnType<typeof summarizeLoteamento>,
  params: OtimizarQuadraParams,
  quadraName: string,
): string {
  const key = formatQuadraId(quadraName);
  const prev = before.quadras.find((row) => formatQuadraId(row.name) === key);
  const next = after.quadras.find((row) => formatQuadraId(row.name) === key);
  const lotCount = next?.lotCount ?? after.lots.length;
  const mediaAtual = prev?.areaMediaM2 ?? 0;
  const alvo = params.areaAlvo;
  const excecoes =
    params.excecoes?.length
      ? `\nExceções: ${params.excecoes.map((item) => `${item.lote.toUpperCase()} = ${item.areaAlvo} m²`).join(", ")}`
      : "";
  return [
    `Vou alterar a quadra ${key}.`,
    "",
    `${lotCount} lotes`,
    `Área média atual: ${formatAreaBr(mediaAtual)}`,
    alvo != null ? `Área alvo: ${formatAreaBr(alvo)}` : "Área alvo: redistribuir a quadra atual",
    "",
    `Preservar ruas: ${(params.preservarRuas ?? true) ? "SIM" : "NÃO"}`,
    `Preservar limites: ${(params.preservarLimites ?? true) ? "SIM" : "NÃO"}`,
    `Minimizar remanescente: ${(params.minimizarRemanescente ?? true) ? "SIM" : "NÃO"}`,
    excecoes,
    "",
    "Aplicar alteração?",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function applySize(
  project: CadProject,
  entityId: string,
  mode: "quadra" | "lote",
  areaM2?: number,
  testadaM?: number,
  profundidadeM?: number,
) {
  const inferredArea =
    areaM2 != null && areaM2 > 0
      ? areaM2
      : testadaM != null && profundidadeM != null && testadaM > 0 && profundidadeM > 0
        ? testadaM * profundidadeM
        : undefined;
  return applyLoteamentoLotSize(project, {
    entityId,
    mode,
    areaM2: inferredArea,
    testadaM,
    profundidadeM,
  });
}

export function otimizarQuadra(project: CadProject, params: OtimizarQuadraParams): CadCommandExecutionResult {
  const targets = params.quadra
    ? [resolveQuadraRef(project, params.quadra)].filter((item): item is NonNullable<typeof item> => Boolean(item))
    : params.selectedId
      ? [resolveSelectedQuadra(project, params.selectedId)].filter((item): item is NonNullable<typeof item> =>
          Boolean(item),
        )
      : buildCadContext(project)
          .quadras.map((row) => resolveQuadraRef(project, row.id))
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (targets.length === 0) {
    return fail(
      project,
      "Entendi o que você quer fazer, mas não encontrei a quadra no loteamento. Gere o loteamento antes de otimizar.",
    );
  }

  if (params.preservarRuas === false) {
    return fail(
      project,
      "O motor atual ajusta só os lotes da quadra e não redesenha ruas. Para alterar vias, use as ferramentas de eixo/loteamento.",
    );
  }

  const before = summarizeLoteamento(project);
  let next = project;
  let selectedId: string | null = params.selectedId ?? null;
  const previews: string[] = [];

  try {
    for (const host of targets) {
      if (host.lots.length === 0 && !host.entity) {
        return fail(
          project,
          `A quadra ${formatQuadraId(host.name)} ainda não tem lotes. Essa operação ainda não está disponível sem malha gerada.`,
        );
      }
      const applied = applySize(
        next,
        host.entityId,
        "quadra",
        params.areaAlvo,
        params.testadaMinima,
        params.profundidade,
      );
      next = applied.project;
      selectedId = applied.selectedId;

      for (const ex of params.excecoes ?? []) {
        const lot = resolveLotRef(next, ex.lote);
        if (!lot) {
          return fail(next, `Não encontrei o lote ${ex.lote} para aplicar a exceção.`);
        }
        const adjusted = applySize(next, lot.entity.id, "lote", ex.areaAlvo);
        next = adjusted.project;
        selectedId = adjusted.selectedId;
      }

      if (params.lotesEsquinaMaiores) {
        const corners = listProjectLots(next).filter(
          (lot) =>
            formatQuadraId(lot.quadra) === formatQuadraId(host.name) &&
            (lot.entity.lote?.tipo ?? "INTERNO") === "ESQUINA",
        );
        for (const lot of corners) {
          const alvo = (lot.entity.lote?.areaM2 ?? params.areaAlvo ?? 0) * 1.2;
          if (alvo > 1) {
            const adjusted = applySize(next, lot.entity.id, "lote", alvo);
            next = adjusted.project;
            selectedId = adjusted.selectedId;
          }
        }
      }

      previews.push(formatOtimizarPreview(before, summarizeLoteamento(next), params, host.name));
    }
  } catch (error) {
    const message =
      error instanceof LoteamentoError
        ? error.message
        : "Não foi possível otimizar a quadra com o motor geométrico atual.";
    return fail(project, message);
  }

  return ok(next, previews.join("\n\n"), {
    selectedId,
    sideEffects: [{ type: "fit_view", entities: next.entities.filter((e) => e.id === selectedId) }],
  });
}

export function ajustarLote(
  project: CadProject,
  ref: string | undefined,
  areaAlvo?: number,
  testadaMinima?: number,
  selectedId?: string | null,
  scope: "single_lot" | "quad" | "local_redistribution" = "single_lot",
): CadCommandExecutionResult {
  if (!ref) return fail(project, "Informe o lote (ex.: G-01).");
  const lot = resolveLotRef(project, ref, selectedId);
  if (!lot) return fail(project, `Não encontrei o lote ${ref}.`);
  if (areaAlvo == null && testadaMinima == null) {
    return fail(project, "Informe a área ou a testada alvo do lote.");
  }
  const inferredArea =
    areaAlvo != null && areaAlvo > 0
      ? areaAlvo
      : testadaMinima != null && testadaMinima > 0
        ? testadaMinima * (lot.entity.lote?.profundidadeM ?? 25)
        : undefined;
  if (inferredArea == null || inferredArea <= 0) {
    return fail(project, "Informe a área alvo do lote.");
  }

  if (scope === "local_redistribution") {
    try {
      const result = applySize(project, lot.entity.id, "lote", inferredArea, testadaMinima);
      return ok(
        result.project,
        `Lote ${formatLotId(lot)} ajustado para cerca de ${formatAreaBr(inferredArea)}. Redistribuição dos lotes afetados autorizada.`,
        { selectedId: result.selectedId },
      );
    } catch (error) {
      return fail(project, error instanceof LoteamentoError ? error.message : "Falha ao ajustar o lote.");
    }
  }

  const isolated = tryAdjustSingleLot(project, lot.entity, inferredArea);
  if (!isolated.ok) {
    const label = formatLotId(lot);
    const pendingAction = createRedistributionPending({
      originalCommand: "",
      targetLot: label,
      targetArea: inferredArea,
    });
    return {
      ok: false,
      project,
      message:
        isolated.reason === "impossible"
          ? formatSingleLotBlocked(label, inferredArea)
          : isolated.message,
      redistributionOffer: { lote: ref, areaAlvo: inferredArea },
      pendingAction,
    };
  }
  const check = validateSingleLotModification({
    targetEntityId: lot.entity.id,
    beforeState: project,
    afterState: isolated.project,
  });
  if (!check.ok) {
    return {
      ok: false,
      project,
      message: check.message ?? "Erro: a operação alterou lotes que não foram solicitados.",
    };
  }
  return ok(
    isolated.project,
    `Lote ${formatLotId(lot)} ajustado para cerca de ${formatAreaBr(isolated.areaM2)}. Os demais lotes permanecem intactos.`,
    { selectedId: isolated.selectedId },
  );
}

export function countChangedLots(before: CadProject, after: CadProject): string[] {
  const prev = snapshotLotGeometries(before);
  const next = snapshotLotGeometries(after);
  const ids = new Set([...prev.keys(), ...next.keys()]);
  const changed: string[] = [];
  for (const id of ids) {
    const a = prev.get(id);
    const b = next.get(id);
    if (!a || !b) {
      changed.push(id);
      continue;
    }
    if (Math.abs(a.areaM2 - b.areaM2) > 0.25) {
      changed.push(id);
      continue;
    }
    if (a.vertices.length !== b.vertices.length) {
      changed.push(id);
      continue;
    }
    const moved = a.vertices.some((vertex, index) => {
      const other = b.vertices[index];
      return !other || Math.abs(vertex.x - other.x) > 1e-4 || Math.abs(vertex.y - other.y) > 1e-4;
    });
    if (moved) changed.push(id);
  }
  return changed;
}

export function executeRedistributionPending(
  project: CadProject,
  action: CadPendingRedistribution,
  selectedId?: string | null,
): CadCommandExecutionResult {
  const result = ajustarLote(project, action.targetLot, action.targetArea, undefined, selectedId, "local_redistribution");
  if (result.ok === false) return result;
  const changed = countChangedLots(project, result.project);
  return {
    ...result,
    message: redistributionDoneMessage(action, Math.max(changed.length, 1)),
    pendingAction: undefined,
  };
}

export function redistribuirLotes(
  project: CadProject,
  quadra?: string,
  selectedId?: string | null,
): CadCommandExecutionResult {
  const host = (quadra ? resolveQuadraRef(project, quadra) : null) ?? resolveSelectedQuadra(project, selectedId ?? null);
  if (!host) return fail(project, "Informe a quadra para redistribuir os lotes.");
  const ctx = buildCadContext(project);
  const row = ctx.quadras.find((item) => item.id === formatQuadraId(host.name));
  return otimizarQuadra(project, {
    quadra: host.name,
    areaAlvo: row?.areaMedia,
    preservarRuas: true,
    preservarLimites: true,
    minimizarRemanescente: true,
    selectedId: host.entityId,
  });
}

export function analisarLoteamento(project: CadProject): CadCommandExecutionResult {
  return ok(project, formatValidacao(validarLoteamento(project)));
}

export function renomearQuadra(
  project: CadProject,
  command: CadAiCommand,
): CadCommandExecutionResult {
  const mappings =
    command.mapeamentos?.filter((item) => item.de?.trim() && item.para?.trim()) ??
    (command.quadra && (command.novo_id || command.nomes?.[0])
      ? [{ de: command.quadra, para: command.novo_id || command.nomes![0] }]
      : []);
  const nomes = (command.nomes ?? []).map((item) => item.trim()).filter(Boolean);
  const quadras = listLoteamentoQuadraPolylines(project);
  if (!mappings.length && !nomes.length) {
    return ok(project, "Claro. Quais nomes você deseja atribuir às quadras?");
  }

  let pairs = mappings.map((item) => ({ de: item.de.trim(), para: item.para.trim() }));
  if (!pairs.length && nomes.length) {
    if (quadras.length === 0) {
      return fail(project, "Não encontrei quadras no loteamento para renomear.");
    }
    if (nomes.length !== quadras.length && !(quadras.length === 2 && nomes.length === 2)) {
      const atuais = quadras.map((item) => formatQuadraId(item.name ?? "")).join(", ");
      return ok(
        project,
        `Você quer renomear as quadras ${atuais} para ${nomes.join(" e ")}? Informe o par (ex.: Quadra A → QA).`,
      );
    }
    const ordered = [...quadras].sort((a, b) => formatQuadraId(a.name ?? "").localeCompare(formatQuadraId(b.name ?? "")));
    pairs = ordered.map((entity, index) => ({
      de: formatQuadraId(entity.name ?? ""),
      para: nomes[index],
    }));
  }

  if (!pairs.length) {
    return ok(project, "Claro. Quais nomes você deseja atribuir às quadras?");
  }

  const next: CadProject = {
    ...project,
    entities: project.entities.map((entity) => {
      if (entity.type !== "polyline") return entity;
      if (quadras.some((quadra) => quadra.id === entity.id)) {
        const pair = pairs.find((item) => sameQuadra(entity.name ?? "", item.de) || formatQuadraId(entity.name ?? "") === item.de.toUpperCase());
        if (!pair) return entity;
        return { ...entity, name: pair.para };
      }
      if (isLoteamentoLotEntity(entity)) {
        const parsed = parseLoteamentoLotName(entity.name);
        const pair = pairs.find((item) => sameQuadra(parsed.quadra, item.de));
        if (!pair) return entity;
        return { ...entity, name: `${pair.para} — ${parsed.numero}` };
      }
      return entity;
    }),
  };
  const summary = pairs.map((item) => `${item.de} → ${item.para}`).join(", ");
  return ok(next, `Renomeei as quadras: ${summary}.`);
}

export function paramsFromCommand(command: CadAiCommand, selectedId?: string | null): OtimizarQuadraParams {
  return {
    quadra: command.quadra,
    areaAlvo: command.area_alvo_m2 ?? command.area_minima_m2,
    areaMinima: command.area_minima_m2,
    areaMaxima: command.area_maxima_m2,
    testadaMinima: command.testada_minima_m ?? command.testada_m,
    profundidade: command.profundidade_quadra_m,
    preservarRuas: command.preservar_ruas ?? true,
    preservarLimites: command.preservar_limites ?? true,
    minimizarRemanescente: command.minimizar_remanescente ?? true,
    lotesEsquinaMaiores: command.lotes_esquina_maiores,
    excecoes: command.excecoes?.map((item) => ({
      lote: item.lote,
      areaAlvo: item.area_alvo_m2,
    })),
    selectedId,
  };
}
