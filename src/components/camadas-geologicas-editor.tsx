"use client";

import { useMemo } from "react";
import { PerfilEstratigrafico } from "@/components/perfil-estratigrafico";
import {
  atualizarCamadaGeolCampo,
  camadasGeolToPerfil,
  type CamadaGeol,
  novaCamadaGeolNoFinal,
  removerCamadaGeol,
  selecionarTipoCamadaGeol,
} from "@/lib/camadas-geologicas";
import { TIPOS_ROCHA } from "@/lib/tipos-rocha";

type Props = {
  camadas: CamadaGeol[];
  onChange: (next: CamadaGeol[]) => void;
  onAdicionar?: () => void;
  titulo?: string;
  descricao?: string;
};

export function CamadasGeologicasEditor({
  camadas,
  onChange,
  onAdicionar,
  titulo = "Camadas geológicas (boletim)",
  descricao = "Perfil litológico da sondagem — profundidades De/Até (m), material, descrição e cor para o boletim.",
}: Props) {
  const perfil = useMemo(() => camadasGeolToPerfil(camadas), [camadas]);

  function adicionar() {
    if (onAdicionar) {
      onAdicionar();
      return;
    }
    onChange(novaCamadaGeolNoFinal(camadas));
  }

  return (
    <div className="mb-6 print:hidden">
      <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">{titulo}</h3>
      <p className="mb-2 text-xs text-[var(--muted)]">{descricao}</p>
      <button
        type="button"
        onClick={adicionar}
        className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)]"
      >
        + Camada
      </button>
      {camadas.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--surface)] text-left text-[var(--text)]">
                  <th className="border border-[var(--border)] p-2">De (m)</th>
                  <th className="border border-[var(--border)] p-2">Até (m)</th>
                  <th className="border border-[var(--border)] p-2">Material</th>
                  <th className="border border-[var(--border)] p-2">Descrição</th>
                  <th className="border border-[var(--border)] p-2">Cor</th>
                  <th className="w-10 border border-[var(--border)] p-2" />
                </tr>
              </thead>
              <tbody>
                {camadas.map((row, i) => (
                  <tr key={`camada-${i}`}>
                    <td className="border border-[var(--border)] p-1">
                      <input
                        value={row.de}
                        onChange={(e) =>
                          onChange(
                            atualizarCamadaGeolCampo(camadas, i, "de", e.target.value),
                          )
                        }
                        className="w-full min-w-[4rem] rounded border border-[var(--border)] bg-[var(--card)] p-1"
                      />
                    </td>
                    <td className="border border-[var(--border)] p-1">
                      <input
                        value={row.ate}
                        onChange={(e) =>
                          onChange(
                            atualizarCamadaGeolCampo(camadas, i, "ate", e.target.value),
                          )
                        }
                        className="w-full min-w-[4rem] rounded border border-[var(--border)] bg-[var(--card)] p-1"
                      />
                    </td>
                    <td className="border border-[var(--border)] p-1">
                      <select
                        value={row.tipo}
                        onChange={(e) =>
                          onChange(selecionarTipoCamadaGeol(camadas, i, e.target.value))
                        }
                        className="w-full min-w-[10rem] rounded border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--text)]"
                      >
                        <option value="">Selecionar</option>
                        {TIPOS_ROCHA.map((t) => (
                          <option key={t.nome} value={t.nome}>
                            {t.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-[var(--border)] p-1">
                      <input
                        value={row.descricao}
                        onChange={(e) =>
                          onChange(
                            atualizarCamadaGeolCampo(
                              camadas,
                              i,
                              "descricao",
                              e.target.value,
                            ),
                          )
                        }
                        className="w-full min-w-[10rem] rounded border border-[var(--border)] bg-[var(--card)] p-1"
                      />
                    </td>
                    <td
                      className="h-10 w-12 min-w-[2.5rem] border border-[var(--border)] p-0"
                      style={{ backgroundColor: row.cor }}
                      title={row.tipo || row.cor}
                      aria-label={row.tipo ? `Cor: ${row.tipo}` : "Sem material"}
                    />
                    <td className="border border-[var(--border)] p-1 text-center">
                      <button
                        type="button"
                        aria-label="Remover camada"
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                        onClick={() => onChange(removerCamadaGeol(camadas, i))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 print:hidden">
            <p className="mb-2 text-xs font-medium text-[var(--text)]">
              Pré-visualização — perfil estratigráfico
            </p>
            {perfil.length > 0 ? (
              <PerfilEstratigrafico dados={perfil} />
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Indique profundidades válidas em <strong>De</strong> e{" "}
                <strong>Até</strong> (m) para desenhar a coluna.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
