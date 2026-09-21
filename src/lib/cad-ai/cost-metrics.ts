export type CadAiCostSnapshot = {
  openAIRequests: number;
  localRequests: number;
  lastRoute: "local" | "openai" | null;
  lastOpenAiCalled: boolean;
  lastContextLevel: number | null;
  lastContextSize: number;
  lastTool: string;
  lastGeometrySent: boolean;
};

const metrics: CadAiCostSnapshot = {
  openAIRequests: 0,
  localRequests: 0,
  lastRoute: null,
  lastOpenAiCalled: false,
  lastContextLevel: null,
  lastContextSize: 0,
  lastTool: "",
  lastGeometrySent: false,
};

export function resetCadAiCostMetrics(): void {
  metrics.openAIRequests = 0;
  metrics.localRequests = 0;
  metrics.lastRoute = null;
  metrics.lastOpenAiCalled = false;
  metrics.lastContextLevel = null;
  metrics.lastContextSize = 0;
  metrics.lastTool = "";
  metrics.lastGeometrySent = false;
}

export function getCadAiCostMetrics(): CadAiCostSnapshot {
  return { ...metrics };
}

export function recordCadAiLocalRoute(tool: string, contextLevel = 0): void {
  metrics.localRequests += 1;
  metrics.lastRoute = "local";
  metrics.lastOpenAiCalled = false;
  metrics.lastContextLevel = contextLevel;
  metrics.lastContextSize = 0;
  metrics.lastTool = tool;
  metrics.lastGeometrySent = false;
  console.info(`[CAD AI] route: local | openaiCalled: false | tool: ${tool || "(nenhuma)"}`);
}

export function recordCadAiOpenAiRoute(input: {
  contextLevel: number;
  contextSize: number;
  tool: string;
  geometrySent: boolean;
}): void {
  metrics.openAIRequests += 1;
  metrics.lastRoute = "openai";
  metrics.lastOpenAiCalled = true;
  metrics.lastContextLevel = input.contextLevel;
  metrics.lastContextSize = input.contextSize;
  metrics.lastTool = input.tool;
  metrics.lastGeometrySent = input.geometrySent;
  console.info(
    `[CAD AI] route: openai | openaiCalled: true | contextLevel: ${input.contextLevel} | contextSize: ${input.contextSize} | tool: ${input.tool || "(nenhuma)"}`,
  );
}
