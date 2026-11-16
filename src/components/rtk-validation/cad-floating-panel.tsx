"use client";

import { GripHorizontal, Maximize2, PanelBottom, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Janela que pode ficar encaixada embaixo do desenho ou solta sobre ele (arrastar pela barra
 * do título e redimensionar pelo canto). Posição, tamanho e modo ficam salvos por painel.
 */
export type PainelModo = "solto" | "encaixado";
type Caixa = { x: number; y: number; w: number; h: number };

const MIN_W = 320;
const MIN_H = 160;

function lerSalvo(id: string): { modo: PainelModo; caixa: Caixa | null } {
  try {
    const raw = window.localStorage.getItem(`datageo.painel.${id}`);
    if (!raw) return { modo: "solto", caixa: null };
    const j = JSON.parse(raw) as { modo?: PainelModo; caixa?: Caixa };
    return { modo: j.modo === "encaixado" ? "encaixado" : "solto", caixa: j.caixa ?? null };
  } catch {
    return { modo: "solto", caixa: null };
  }
}

function dentroDaTela(c: Caixa): Caixa {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(c.w, MIN_W), vw - 16);
  const h = Math.min(Math.max(c.h, MIN_H), vh - 16);
  return {
    w,
    h,
    x: Math.min(Math.max(8, c.x), vw - Math.min(w, 120)),
    y: Math.min(Math.max(8, c.y), vh - 40),
  };
}

export function CadFloatingPanel({
  id,
  title,
  onClose,
  padrao,
  children,
}: {
  id: string;
  title: string;
  onClose?: () => void;
  /** Caixa inicial quando solto (px). Sem ela, metade inferior direita da tela. */
  padrao?: Partial<Caixa>;
  children: (modo: PainelModo) => ReactNode;
}) {
  const [modo, setModo] = useState<PainelModo>("solto");
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const arrasto = useRef<{ tipo: "mover" | "tamanho"; px: number; py: number; inicio: Caixa } | null>(null);

  useEffect(() => {
    const s = lerSalvo(id);
    setModo(s.modo);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const base: Caixa = {
      w: padrao?.w ?? Math.min(980, vw * 0.62),
      h: padrao?.h ?? Math.min(440, vh * 0.45),
      x: padrao?.x ?? vw - Math.min(980, vw * 0.62) - 24,
      y: padrao?.y ?? vh - Math.min(440, vh * 0.45) - 24,
    };
    setCaixa(dentroDaTela(s.caixa ?? base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const salvar = useCallback(
    (m: PainelModo, c: Caixa | null) => {
      try {
        window.localStorage.setItem(`datageo.painel.${id}`, JSON.stringify({ modo: m, caixa: c }));
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    },
    [id],
  );

  const iniciar = (tipo: "mover" | "tamanho") => (e: React.PointerEvent) => {
    if (!caixa || modo !== "solto") return;
    if (tipo === "mover" && (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arrasto.current = { tipo, px: e.clientX, py: e.clientY, inicio: caixa };
  };
  const mover = (e: React.PointerEvent) => {
    const a = arrasto.current;
    if (!a) return;
    const dx = e.clientX - a.px;
    const dy = e.clientY - a.py;
    setCaixa(
      dentroDaTela(
        a.tipo === "mover"
          ? { ...a.inicio, x: a.inicio.x + dx, y: a.inicio.y + dy }
          : { ...a.inicio, w: a.inicio.w + dx, h: a.inicio.h + dy },
      ),
    );
  };
  const soltar = () => {
    if (!arrasto.current) return;
    arrasto.current = null;
    salvar(modo, caixa);
  };
  const trocarModo = () => {
    const m: PainelModo = modo === "solto" ? "encaixado" : "solto";
    setModo(m);
    salvar(m, caixa);
  };

  const cabecalho = (
    <div
      onPointerDown={iniciar("mover")}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      className={`flex shrink-0 select-none items-center gap-2 border-b border-[#e5e7eb] bg-[#0f2848] px-2 py-1 text-white ${
        modo === "solto" ? "cursor-move rounded-t-xl" : "rounded-t-lg"
      }`}
    >
      {modo === "solto" ? <GripHorizontal className="h-4 w-4 opacity-70" aria-hidden /> : null}
      <p className="min-w-0 flex-1 truncate text-[11px] font-semibold">{title}</p>
      <button
        type="button"
        onClick={trocarModo}
        title={modo === "solto" ? "Encaixar embaixo do desenho" : "Soltar para mover"}
        aria-label={modo === "solto" ? "Encaixar embaixo do desenho" : "Soltar para mover"}
        className="rounded p-1 hover:bg-white/15"
      >
        {modo === "solto" ? <PanelBottom className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
      {onClose ? (
        <button type="button" onClick={onClose} title="Fechar" aria-label="Fechar" className="rounded p-1 hover:bg-white/15">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );

  if (modo === "encaixado" || !caixa) {
    return (
      <div className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
        {cabecalho}
        {children("encaixado")}
      </div>
    );
  }
  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed z-[85] flex flex-col overflow-hidden rounded-xl border border-[#cbd5e1] bg-white shadow-2xl"
      style={{ left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h }}
    >
      {cabecalho}
      <div className="min-h-0 flex-1 overflow-auto">{children("solto")}</div>
      <div
        onPointerDown={iniciar("tamanho")}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        title="Arraste para mudar o tamanho"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        style={{ background: "linear-gradient(135deg, transparent 50%, #94a3b8 50%)" }}
      />
    </div>
  );
}
