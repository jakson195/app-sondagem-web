import * as XLSX from "xlsx";
import {
  checkDrainageHydraulics,
  classifyDrainageFlowDepthRatio,
  DEFAULT_DRAINAGE_PARAMS,
  DRAINAGE_LAMINA_RELATIVA_MAX,
  DRAINAGE_VELOCITY_MAX_MS,
  DRAINAGE_VELOCITY_MIN_MS,
  isDrainagePipeEntity,
  isDrainagePvEntity,
  listDrainagePipes,
  listDrainagePvs,
  rationalRunoffLps,
  updateDrainagePipe,
  type DrainageParams,
} from "./loteamento-drainage";
import type {
  CadDrainageKind,
  CadDrainageStatus,
  CadEntity,
  CadPointEntity,
  CadPolylineEntity,
  CadProject,
} from "./types";

/**
 * Cabeçalhos 1:1 da planilha C3DRENGS "REDE E.xlsx"
 * (folha "Planilha de cálculo  REDE  E").
 */
export const DRAINAGE_CALC_SHEET_HEADERS = [
  "Segmento",
  "Descrição",
  "Número de regras violadas",
  "Cota do fundo da estrutura de jusante",
  "Cota de topo da estrutura de jusante",
  "Recobrimento mecânico",
  "Recobrimento manual",
  "Escavação mecânica",
  "Escavação manual",
  "Superfície de referência do tubo",
  "Largura do fundo da vala",
  "Extensão",
  "Velocidade real de escoamento",
  "Lâmina real escoando no tubo",
  "Vazão escoando",
  "Cota de terreno à jusante",
  "Cobrimento máximo acima do tubo",
  "Cobrimento mínimo acima do tubo",
  "Cota de terreno à montante",
  "Cota da geratriz interna inferior do tubo à montante",
  "Cota da geratriz interna inferior do tubo à jusante",
  "Degrau",
  "Resalto de saída da estrutura",
  "Seção do tubo",
  "Declividade do tubo",
  "Profundidade da geratriz de montante do tubo",
  "Profundidade da geratriz de jusante  do tubo",
  "Tubo existente",
  "Superfície de referência da estrutura de montante",
  "Tipo de estrutura à montante",
  "Altura do corpo da estrutura, sem o cone ou pescoço",
  "Profundidade da estrutura de montante",
  "Cota do fundo da estrutura à montante",
  "Cota de topo da estrutura de montante",
  "Declividade média de todos os talvegues",
  "Vazão que entra na estrutura",
  "Desnivel do talvegue",
  "Comprimento do talvelgue",
  "Declividade média do talvegue",
  "Tempo de concentração",
  "Velocidade à seção plena",
  "Vazão à seção plena",
  "Altura hidráulica",
  "Nível d'água",
] as const;

/**
 * Cabeçalhos da planilha "REDE E REV ESCAVACAO.xlsx" (folha Planilha1),
 * sem as quebras de linha internas do export original.
 */
export const DRAINAGE_EXCAVATION_SHEET_HEADERS = [
  "NOME",
  "TUBO",
  "EXT",
  "BERCO",
  "VALA",
  "TALVALA",
  "EMEC",
  "EMAN",
  "RMEC",
  "RMAN",
  "ESCORA",
  "EST",
  "PROF",
  "CT",
  "Cota do fundo",
  "AREACORTE",
  "AREABERCO",
  "AREAHTUBO",
  "AREATUBO",
  "AREAREATERRO",
  "COMPESCORA",
  "DIST",
  "OFFSETESQ",
  "COTAOFFSETESQ",
  "BORDOESQ",
  "COTABORDOESQ",
  "OFFSETDIR",
  "COTAOFFSETDIR",
  "BORDODIR",
  "COTABORDODIR",
] as const;

export type DrainageCalcSheetHeader = (typeof DRAINAGE_CALC_SHEET_HEADERS)[number];
export type DrainageExcavationSheetHeader = (typeof DRAINAGE_EXCAVATION_SHEET_HEADERS)[number];

export type DrainageCalcFailKey =
  | "yd_extrapolando"
  | "yd_cheio"
  | "q_capacity"
  | "v_min"
  | "v_max"
  | "slope_min";

export type DrainageCalcUiColumn =
  | "segmento"
  | "pvexist"
  | "cr"
  | "ctm"
  | "refalin"
  | "i"
  | "tcmax"
  | "decmedtal"
  | "scxa"
  | "qesc"
  | "qsp"
  | "vesc"
  | "lamina"
  | "declividade"
  | "dn"
  | "extensao"
  | "rules";

