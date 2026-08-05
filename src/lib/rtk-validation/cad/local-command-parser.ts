import { normalizeCadAiCommand } from "./ai-command-catalog";
import { parsePointReferenceList } from "./ai-point-utils";
import type { CadAiCommand, CadAiProjectContext } from "./ai-command-types";
function norm(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

/** Interpreta comandos comuns em português sem chamar OpenAI. */
export function parseLocalCadCommand(
  text: string,
  context?: CadAiProjectContext,
): CadAiCommand | null {
  const raw = norm(text)
    .replace(/^(?:ia|assistente|chat)[,:\s-]+/i, "")
    .trim();
  const lower = raw.toLowerCase();
  const renamePatterns = [
    /^(?:renomear|alterar\s+(?:id|nome|identifica[cç][aã]o))\s+(?:ponto\s+)?(.+?)\s+(?:para|em|como)\s+(.+)$/i,
  ];
  for (const re of renamePatterns) {
    const m = raw.match(re);
    if (m) {
      return normalizeCadAiCommand({
        acao: "alterar_id",
        id_origem: m[1].trim(),
        novo_id: m[2].trim(),
        resposta: `Renomear ${m[1].trim()} para ${m[2].trim()}.`,
      });
    }
  }

  const cotaPatterns = [
    /^(?:alterar|modificar|mudar)\s+(?:a\s+)?cota\s+(?:do\s+)?(?:ponto\s+)?(.+?)\s+(?:para|em|=)\s*([\d.,]+)\s*m?$/i,
    /^cota\s+(?:do\s+)?(?:ponto\s+)?(.+?)\s+(?:para|em|=)\s*([\d.,]+)\s*m?$/i,
    /^cota\s+(?:do\s+)?(?:ponto\s+)?(.+?)\s+([\d.,]+)\s*m?$/i,
  ];
  for (const re of cotaPatterns) {
    const m = raw.match(re);
    if (m) {
      const z = Number(m[2].replace(",", "."));
      if (Number.isFinite(z)) {
        return normalizeCadAiCommand({
          acao: "alterar_cota",
          id_origem: m[1].trim(),
          z,
          resposta: `Cota de ${m[1].trim()} → ${z} m.`,
        });
      }
    }
  }

  const deletePatterns = [
    /^(?:excluir|apagar|remover|deletar)\s+(?:o\s+)?ponto\s+(.+)$/i,
    /^(?:excluir|apagar|remover|deletar)\s+ponto$/i,
  ];
  for (const re of deletePatterns) {
    const m = raw.match(re);
    if (m) {
      const ref = m[1]?.trim();
      return normalizeCadAiCommand({
        acao: "apagar",
        id_origem: ref,
        entidade_id: ref ? undefined : (context?.selectedEntityId ?? undefined),
        resposta: ref ? `Excluir ponto ${ref}.` : "Excluir ponto selecionado.",
      });
    }
  }

  const distPatterns = [
    /^(?:medir\s+)?dist[aâ]ncia\s+(?:entre\s+)?(.+?)\s+e\s+(.+)$/i,
    /^medir\s+(.+?)\s+e\s+(.+)$/i,
  ];
  for (const re of distPatterns) {
    const m = raw.match(re);
    if (m && !/pol[ií]gono|[aá]rea/i.test(raw)) {
      return normalizeCadAiCommand({
        acao: "medir_distancia",
        pontos: [m[1].trim(), m[2].trim()],
      });
    }
  }

  const cotaMatch = lower.match(/^colocar\s+cota\s+entre\s+(.+?)\s+e\s+(.+)$/i);
  if (cotaMatch) {
    return normalizeCadAiCommand({
      acao: "inserir_cota",
      pontos: [cotaMatch[1].trim(), cotaMatch[2].trim()],
    });
  }

  const coordMatch = lower.match(
    /^(?:inserir|mostrar)\s+coordenadas?\s+(?:do\s+)?(?:ponto\s+)?(.+)$/i,
  );
  if (coordMatch) {
    const refs = coordMatch[1].split(/\s+e\s+|\s*,\s*|\s+/).map((s) => s.trim()).filter(Boolean);
    return normalizeCadAiCommand({
      acao: "inserir_coordenadas",
      pontos: refs.length ? refs : undefined,
    });
  }

  const createPointMatch = raw.match(
    /^(?:inserir|criar)\s+ponto\s+(?:em\s+)?(?:e\s*)?([\d.,\s]+)\s+(?:n\s*)?([\d.,\s]+)(?:\s+(?:z\s*)?([\d.,]+))?/i,
  );
  if (createPointMatch) {
    const x = Number(createPointMatch[1].replace(/\s/g, "").replace(",", "."));
    const y = Number(createPointMatch[2].replace(/\s/g, "").replace(",", "."));
    const zRaw = createPointMatch[3];
    const z = zRaw != null ? Number(zRaw.replace(",", ".")) : 0;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return normalizeCadAiCommand({
        acao: "criar_ponto",
        x,
        y,
        z: Number.isFinite(z) ? z : 0,
        resposta: `Ponto em E ${x}, N ${y}.`,
      });
    }
  }

  const profileMatch = raw.match(
    /^perfil\s+longitudinal\s+(.+?)\s+(?:e|→|a|até|ate)\s+(.+)$/i,
  );
  if (profileMatch) {
    return normalizeCadAiCommand({
      acao: "perfil_longitudinal",
      pontos: [profileMatch[1].trim(), profileMatch[2].trim()],
    });
  }

  const polyMatch =
    lower.match(/^criar\s+pol[ií]gono\s+(?:com\s+(?:os\s+)?pontos?\s+)?(.+)$/i) ??
    lower.match(/^criar\s+pol[ií]gono\s+(.+)$/i);
  if (polyMatch) {
    const pontos = parsePointReferenceList(polyMatch[1]);
    if (pontos.length >= 3) {
      return normalizeCadAiCommand({
        acao: "criar_poligono",
        pontos,
        resposta: `Polígono fechado: ${pontos.join(" → ")}.`,
      });
    }
  }

  const polyLineMatch = lower.match(/^criar\s+pol[ií]linha\s+(.+)$/i);
  if (polyLineMatch) {
    const pontos = parsePointReferenceList(polyLineMatch[1]);
    if (pontos.length >= 2) {
      return normalizeCadAiCommand({
        acao: "criar_polilinha",
        pontos,
        resposta: `Polilinha: ${pontos.join(" → ")}.`,
      });
    }
  }

  const lineMatch = lower.match(/^criar\s+linha\s+(?:do|de)\s+(.+?)\s+(?:ao|a|até|ate)\s+(.+)$/i);
  if (lineMatch) {
    return normalizeCadAiCommand({
      acao: "criar_linha",
      pontos: [lineMatch[1].trim(), lineMatch[2].trim()],
      resposta: `Linha de ${lineMatch[1].trim()} a ${lineMatch[2].trim()}.`,
    });
  }
  if (/^(?:gerar|criar)\s+(?:mapa\s+)?hipsom[eé]trico$/i.test(lower) || lower === "mapa hipsométrico") {
    return normalizeCadAiCommand({ acao: "mapa_hipsometrico" });
  }
  if (/^(?:gerar|criar)\s+(?:a\s+)?triangula[cç][aã]o$/i.test(lower) || lower === "triangulação" || lower === "gerar tin") {
    return normalizeCadAiCommand({ acao: "gerar_tin" });
  }
  if (/^(?:remover|desativar|desabilitar)\s+(?:a\s+)?triangula[cç][aã]o$/i.test(lower) || lower === "desativar tin") {
    return normalizeCadAiCommand({ acao: "remover_tin" });
  }

  const contourMatch = lower.match(/curvas?\s+(?:de\s+)?([\d.,]+)\s*m/i);
  if (contourMatch) {
    const interval = Number(contourMatch[1].replace(",", "."));
    if (Number.isFinite(interval) && interval > 0) {
      return normalizeCadAiCommand({ acao: "curvas_nivel", intervalo: interval, equidistancia: interval });
    }
  }

  if (/^(?:calcular|medir)\s+[aá]rea$/i.test(lower)) {
    return normalizeCadAiCommand({ acao: "medir_area", entidade_id: context?.selectedEntityId ?? undefined });
  }

  if (/^importar/i.test(lower)) {
    return normalizeCadAiCommand({ acao: "importar", resposta: "Importar arquivo anexado." });
  }

  if (/^renumerar\s+pontos?$/i.test(lower)) {
    return normalizeCadAiCommand({ acao: "renumerar_pontos" });
  }

  if (/^fechar\s+pol[ií]gono$/i.test(lower)) {
    return normalizeCadAiCommand({
      acao: "fechar_poligono",
      entidade_id: context?.selectedEntityId ?? undefined,
    });
  }

  if (/^(?:gerar\s+)?memorial\s+descritivo$/i.test(lower)) {
    return normalizeCadAiCommand({
      acao: "memorial_descritivo",
      entidade_id: context?.selectedEntityId ?? undefined,
    });
  }

  if (/^ligar\s+(?:todos\s+)?(?:os\s+)?pontos?$/i.test(lower) && context?.pontos?.length) {
    return normalizeCadAiCommand({
      acao: "criar_polilinha",
      pontos: context.pontos,
      resposta: `Polilinha ligando ${context.pontos.length} pontos.`,
    });
  }

  if (/^(?:numere|numerar)\s+(?:os\s+)?v[eé]rtices?$/i.test(lower)) {
    return normalizeCadAiCommand({ acao: "renumerar_pontos" });
  }

  if (/^coloque?\s+(?:as\s+)?dist[aâ]ncias?$/i.test(lower)) {
    return normalizeCadAiCommand({
      acao: "inserir_cota_automatica",
      entidade_id: context?.selectedEntityId ?? undefined,
    });
  }

  if (/^exportar\s+(?:para\s+)?kml$/i.test(lower)) {
    return normalizeCadAiCommand({ acao: "exportar", formato: "kml" });
  }

  if (/^exportar\s+(?:para\s+)?kmz$/i.test(lower)) {
    return normalizeCadAiCommand({ acao: "exportar", formato: "kmz" });
  }

  return null;
}

/** Interpreta sequências locais separadas por vírgula ou " e " entre verbos CAD. */
export function parseLocalCadCommandChain(
  text: string,
  context?: CadAiProjectContext,
): CadAiCommand[] | null {
  const single = parseLocalCadCommand(text, context);
  if (single) return [single];

  const parts = text
    .split(/\s*,\s*(?=(?:import|export|ger|cri|calc|coloc|num|lig|med|faç|faz|mostr|exclu|remov|triang|curv|memor|perfil))/i)
    .flatMap((chunk) => chunk.split(/\s+e\s+(?=(?:import|export|ger|cri|calc|coloc|num|lig|med|faç|faz|mostr|exclu|remov|triang|curv|memor|perfil))/i))
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) return null;

  const commands: CadAiCommand[] = [];
  for (const part of parts) {
    const cmd = parseLocalCadCommand(part, context);
    if (!cmd) return null;
    commands.push(cmd);
  }
  return commands;
}
