"use client";

import type { CadInsertKind } from "@/lib/rtk-validation/cad/cad-io-kinds";

const HINTS: Record<CadInsertKind, { title: string; hint: string }> = {
  point: { title: "Inserir ponto", hint: "Clique no desenho para criar um ponto na coordenada real (com OSNAP)." },
  line: { title: "Inserir linha", hint: "Clique o início e o fim. Distância e azimute no teclado ou no painel polar." },
  polyline: { title: "Inserir polilinha", hint: "Clique os vértices. Finalize ou feche pelo toolbar." },
  polygon: { title: "Inserir polígono", hint: "Clique os vértices. Com 3 ou mais pontos, feche o polígono." },
  circle: { title: "Inserir círculo", hint: "Clique o centro e um ponto da circunferência." },
  arc: { title: "Inserir arco", hint: "Clique início, um ponto intermediário e o fim." },
  text: { title: "Inserir texto", hint: "Digite o texto e clique a posição no desenho." },
  dimension: { title: "Inserir cota", hint: "Clique os dois pontos da cota." },
  block: { title: "Inserir bloco", hint: "Importe um DWG/DXF para trazer o desenho como referência no projeto." },
  image: { title: "Inserir imagem", hint: "Importe JPG, PNG ou TIFF georreferenciado pela mesma operação de ortofoto." },
};

type CadInsertPanelProps = {
  kind: CadInsertKind;
  text: string;
  onTextChange: (value: string) => void;
  onClose: () => void;
  onPickBlock?: () => void;
  onPickImage?: () => void;
  canClosePolygon?: boolean;
  onClosePolygon?: () => void;
};

export function CadInsertPanel({
  kind,
  text,
  onTextChange,
  onClose,
  onPickBlock,
  onPickImage,
  canClosePolygon,
  onClosePolygon,
}: CadInsertPanelProps) {
  const info = HINTS[kind];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#0f2848]">{info.title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-[10px] font-medium text-[#6b7280] hover:bg-[#f3f4f6]"
        >
          Voltar
        </button>
      </div>
      <p className="text-[10px] text-[#6b7280]">{info.hint}</p>
      {kind === "text" ? (
        <label className="block text-[10px] text-[#6b7280]">
          Texto
          <input
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-1.5 text-xs"
            placeholder="Lote 01"
          />
        </label>
      ) : null}
      {kind === "block" ? (
        <button
          type="button"
          onClick={onPickBlock}
          className="w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white"
        >
          Escolher DWG / DXF
        </button>
      ) : null}
      {kind === "image" ? (
        <button
          type="button"
          onClick={onPickImage}
          className="w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white"
        >
          Escolher imagem
        </button>
      ) : null}
      {kind === "polygon" && canClosePolygon ? (
        <button
          type="button"
          onClick={onClosePolygon}
          className="w-full rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-medium text-white"
        >
          Fechar polígono
        </button>
      ) : null}
    </section>
  );
}