export type DrainageCalcFailFlag = {
  key: DrainageCalcFailKey;
  column: DrainageCalcUiColumn;
  message: string;
};

/** Códigos C3DRENGS visíveis na grade (screenshot Planilha de cálculo). */
export const DRAINAGE_PLANILHA_UI_COLUMNS: Array<{
  key: DrainageCalcUiColumn;
  code: string;
  header: DrainageCalcSheetHeader | "Status";
  editable?: boolean;
}> = [
  { key: "segmento", code: "TRECHO", header: "Segmento" },
  { key: "pvexist", code: "PVEXIST", header: "Tubo existente", editable: true },
  { key: "cr", code: "CR", header: "Vazão que entra na estrutura", editable: true },
  { key: "ctm", code: "CTM", header: "Cota de terreno à montante" },
  { key: "refalin", code: "REFALIN", header: "Superfície de referência do tubo" },
  { key: "i", code: "I", header: "Tempo de concentração", editable: true },
  { key: "tcmax", code: "TCMAX", header: "Tempo de concentração", editable: true },
  { key: "decmedtal", code: "DECMEDTAL", header: "Declividade média de todos os talvegues" },
  { key: "scxa", code: "SCXA", header: "Extensão", editable: true },
  { key: "qesc", code: "QESC", header: "Vazão escoando" },
  { key: "qsp", code: "QSP", header: "Vazão à seção plena" },
  { key: "vesc", code: "VESC", header: "Velocidade real de escoamento" },
  { key: "lamina", code: "y/D", header: "Lâmina real escoando no tubo" },
  { key: "declividade", code: "i", header: "Declividade do tubo", editable: true },
  { key: "dn", code: "DN", header: "Seção do tubo", editable: true },
  { key: "extensao", code: "L", header: "Extensão" },
  { key: "rules", code: "RULES", header: "Número de regras violadas" },
];

export type DrainageCalcRow = {
  pipeId: string;
  fromPvId: string;
  toPvId: string;
  segmento: string;
  descricao: string;
  regrasVioladas: number;
  cotaFundoJusanteM: number;
  cotaTopoJusanteM: number;
  recobrimentoMecanicoM3: number;
  recobrimentoManualM3: number;
  escavacaoMecanicaM3: number;
  escavacaoManualM3: number;
  superficieRefTubo: string;
  larguraFundoValaM: number;
  extensaoM: number;
  velocidadeRealMs: number;
  laminaReal: number;
  vazaoEscoandoLps: number;
  cotaTerrenoJusanteM: number;
  cobrimentoMaxM: number;
  cobrimentoMinM: number;
  cotaTerrenoMontanteM: number;
  geratrizMontanteM: number;
  geratrizJusanteM: number;
  degrauM: number;
  resaltoM: number;
  secaoTubo: string;
  diameterMm: number;
  declividadeDecimal: number;
  slopePct: number;
  profGeratrizMontanteM: number;
  profGeratrizJusanteM: number;
  tuboExistente: boolean;
  superficieRefMontante: string;
  tipoEstruturaMontante: string;
  alturaCorpoM: number;
  profEstruturaMontanteM: number;
  cotaFundoMontanteM: number;
  cotaTopoMontanteM: number;
  decMedTalDecimal: number;
  vazaoEntraLps: number;
  desnivelTalvegueM: number;
  comprimentoTalvegueM: number;
  decTalDecimal: number;
  tcMin: number;
  velocidadePlenaMs: number;
  vazaoPlenaLps: number;
  alturaHidraulicaM: number;
  nivelAguaM: number;
  runoffC: number;
  intensityMmH: number;
  returnPeriodYears: number;
  contribAreaM2: number;
  contribAreaHa: number;
  status: CadDrainageStatus;
  flowClass: "Parcial" | "Cheio" | "Extrapolando";
  fails: DrainageCalcFailFlag[];
};

export type DrainageBasinParams = {
  AREA: number;
  C: number;
  CATCHMENT: number;
  CXA: number;
  DECTAL: number;
  F: number;
  H: number;
  LT: number;
  QIN: number;
  TC: number;
  I: number;
  TR: number;
  QESC: number;
  VESC: number;
  TCMAX: number;
  QSP: number;
  DEG: number;
  SUMP: number;
  RULES: number;
};

