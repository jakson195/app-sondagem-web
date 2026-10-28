"use client";

import {
  ArrowRightFromLine,
  Copy,
  FlipHorizontal2,
  Link2,
  Maximize2,
  Move,
  RotateCw,
  Scissors,
  Spline,
  Split,
  SquareDashed,
  Ungroup,
  UnfoldHorizontal,
  LayoutGrid,
  Pentagon,
} from "lucide-react";
import type { CadModifyTool, ModifySession } from "@/lib/rtk-validation/cad/modify-session";

const TOOLS: Array<{
  id: CadModifyTool;
  label: string;
  shortcut: string;
  tip: string;
  Icon: typeof Move;
}> = [
  { id: "move", label: "Mover", shortcut: "M", tip: "Mover geometria (ponto base → destino)", Icon: Move },
  { id: "rotate", label: "Rotacionar", shortcut: "RO", tip: "Rotacionar em torno de um centro", Icon: RotateCw },
  { id: "copy", label: "Copiar", shortcut: "CO", tip: "Copiar sem alterar o original", Icon: Copy },
  { id: "mirror", label: "Espelhar", shortcut: "MI", tip: "Espelhar em um eixo de dois pontos", Icon: FlipHorizontal2 },
  { id: "stretch", label: "Esticar", shortcut: "S", tip: "Deslocar só os vértices da janela", Icon: UnfoldHorizontal },
  { id: "scale", label: "Escala", shortcut: "SC", tip: "Escalar a partir de um ponto base", Icon: Maximize2 },
  { id: "offset", label: "Deslocar", shortcut: "O", tip: "Gerar paralela (offset)", Icon: SquareDashed },
  { id: "trim", label: "Aparar", shortcut: "TR", tip: "Aparar no limite de outro objeto", Icon: Scissors },
  { id: "extend", label: "Estender", shortcut: "EX", tip: "Prolongar até um limite", Icon: ArrowRightFromLine },
  { id: "fillet", label: "Concordância", shortcut: "F", tip: "Fillet com raio nas esquinas", Icon: Spline },
  { id: "chamfer", label: "Chanfrar", shortcut: "CHA", tip: "Chanfro com uma ou duas distâncias", Icon: Pentagon },
  { id: "array", label: "Matriz", shortcut: "AR", tip: "Matriz retangular ou polar", Icon: LayoutGrid },
  { id: "explode", label: "Explodir", shortcut: "X", tip: "Polígono → linhas", Icon: Ungroup },
  { id: "join", label: "Unir", shortcut: "J", tip: "Unir linhas conectadas", Icon: Link2 },
  { id: "split", label: "Dividir", shortcut: "", tip: "Dividir em partes iguais", Icon: Split },
];

type CadModifyPanelProps = {
  session: ModifySession | null;
  activeTool: CadModifyTool | null;
  onTool: (tool: CadModifyTool) => void;
  onChangeSession: (patch: Partial<ModifySession>) => void;
  onApply: () => void;
  onCancel: () => void;
  canApply: boolean;
};

