import { z } from "zod";
import { isCadAiImplementedAction, normalizeCadAiCommand } from "./ai-command-catalog";
import type { CadAiCommand } from "./ai-command-types";

const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().finite().optional(),
);

const optionalString = z.string().trim().min(1).optional();
const optionalStringArray = z.array(z.string().trim().min(1)).optional();
const optionalNumberArray = z.array(z.coerce.number().finite()).optional();

const commandShape = z
  .object({
    acao: z.string().min(1),
    pontos: optionalStringArray,
    entidade_id: optionalString,
    entidade_ids: optionalStringArray,
    intervalo: optionalNumber,
    equidistancia: optionalNumber,
    arquivo: optionalString,
    formato: optionalString,
    texto: optionalString,
    novo_id: optionalString,
    id_origem: optionalString,
    distancia: optionalNumber,
    largura: optionalNumber,
    angulo: optionalNumber,
    x: optionalNumber,
    y: optionalNumber,
    z: optionalNumber,
    conteudo: optionalString,
    csv_conteudo: optionalString,
    resposta: optionalString,
    forcar: z.boolean().optional(),
    usarSelecao: z.boolean().optional(),
    posicao: optionalString,
    largura_via_m: optionalNumber,
    profundidade_quadra_m: optionalNumber,
    testada_minima_m: optionalNumber,
    area_minima_m2: optionalNumber,
    area_minima_quadra_m2: optionalNumber,
    orientacao: optionalNumber,
    prefixo_quadra: optionalString,
    largura_calcada_m: optionalNumber,
    eixo_rua: z.boolean().optional(),
    raio_esquina_m: optionalNumber,
    vias_existentes_extremidades: z.boolean().optional(),
    lados_aresta: optionalNumberArray,
    ferramenta: optionalString,
    camada: optionalString,
    visivel: z.boolean().optional(),
    testada_m: optionalNumber,
    lado: optionalString,
    percentual: optionalNumber,
    percentual_esquina: optionalNumber,
    tipo: optionalString,
    nome: optionalString,
    equidistancia_m: optionalNumber,
    cota_referencia_m: optionalNumber,
  })
  .passthrough();

export interface CadAiValidationFailure {
  index: number;
  acao?: string;
  missing: string[];
  message: string;
}

export type CadAiValidationResult =
  | { ok: true; commands: CadAiCommand[] }
  | { ok: false; message: string; failures: CadAiValidationFailure[] };

function hasSelectionFallback(cmd: CadAiCommand): boolean {
  return cmd.usarSelecao === true;
}