export type DrainageCalcSelection = {
  entityId: string;
  kind: CadDrainageKind | "unknown";
  pipeId: string | null;
  row: DrainageCalcRow | null;
  rows: DrainageCalcRow[];
  basin: DrainageBasinParams | null;
  network: {
    name: string;
    pipeCount: number;
    failCount: number;
  };
  /** Campos pedidos no clique: trecho, I, TC, C, AREA/SCXA, Q, i, DN, L, invert, v, y/D, status. */
  params: {
    trecho: string;
    I: number;
    TC: number;
    C: number;
    AREA: number;
    SCXA: number;
    Q: number;
    slopePct: number;
    DN: number;
    L: number;
    invertInZ: number;
    invertOutZ: number;
    velocityMs: number;
    yOverD: number;
    status: CadDrainageStatus;
  } | null;
};

export type DrainageExcavationRow = {
  pipeId: string;
  NOME: string;
  TUBO: string;
  EXT: number;
  BERCO: number;
  VALA: number;
  TALVALA: string;
  EMEC: number;
  EMAN: number;
  RMEC: number;
  RMAN: number;
  ESCORA: number;
  EST: number;
  PROF: number;
  CT: number;
  cotaFundo: number;
  AREACORTE: number;
  AREABERCO: number;
  AREAHTUBO: number;
  AREATUBO: number;
  AREAREATERRO: number;
  COMPESCORA: number;
  DIST: number;
  OFFSETESQ: number;
  COTAOFFSETESQ: number;
  BORDOESQ: number;
  COTABORDOESQ: number;
  OFFSETDIR: number;
  COTAOFFSETDIR: number;
  BORDODIR: number;
  COTABORDODIR: number;
};

export type DrainageCalcCriteria = {
  minSlopePct: number;
  minVelocityMs: number;
  maxVelocityMs: number;
  laminaMax: number;
};

export const DEFAULT_DRAINAGE_CALC_CRITERIA: DrainageCalcCriteria = {
  minSlopePct: DEFAULT_DRAINAGE_PARAMS.minSlopePct,
  minVelocityMs: DRAINAGE_VELOCITY_MIN_MS,
  maxVelocityMs: DRAINAGE_VELOCITY_MAX_MS,
  laminaMax: DRAINAGE_LAMINA_RELATIVA_MAX,
};

const REF_SURFACE = "TERRAPLENAGEM";
const TRENCH_WIDTH_M = 1;
const TALVEGUE_H_M = 1;
const TALVEGUE_L_M = 10;
const TALVEGUE_SLOPE = 0.1;
const KIRPICH_F = 0.498;