export function CadModifyPanel({
  session,
  activeTool,
  onTool,
  onChangeSession,
  onApply,
  onCancel,
  canApply,
}: CadModifyPanelProps) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#0f2848]">Modificar</h3>
      <div className="grid grid-cols-3 gap-1">
        {TOOLS.map(({ id, label, shortcut, tip, Icon }) => {
          const active = activeTool === id;
          return (
            <button
              key={id}
              type="button"
              title={`${tip}${shortcut ? ` — ${shortcut}` : ""}`}
              aria-label={`${label}${shortcut ? ` (${shortcut})` : ""}`}
              aria-pressed={active}
              onClick={() => onTool(id)}
              className={`flex flex-col items-center gap-0.5 rounded border px-1 py-1 text-[10px] font-medium ${
                active
                  ? "border-[#0f2848] bg-[#0f2848] text-white"
                  : "border-[#e5e7eb] bg-white text-[#111827] hover:border-[#0f2848]/40 hover:bg-[#f8fafc]"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="w-full truncate text-center">{label}</span>
            </button>
          );
        })}
      </div>

      {session ? (
        <div className="space-y-2 rounded-md border border-[#e5e7eb] bg-[#f9fafb] p-2">
          <p className="text-[11px] text-[#374151]">{session.hint}</p>
          {session.tool === "mirror" ? (
            <label className="flex items-center gap-2 text-[11px] text-[#111827]">
              <input
                type="checkbox"
                checked={session.keepOriginal}
                onChange={(e) => onChangeSession({ keepOriginal: e.target.checked })}
              />
              Manter objeto original?
            </label>
          ) : null}
          {["offset", "fillet", "chamfer", "scale", "rotate", "split"].includes(session.tool) ? (
            <label className="block text-[10px] text-[#6b7280]">
              {session.tool === "scale"
                ? "Fator"
                : session.tool === "rotate"
                  ? "Ângulo (°)"
                  : session.tool === "split"
                    ? "Partes"
                    : session.tool === "fillet"
                      ? "Raio (m)"
                      : "Distância (m)"}
              <input
                type="text"
                inputMode="decimal"
                value={session.value ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  onChangeSession({ value: e.target.value === "" ? null : Number.isFinite(n) ? n : session.value });
                }}
                className="mt-1 w-full rounded border border-[#d1d5db] bg-white px-2 py-1 font-mono text-xs text-[#111827]"
              />
            </label>
          ) : null}
          {session.tool === "chamfer" ? (
            <label className="block text-[10px] text-[#6b7280]">
              Distância 2 (m)
              <input
                type="text"
                inputMode="decimal"
                value={session.value2 ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  onChangeSession({ value2: e.target.value === "" ? null : Number.isFinite(n) ? n : session.value2 });
                }}
                className="mt-1 w-full rounded border border-[#d1d5db] bg-white px-2 py-1 font-mono text-xs text-[#111827]"
              />
            </label>
          ) : null}
          {session.tool === "array" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 text-[10px] text-[#6b7280]">
                Tipo
                <select
                  value={session.arrayKind}
                  onChange={(e) =>
                    onChangeSession({ arrayKind: e.target.value === "polar" ? "polar" : "rectangular" })
                  }
                  className="mt-1 w-full rounded border border-[#d1d5db] bg-white px-2 py-1 text-xs text-[#111827]"
                >
                  <option value="rectangular">Retangular</option>
                  <option value="polar">Polar</option>
                </select>
              </label>
              <label className="text-[10px] text-[#6b7280]">
                Colunas
                <input
                  type="number"
                  min={1}
                  value={session.cols}
                  onChange={(e) => onChangeSession({ cols: Math.max(1, Number(e.target.value) || 1) })}
                  className="mt-1 w-full rounded border border-[#d1d5db] bg-white px-2 py-1 font-mono text-xs text-[#111827]"
                />
              </label>
              <label className="text-[10px] text-[#6b7280]">
                Linhas
                <input
                  type="number"
                  min={1}
                  value={session.rows}
                  onChange={(e) => onChangeSession({ rows: Math.max(1, Number(e.target.value) || 1) })}
                  className="mt-1 w-full rounded border border-[#d1d5db] bg-white px-2 py-1 font-mono text-xs text-[#111827]"
                />
              </label>
              <label className="col-span-2 text-[10px] text-[#6b7280]">
                Espaçamento X (m)
                <input
                  type="text"
                  inputMode="decimal"
                  value={session.value ?? ""}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(",", "."));
                    onChangeSession({ value: Number.isFinite(n) ? n : session.value });
                  }}
                  className="mt-1 w-full rounded border border-[#d1d5db] bg-white px-2 py-1 font-mono text-xs text-[#111827]"
                />
              </label>
              <label className="col-span-2 text-[10px] text-[#6b7280]">
                Espaçamento Y (m)
                <input
                  type="text"
                  inputMode="decimal"
                  value={session.value2 ?? ""}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(",", "."));
                    onChangeSession({ value2: Number.isFinite(n) ? n : session.value2 });
                  }}
                  className="mt-1 w-full rounded border border-[#d1d5db] bg-white px-2 py-1 font-mono text-xs text-[#111827]"
                />
              </label>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canApply}
              onClick={onApply}
              className="flex-1 rounded bg-[#0f2848] px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded border border-[#d1d5db] px-2 py-1.5 text-[11px] font-medium text-[#374151]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
