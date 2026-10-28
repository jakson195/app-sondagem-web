import { resolveLotRef, resolveQuadraRef } from "@/lib/cad-ai/resolve";
import { polygonCentroid } from "./ai-geometry-utils";
import { validateSubdivision } from "./lot-access";
import { polygonInteriorOverlapM2 } from "./lot-subdivision";
import { AREA_RESERVA_LEGAL_LAYER_ID, isLoteamentoLotEntity, isLoteamentoQuadraEntity } from "./loteamento-tools";
import { pointInPolygon } from "./polygon-utils";
import { LOTEAMENTO_VIAS_LAYER_ID } from "./reurb";
import type { CadAiCommand } from "./ai-command-types";
import type { CadEntity, CadLineEntity, CadProject, CadVertex } from "./types";
import {
  CAD_EPSILON,
  arrayPolar,
  arrayRectangular,
  asLineEntity,
  chamferTwoLines,
  copyEntity,
  displacementFromPolar,
  entityCentroid,
  entityLengthM,
  explodeEntity,
  extendEntity,
  filletPolylineCorner,
  filletTwoLines,
  joinEntities,
  mirrorEntity,
  newModifyId,
  offsetEntity,
  rotateEntity,
  scaleEntity,
  splitEntityEqual,
  stretchEntity,
  translateEntity,
  trimEntity,
} from "./modify-geometry";

export { CAD_EPSILON } from "./modify-geometry";

export type ModifyResult = {
  ok: boolean;
  project: CadProject;
  selectedIds: string[];
  message: string;
  previewEntities?: CadEntity[];
  missing?: string[];
};

const AREA_INSTITUCIONAL_ID = "area_institucional";
const AREA_APP_ID = "area_app";

function entityDisplayName(entity: CadEntity): string {
  if (entity.type === "point") return entity.label ?? "";
  if (entity.type === "polyline") return entity.name ?? "";
  return "";
}

function findEntityByName(project: CadProject, name: string): CadEntity | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    project.entities.find((e) => entityDisplayName(e).toLowerCase() === needle) ??
    project.entities.find((e) => {
      const folded = entityDisplayName(e).toLowerCase();
      return Boolean(folded) && (folded.includes(needle) || needle.includes(folded));
    })
  );
}

function resolveBoundary(project: CadProject, ref?: string): CadEntity | undefined {
  if (!ref) return undefined;
  return (
    project.entities.find((e) => e.id === ref) ??
    findEntityByName(project, ref) ??
    resolveQuadraRef(project, ref)?.entity ??
    undefined
  );
}

function replaceEntities(project: CadProject, next: CadEntity[], removeIds: string[] = []): CadProject {
  const remove = new Set(removeIds);
  const kept = project.entities.filter((e) => !remove.has(e.id));
  const byId = new Map(kept.map((e) => [e.id, e]));
  for (const entity of next) {
    if (byId.has(entity.id)) {
      const idx = kept.findIndex((e) => e.id === entity.id);
      if (idx >= 0) kept[idx] = entity;
    } else {
      kept.push(entity);
    }
  }
  return { ...project, entities: kept };
}

export function resolveModifyTargets(
  project: CadProject,
  command: Pick<CadAiCommand, "entidade_id" | "entidade_ids" | "lote" | "quadra" | "usarSelecao" | "nome">,
  selectedId?: string | null,
  extraIds: string[] = [],
): CadEntity[] {
  const ids = new Set<string>([...extraIds, ...(command.entidade_ids ?? [])]);
  if (command.entidade_id) ids.add(command.entidade_id);
  if (command.usarSelecao && selectedId) ids.add(selectedId);
  if (command.lote) {
    const lot = resolveLotRef(project, command.lote, selectedId);
    if (lot) ids.add(lot.entity.id);
  }
  if (command.quadra) {
    const quadra = resolveQuadraRef(project, command.quadra);
    if (quadra?.entity) ids.add(quadra.entity.id);
    else if (quadra) for (const lot of quadra.lots) ids.add(lot.id);
  }
  if (command.nome) {
    const named = findEntityByName(project, command.nome);
    if (named) ids.add(named.id);
  }
  if (ids.size === 0 && selectedId) ids.add(selectedId);
  const found: CadEntity[] = [];
  for (const id of ids) {
    const direct = project.entities.find((e) => e.id === id);
    if (direct) {
      found.push(direct);
      continue;
    }
    const lot = resolveLotRef(project, id, selectedId);
    if (lot) found.push(lot.entity);
    else {
      const quadra = resolveQuadraRef(project, id);
      if (quadra?.entity) found.push(quadra.entity);
    }
  }
  return found;
}

