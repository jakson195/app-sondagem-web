import { normalizeCadAiCommand } from "./ai-command-catalog";
import { executeCadAiCommand } from "./ai-command-executor";
import type {
  CadAiCommand,
  CadAiSideEffect,
  CadCommandExecutionResult,
  CadCommandExecutorMeta,
  CadCommandExecutorOptions,
} from "./ai-command-types";
import type { CadProject } from "./types";

/** Aliases camelCase / legados → ação canônica snake_case. */
const FUNCAO_ALIASES: Record<string, string> = {
  criarPoligono: "criar_poligono",
  criarPolilinha: "criar_polilinha",
  criarLinha: "criar_linha",
  criarPonto: "criar_ponto",
  calcularArea: "medir_area",
  adicionarTexto: "inserir_texto",
  inserirTexto: "inserir_texto",
  medir: "medir",
  medirDistancia: "medir_distancia",
  medirArea: "medir_area",
  medirPerimetro: "medir_perimetro",
  criarCota: "inserir_cota",
  inserirCota: "inserir_cota",
  importarKML: "importar",
  importarKMZ: "importar",
  importarKml: "importar",
  importarKmz: "importar",
  exportarKML: "exportar",
  exportarKMZ: "exportar",
  exportarKml: "exportar",
  exportarKmz: "exportar",
  gerarTIN: "gerar_tin",
  gerarTin: "gerar_tin",
  gerarCurvas: "curvas_nivel",
  gerarMemorial: "memorial_descritivo",
  criarPerfil: "perfil_longitudinal",
  calcularVolume: "volume_corte",
  calcularDeclividade: "mapa_declividade",
  selecionarObjetos: "selecionar",
  identificarPonto: "mostrar_coordenadas",
  ligarPontos: "criar_polilinha",
  numerarVertices: "renumerar_pontos",
  colocarDistancias: "inserir_cota_automatica",
  fecharPoligono: "fechar_poligono",
  removerTIN: "remover_tin",
};

function camelToSnake(value: string): string {
  return value.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function resolveAction(raw: Record<string, unknown>): string {
  const funcao = raw.funcao ?? raw.acao;
  if (typeof funcao !== "string" || !funcao.trim()) return "desconhecido";
  const trimmed = funcao.trim();
  return FUNCAO_ALIASES[trimmed] ?? camelToSnake(trimmed);
}

function rawToCommand(raw: Record<string, unknown>): CadAiCommand {
  const acao = resolveAction(raw) as CadAiCommand["acao"];
  const pontos = Array.isArray(raw.pontos)
    ? raw.pontos.map(String)
    : Array.isArray(raw.points)
      ? raw.points.map(String)
      : undefined;

  const cmd: CadAiCommand = {
    ...(raw as unknown as CadAiCommand),
    acao,
    pontos,
    texto: typeof raw.texto === "string" ? raw.texto : typeof raw.conteudo === "string" ? raw.conteudo : undefined,
    equidistancia:
      typeof raw.equidistancia === "number"
        ? raw.equidistancia
        : typeof raw.intervalo === "number"
          ? raw.intervalo
          : undefined,
    intervalo:
      typeof raw.intervalo === "number"
        ? raw.intervalo
        : typeof raw.equidistancia === "number"
          ? raw.equidistancia
          : undefined,
    arquivo: typeof raw.arquivo === "string" ? raw.arquivo : undefined,
    formato: typeof raw.formato === "string" ? raw.formato : undefined,
    resposta: typeof raw.resposta === "string" ? raw.resposta : undefined,
    usarSelecao: raw.usarSelecao === true,
    posicao: typeof raw.posicao === "string" ? raw.posicao : undefined,
  };

  return normalizeCadAiCommand(cmd);
}

/** Converte resposta da OpenAI (objeto ou string JSON) em lista de comandos CAD. */
export function parseCadAiResponse(raw: string | Record<string, unknown>): CadAiCommand[] {
  let parsed: Record<string, unknown>;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [{ acao: "desconhecido", resposta: "Não foi possível interpretar a resposta da IA." }];
    }
    try {
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return [{ acao: "desconhecido", resposta: "JSON inválido retornado pela IA." }];
    }
  } else {
    parsed = raw;
  }

  const acoesRaw = parsed.acoes ?? parsed.actions ?? parsed.comandos;
  if (Array.isArray(acoesRaw) && acoesRaw.length > 0) {
    return acoesRaw.map((item) =>
      rawToCommand(typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { acao: "desconhecido" }),
    );
  }

  if (typeof parsed.acao === "string" || typeof parsed.funcao === "string") {
    return [rawToCommand(parsed)];
  }

  return [{ acao: "desconhecido", resposta: "Nenhuma ação reconhecida na resposta da IA." }];
}

/** Executa uma sequência de comandos CAD, propagando estado entre eles. */
export function executeCadAiCommandChain(
  initialProject: CadProject,
  commands: CadAiCommand[],
  options: CadCommandExecutorOptions,
): CadCommandExecutionResult & { meta?: CadCommandExecutorMeta } {
  let project = initialProject;
  let selectedId = options.selectedId ?? null;
  let pendingProfileStart = options.pendingProfileStart ?? null;
  const messages: string[] = [];
  const sideEffects: CadAiSideEffect[] = [];

  for (const command of commands) {
    const result = executeCadAiCommand(project, command, {
      ...options,
      selectedId,
      pendingProfileStart,
    });
    project = result.project;
    if (result.selectedId !== undefined) selectedId = result.selectedId;
    if (result.meta?.pendingProfileStart !== undefined) {
      pendingProfileStart = result.meta.pendingProfileStart;
    }
    messages.push(result.message);
    if (result.sideEffects?.length) sideEffects.push(...result.sideEffects);
    if (result.ok === false) {
      return {
        ok: false,
        project,
        selectedId,
        message: messages.join(" · "),
        sideEffects,
        meta: { pendingProfileStart },
      };
    }
  }

  return {
    ok: true,
    project,
    selectedId,
    message: messages.join(" · "),
    sideEffects,
    meta: { pendingProfileStart },
  };
}
