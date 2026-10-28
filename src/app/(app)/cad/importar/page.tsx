"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCadImportPayload } from "@/lib/rtk-validation/cad/import-from-adjustment";
import type { SurveyPoint } from "@/lib/rtk-validation/types";

// Página-ponte: recebe um link curto (?src=<id>) gerado por um sistema
// externo (ex: o portal do Leitor de Matrícula-Agrim, iamatrix.vercel.app),
// busca os pontos de lá, monta o payload de importação do CAD e redireciona
// para /cad — que já sabe carregar esse payload sozinho ao abrir
// (ver bootstrapProject() em cad-workspace.tsx, via loadCadImportPayload()).
function parsePontosTxt(texto: string): SurveyPoint[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const pontos: SurveyPoint[] = [];
  for (const linha of linhas) {
    const partes = linha.split(",").map((p) => p.trim());
    if (partes.length < 3) continue;
    const [id, eStr, nStr] = partes;
    if (id.toUpperCase() === "ID" && Number.isNaN(Number(eStr))) continue; // pula cabeçalho "ID,E,N"
    const e = Number(eStr);
    const n = Number(nStr);
    if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
    pontos.push({
      id: `ext_${pontos.length}_${id}`,
      code: id,
      name: id,
      e,
      n,
      z: 0,
    });
  }
  return pontos;
}

export default function ImportarNoCadPage() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const src = params.get("src");
    const nome = params.get("name") || "Análise importada";
    const origem = (params.get("origin") || "https://iamatrix.vercel.app").replace(/\/$/, "");

    if (!src) {
      setErro("Link de importação inválido — falta o parâmetro 'src'.");
      return;
    }

    (async () => {
      try {
        const resp = await fetch(`${origem}/api/cad-handoff?id=${encodeURIComponent(src)}`);
        if (!resp.ok) {
          const body = (await resp.json().catch(() => ({}))) as { erro?: string };
          throw new Error(body.erro || `Erro ao buscar dados (status ${resp.status}).`);
        }
        const data = (await resp.json()) as { texto?: string; nome?: string };
        const pontos = parsePontosTxt(data.texto || "");
        if (!pontos.length) {
          throw new Error("Nenhum ponto válido encontrado nos dados recebidos.");
        }

        saveCadImportPayload({
          projectName: data.nome || nome,
          crs: "EPSG:4674",
          surveyPoints: pontos,
          controlPoints: [],
          adjustmentResult: null,
        });

        router.replace("/cad");
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao importar os pontos.");
      }
    })();
  }, [router]);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {erro ? (
        <div style={{ maxWidth: 420, textAlign: "center", color: "#b91c1c" }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Não foi possível importar</p>
          <p style={{ fontSize: 14 }}>{erro}</p>
        </div>
      ) : (
        <p>Importando pontos para o Ambiente CAD…</p>
      )}
    </div>
  );
}
