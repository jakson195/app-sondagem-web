"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  GRUPOS_NOMENCLATURA_LABEL,
  type ComplementosDescricaoSolo,
  type GrupoNomenclatura,
  montarDetalheSolo,
  parseDetalheSolo,
  TIPOS_SOLO_POR_FAMILIA,
  TIPOS_SOLO_PRINCIPAIS,
  termosDoGrupo,
  textoCompletoDescricaoSolo,
} from "@/lib/nomenclatura-geologica-solo";

type Props = {
  tipoPrincipal: string;
  detalhe: string;
  onTipoChange: (tipo: string) => void;
  onDetalheChange: (detalhe: string) => void;
  compact?: boolean;
};

const GRUPOS_COMPLEMENTO: GrupoNomenclatura[] = [
  "origem",
  "granulometria",
  "plasticidade",
  "consistencia",
  "compacidade",
  "cor",
  "umidade",
  "estrutura",
  "inclusoes",
  "alteracao_rocha",
  "classificacao_uscs",
];

function SelectComplemento({
  grupo,
  value,
  onChange,
  id,
}: {
  grupo: GrupoNomenclatura;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const opcoes = termosDoGrupo(grupo);
  return (
    <label className="block text-[10px] text-[var(--muted)]">
      {GRUPOS_NOMENCLATURA_LABEL[grupo]}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-xs text-[var(--text)]"
      >
        <option value="">—</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.termo}>
            {o.termo}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SoloNomenclaturaCampo({
  tipoPrincipal,
  detalhe,
  onTipoChange,
  onDetalheChange,
  compact = false,
}: Props) {
  const baseId = useId();
  const [aberto, setAberto] = useState(!compact);
  const [comp, setComp] = useState<ComplementosDescricaoSolo>(() =>
    parseDetalheSolo(detalhe),
  );

  useEffect(() => {
    setComp(parseDetalheSolo(detalhe));
  }, [detalhe]);

  const preview = useMemo(
    () => textoCompletoDescricaoSolo(tipoPrincipal, detalhe),
    [tipoPrincipal, detalhe],
  );

  function aplicarComplementos(next: ComplementosDescricaoSolo) {
    setComp(next);
    onDetalheChange(montarDetalheSolo(next));
  }

  function patch(partial: Partial<ComplementosDescricaoSolo>) {
    aplicarComplementos({ ...comp, ...partial });
  }

  const toggleInclusao = (termo: string) => {
    const cur = comp.inclusoes ?? [];
    const next = cur.includes(termo)
      ? cur.filter((t) => t !== termo)
      : [...cur, termo];
    patch({ inclusoes: next });
  };

  return (
    <div className="min-w-0 space-y-1.5 text-left">
      <label className="block text-[10px] font-medium text-[var(--muted)]">
        Tipo de solo
        <select
          value={tipoPrincipal}
          onChange={(e) => onTipoChange(e.target.value)}
          className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-xs text-[var(--text)]"
        >
          <option value="">Selecionar…</option>
          {TIPOS_SOLO_POR_FAMILIA.map((fam) => (
            <optgroup key={fam.label} label={fam.label}>
              {fam.tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="text-[10px] font-semibold text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
      >
        {aberto ? "Ocultar nomenclatura" : "Mais opções (granulometria, inclusões…)"}
      </button>

      {compact && !aberto && (
        <label className="block text-[10px] text-[var(--muted)]">
          Detalhe específico
          <input
            type="text"
            value={comp.observacao ?? ""}
            onChange={(e) => patch({ observacao: e.target.value })}
            placeholder="Ex.: presença de resíduos de carvão, odor, água…"
            className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--card)] p-1 text-xs"
            autoComplete="off"
          />
        </label>
      )}

      {aberto && (
        <div
          className="grid gap-2 rounded border border-[var(--border)] bg-[var(--surface)] p-2 sm:grid-cols-2"
          role="region"
          aria-label="Complementos da descrição geológica"
        >
          {GRUPOS_COMPLEMENTO.filter((g) => g !== "inclusoes").map((grupo) => (
            <SelectComplemento
              key={grupo}
              id={`${baseId}-${grupo}`}
              grupo={grupo}
              value={
                grupo === "origem"
                  ? (comp.origem ?? "")
                  : grupo === "granulometria"
                    ? (comp.granulometria ?? "")
                    : grupo === "plasticidade"
                      ? (comp.plasticidade ?? "")
                      : grupo === "consistencia"
                        ? (comp.consistencia ?? "")
                        : grupo === "compacidade"
                          ? (comp.compacidade ?? "")
                          : grupo === "cor"
                            ? (comp.cor ?? "")
                            : grupo === "umidade"
                              ? (comp.umidade ?? "")
                              : grupo === "estrutura"
                                ? (comp.estrutura ?? "")
                                : grupo === "alteracao_rocha"
                                  ? (comp.alteracao ?? "")
                                  : (comp.uscs ?? "")
              }
              onChange={(v) => {
                const map: Record<GrupoNomenclatura, keyof ComplementosDescricaoSolo> =
                  {
                    origem: "origem",
                    granulometria: "granulometria",
                    plasticidade: "plasticidade",
                    consistencia: "consistencia",
                    compacidade: "compacidade",
                    cor: "cor",
                    umidade: "umidade",
                    estrutura: "estrutura",
                    alteracao_rocha: "alteracao",
                    classificacao_uscs: "uscs",
                    tipo_principal: "origem",
                    inclusoes: "inclusoes",
                  };
                patch({ [map[grupo]]: v });
              }}
            />
          ))}

          <div className="sm:col-span-2">
            <span className="block text-[10px] text-[var(--muted)]">Inclusões</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {termosDoGrupo("inclusoes").map((o) => {
                const on = (comp.inclusoes ?? []).includes(o.termo);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggleInclusao(o.termo)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      on
                        ? "border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200"
                        : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
                    }`}
                  >
                    {o.termo}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block text-[10px] text-[var(--muted)] sm:col-span-2">
            Observação livre
            <input
              type="text"
              value={comp.observacao ?? ""}
              onChange={(e) => patch({ observacao: e.target.value })}
              placeholder="Ex.: com odor, presença de água…"
              className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--card)] p-1 text-xs"
              autoComplete="off"
            />
          </label>

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => aplicarComplementos({ inclusoes: [] })}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--card)]"
            >
              Limpar complementos
            </button>
          </div>
        </div>
      )}

      {preview && preview !== "—" && (
        <p
          className="rounded bg-[var(--card)] px-2 py-1 text-[10px] leading-snug text-[var(--text)]"
          title="Pré-visualização no PDF"
        >
          <span className="font-semibold text-[var(--muted)]">PDF: </span>
          {preview.toUpperCase()}
        </p>
      )}

      {!compact && (
        <datalist id={`${baseId}-tipos`}>
          {TIPOS_SOLO_PRINCIPAIS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
    </div>
  );
}