function ringOf(entity: CadEntity): [number, number][] {
  if (entity.type !== "polyline") return [];
  return entity.vertices.map((v) => [v.x, v.y] as [number, number]);
}

export function validateModifyAgainstLoteamento(
  before: CadProject,
  after: CadProject,
  touchedIds: string[],
): string | null {
  const lotsAfter = after.entities.filter(isLoteamentoLotEntity);
  if (lotsAfter.length === 0) return null;
  const touched = new Set(touchedIds);
  const changedLots = lotsAfter.filter((lot) => touched.has(lot.id));
  if (changedLots.length === 0) {
    const explodedLot = before.entities.some((e) => touched.has(e.id) && isLoteamentoLotEntity(e));
    if (!explodedLot) return null;
  }

  const streets = after.entities
    .filter((e) => e.type === "polyline" && e.layerId === LOTEAMENTO_VIAS_LAYER_ID)
    .map((e) => (e.type === "polyline" ? e.vertices.map((v) => [v.x, v.y] as [number, number]) : []))
    .filter((r) => r.length >= 3);
  const greens = after.entities.filter(
    (e) =>
      e.type === "polyline" &&
      e.closed &&
      (e.layerId === AREA_RESERVA_LEGAL_LAYER_ID || e.layerId === AREA_APP_ID),
  );
  const institutional = after.entities.filter(
    (e) => e.type === "polyline" && e.closed && e.layerId === AREA_INSTITUCIONAL_ID,
  );
  const quadras = after.entities.filter(isLoteamentoQuadraEntity);

  for (let i = 0; i < lotsAfter.length; i++) {
    const a = lotsAfter[i];
    const ra = ringOf(a);
    for (let j = i + 1; j < lotsAfter.length; j++) {
      const overlap = polygonInteriorOverlapM2(ra, ringOf(lotsAfter[j]));
      if (overlap > 0.05) {
        return `A operação criaria sobreposição entre ${a.name ?? a.id} e ${lotsAfter[j].name ?? lotsAfter[j].id}.`;
      }
    }
    for (const green of greens) {
      if (polygonInteriorOverlapM2(ra, ringOf(green)) > 0.05) {
        return `A operação atravessaria área verde/APP (${entityDisplayName(green) || green.id}).`;
      }
    }
    for (const inst of institutional) {
      if (polygonInteriorOverlapM2(ra, ringOf(inst)) > 0.05) {
        return `A operação atravessaria área institucional (${entityDisplayName(inst) || inst.id}).`;
      }
    }
    for (const street of after.entities.filter((e) => e.type === "polyline" && e.layerId === LOTEAMENTO_VIAS_LAYER_ID && e.closed)) {
      if (polygonInteriorOverlapM2(ra, ringOf(street)) > 0.05) {
        return `A operação atravessaria uma via (${street.type === "polyline" ? street.name ?? street.id : street.id}).`;
      }
    }
    if (quadras.length > 0 && (touched.has(a.id) || changedLots.includes(a))) {
      const host =
        quadras.find((q) => (q.name ?? "").includes(a.lote?.quadra ?? "")) ??
        quadras.find((q) => a.vertices.every((v) => pointInPolygon(v.x, v.y, q.vertices)));
      if (host && !a.vertices.every((v) => pointInPolygon(v.x, v.y, host.vertices))) {
        return `O lote ${a.name ?? a.id} sairia da quadra.`;
      }
    }
  }

  if (streets.length > 0) {
    const lotes = lotsAfter.map((lot, i) => ({
      coordinates: [lot.vertices.map((v) => [v.x, v.y])],
      area_m2: 0,
      testada_m: lot.lote?.testadaM ?? 0,
      quadra: lot.lote?.quadra ? `Quadra ${lot.lote.quadra}` : lot.name ?? "Quadra",
      numero: typeof lot.lote?.numero === "number" ? String(lot.lote.numero).padStart(2, "0") : `${i + 1}`,
    }));
    const check = validateSubdivision(lotes as never, streets, 0);
    if (!check.ok && check.lotsWithoutRoadAccessCount > 0) {
      return "A operação deixaria lote(s) sem acesso viário.";
    }
  }
  return null;
}

