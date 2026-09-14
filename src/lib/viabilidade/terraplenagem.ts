import { D } from "./money";
import type { ItemCalculo, ProjetoLoteamentoInput, QuantitativoResultado, TerraplenagemVolumes } from "./types";
import { TERRAPLENAGEM_INDISPONIVEL } from "./types";
import type { ViabilidadePremissas } from "./types";

function parseManual(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function resolverTerraplenagem(
  projeto: ProjetoLoteamentoInput,
  premissas: ViabilidadePremissas,
): { volumes: TerraplenagemVolumes | null; aviso: string | null } {
  const corteManual = parseManual(premissas.volumeCorteManualM3);
  const aterroManual = parseManual(premissas.volumeAterroManualM3);
  if (corteManual != null || aterroManual != null) {
    const corte = corteManual ?? 0;
    const aterro = aterroManual ?? 0;
    const balanco = corte - aterro;
    return {
      volumes: {
        volumeCorte: corte,
        volumeAterro: aterro,
        balancoTerraplenagem: balanco,
        volumeBotaFora: balanco > 0 ? balanco : 0,
        volumeEmprestimo: balanco < 0 ? -balanco : 0,
        origem: "ESTIMATIVA",
        confianca: "BAIXA",
      },
      aviso: null,
    };
  }
  if (projeto.terraplenagem) {
    return { volumes: projeto.terraplenagem, aviso: null };
  }
  return { volumes: null, aviso: TERRAPLENAGEM_INDISPONIVEL };
}

export function itensTerraplenagem(volumes: TerraplenagemVolumes | null): {
  itens: ItemCalculo[];
  quantitativos: QuantitativoResultado[];
} {
  if (!volumes) {
    return {
      itens: [],
      quantitativos: [
        {
          categoria: "TERRAPLENAGEM",
          descricao: "Volume de terraplenagem",
          quantidade: D(0),
          unidade: "m³",
          origem: "ESTIMATIVA",
          confianca: "BAIXA",
          observacao: TERRAPLENAGEM_INDISPONIVEL,
        },
      ],
    };
  }

  const rows: Array<{ codigo: string; descricao: string; qty: number }> = [
    { codigo: "TER_CORTE", descricao: "Corte de material", qty: volumes.volumeCorte },
    { codigo: "TER_ATERRO", descricao: "Aterro compactado", qty: volumes.volumeAterro },
    { codigo: "TER_BOTA_FORA", descricao: "Transporte de bota-fora", qty: volumes.volumeBotaFora },
    { codigo: "TER_EMPRESTIMO", descricao: "Material de empréstimo", qty: volumes.volumeEmprestimo },
  ];

  const itens: ItemCalculo[] = [];
  const quantitativos: QuantitativoResultado[] = [];
  for (const row of rows) {
    quantitativos.push({
      categoria: "TERRAPLENAGEM",
      descricao: row.descricao,
      quantidade: D(row.qty),
      unidade: "m³",
      origem: volumes.origem,
      confianca: volumes.confianca,
      observacao: null,
    });
    if (row.qty > 0) {
      itens.push({
        categoria: "TERRAPLENAGEM",
        codigo: row.codigo,
        descricao: row.descricao,
        quantidade: D(row.qty),
        unidade: "m³",
        origemQuantitativo: volumes.origem,
        confianca: volumes.confianca,
        preferirSicro: true,
      });
    }
  }
  return { itens, quantitativos };
}