function missingForAction(cmd: CadAiCommand): string[] {
  const missing: string[] = [];
  const pontos = cmd.pontos ?? [];
  const sel = hasSelectionFallback(cmd);

  switch (cmd.acao) {
    case "criar_ponto":
      if (cmd.x == null || !Number.isFinite(cmd.x)) missing.push("x (coordenada E)");
      if (cmd.y == null || !Number.isFinite(cmd.y)) missing.push("y (coordenada N)");
      break;
    case "criar_linha":
    case "medir_distancia":
    case "medir_azimute":
    case "medir_inclinacao":
    case "inserir_cota":
      if (pontos.length < 2 && !sel) missing.push("dois pontos (ex.: P1 e P2)");
      break;
    case "criar_polilinha":
      if (pontos.length < 2 && !sel) missing.push("pelo menos 2 pontos");
      break;
    case "criar_poligono":
      if (pontos.length < 3 && !sel) missing.push("pelo menos 3 pontos (ex.: P1 P2 P3)");
      break;
    case "unir_linhas":
      if ((cmd.entidade_ids?.length ?? 0) < 2 && !sel) missing.push("entidade_ids (duas polilinhas)");
      break;
    case "mover":
    case "copiar":
      if (cmd.distancia == null || !Number.isFinite(cmd.distancia)) missing.push("distancia (metros)");
      if (cmd.angulo == null || !Number.isFinite(cmd.angulo)) missing.push("angulo (azimute em graus)");
      break;
    case "rotacionar":
      if (cmd.angulo == null || !Number.isFinite(cmd.angulo)) missing.push("angulo (graus)");
      break;
    case "alterar_id":
      if (!cmd.id_origem && !pontos[0]) missing.push("id_origem (ponto atual)");
      if (!cmd.novo_id && !cmd.texto && !pontos[1]) missing.push("novo_id");
      break;
    case "alterar_cota":
      if (!cmd.id_origem && !pontos[0] && !sel) missing.push("id_origem (ponto)");
      if (cmd.z == null || !Number.isFinite(cmd.z)) missing.push("z (cota em metros)");
      break;
    case "inserir_texto":
      if (!cmd.texto?.trim()) missing.push("texto");
      break;
    case "selecionar":
      if (!cmd.entidade_id && !sel) missing.push("entidade_id");
      break;
    case "perfil_longitudinal":
      if (pontos.length < 1 && !sel) missing.push("pontos inicial e final");
      break;
    case "gerar_loteamento":
      if (cmd.largura_via_m == null || !Number.isFinite(cmd.largura_via_m) || cmd.largura_via_m <= 0) {
        missing.push("largura_via_m (metros, > 0)");
      }
      if (
        cmd.profundidade_quadra_m == null ||
        !Number.isFinite(cmd.profundidade_quadra_m) ||
        cmd.profundidade_quadra_m <= 0
      ) {
        missing.push("profundidade_quadra_m (metros, > 0)");
      }
      if (cmd.testada_minima_m == null || !Number.isFinite(cmd.testada_minima_m) || cmd.testada_minima_m <= 0) {
        missing.push("testada_minima_m (metros, > 0)");
      }
      if (cmd.area_minima_m2 == null || !Number.isFinite(cmd.area_minima_m2) || cmd.area_minima_m2 <= 0) {
        missing.push("area_minima_m2 (metros quadrados, > 0)");
      }
      break;
    case "ativar_ferramenta":
      if (!cmd.ferramenta?.trim()) missing.push("ferramenta (selecionar, pan, linha, polilinha, editar_poligono, confrontacao)");
      break;
    case "trocar_camada":
      if (!cmd.camada?.trim()) missing.push("camada (nome ou id)");
      break;
    case "subdividir_quadra": {
      const testada = cmd.testada_m ?? cmd.testada_minima_m;
      if (testada == null || !Number.isFinite(testada) || testada <= 0) {
        missing.push("testada_m (metros, > 0)");
      }
      break;
    }
    case "reservar_area":
      if (!cmd.tipo?.trim()) missing.push("tipo (institucional ou reserva_legal)");
      if (cmd.percentual == null || !Number.isFinite(cmd.percentual) || cmd.percentual <= 0 || cmd.percentual >= 100) {
        missing.push("percentual (0–100)");
      }
      break;
    default:
      break;
  }

  return missing;
}

function clarificationMessage(failures: CadAiValidationFailure[]): string {
  const parts = failures.map((f) => {
    const acao = f.acao ? ` na ação "${f.acao}"` : "";
    return `faltou ${f.missing.join(", ")}${acao}`;
  });
  return `Comando incompleto: ${parts.join("; ")}. Repita o comando informando o que falta.`;
}

/** Valida e normaliza CadAiCommand[] (tipos + campos obrigatórios por ação). */
export function validateCadAiCommands(commands: CadAiCommand[]): CadAiValidationResult {
  if (!commands.length) {
    return { ok: false, message: "Nenhuma ação reconhecida. Reformule o comando.", failures: [] };
  }

  const failures: CadAiValidationFailure[] = [];
  const parsed: CadAiCommand[] = [];

  commands.forEach((raw, index) => {
    const result = commandShape.safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0]?.message ?? "tipo inválido";
      failures.push({
        index,
        acao: raw.acao,
        missing: [issue],
        message: issue,
      });
      return;
    }

    const coerced = normalizeCadAiCommand(result.data as CadAiCommand);

    if (!isCadAiImplementedAction(coerced.acao) && coerced.acao !== "desconhecido") {
      failures.push({
        index,
        acao: coerced.acao,
        missing: [`ação "${coerced.acao}" não existe`],
        message: `A ação "${coerced.acao}" não é suportada.`,
      });
      return;
    }

    if (coerced.acao === "desconhecido") {
      parsed.push(coerced);
      return;
    }

    const missing = missingForAction(coerced);
    if (missing.length) {
      failures.push({
        index,
        acao: coerced.acao,
        missing,
        message: `Faltou ${missing.join(", ")} em "${coerced.acao}".`,
      });
      return;
    }

    parsed.push(coerced);
  });

  if (failures.length) {
    return { ok: false, message: clarificationMessage(failures), failures };
  }

  return { ok: true, commands: parsed };
}