function fail(project: CadProject, message: string, missing?: string[]): ModifyResult {
  return { ok: false, project, selectedIds: [], message, missing };
}

function ok(project: CadProject, ids: string[], message: string, preview?: CadEntity[]): ModifyResult {
  return { ok: true, project, selectedIds: ids, message, previewEntities: preview };
}

function applyGuard(before: CadProject, after: CadProject, ids: string[], message: string): ModifyResult {
  const err = validateModifyAgainstLoteamento(before, after, ids);
  if (err) return fail(before, err);
  return ok(after, ids, message);
}

function resolveDelta(command: CadAiCommand): { dx: number; dy: number } | null {
  if (command.dx != null && command.dy != null && Number.isFinite(command.dx) && Number.isFinite(command.dy)) {
    return { dx: command.dx, dy: command.dy };
  }
  if (command.distancia != null && Number.isFinite(command.distancia)) {
    const az = command.angulo ?? 90;
    return displacementFromPolar(command.distancia, az);
  }
  return null;
}

export function applyModifyCommand(
  project: CadProject,
  command: CadAiCommand,
  opts?: { selectedId?: string | null; extraIds?: string[]; preview?: boolean },
): ModifyResult {
  const selectedId = opts?.selectedId ?? null;
  const targets = resolveModifyTargets(project, command, selectedId, opts?.extraIds);
  const preview = Boolean(opts?.preview);

  const commit = (next: CadProject, ids: string[], message: string, ghosts?: CadEntity[]): ModifyResult => {
    if (preview) return ok(project, ids, message, ghosts ?? next.entities.filter((e) => ids.includes(e.id) || e.id.startsWith("preview_")));
    return applyGuard(project, next, ids, message);
  };

  switch (command.acao) {
    case "mover": {
      if (targets.length === 0) return fail(project, "Selecione o objeto a mover.", ["entidade_id"]);
      const delta = resolveDelta(command);
      if (!delta) return fail(project, "Informe a distância e a direção (ou dx/dy).", ["distancia", "angulo"]);
      const next = targets.map((e) => translateEntity(e, delta.dx, delta.dy));
      return commit(replaceEntities(project, next), targets.map((e) => e.id), `Movido ${delta.dx.toFixed(2)}, ${delta.dy.toFixed(2)} m.`, next);
    }
    case "copiar": {
      if (targets.length === 0) return fail(project, "Selecione o objeto a copiar.", ["entidade_id"]);
      const delta = resolveDelta(command);
      if (!delta) return fail(project, "Informe a distância e a direção (ou dx/dy).", ["distancia", "angulo"]);
      const copies = targets.map((e) => copyEntity(e, delta.dx, delta.dy));
      return commit(
        { ...project, entities: [...project.entities, ...copies] },
        copies.map((e) => e.id),
        `Cópia deslocada ${delta.dx.toFixed(2)}, ${delta.dy.toFixed(2)} m.`,
        copies,
      );
    }
    case "rotacionar": {
      if (targets.length === 0) return fail(project, "Selecione o objeto a rotacionar.", ["entidade_id"]);
      if (command.angulo == null || !Number.isFinite(command.angulo)) {
        return fail(project, "Informe o ângulo em graus.", ["angulo"]);
      }
      const center =
        command.x != null && command.y != null
          ? { x: command.x, y: command.y, z: command.z ?? 0 }
          : polygonCentroid(targets.flatMap((e) => (e.type === "point" ? [{ x: e.x, y: e.y, z: e.z }] : e.type === "line" ? [e.start, e.end] : e.vertices)));
      const next = targets.map((e) => rotateEntity(e, center, command.angulo!));
      return commit(replaceEntities(project, next), targets.map((e) => e.id), `Rotacionado ${command.angulo}°.`, next);
    }
    case "espelhar": {
      if (targets.length === 0) return fail(project, "Selecione o objeto a espelhar.", ["entidade_id"]);
      if (command.x == null || command.y == null || command.x2 == null || command.y2 == null) {
        return fail(project, "Informe os dois pontos do eixo de espelho.", ["x", "y", "x2", "y2"]);
      }
      const a = { x: command.x, y: command.y, z: 0 };
      const b = { x: command.x2, y: command.y2, z: 0 };
      const mirrored = targets.map((e) => {
        const m = mirrorEntity(e, a, b);
        return command.manter_original === false ? m : { ...m, id: newModifyId(e.type === "line" ? "ln" : e.type === "point" ? "pt" : "pl") };
      });
      if (command.manter_original === false) {
        return commit(replaceEntities(project, mirrored), mirrored.map((e) => e.id), "Objeto espelhado.", mirrored);
      }
      return commit(
        { ...project, entities: [...project.entities, ...mirrored] },
        mirrored.map((e) => e.id),
        "Cópia espelhada criada.",
        mirrored,
      );
    }
    case "esticar": {
      if (targets.length === 0) return fail(project, "Selecione o objeto a esticar.", ["entidade_id"]);
      const delta = resolveDelta(command);
      if (!delta) return fail(project, "Informe o deslocamento do esticamento.", ["distancia", "angulo"]);
      const window =
        command.x != null && command.y != null && command.x2 != null && command.y2 != null
          ? ([{ x: command.x, y: command.y, z: 0 }, { x: command.x2, y: command.y2, z: 0 }] as [CadVertex, CadVertex])
          : undefined;
      const indices = command.vertices_indices;
      const next = targets.map((e) => stretchEntity(e, delta.dx, delta.dy, { window, indices }));
      return commit(replaceEntities(project, next), targets.map((e) => e.id), "Geometria esticada.", next);
    }
    case "escala": {
      if (targets.length === 0) return fail(project, "Selecione o objeto a escalar.", ["entidade_id"]);
      let factor = command.fator;
      if ((factor == null || !Number.isFinite(factor)) && command.distancia != null && targets[0]) {
        const current = entityLengthM(targets[0]);
        if (current > CAD_EPSILON) factor = command.distancia / current;
      }
      if (factor == null || !Number.isFinite(factor) || factor <= 0) {
        return fail(project, "Informe o fator de escala (ex.: 2 ou 0.8).", ["fator"]);
      }
      const base =
        command.x != null && command.y != null
          ? { x: command.x, y: command.y, z: command.z ?? 0 }
          : entityCentroid(targets[0]);
      const next = targets.map((e) => scaleEntity(e, base, factor!));
      return commit(replaceEntities(project, next), targets.map((e) => e.id), `Escala ${factor}.`, next);
    }
    case "deslocar": {
      if (targets.length === 0) return fail(project, "Selecione a linha/polilinha para offset.", ["entidade_id"]);
      if (command.distancia == null || !(command.distancia > 0)) {
        return fail(project, "Informe a distância do offset.", ["distancia"]);
      }
      const side: 1 | -1 = command.lado === "esquerda" || command.lado === "left" ? 1 : -1;
      const copies: CadEntity[] = [];
      for (const entity of targets) {
        const off = offsetEntity(entity, command.distancia, side);
        if (off) copies.push(off);
      }
      if (copies.length === 0) return fail(project, "Não foi possível gerar o offset.");
      return commit(
        { ...project, entities: [...project.entities, ...copies] },
        copies.map((e) => e.id),
        `Offset de ${command.distancia} m.`,
        copies,
      );
    }
    case "aparar": {
      if (targets.length < 1) return fail(project, "Selecione o objeto a aparar.", ["entidade_id"]);
      const target =
        (command.entidade_id ? project.entities.find((e) => e.id === command.entidade_id) : null) ?? targets[0];
      const boundary =
        resolveBoundary(project, command.entidade_corte) ??
        targets.find((e) => e.id !== target.id) ??
        targets[1];
      if (!boundary) return fail(project, "Selecione o objeto limite (corte).", ["entidade_corte"]);
      const click =
        command.x != null && command.y != null
          ? { x: command.x, y: command.y, z: 0 }
          : entityCentroid(target);
      const trimmed = trimEntity(target, boundary, click);
      if (!trimmed) return fail(project, "Não há interseção para aparar.");
      return commit(replaceEntities(project, [trimmed]), [trimmed.id], "Objeto aparado.", [trimmed]);
    }
    case "estender": {
      if (targets.length < 1) return fail(project, "Selecione o objeto a estender.", ["entidade_id"]);
      const target =
        (command.entidade_id ? project.entities.find((e) => e.id === command.entidade_id) : null) ?? targets[0];
      const boundary =
        resolveBoundary(project, command.entidade_corte) ??
        targets.find((e) => e.id !== target.id) ??
        targets[1];
      if (!boundary) return fail(project, "Selecione o limite até onde estender.", ["entidade_corte"]);
      const click =
        command.x != null && command.y != null
          ? { x: command.x, y: command.y, z: 0 }
          : entityCentroid(target);
      const extended = extendEntity(target, boundary, click);
      if (!extended) return fail(project, "Não foi possível estender até o limite.");
      return commit(replaceEntities(project, [extended]), [extended.id], "Objeto estendido.", [extended]);
    }
    case "concordar": {
      const radius = command.raio ?? command.distancia;
      if (radius == null || !(radius > 0)) return fail(project, "Informe o raio da concordância.", ["raio"]);
      if (targets.length === 1 && targets[0].type === "polyline") {
        const idx = command.vertices_indices?.[0] ?? 0;
        const next = filletPolylineCorner(targets[0], idx, radius);
        if (!next) return fail(project, "Não foi possível concordar essa esquina.");
        return commit(replaceEntities(project, [next]), [next.id], `Concordância de raio ${radius} m.`, [next]);
      }
      if (targets.length < 2) return fail(project, "Selecione duas linhas para concordar.", ["entidade_ids"]);
      const a = asLineEntity(targets[0]);
      const b = asLineEntity(targets[1]);
      if (!a || !b) return fail(project, "Concordância exige duas linhas.");
      const filleted = filletTwoLines(a as CadLineEntity, b as CadLineEntity, radius);
      if (!filleted) return fail(project, "As linhas não se encontram para concordar.");
      const nextProject = replaceEntities(project, [filleted.a, filleted.b, filleted.arc], []);
      return commit(nextProject, [filleted.a.id, filleted.b.id, filleted.arc.id], `Concordância de raio ${radius} m.`);
    }
    case "chanfrar": {
      const d1 = command.distancia ?? command.distancia_1;
      const d2 = command.distancia_2 ?? d1;
      if (d1 == null || !(d1 > 0)) return fail(project, "Informe a distância do chanfro.", ["distancia"]);
      if (targets.length < 2) return fail(project, "Selecione duas linhas para chanfrar.", ["entidade_ids"]);
      const a = asLineEntity(targets[0]);
      const b = asLineEntity(targets[1]);
      if (!a || !b) return fail(project, "Chanfro exige duas linhas.");
      const cut = chamferTwoLines(a as CadLineEntity, b as CadLineEntity, d1, d2 ?? d1);
      if (!cut) return fail(project, "As linhas não se encontram para chanfrar.");
      return commit(
        replaceEntities(project, [cut.a, cut.b, cut.cut]),
        [cut.a.id, cut.b.id, cut.cut.id],
        `Chanfro de ${d1} m.`,
      );
    }
    case "matriz": {
      if (targets.length === 0) return fail(project, "Selecione o objeto da matriz.", ["entidade_id"]);
      const cols = command.colunas ?? 1;
      const rows = command.linhas ?? 1;
      const dx = command.dx ?? command.distancia ?? 0;
      const dy = command.dy ?? 0;
      const copies: CadEntity[] = [];
      if (command.tipo_matriz === "polar" && command.angulo != null) {
        const center =
          command.x != null && command.y != null
            ? { x: command.x, y: command.y, z: 0 }
            : entityCentroid(targets[0]);
        for (const entity of targets) copies.push(...arrayPolar(entity, center, command.partes ?? cols, command.angulo));
      } else {
        for (const entity of targets) copies.push(...arrayRectangular(entity, cols, rows, dx, dy));
      }
      if (copies.length === 0) return fail(project, "Informe colunas/linhas e espaçamento da matriz.", ["colunas", "distancia"]);
      return commit(
        { ...project, entities: [...project.entities, ...copies] },
        copies.map((e) => e.id),
        `Matriz: ${copies.length} cópia(s).`,
        copies,
      );
    }
    case "explodir": {
      if (targets.length === 0) return fail(project, "Selecione o objeto a explodir.", ["entidade_id"]);
      const lines = targets.flatMap(explodeEntity);
      if (lines.length === 0) return fail(project, "Nada para explodir.");
      const remove = targets.map((e) => e.id);
      return commit(replaceEntities(project, lines, remove), lines.map((e) => e.id), `Explodido em ${lines.length} linha(s).`);
    }
    case "unir": {
      const parts = targets.length >= 2 ? targets : project.entities.filter((e) => (command.entidade_ids ?? []).includes(e.id));
      if (parts.length < 2) return fail(project, "Selecione pelo menos duas linhas/polilinhas para unir.", ["entidade_ids"]);
      const joined = joinEntities(parts);
      if (!joined) return fail(project, "As extremidades não se encontram (tolerância 0,001 m).");
      return commit(replaceEntities(project, [joined], parts.map((e) => e.id)), [joined.id], "Entidades unidas.");
    }
    case "dividir": {
      if (targets.length === 0) return fail(project, "Selecione o objeto a dividir.", ["entidade_id"]);
      const parts = command.partes ?? 2;
      const pieces = targets.flatMap((e) => splitEntityEqual(e, parts));
      if (pieces.length <= targets.length) return fail(project, "Não foi possível dividir o objeto.");
      return commit(replaceEntities(project, pieces, targets.map((e) => e.id)), pieces.map((e) => e.id), `Dividido em ${pieces.length} parte(s).`);
    }
    default:
      return fail(project, "Ferramenta de modificação não reconhecida.");
  }
}

