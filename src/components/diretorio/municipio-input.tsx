"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-url";

export type MunicipioOpcao = { codigoIbge: number; nome: string; uf: string };

/** Campo de cidade com autocompletar pela tabela do IBGE. */
export function MunicipioInput({
  value,
  onChange,
  placeholder = "Digite a cidade (ex.: Criciúma)",
  id,
}: {
  value: MunicipioOpcao | null;
  onChange: (m: MunicipioOpcao | null) => void;
  placeholder?: string;
  id?: string;
}) {
  const [texto, setTexto] = useState(value ? `${value.nome}/${value.uf}` : "");
  const [opcoes, setOpcoes] = useState<MunicipioOpcao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const req = useRef(0);

  useEffect(() => {
    setTexto(value ? `${value.nome}/${value.uf}` : "");
  }, [value]);

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2 || (value && q === `${value.nome}/${value.uf}`)) {
      setOpcoes([]);
      return;
    }
    const id = ++req.current;
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(apiUrl(`/api/diretorio/municipios?q=${encodeURIComponent(q)}`), { credentials: "include" });
        const data = (await r.json()) as { municipios?: MunicipioOpcao[] };
        if (req.current === id) {
          setOpcoes(data.municipios ?? []);
          setAtivo(0);
          setAberto(true);
        }
      } catch {
        /* rede: mantém a lista anterior */
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [texto, value]);

  const escolher = (m: MunicipioOpcao) => {
    onChange(m);
    setTexto(`${m.nome}/${m.uf}`);
    setAberto(false);
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={texto}
        placeholder={placeholder}
        onChange={(e) => {
          setTexto(e.target.value);
          if (value) onChange(null);
        }}
        onFocus={() => opcoes.length > 0 && setAberto(true)}
        onBlur={() => window.setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (!aberto || opcoes.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAtivo((a) => Math.min(opcoes.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const m = opcoes[ativo];
            if (m) escolher(m);
          } else if (e.key === "Escape") {
            setAberto(false);
          }
        }}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
      />
      {aberto && opcoes.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
          {opcoes.map((m, i) => (
            <li key={m.codigoIbge}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(m)}
                className={`flex w-full justify-between px-3 py-1.5 text-left text-sm ${
                  i === ativo ? "bg-teal-600/15 text-[var(--text)]" : "text-[var(--text)] hover:bg-teal-600/10"
                }`}
              >
                <span>{m.nome}</span>
                <span className="text-xs text-[var(--muted)]">{m.uf}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
