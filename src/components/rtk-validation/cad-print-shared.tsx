"use client";

import { useEffect, useRef, useState } from "react";
import type { MemorialFormDefaults } from "@/lib/rtk-validation/cad";
import {
  type AbntSheetFormat,
  type SheetOrientation,
  sheetDimensionsMm,
} from "@/lib/rtk-validation/cad/abnt-sheet-format";
import type { CadPolylineEntity, CadProject } from "@/lib/rtk-validation/cad/types";

export interface LayoutState {
  logo: string | null;
  empresa: string;
  projeto: string;
  titulo: string;
  proprietario: string;
  local: string;
  arquivo: string;
  conformeNota: string;
  escala: string;
  data: string;
  folha: string;
  totalFolhas: string;
  desenhista: string;
  verificador: string;
  aprovador: string;
  numeroDesenho: string;
  revisao: string;
  formato: AbntSheetFormat;
  orientacao: SheetOrientation;
  /** Exibe convenções de desenho na prancha (barra lateral + área gráfica). */
  showConventions: boolean;
  /** Textos personalizados na área gráfica (rótulos P1, V1, nomes etc.). */
  textOverrides: PrintTextOverrides;
  /** Base cartográfica da planta de localização. */
  locationMapStyle: "satellite" | "street" | "topo";
}

export type PrintTextOverrides = Record<string, string>;

export function buildPrintPointLabelKey(pointId: string) {
  return `point:${pointId}`;
}

export function buildPrintVertexLabelKey(polyId: string, index: number) {
  return `poly:${polyId}:v:${index}`;
}

export function buildPrintPolyNameKey(polyId: string) {
  return `poly:${polyId}:name`;
}

export function resolvePrintLabel(overrides: PrintTextOverrides, key: string, fallback: string) {
  const custom = overrides[key];
  return custom?.trim() ? custom.trim() : fallback;
}

/** Tipografia compartilhada da faixa inferior da prancha (tabelas + legenda ABNT). */
export const PRINT_BOTTOM_STRIP_TYPO = {
  fontFamily: '"Arial", "Helvetica Neue", Helvetica, sans-serif',
  text: "#111827",
  label: "#374151",
  muted: "#6b7280",
  titleSize: "2.35mm",
  labelSize: "1.95mm",
  bodySize: "2.15mm",
  tableSize: "2.05mm",
  smallSize: "1.9mm",
  lineHeight: 1.35,
} as const;

/**
 * Bordas da prancha — usam CSS vars definidas em `.prancha-wrapper`.
 * Na tela, `--print-border-w` / `--print-frame-w` compensam o `scale()` da pré-visualização.
 */
export const PRINT_CELL_BORDER = "var(--print-border-w, 0.25mm) solid #111827";

/** Quadro ABNT (NBR 10068) — espessura nominal via `--print-frame-w`. */
export function printSheetFrameBorder(): string {
  return "var(--print-frame-w, 0.5mm) solid #000";
}

/** Tabela de coordenadas N/E na faixa inferior da prancha. */
export const PRINT_COORD_TABLE_TYPO = {
  headerSize: "2.35mm",
  cellSize: "2.65mm",
  titleSize: "2.55mm",
} as const;

export function sheetDimensions(formato: LayoutState["formato"], orientacao: LayoutState["orientacao"]) {
  return sheetDimensionsMm(formato, orientacao);
}

function todayPtBr() {
  return new Date().toLocaleDateString("pt-BR");
}

export function buildDefaultLayoutState(
  project: CadProject,
  memorialForm: MemorialFormDefaults,
  selectedPolyline?: CadPolylineEntity | null,
): LayoutState {
  const local =
    memorialForm.municipality && memorialForm.state
      ? `${memorialForm.municipality} - ${memorialForm.state}`
      : memorialForm.municipality || memorialForm.state || "";

  return {
    logo: null,
    empresa: memorialForm.lawFirmName || "DATAGEO NTRIP",
    projeto: project.name,
    titulo: selectedPolyline?.name ?? "PLANTA TOPOGRÁFICA GEORREFERENCIADA",
    proprietario: memorialForm.owner || "",
    local,
    arquivo: project.name.replace(/\s+/g, "_").toUpperCase(),
    conformeNota: "CONFORME RETIFICAÇÃO:",
    escala: "1:2000",
    data: todayPtBr(),
    folha: "01",
    totalFolhas: "01",
    desenhista: memorialForm.technicalName,
    verificador: "",
    aprovador: "",
    numeroDesenho: memorialForm.registration ? `MAT. ${memorialForm.registration}` : "",
    revisao: "00",
    formato: "A3",
    orientacao: "paisagem",
    showConventions: true,
    textOverrides: {},
    locationMapStyle: "satellite",
  };
}

type ClickToEditProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  mono?: boolean;
  multiline?: boolean;
  /** Permite quebra de linha na visualização (campos longos da legenda). */
  wrap?: boolean;
};

export function ClickToEdit({
  value,
  onChange,
  className = "",
  placeholder = "—",
  mono = false,
  multiline = false,
  wrap = false,
}: ClickToEditProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const baseStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    minHeight: "1.2em",
    padding: "0 2px",
    fontSize: "inherit",
    fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : "inherit",
    fontWeight: 500,
    color: PRINT_BOTTOM_STRIP_TYPO.text,
    lineHeight: PRINT_BOTTOM_STRIP_TYPO.lineHeight,
    fontVariantNumeric: mono ? "tabular-nums" : undefined,
    background: "transparent",
  };

  if (editing) {
    const common = {
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
      onBlur: () => setEditing(false),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !multiline) setEditing(false);
      },
      className,
      style: { ...baseStyle, border: "1px solid #2563eb", outline: "none", borderRadius: 2 },
    };
    return multiline ? (
      <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} rows={2} {...common} />
    ) : (
      <input ref={inputRef as React.RefObject<HTMLInputElement>} {...common} />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setEditing(true);
      }}
      className={className}
      style={{
        ...baseStyle,
        border: "1px solid transparent",
        cursor: "text",
        whiteSpace: multiline || wrap ? "normal" : "nowrap",
        overflow: multiline || wrap ? "visible" : "hidden",
        textOverflow: multiline || wrap ? "clip" : "ellipsis",
        wordBreak: wrap || multiline ? "break-word" : "normal",
      }}
      title={value || placeholder}
    >
      {value || placeholder}
    </span>
  );
}
