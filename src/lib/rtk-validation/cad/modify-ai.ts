import type { CadAiAction, CadAiCommand } from "./ai-command-types";
import { azimuthFromDirection } from "./modify-geometry";

type ModifyPendingLike = {
  action: CadAiAction;
  lote?: string;
  quadra?: string;
  entidade_id?: string;
  entidade_ids?: string[];
  collected: CadAiCommand;
};

function fold(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function num(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function lotRef(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(?:lote\s*)?([a-z]{0,3}-?\d{1,3}|\d{1,3})/i);
  return m?.[1]?.replace(/^0+/, "") ? raw.replace(/^lote\s+/i, "").trim() : raw.trim();
}

const DIR_RE = "(?:para\\s+)?(?:o\\s+)?(leste|oeste|norte|sul|direita|esquerda|cima|baixo|east|west|north|south)";

export function parseModifyFollowUp(text: string): Partial<CadAiCommand> | null {
  const raw = fold(text);
  if (!raw) return null;
  const out: Partial<CadAiCommand> = {};
  const distDir = raw.match(new RegExp(`([\\d.,]+)\\s*(?:m|metros?)?\\s+${DIR_RE}`));
  if (distDir) {
    const d = num(distDir[1]);
    const az = azimuthFromDirection(distDir[2]);
    if (d != null) out.distancia = d;
    if (az != null) out.angulo = az;
  }
  const onlyDist = raw.match(/^([\d.,]+)\s*(?:m|metros?)?$/);
  if (onlyDist && out.distancia == null) {
    const d = num(onlyDist[1]);
    if (d != null) out.distancia = d;
  }
  const onlyDir = raw.match(new RegExp(`^(?:agora\\s+)?${DIR_RE}$`));
  if (onlyDir) {
    const az = azimuthFromDirection(onlyDir[1]);
    if (az != null) out.angulo = az;
  }
  const angle = raw.match(/([\d.,]+)\s*(?:graus|°)/);
  if (angle) {
    const a = num(angle[1]);
    if (a != null) out.angulo = a;
  }
  const factor = raw.match(/(?:escala|fator)\s*([\d.,]+)|([\d.,]+)\s*%|(\d+(?:[.,]\d+)?)\s*vezes/);
  if (factor) {
    if (factor[2]) {
      const p = num(factor[2]);
      if (p != null) out.fator = p > 1.5 ? 1 + p / 100 : p / 100;
    } else {
      const f = num(factor[1] ?? factor[3]);
      if (f != null) out.fator = f;
    }
  }
  const percent = raw.match(/(?:aumente|aumentar).{0,12}?([\d.,]+)\s*%/);
  if (percent) {
    const p = num(percent[1]);
    if (p != null) out.fator = 1 + p / 100;
  }
  const reduce = raw.match(/(?:reduza|reduzir).{0,12}?([\d.,]+)\s*%/);
  if (reduce) {
    const p = num(reduce[1]);
    if (p != null) out.fator = p / 100;
  }
  if (/manter|copia|copiada/.test(raw)) out.manter_original = true;
  if (/sem original|substitu/.test(raw)) out.manter_original = false;
  return Object.keys(out).length ? out : null;
}

export function mergeModifyPending(pending: ModifyPendingLike, follow: Partial<CadAiCommand>): CadAiCommand {
  return {
    ...pending.collected,
    ...follow,
    acao: pending.action,
    lote: follow.lote ?? pending.lote ?? pending.collected.lote,
    quadra: follow.quadra ?? pending.quadra ?? pending.collected.quadra,
    entidade_id: follow.entidade_id ?? pending.entidade_id ?? pending.collected.entidade_id,
    entidade_ids: follow.entidade_ids ?? pending.entidade_ids ?? pending.collected.entidade_ids,
  };
}

export function stillMissing(command: CadAiCommand, missing: string[]): string[] {
  return missing.filter((key) => {
    const value = command[key as keyof CadAiCommand];
    if (key === "distancia") return command.distancia == null && (command.dx == null || command.dy == null);
    if (key === "angulo") return command.angulo == null && (command.dx == null || command.dy == null);
    return value == null || value === "";
  });
}

const WORD_PARTS: Record<string, number> = {
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
};

function isStrongModifyPhrase(raw: string, base: Partial<CadAiCommand>, extra = false): boolean {
  const named = Boolean(base.lote || base.quadra || base.nome);
  const measured = base.distancia != null || base.angulo != null || extra || /%/.test(raw);
  const explicitSel =
    /ess[ae]s?\s+(linha|linhas|polilinha|polilinhas|poligono|lote|lotes|quadra|rua|ruas)|selecionad/.test(raw);
  return named || measured || explicitSel;
}

export function parseModifyNaturalCommand(text: string): CadAiCommand | null {
  const raw = fold(text);
  if (!raw) return null;

  const lot = raw.match(/lote\s+([a-z]?\d{1,3}|[a-z]-\d{1,3})/i);
  const quadra = raw.match(/quadra\s+([a-z0-9]+)/i);
  const ruas = [...raw.matchAll(/rua\s+([a-z0-9]+)/gi)];
  const dist = raw.match(/([\d.,]+)\s*(?:m|metros?)/);
  const ang = raw.match(/([\d.,]+)\s*(?:graus|°)/);
  const dir = raw.match(new RegExp(DIR_RE));
  const pct = raw.match(/([\d.,]+)\s*%/);
  const base: Partial<CadAiCommand> = {
    lote: lot ? lotRef(lot[0]) : undefined,
    quadra: quadra?.[1],
    nome: ruas[0] ? `Rua ${ruas[0][1].toUpperCase()}` : undefined,
    distancia: dist ? num(dist[1]) ?? undefined : undefined,
    angulo: ang ? num(ang[1]) ?? undefined : azimuthFromDirection(dir?.[1] ?? raw) ?? undefined,
    usarSelecao: !lot && !quadra && /essa|este|isso|selecionad/.test(raw),
    entity_type: lot ? "lote" : quadra ? "quadra" : ruas[0] ? "rua" : undefined,
  };

  const hit = (acao: CadAiAction): CadAiCommand =>
    ({ acao, ...base, resposta: text.trim() }) as CadAiCommand;

  const accept = (acao: CadAiAction, extra = false): CadAiCommand | null =>
    isStrongModifyPhrase(raw, base, extra) ? hit(acao) : null;

  if (/explod/.test(raw)) return accept("explodir");
  if (/(?:unir|junte|juntar)\s+(?:essas\s+)?(?:linhas|polilinhas)/.test(raw)) return accept("unir", true);
  if (/divid/.test(raw) && !/loteamento|em lotes|subdivid/.test(raw)) {
    const parts = raw.match(/em\s+(\d+)/);
    const word = raw.match(/em\s+(dois|duas|tres|quatro|cinco|seis|sete|oito)/);
    const cmd = accept("dividir", Boolean(parts || word));
    if (!cmd) return null;
    cmd.partes = parts ? Number(parts[1]) : word ? WORD_PARTS[word[1]] ?? 2 : 2;
    return cmd;
  }
  if (/matriz|array|copie.{0,20}vezes|distribua/.test(raw)) {
    const n = raw.match(/(\d+)\s*(?:vezes|colunas?)/);
    const space = raw.match(/espa[cç]amento\s+(?:de\s+)?([\d.,]+)/);
    const cmd = accept("matriz", Boolean(n || space));
    if (!cmd) return null;
    return {
      ...cmd,
      colunas: n ? Number(n[1]) : 5,
      linhas: 1,
      distancia: space ? num(space[1]) ?? base.distancia : base.distancia,
      dx: space ? num(space[1]) ?? undefined : base.distancia,
    };
  }
  if (/chanfr/.test(raw)) return accept("chanfrar");
  if (/concord|fillet/.test(raw)) {
    const cmd = accept("concordar");
    return cmd ? { ...cmd, raio: base.distancia } : null;
  }
  if (/estend/.test(raw)) {
    const cmd = accept("estender");
    if (!cmd) return null;
    if (ruas[1]) cmd.entidade_corte = `Rua ${ruas[1][1].toUpperCase()}`;
    return cmd;
  }
  if (/apar/.test(raw)) {
    const cmd = accept("aparar");
    if (!cmd) return null;
    if (quadra?.[1]) cmd.entidade_corte = quadra[1];
    return cmd;
  }
  if (/\boffset\b|linha paralela|paralela a/.test(raw)) return accept("deslocar");
  if (/escal|aumente.{0,20}%|reduz.{0,20}%/.test(raw)) {
    const pctUp = raw.match(/aumente.{0,16}([\d.,]+)\s*%/);
    const pctDn = raw.match(/reduz.{0,16}([\d.,]+)\s*%/);
    const cmd = accept("escala", Boolean(pct || pctUp || pctDn));
    if (!cmd) return null;
    const fator = pctUp
      ? 1 + (num(pctUp[1]) ?? 0) / 100
      : pctDn
        ? (num(pctDn[1]) ?? 80) / 100
        : pct
          ? 1 + (num(pct[1]) ?? 0) / 100
          : base.distancia;
    return { ...cmd, fator: typeof fator === "number" ? fator : undefined };
  }
  if (/estic/.test(raw)) return accept("esticar");
  if (/espelh/.test(raw)) {
    const cmd = accept("espelhar");
    return cmd ? { ...cmd, manter_original: /copia|copiada|manter/.test(raw) ? true : undefined } : null;
  }
  if (/copi/.test(raw)) return accept("copiar");
  if (/rotacion|gir[ae]/.test(raw)) return accept("rotacionar");
  if (/mov[ae]|desloc/.test(raw)) return accept("mover");
  return null;
}
