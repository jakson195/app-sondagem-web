import type { CadAiCommand, CadAiHistoryMessage, CadAiProjectContext } from "@/lib/rtk-validation/cad/ai-command-types";

function norm(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/metros?\s+quadrados?/gi, "m²")
    .replace(/m2\b/gi, "m²");
}

function parseNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function parseAreaToken(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = parseNumber(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function isQuadraToken(raw: string): boolean {
  return /^[A-Za-z]$|^[A-Za-z]{1,3}\d{0,2}$|^\d{1,2}$/.test(raw.trim());
}

const CONFIRM_RE =
  /^(?:sim|ok|pode|pode\s+aplicar|aplica(?:r)?|confirmo|confirma(?:r)?|feito|vai|pode\s+ser|isso)(?:\s*[.!]?)$/i;
const CANCEL_RE = /^(?:n[aã]o|cancela(?:r)?|desiste|para|n[aã]o\s+aplica)(?:\s*[.!]?)$/i;
const UNDO_RE = /^(?:desfaz(?:er)?|desfaça|undo|voltar|reverte(?:r)?)(?:\s*[.!]?)$/i;

export function isConfirmPhrase(text: string): boolean {
  return CONFIRM_RE.test(norm(text));
}

export function isCancelPhrase(text: string): boolean {
  return CANCEL_RE.test(norm(text));
}

export function isUndoPhrase(text: string): boolean {
  return UNDO_RE.test(norm(text));
}

function extractExceptions(text: string): Array<{ lote: string; area_alvo_m2: number }> {
  const found: Array<{ lote: string; area_alvo_m2: number }> = [];
  const block =
    /((?:[A-Za-z]\s*[-–—]\s*\d{1,3})(?:\s+e\s+[A-Za-z]\s*[-–—]\s*\d{1,3})*)\s+(?:quero\s+)?(?:com|de)\s+([\d]+(?:[.,]\d+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = block.exec(text))) {
    const area = parseAreaToken(match[2]);
    if (!area) continue;
    const refs = match[1].match(/[A-Za-z]\s*[-–—]\s*\d{1,3}/g) ?? [];
    for (const ref of refs) {
      const parsed = ref.match(/([A-Za-z])\s*[-–—]\s*0*(\d{1,3})/);
      if (parsed) found.push({ lote: `${parsed[1].toUpperCase()}-${parsed[2].padStart(2, "0")}`, area_alvo_m2: area });
    }
  }
  const menos = text.match(
    /menos\s+(?:o\s+)?([A-Za-z])\s*[-–—]\s*0*(\d{1,3})\s+(?:que\s+)?(?:quero\s+)?(?:com|de)\s+([\d]+(?:[.,]\d+)?)/i,
  );
  if (menos) {
    const area = parseAreaToken(menos[3]);
    if (area) {
      found.push({
        lote: `${menos[1].toUpperCase()}-${menos[2].padStart(2, "0")}`,
        area_alvo_m2: area,
      });
    }
  }
  return found;
}

function extractPreserveFlags(text: string): Pick<
  CadAiCommand,
  "preservar_ruas" | "preservar_limites" | "minimizar_remanescente"
> {
  const lower = text.toLowerCase();
  return {
    preservar_ruas: /n[aã]o\s+mex[ae].*rua|preserv[ae].*rua|sem\s+mexer\s+na\s+rua/.test(lower) ? true : undefined,
    preservar_limites: /n[aã]o\s+mex[ae].*limit|preserv[ae].*limit/.test(lower) ? true : undefined,
    minimizar_remanescente: /elimin[ae].*remanesc|sem\s+remanesc|minimizar\s+remanesc/.test(lower) ? true : undefined,
  };
}

function extractLotDims(text: string): { testada?: number; profundidade?: number; area?: number } {
  const testada = text.match(/testada(?:\s+m[ií]nima)?\s*(?:de\s+)?([\d]+(?:[.,]\d+)?)/i);
  const prof = text.match(/profundidade\s*(?:de\s+)?([\d]+(?:[.,]\d+)?)/i);
  let front = parseAreaToken(testada?.[1]);
  let depth = parseAreaToken(prof?.[1]);
  if (front == null || depth == null) {
    const pair = text.match(
      /([\d]+(?:[.,]\d+)?)\s*(?:m(?:etros?)?)?\s*(?:x|por|×)\s+([\d]+(?:[.,]\d+)?)/i,
    );
    front ??= parseAreaToken(pair?.[1]);
    depth ??= parseAreaToken(pair?.[2]);
  }
  return {
    testada: front,
    profundidade: depth,
    area: extractArea(text),
  };
}

function dimsToLoteamentoCommand(
  dims: { testada?: number; profundidade?: number; area?: number },
  context?: CadAiProjectContext,
  history?: CadAiHistoryMessage[],
): CadAiCommand[] {
  const testada = dims.testada;
  const profundidade = dims.profundidade;
  const area =
    dims.area ??
    (testada != null && profundidade != null ? Number((testada * profundidade).toFixed(2)) : undefined);
  const askedRebuild = (history ?? []).some((item) =>
    /reprojet|reporjet|refazer|regerar|otimizar|loteamento/i.test(item.content),
  );
  const hasLots =
    (context?.loteamento?.lotes?.length ?? 0) > 0 ||
    (context?.loteamento?.quadras?.length ?? 0) > 0 ||
    askedRebuild;
  const parts = [
    testada != null ? `testada ${testada} m` : null,
    profundidade != null ? `profundidade ${profundidade} m` : null,
    area != null ? `cerca de ${area} m²` : null,
  ].filter(Boolean);
  if (hasLots) {
    return [
      {
        acao: "otimizar_quadra",
        testada_minima_m: testada,
        profundidade_quadra_m: profundidade,
        area_alvo_m2: area,
        preservar_ruas: true,
        preservar_limites: true,
        minimizar_remanescente: true,
        resposta: `Entendi. Vou reprojetar os lotes com ${parts.join(", ")}. Deseja aplicar?`,
      },
    ];
  }
  return [
    {
      acao: "gerar_loteamento",
      testada_minima_m: testada,
      profundidade_quadra_m: profundidade,
      largura_via_m: 12,
      area_minima_m2: area,
      usarSelecao: true,
      resposta: `Entendi. Vou gerar o loteamento com ${parts.join(", ")}. Deseja aplicar?`,
    },
  ];
}

export function parseLoteamentoFollowUp(
  text: string,
  history?: CadAiHistoryMessage[],
  context?: CadAiProjectContext,
): CadAiCommand[] | null {
  const raw = norm(text);
  if (!raw) return null;
  const dims = extractLotDims(raw);
  if (dims.testada == null && dims.profundidade == null && dims.area == null) return null;
  const lastAsk = [...(history ?? [])]
    .reverse()
    .find((item) => item.role === "assistant" && /testada|profundidade|área em m/i.test(item.content));
  const dimsOnly =
    /^(?:testada|profundidade|área|area|lote|lotes|com|de|e|por|x|×|,|\s|\d|[.,]|metros?|m²?)+$/i.test(raw);
  if (!lastAsk && !dimsOnly) return null;
  return dimsToLoteamentoCommand(dims, context, history);
}

function extractArea(text: string): number | undefined {
  const match = text.match(
    /([\d]+(?:[.,]\d+)?)\s*m²|(?:lotes?\s+(?:de|com|em\s+torno\s+de|pr[oó]ximos\s+de|aproximadamente|cerca\s+de)\s+)([\d]+(?:[.,]\d+)?)|(?:aproximadamente|cerca\s+de|em\s+torno\s+de|pr[oó]ximos\s+de)\s+([\d]+(?:[.,]\d+)?)/i,
  );
  return parseAreaToken(match?.[1] ?? match?.[2] ?? match?.[3]);
}

function splitOptimizeClauses(text: string): string[] {
  return text
    .split(/\s*(?:,|\.| e )(?=\s*(?:na\s+(?:quadra\s+)?|quadra\s+))/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractOptimizeClauses(text: string): CadAiCommand[] {
  const commands: CadAiCommand[] = [];
  const flags = extractPreserveFlags(text);
  const globalExceptions = extractExceptions(text);
  const clauseRe = /\b(?:na\s+(?:quadra\s+)?|da\s+(?:quadra\s+)?|quadra\s+)([A-Za-z0-9]+)\b/gi;

  for (const chunk of splitOptimizeClauses(text)) {
    const match =
      clauseRe.exec(chunk) ??
      /\b(?:na\s+(?:quadra\s+)?|da\s+(?:quadra\s+)?|quadra\s+)([A-Za-z0-9]+)\b/i.exec(chunk);
    clauseRe.lastIndex = 0;
    if (!match || !isQuadraToken(match[1])) continue;
    const quadra = match[1].toUpperCase();
    const area = extractArea(chunk) ?? extractArea(text);
    const localExceptions = [
      ...extractExceptions(chunk),
      ...globalExceptions.filter((item) => item.lote.startsWith(`${quadra}-`)),
    ];
    const unique = new Map(localExceptions.map((item) => [item.lote, item]));
    if (area != null || unique.size > 0 || /refaz|otimiz|redimension|redistribu/.test(chunk.toLowerCase())) {
      commands.push({
        acao: "otimizar_quadra",
        quadra,
        area_alvo_m2: area,
        excecoes: unique.size ? [...unique.values()] : undefined,
        preservar_ruas: flags.preservar_ruas ?? true,
        preservar_limites: flags.preservar_limites ?? true,
        minimizar_remanescente: flags.minimizar_remanescente ?? true,
        scope: "quad",
        resposta: area != null ? `Otimizar quadra ${quadra} para cerca de ${area} m².` : `Refazer a quadra ${quadra}.`,
      });
    }
  }

  return commands;
}

function isGlebaLotear(text: string): boolean {
  return /\b(?:lotea|lotear|parcelar|parcela(?:r)?\s+(?:essa\s+)?gleba|divide\s+(?:esse\s+)?terreno)\b/i.test(text);
}

export function isGreetingPhrase(text: string): boolean {
  return /^(?:ol[aá]|oi+|hey|hi|hello|e\s+a[ií]|bom\s+dia|boa\s+tarde|boa\s+noite)(?:\s*[.!?,]?)$/i.test(norm(text));
}

function normalizeLotRefToken(raw: string): string {
  const compact = raw.replace(/\s+/g, "");
  const labeled = compact.match(/^([A-Za-z])[-–—]?0*(\d{1,3})$/);
  if (labeled) return `${labeled[1].toUpperCase()}-${labeled[2].padStart(2, "0")}`;
  return compact.replace(/^0+(\d)/, "$1").padStart(2, "0");
}

function lastLotExceptionFromHistory(
  history?: CadAiHistoryMessage[],
): Array<{ lote: string; area_alvo_m2: number }> {
  for (const item of [...(history ?? [])].reverse()) {
    const match = item.content.match(
      /(?:alter(?:ar|e)|ajust(?:ar|e))\s+(?:o\s+)?lote\s+([A-Za-z0-9-–—]+)\s+(?:para|pra|com|de)\s+([\d]+(?:[.,]\d+)?)/i,
    );
    if (!match) continue;
    const area = parseAreaToken(match[2]);
    if (!area) continue;
    return [{ lote: normalizeLotRefToken(match[1]), area_alvo_m2: area }];
  }
  return [];
}

function parseAreaVerdePercent(text: string): CadAiCommand[] | null {
  const match =
    text.match(
      /(?:mudar|alterar|ajustar|definir|colocar|passar|deixar|reduzir|aumentar)?\s*(?:a\s+)?(?:área|area)\s+(?:verde|de\s+reserva(?:\s+legal)?|reserva\s+legal)\s+(?:para|pra|em|de|=)\s+([\d]+(?:[.,]\d+)?)\s*%?/i,
    ) ?? text.match(/(?:reserva\s+legal|[aá]rea\s+verde)\s+([\d]+(?:[.,]\d+)?)\s*%/i);
  if (!match) return null;
  const percentual = parseAreaToken(match[1]);
  if (percentual == null || percentual >= 100) return null;
  return [
    {
      acao: "reservar_area",
      tipo: "reserva_legal",
      percentual,
      lado: "superior_direita",
      usarSelecao: true,
      resposta: `Entendi. Vou ajustar a área verde para ${percentual}%. Deseja aplicar?`,
    },
  ];
}

function parseGlobalLotSize(text: string, history?: CadAiHistoryMessage[]): CadAiCommand[] | null {
  const demais = text.match(
    /(?:os\s+)?(?:demais|demias)\s+(?:lotes?\s+)?(?:com|para|pra|de)\s+([\d]+(?:[.,]\d+)?)/i,
  );
  const allLots = text.match(
    /(?:ajust(?:ar|e)|alter(?:ar|e)|redimension(?:ar|e)|mudar|colocar|passar)\s+(?:os\s+|todos\s+(?:os\s+)?)?lotes\s+(?:para|pra|com|de|em)\s+([\d]+(?:[.,]\d+)?)/i,
  );
  const area = parseAreaToken(demais?.[1] ?? allLots?.[1]) ?? (demais || allLots ? extractArea(text) : undefined);
  if (area == null || (!demais && !allLots)) return null;
  const excecoes = demais ? lastLotExceptionFromHistory(history) : [];
  return [
    {
      acao: "otimizar_quadra",
      area_alvo_m2: area,
      excecoes: excecoes.length ? excecoes : undefined,
      preservar_ruas: true,
      preservar_limites: true,
      minimizar_remanescente: true,
      scope: "quad",
      resposta: demais
        ? `Entendi. Vou ajustar os demais lotes para cerca de ${area} m². Deseja aplicar?`
        : `Entendi. Vou ajustar os lotes para cerca de ${area} m². Deseja aplicar?`,
    },
  ];
}

/** Parser local de linguagem natural de loteamento (sem OpenAI). */
export function parseLoteamentoAssistantCommand(
  text: string,
  context?: CadAiProjectContext,
  history?: CadAiHistoryMessage[],
): CadAiCommand[] | null {
  const raw = norm(text);
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (isConfirmPhrase(raw)) return [{ acao: "aplicar_alteracao", resposta: "Aplicar a alteração pendente." }];
  if (isUndoPhrase(raw)) return [{ acao: "desfazer_alteracao", resposta: "Desfazer a última alteração." }];
  if (isCancelPhrase(raw)) return [{ acao: "desconhecido", resposta: "Alteração cancelada." }];

  const areaVerde = parseAreaVerdePercent(raw);
  if (areaVerde) return areaVerde;

  const globalLots = parseGlobalLotSize(raw, history);
  if (globalLots) return globalLots;

  if (isGlebaLotear(raw) && !/\bquadra\s+[A-Za-z0-9]+\b/i.test(raw)) {
    return null;
  }

  if (/^(?:analis[ea]|verifique|valide)\s+(?:esse\s+|o\s+)?loteamento/i.test(lower)) {
    return [{ acao: "validar_loteamento", resposta: "Analisar o loteamento." }];
  }

  if (/qual\s+(?:[eé]\s+)?(?:o\s+)?menor\s+lote/.test(lower)) {
    return [{ acao: "consultar_lotes", resposta: "Consultar o menor lote." }];
  }

  const areaQuadra = raw.match(/qual\s+(?:[eé]\s+)?a\s+[aá]rea\s+da\s+quadra\s+([A-Za-z0-9]+)/i);
  if (areaQuadra) {
    return [{ acao: "consultar_quadra", quadra: areaQuadra[1].toUpperCase(), resposta: `Consultar a quadra ${areaQuadra[1].toUpperCase()}.` }];
  }

  const qtd = raw.match(/quantos\s+lotes?\s+(?:existem\s+)?(?:na|da)\s+quadra\s+([A-Za-z0-9]+)/i);
  if (qtd) {
    return [{ acao: "consultar_quadra", quadra: qtd[1].toUpperCase(), resposta: `Consultar lotes da quadra ${qtd[1].toUpperCase()}.` }];
  }

  const abaixo = raw.match(/(?:mostre|lista|liste|exiba)\s+(?:os\s+)?lotes\s+(?:abaixo|menores|com\s+menos)\s+de\s+([\d]+(?:[.,]\d+)?)/i);
  if (abaixo) {
    return [
      {
        acao: "consultar_lotes",
        filtro_area_max_m2: parseAreaToken(abaixo[1]),
        resposta: `Listar lotes abaixo de ${abaixo[1]} m².`,
      },
    ];
  }

  if (/[aá]rea\s+remanesc/.test(lower) && /qual|quanto/.test(lower)) {
    return [{ acao: "calcular_area_remanescente", resposta: "Calcular a área remanescente." }];
  }

  if (/elimin[ae].*[aá]rea\s+remanesc/.test(lower)) {
    return [
      { acao: "calcular_area_remanescente", resposta: "Calcular a área remanescente." },
      {
        acao: "otimizar_quadra",
        minimizar_remanescente: true,
        preservar_ruas: true,
        preservar_limites: true,
        resposta: "Redistribuir lotes para reduzir remanescente.",
      },
    ];
  }

  if (
    /\b(?:lotes?\s+(?:mais\s+)?iguais|mesma\s+[aá]rea|uniformizar\s+(?:as\s+)?[aá]reas?|igualar\s+(?:as\s+)?[aá]reas?|maximizar\s+(?:a\s+)?equidade)\b/.test(
      lower,
    ) &&
    !/\blote\s+\d/i.test(lower)
  ) {
    const quadra = raw.match(/\bquadra\s+([A-Za-z0-9]+)/i)?.[1]?.toUpperCase();
    return [
      {
        acao: "otimizar_quadra",
        quadra,
        objetivo: "maximizar_equidade",
        preservar_ruas: true,
        preservar_limites: true,
        scope: "quad",
        resposta: quadra
          ? `Entendi. Vou redistribuir os lotes da quadra ${quadra} para ficarem com áreas o mais iguais possível. Deseja aplicar?`
          : "Entendi. Vou redistribuir os lotes para ficarem com áreas o mais iguais possível. Deseja aplicar?",
      },
    ];
  }

  if (/lotes?\s+de\s+esquina\s+maior/.test(lower)) {
    const quadra = raw.match(/\bquadra\s+([A-Za-z0-9]+)/i)?.[1]?.toUpperCase();
    return [
      {
        acao: "otimizar_quadra",
        quadra,
        lotes_esquina_maiores: true,
        preservar_ruas: true,
        resposta: "Aumentar lotes de esquina.",
      },
    ];
  }

  if (
    /reproj?etar|reporjetar|regerar|refazer\s+(?:todo\s+)?(?:o\s+)?loteamento|reprojetar\s+todo|reporjetar\s+todo/i.test(
      lower,
    )
  ) {
    const dims = extractLotDims(raw);
    const area =
      dims.area ??
      (dims.testada != null && dims.profundidade != null
        ? Number((dims.testada * dims.profundidade).toFixed(2))
        : undefined);
    const dimParts = [
      dims.testada != null ? `testada ${dims.testada} m` : null,
      dims.profundidade != null ? `profundidade ${dims.profundidade} m` : null,
      area != null ? `cerca de ${area} m²` : null,
    ].filter(Boolean);
    return [
      {
        acao: "otimizar_quadra",
        testada_minima_m: dims.testada,
        profundidade_quadra_m: dims.profundidade,
        area_alvo_m2: area,
        preservar_ruas: true,
        preservar_limites: true,
        minimizar_remanescente: true,
        resposta: dimParts.length
          ? `Entendi. Vou reprojetar os lotes com ${dimParts.join(", ")}. Deseja aplicar?`
          : "Entendi. Vou reprojetar o loteamento nas quadras existentes, sem mexer nas ruas. Deseja aplicar?",
      },
    ];
  }

  const refaz = raw.match(/refaz(?:er)?\s+(?:somente\s+)?(?:a\s+)?quadra\s+([A-Za-z0-9]+)/i);
  if (refaz) {
    return [
      {
        acao: "otimizar_quadra",
        quadra: refaz[1].toUpperCase(),
        preservar_ruas: true,
        preservar_limites: true,
        minimizar_remanescente: true,
        resposta: `Refazer somente a quadra ${refaz[1].toUpperCase()}.`,
      },
    ];
  }

  if (/^n[aã]o\s+mex[ae]\s+(?:na|nas)\s+ruas?/.test(lower) && !/quadra|lote/.test(lower)) {
    return [
      {
        acao: "consultar_projeto",
        preservar_ruas: true,
        resposta: "Ok. Nas próximas alterações vou preservar as ruas.",
      },
    ];
  }

  const lotArea = raw.match(/qual\s+(?:[eé]\s+)?a\s+[aá]rea\s+do\s+lote\s+([A-Za-z0-9-–—]+)/i);
  if (lotArea) {
    return [{ acao: "consultar_lote", lote: lotArea[1], resposta: `Consultar o lote ${lotArea[1]}.` }];
  }

  const ajustarLote = raw.match(
    /(?:alter(?:ar|e)|ajust(?:ar|e)|aument(?:ar|e)|passar|deixar|mudar)\s+(?:o\s+)?lote\s+([A-Za-z0-9-–—]+)\s+(?:para|pra|com|de)\s+([\d]+(?:[.,]\d+)?)\s*m²?/i,
  );
  if (ajustarLote) {
    const area = parseAreaToken(ajustarLote[2]);
    const neighbors = /\b(?:pode ajustar os lotes vizinhos|permitir (?:a )?redistribui|vizinhos?)\b/i.test(raw);
    return [
      {
        acao: "ajustar_lote",
        lote: normalizeLotRefToken(ajustarLote[1]),
        area_alvo_m2: area,
        scope: neighbors ? "local_redistribution" : "single_lot",
        resposta: neighbors
          ? `Entendi. Vou ajustar o lote ${ajustarLote[1]} para ${area} m² e redistribuir apenas os lotes afetados. Deseja aplicar?`
          : `Vou ajustar somente o Lote ${normalizeLotRefToken(ajustarLote[1])} para ${area} m². Deseja aplicar?`,
      },
    ];
  }

  const optimize = extractOptimizeClauses(raw);
  if (optimize.length) return optimize;

  return parseLoteamentoFollowUp(raw, history, context);
}
