import { interpretAssistenteIaCommand } from "../src/lib/rtk-validation/cad/openai-assistant.service";
import { hasOpenAIKey, resolveOpenAIModel } from "../src/lib/cad-ai/openai-env";
import type { CadAiProjectContext } from "../src/lib/rtk-validation/cad/ai-command-types";

function context(): CadAiProjectContext {
  return {
    projectName: "Teste live",
    crs: "EPSG:31982",
    sistema: "SIRGAS 2000 / UTM",
    coordenadas: {
      sistema: "SIRGAS 2000 / UTM",
      epsg: "EPSG:31982",
      extensao: { minE: 0, minN: 0, maxE: 100, maxN: 100 },
    },
    selectedEntityId: "pl_1",
    selectedEntitySummary: "Quadra G (selecionada)",
    selectedVertexIndex: null,
    selectedSegmentIndex: null,
    pontos: ["P1", "P2", "P3", "P4"],
    points: [],
    camadas: ["LOTEAMENTO_LOTES"],
    layers: [],
    polygons: [{ id: "pl_1", name: "Quadra G", vertices: 4, closed: true }],
    lines: 0,
    polylines: 1,
    totalEntidades: 5,
    objetosSelecionados: 1,
    selecao: {
      entidadeId: "pl_1",
      tipo: "polyline",
      resumo: "Quadra G",
      pontos: [],
      verticeIndex: null,
      arestaIndex: null,
    },
    terreno: { tin: { ativo: false, arestas: 0, pontos: 0 }, curvasNivel: { ativo: false, quantidade: 0 } },
    elevationPointCount: 0,
    pendingProfileStart: null,
    loteamento: {
      projeto: { nome: "Teste live", unidade: "m / m²", sistemaCoordenadas: "EPSG:31982" },
      quadras: [{ id: "G", area: 4000, quantidadeLotes: 4, areaMedia: 250 }],
      lotes: [{ id: "01", quadra: "G", area: 220, testada: 10, profundidade: 22 }],
      ruas: [{ id: "r1", nome: "Rua A", area: 800 }],
      areasInstitucionais: [],
      areasVerdes: [],
      remanescenteM2: 12,
    },
  };
}

function printResult(label: string, result: Awaited<ReturnType<typeof interpretAssistenteIaCommand>>) {
  const cmd = result.commands[0];
  console.info(`[CAD AI LIVE] ${label}`);
  console.info(`[CAD AI LIVE] source=${result.source}`);
  console.info(`[CAD AI LIVE] tool=${cmd?.acao ?? "(nenhuma)"}`);
  console.info(
    `[CAD AI LIVE] params=${JSON.stringify({
      lote: cmd?.lote,
      area_alvo_m2: cmd?.area_alvo_m2,
      preservar_ruas: cmd?.preservar_ruas,
      tipo: cmd?.tipo,
      percentual: cmd?.percentual,
    })}`,
  );
  console.info(`[CAD AI LIVE] resposta=${result.resposta ?? cmd?.resposta ?? ""}`);
}

async function main() {
  console.info(`[CAD AI LIVE] OpenAI configured: ${hasOpenAIKey()}`);
  console.info(`[CAD AI LIVE] Model: ${resolveOpenAIModel()}`);
  const ctx = context();

  const first = await interpretAssistenteIaCommand({
    command: "alterar lote 01 para 500m²",
    context: ctx,
  });
  printResult("teste 1 — alterar lote 01 para 500m²", first);

  const novel = await interpretAssistenteIaCommand({
    command: "Quero aumentar um pouco o lote 01 sem mexer na rua.",
    context: ctx,
  });
  printResult("teste 2 — frase nova", novel);

  if (novel.source !== "openai") {
    process.exitCode = 2;
    console.error("[CAD AI LIVE] FALHOU: frase nova não veio da OpenAI");
    return;
  }
  if (novel.commands[0]?.acao !== "ajustar_lote") {
    process.exitCode = 2;
    console.error("[CAD AI LIVE] FALHOU: frase nova não virou ajustar_lote");
    return;
  }
  console.info("[CAD AI LIVE] OK: frase nova interpretada pela OpenAI");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[CAD AI LIVE] erro:", message.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]"));
  process.exitCode = 1;
});