export function pickHintForTool(tool: string, phase: string): string {
  const map: Record<string, Record<string, string>> = {
    move: { select: "Selecione o objeto.", base: "Clique o ponto base.", dest: "Clique o ponto destino." },
    rotate: { select: "Selecione o objeto.", base: "Clique o centro de rotação.", value: "Informe o ângulo ou clique o segundo ponto." },
    copy: { select: "Selecione o objeto.", base: "Clique o ponto base.", dest: "Clique o ponto destino da cópia." },
    mirror: { select: "Selecione o objeto.", base: "Primeiro ponto do eixo.", dest: "Segundo ponto do eixo." },
    stretch: { select: "Selecione o objeto.", base: "Primeiro canto da janela.", dest: "Segundo canto, depois o deslocamento." },
    scale: { select: "Selecione o objeto.", base: "Clique o ponto base.", value: "Informe o fator (ex.: 2 ou 0.8)." },
    offset: { select: "Selecione a linha/polilinha.", value: "Informe a distância e clique o lado." },
    trim: { select: "Clique o objeto limite.", target: "Clique a parte a aparar." },
    extend: { select: "Clique o limite.", target: "Clique o objeto a estender." },
    fillet: { value: "Informe o raio e clique as duas linhas (ou a esquina)." },
    chamfer: { value: "Informe a distância e clique as duas linhas." },
    array: { value: "Informe colunas, linhas e espaçamento; depois Aplicar." },
    explode: { select: "Selecione o polígono/polilinha e clique Aplicar." },
    join: { select: "Selecione as linhas conectadas e clique Aplicar." },
    split: { value: "Informe em quantas partes e clique Aplicar." },
  };
  return map[tool]?.[phase] ?? "Selecione o objeto e defina os parâmetros.";
}