function pvNumericCode(pv: CadPointEntity | undefined, fallback: string): number {
  const raw = pv?.drainage?.code ?? pv?.label ?? fallback;
  const m = String(raw).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Rótulo de trecho na planilha: BL7→PV3, PV1→PV2, BL2→T1. */
export function drainageNodeRef(pv: CadPointEntity | undefined, fallback = "PV0"): string {
  if (!pv) {
    const m = String(fallback).match(/(\d+)/);
    return `PV${m ? Number(m[1]) : 0}`;
  }
  const n = pvNumericCode(pv, "0");
  if (pv.drainage?.kind === "inlet" || pv.layerId === "drenagem_bocas") return `BL${n}`;
  if (pv.drainage?.tap || /^T[-_\s]/i.test(pv.drainage?.code ?? pv.label ?? "")) return `T${n}`;
  return `PV${n}`;
}

function structureLabel(pv: CadPointEntity | undefined): string {
  if (!pv) return "PVQ 1.000 x 1.000 mm";
  if (pv.drainage?.kind === "inlet" || pv.layerId === "drenagem_bocas") return "BL 400 x 800 mm";
  if (pv.drainage?.kind === "outfall" || pv.layerId === "drenagem_emissario") return "Emissário";
  return "PVQ 1.000 x 1.000 mm";
}

function secaoTuboLabel(diameterMm: number): string {
  const wall = diameterMm <= 400 ? 50 : diameterMm <= 600 ? 60 : 80;
  return `BSTC ${diameterMm} x ${wall} mm`;
}

function fmtM(n: number): string {
  return `${n.toFixed(3)} m`;
}

function fmtM3(n: number): string {
  return `${n.toFixed(3)} m³`;
}

function fmtLps(n: number): string {
  return `${n.toFixed(3)} l/s`;
}

function fmtMs(n: number): string {
  return `${n.toFixed(3)} m/s`;
}

function fmtMin(n: number): string {
  return `${n.toFixed(3)} min`;
}

export function drainageCalcFailFlags(
  input: {
    flowDepthRatio: number;
    qContribLps: number;
    qCapacityLps: number;
    velocityMs: number;
    slopePct: number;
  },
  criteria: DrainageCalcCriteria = DEFAULT_DRAINAGE_CALC_CRITERIA,
): DrainageCalcFailFlag[] {
  const fails: DrainageCalcFailFlag[] = [];
  const y = Number.isFinite(input.flowDepthRatio) ? input.flowDepthRatio : 0;
  const q = input.qContribLps;
  const cap = input.qCapacityLps;
  const v = input.velocityMs;
  const i = input.slopePct;

  if (y >= 1) {
    fails.push({
      key: "yd_extrapolando",
      column: "lamina",
      message: "y/D ≥ 1 Extrapolando",
    });
  } else if (y > criteria.laminaMax) {
    fails.push({
      key: "yd_cheio",
      column: "lamina",
      message: "y/D > 0,85 Cheio",
    });
  }
  if (cap > 0 && q > cap + 1e-6) {
    fails.push({
      key: "q_capacity",
      column: "qesc",
      message: "Q > capacidade",
    });
  }
  if (v < criteria.minVelocityMs - 1e-6) {
    fails.push({
      key: "v_min",
      column: "vesc",
      message: `v < ${criteria.minVelocityMs} m/s`,
    });
  } else if (v > criteria.maxVelocityMs + 1e-6) {
    fails.push({
      key: "v_max",
      column: "vesc",
      message: `v > ${criteria.maxVelocityMs} m/s`,
    });
  }
  if (i < criteria.minSlopePct - 1e-6) {
    fails.push({
      key: "slope_min",
      column: "declividade",
      message: `i < ${criteria.minSlopePct} %`,
    });
  }
  return fails;
}

export function drainageRowHasFail(fails: DrainageCalcFailFlag[]): boolean {
  return fails.length > 0;
}

export function drainageEntityHasRedError(
  entity: CadEntity,
  criteria: DrainageCalcCriteria = DEFAULT_DRAINAGE_CALC_CRITERIA,
): boolean {
  if (!isDrainagePipeEntity(entity)) return false;
  const d = entity.drainage;
  return drainageRowHasFail(
    drainageCalcFailFlags(
      {
        flowDepthRatio: d?.flowDepthRatio ?? 0,
        qContribLps: d?.qContribLps ?? 0,
        qCapacityLps: d?.qCapacityLps ?? 0,
        velocityMs: d?.velocityMs ?? 0,
        slopePct: d?.slopePct ?? 0,
      },
      criteria,
    ),
  );
}

function estimateTrench(lengthM: number, diameterMm: number, coverM: number) {
  const d = Math.max(diameterMm, 300) / 1000;
  const prof = Math.max(0.6, coverM + d);
  const vala = Math.max(TRENCH_WIDTH_M, d + 0.6);
  const areaCorte = vala * prof;
  const areaTubo = Math.PI * (d * d) / 4;
  const areaBerco = 0.2;
  const areaHTubo = Math.max(0, areaTubo * 0.85);
  const areaReaterro = Math.max(0, areaCorte - areaBerco - areaHTubo);
  const vol = areaCorte * Math.max(lengthM, 0);
  const emec = vol * 0.75;
  const eman = vol * 0.25;
  const rmec = areaReaterro * Math.max(lengthM, 0) * 0.75;
  const rman = areaReaterro * Math.max(lengthM, 0) * 0.25;
  const escora = 2 * prof * Math.max(lengthM, 0);
  return {
    prof,
    vala,
    areaCorte,
    areaTubo,
    areaBerco,
    areaHTubo,
    areaReaterro,
    emec,
    eman,
    rmec,
    rman,
    escora,
  };
}

function buildRow(
  pipe: CadPolylineEntity,
  from: CadPointEntity | undefined,
  to: CadPointEntity | undefined,
  params: DrainageParams,
  criteria: DrainageCalcCriteria,
): DrainageCalcRow {
  const d = pipe.drainage;
  const lengthM = d?.lengthM ?? 0;
  const diameterMm = d?.diameterMm ?? params.minDiameterMm;
  const slopePct = d?.slopePct ?? 0;
  const invertInZ = d?.invertInZ ?? from?.drainage?.invertZ ?? from?.z ?? 0;
  const invertOutZ = d?.invertOutZ ?? to?.drainage?.invertZ ?? to?.z ?? invertInZ;
  const groundFrom = from?.drainage?.groundZ ?? from?.z ?? invertInZ + params.minCoverM;
  const groundTo = to?.drainage?.groundZ ?? to?.z ?? invertOutZ + params.minCoverM;
  const coverFrom = groundFrom - invertInZ;
  const coverTo = groundTo - invertOutZ;
  const contribAreaHa = d?.contribAreaHa ?? 0;
  const contribAreaM2 = contribAreaHa * 10_000;
  const runoffC = d?.runoffC ?? params.runoffC;
  const intensityMmH = d?.intensityMmH ?? params.intensityMmH;
  const qContribLps = d?.qContribLps ?? rationalRunoffLps(runoffC, intensityMmH, contribAreaHa);
  const qCapacityLps = d?.qCapacityLps ?? 0;
  const velocityMs = d?.velocityMs ?? 0;
  const flowDepthRatio = d?.flowDepthRatio ?? 0;
  const check =
    qCapacityLps > 0
      ? { capacityLps: qCapacityLps, velocityMs, flowDepthRatio, status: d?.status ?? "ok" }
      : checkDrainageHydraulics(qContribLps, diameterMm, slopePct, d?.nManning ?? params.nManning);
  const fails = drainageCalcFailFlags(
    {
      flowDepthRatio: check.flowDepthRatio,
      qContribLps,
      qCapacityLps: check.capacityLps,
      velocityMs: check.velocityMs,
      slopePct,
    },
    criteria,
  );
  const flow = classifyDrainageFlowDepthRatio(check.flowDepthRatio, criteria.laminaMax);
  const yM = check.flowDepthRatio * (diameterMm / 1000);
  const trench = estimateTrench(lengthM, diameterMm, Math.max(coverFrom, coverTo, 0));
  const tipo = structureLabel(from);

  return {
    pipeId: pipe.id,
    fromPvId: d?.fromPvId ?? from?.id ?? "",
    toPvId: d?.toPvId ?? to?.id ?? "",
    segmento: `${drainageNodeRef(from, d?.fromPvId ?? "0")}→${drainageNodeRef(to, d?.toPvId ?? "0")}`,
    descricao: tipo,
    regrasVioladas: fails.length,
    cotaFundoJusanteM: to?.drainage?.invertZ ?? invertOutZ,
    cotaTopoJusanteM: groundTo,
    recobrimentoMecanicoM3: trench.rmec,
    recobrimentoManualM3: trench.rman,
    escavacaoMecanicaM3: trench.emec,
    escavacaoManualM3: trench.eman,
    superficieRefTubo: REF_SURFACE,
    larguraFundoValaM: trench.vala,
    extensaoM: lengthM,
    velocidadeRealMs: check.velocityMs,
    laminaReal: check.flowDepthRatio,
    vazaoEscoandoLps: qContribLps,
    cotaTerrenoJusanteM: groundTo,
    cobrimentoMaxM: Math.max(coverFrom, coverTo),
    cobrimentoMinM: Math.min(coverFrom, coverTo),
    cotaTerrenoMontanteM: groundFrom,
    geratrizMontanteM: invertInZ,
    geratrizJusanteM: invertOutZ,
    degrauM: Math.max(0, (to?.drainage?.invertZ ?? invertOutZ) - invertOutZ),
    resaltoM: 0,
    secaoTubo: secaoTuboLabel(diameterMm),
    diameterMm,
    declividadeDecimal: slopePct / 100,
    slopePct,
    profGeratrizMontanteM: coverFrom,
    profGeratrizJusanteM: coverTo,
    tuboExistente: Boolean(d?.existingPipe),
    superficieRefMontante: REF_SURFACE,
    tipoEstruturaMontante: tipo,
    alturaCorpoM: Math.max(0, coverFrom - 0.3),
    profEstruturaMontanteM: coverFrom,
    cotaFundoMontanteM: from?.drainage?.invertZ ?? invertInZ,
    cotaTopoMontanteM: groundFrom,
    decMedTalDecimal: TALVEGUE_SLOPE,
    vazaoEntraLps: qContribLps,
    desnivelTalvegueM: TALVEGUE_H_M,
    comprimentoTalvegueM: TALVEGUE_L_M,
    decTalDecimal: TALVEGUE_SLOPE,
    tcMin: d?.tcMin ?? 5,
    velocidadePlenaMs: check.velocityMs,
    vazaoPlenaLps: check.capacityLps,
    alturaHidraulicaM: yM,
    nivelAguaM: invertInZ + yM,
    runoffC,
    intensityMmH,
    returnPeriodYears: d?.returnPeriodYears ?? params.returnPeriodYears,
    contribAreaM2,
    contribAreaHa,
    status: check.status,
    flowClass: flow.class,
    fails,
  };
}

export function buildDrainageCalcRows(
  project: CadProject,
  params: Partial<DrainageParams> = {},
): DrainageCalcRow[] {
  const cfg = { ...DEFAULT_DRAINAGE_PARAMS, ...params };
  const criteria: DrainageCalcCriteria = {
    ...DEFAULT_DRAINAGE_CALC_CRITERIA,
    minSlopePct: cfg.minSlopePct,
  };
  const pvs = listDrainagePvs(project);
  const byId = new Map(pvs.map((pv) => [pv.id, pv]));
  return listDrainagePipes(project).map((pipe) =>
    buildRow(pipe, byId.get(pipe.drainage?.fromPvId ?? ""), byId.get(pipe.drainage?.toPvId ?? ""), cfg, criteria),
  );
}

export function buildDrainageBasinParams(row: DrainageCalcRow): DrainageBasinParams {
  return {
    AREA: row.contribAreaM2,
    C: row.runoffC,
    CATCHMENT: 1,
    CXA: row.contribAreaM2 * row.runoffC,
    DECTAL: row.decTalDecimal * 100,
    F: KIRPICH_F,
    H: row.desnivelTalvegueM,
    LT: row.comprimentoTalvegueM,
    QIN: row.vazaoEntraLps,
    TC: row.tcMin,
    I: row.intensityMmH,
    TR: row.returnPeriodYears,
    QESC: row.vazaoEscoandoLps,
    VESC: row.velocidadeRealMs,
    TCMAX: row.tcMin,
    QSP: row.vazaoPlenaLps,
    DEG: row.degrauM,
    SUMP: row.resaltoM,
    RULES: row.regrasVioladas,
  };
}

function pipesForPv(project: CadProject, pvId: string): CadPolylineEntity[] {
  return listDrainagePipes(project).filter(
    (p) => p.drainage?.fromPvId === pvId || p.drainage?.toPvId === pvId,
  );
}

export function selectDrainageCalcParams(
  project: CadProject,
  entityId: string | null | undefined,
  params: Partial<DrainageParams> = {},
): DrainageCalcSelection | null {
  const rows = buildDrainageCalcRows(project, params);
  const network = {
    name: project.name,
    pipeCount: rows.length,
    failCount: rows.filter((r) => drainageRowHasFail(r.fails)).length,
  };
  if (!entityId) {
    return {
      entityId: "",
      kind: "unknown",
      pipeId: rows[0]?.pipeId ?? null,
      row: rows[0] ?? null,
      rows,
      basin: rows[0] ? buildDrainageBasinParams(rows[0]) : null,
      network,
      params: rows[0] ? paramsFromRow(rows[0]) : null,
    };
  }

  const entity = project.entities.find((e) => e.id === entityId);
  if (!entity) return null;

  let pipeId: string | null = null;
  let kind: CadDrainageKind | "unknown" =
    entity.type === "line" ? "unknown" : (entity.drainage?.kind ?? "unknown");

  if (isDrainagePipeEntity(entity)) {
    pipeId = entity.id;
    kind = "pipe";
  } else if (isDrainagePvEntity(entity)) {
    const linked = pipesForPv(project, entity.id);
    const outgoing = linked.find((p) => p.drainage?.fromPvId === entity.id);
    pipeId = (outgoing ?? linked[0])?.id ?? null;
  }

  const row = rows.find((r) => r.pipeId === pipeId) ?? null;
  return {
    entityId,
    kind,
    pipeId,
    row,
    rows,
    basin: row ? buildDrainageBasinParams(row) : null,
    network,
    params: row ? paramsFromRow(row) : null,
  };
}

export function paramsFromRow(row: DrainageCalcRow): NonNullable<DrainageCalcSelection["params"]> {
  return {
    trecho: row.segmento,
    I: row.intensityMmH,
    TC: row.tcMin,
    C: row.runoffC,
    AREA: row.contribAreaM2,
    SCXA: row.contribAreaM2,
    Q: row.vazaoEscoandoLps,
    slopePct: row.slopePct,
    DN: row.diameterMm,
    L: row.extensaoM,
    invertInZ: row.geratrizMontanteM,
    invertOutZ: row.geratrizJusanteM,
    velocityMs: row.velocidadeRealMs,
    yOverD: row.laminaReal,
    status: row.status,
  };
}

export type DrainageCalcEditPatch = {
  slopePct?: number;
  diameterMm?: number;
  invertInZ?: number;
  invertOutZ?: number;
  contribAreaM2?: number;
  runoffC?: number;
  intensityMmH?: number;
  tcMin?: number;
  existingPipe?: boolean;
};

export function applyDrainageCalcEdit(
  project: CadProject,
  pipeId: string,
  patch: DrainageCalcEditPatch,
): CadProject {
  return updateDrainagePipe(project, pipeId, {
    slopePct: patch.slopePct,
    diameterMm: patch.diameterMm,
    invertInZ: patch.invertInZ,
    invertOutZ: patch.invertOutZ,
    contribAreaHa: patch.contribAreaM2 != null ? patch.contribAreaM2 / 10_000 : undefined,
    runoffC: patch.runoffC,
    intensityMmH: patch.intensityMmH,
    tcMin: patch.tcMin,
    existingPipe: patch.existingPipe,
  });
}

export function buildDrainageExcavationRows(
  project: CadProject,
  params: Partial<DrainageParams> = {},
): DrainageExcavationRow[] {
  return buildDrainageCalcRows(project, params).map((row) => {
    const trench = estimateTrench(row.extensaoM, row.diameterMm, row.cobrimentoMaxM);
    const ct = (row.cotaTerrenoMontanteM + row.cotaTerrenoJusanteM) / 2;
    const fundo = (row.geratrizMontanteM + row.geratrizJusanteM) / 2;
    return {
      pipeId: row.pipeId,
      NOME: row.segmento.replace("→", "-").replace("->", "-"),
      TUBO: row.secaoTubo,
      EXT: row.extensaoM,
      BERCO: 0.2,
      VALA: trench.vala,
      TALVALA: "Vertical",
      EMEC: trench.emec,
      EMAN: trench.eman,
      RMEC: trench.rmec,
      RMAN: trench.rman,
      ESCORA: trench.escora,
      EST: 0,
      PROF: trench.prof,
      CT: ct,
      cotaFundo: fundo,
      AREACORTE: trench.areaCorte,
      AREABERCO: trench.areaBerco,
      AREAHTUBO: trench.areaHTubo,
      AREATUBO: trench.areaTubo,
      AREAREATERRO: trench.areaReaterro,
      COMPESCORA: trench.prof * 2,
      DIST: row.extensaoM,
      OFFSETESQ: 0.5,
      COTAOFFSETESQ: ct,
      BORDOESQ: 0.5,
      COTABORDOESQ: fundo,
      OFFSETDIR: 0.5,
      COTAOFFSETDIR: ct,
      BORDODIR: 0.5,
      COTABORDODIR: fundo,
    };
  });
}

export function drainageCalcRowToExportCells(row: DrainageCalcRow): string[] {
  return [
    row.segmento,
    row.descricao,
    String(row.regrasVioladas),
    fmtM(row.cotaFundoJusanteM),
    fmtM(row.cotaTopoJusanteM),
    fmtM3(row.recobrimentoMecanicoM3),
    fmtM3(row.recobrimentoManualM3),
    fmtM3(row.escavacaoMecanicaM3),
    fmtM3(row.escavacaoManualM3),
    row.superficieRefTubo,
    fmtM(row.larguraFundoValaM),
    fmtM(row.extensaoM),
    fmtMs(row.velocidadeRealMs),
    row.laminaReal.toFixed(2),
    fmtLps(row.vazaoEscoandoLps),
    fmtM(row.cotaTerrenoJusanteM),
    fmtM(row.cobrimentoMaxM),
    fmtM(row.cobrimentoMinM),
    fmtM(row.cotaTerrenoMontanteM),
    fmtM(row.geratrizMontanteM),
    fmtM(row.geratrizJusanteM),
    fmtM(row.degrauM),
    fmtM(row.resaltoM),
    row.secaoTubo,
    row.declividadeDecimal.toFixed(2),
    fmtM(row.profGeratrizMontanteM),
    fmtM(row.profGeratrizJusanteM),
    row.tuboExistente ? "TRUE" : "FALSE",
    row.superficieRefMontante,
    row.tipoEstruturaMontante,
    fmtM(row.alturaCorpoM),
    fmtM(row.profEstruturaMontanteM),
    fmtM(row.cotaFundoMontanteM),
    fmtM(row.cotaTopoMontanteM),
    row.decMedTalDecimal.toFixed(2),
    fmtLps(row.vazaoEntraLps),
    fmtM(row.desnivelTalvegueM),
    fmtM(row.comprimentoTalvegueM),
    row.decTalDecimal.toFixed(2),
    fmtMin(row.tcMin),
    fmtMs(row.velocidadePlenaMs),
    fmtLps(row.vazaoPlenaLps),
    fmtM(row.alturaHidraulicaM),
    fmtM(row.nivelAguaM),
  ];
}

export function drainageExcavationRowToExportCells(row: DrainageExcavationRow): Array<string | number> {
  return [
    row.NOME,
    row.TUBO,
    `${row.EXT.toFixed(3)} m`,
    `${row.BERCO.toFixed(3)} m`,
    `${row.VALA.toFixed(3)} m`,
    row.TALVALA,
    `${row.EMEC.toFixed(3)} m³`,
    `${row.EMAN.toFixed(3)} m³`,
    `${row.RMEC.toFixed(3)} m³`,
    `${row.RMAN.toFixed(3)} m³`,
    `${row.ESCORA.toFixed(5)} m²`,
    `${row.EST.toFixed(3)} m`,
    `${row.PROF.toFixed(3)} m`,
    `${row.CT.toFixed(3)} m`,
    `${row.cotaFundo.toFixed(3)} m`,
    `${row.AREACORTE.toFixed(5)} m²`,
    `${row.AREABERCO.toFixed(5)} m²`,
    `${row.AREAHTUBO.toFixed(5)} m²`,
    `${row.AREATUBO.toFixed(5)} m²`,
    `${row.AREAREATERRO.toFixed(5)} m²`,
    `${row.COMPESCORA.toFixed(3)} m`,
    `${row.DIST.toFixed(3)} m`,
    `${row.OFFSETESQ.toFixed(3)} m`,
    `${row.COTAOFFSETESQ.toFixed(3)} m`,
    `${row.BORDOESQ.toFixed(3)} m`,
    `${row.COTABORDOESQ.toFixed(3)} m`,
    `${row.OFFSETDIR.toFixed(3)} m`,
    `${row.COTAOFFSETDIR.toFixed(3)} m`,
    `${row.BORDODIR.toFixed(3)} m`,
    `${row.COTABORDODIR.toFixed(3)} m`,
  ];
}

export function drainageCalcSheetName(project: CadProject): string {
  const base = (project.name || "REDE").replace(/[^\w\- ]+/g, " ").trim() || "REDE";
  return `Planilha de cálculo  ${base}`.slice(0, 31);
}

export function drainageCalcFilename(project: CadProject): string {
  const base = (project.name || "REDE").replace(/[^\w\-]+/g, "_");
  return `${base}_planilha_calculo.xlsx`;
}

export function exportDrainageCalcWorkbook(
  project: CadProject,
  params: Partial<DrainageParams> = {},
): ArrayBuffer {
  const rows = buildDrainageCalcRows(project, params);
  const excavation = buildDrainageExcavationRows(project, params);
  const calcAoA: Array<Array<string | number>> = [
    [...DRAINAGE_CALC_SHEET_HEADERS],
    ...rows.map((row) => drainageCalcRowToExportCells(row)),
  ];
  const escAoA: Array<Array<string | number>> = [
    [...DRAINAGE_EXCAVATION_SHEET_HEADERS],
    ...excavation.map((row) => drainageExcavationRowToExportCells(row)),
  ];
  const wb = XLSX.utils.book_new();
  const wsCalc = XLSX.utils.aoa_to_sheet(calcAoA);
  const wsEsc = XLSX.utils.aoa_to_sheet(escAoA);
  XLSX.utils.book_append_sheet(wb, wsCalc, drainageCalcSheetName(project));
  XLSX.utils.book_append_sheet(wb, wsEsc, "Escavação");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function isDrainageSelectableEntity(entity: CadEntity | null | undefined): boolean {
  if (!entity) return false;
  return isDrainagePipeEntity(entity) || isDrainagePvEntity(entity);
}
