"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FieldCampaignMap } from "@/lib/mapa";
import type { FieldFuroPin } from "@/components/field-campaign-map-types";
import { LabeledInput } from "@/components/labeled-field";
import { RelatorioFotosCampo } from "@/components/relatorio-fotos-campo";
import { SptRelatorioSoilsulPdf } from "@/components/spt-relatorio-soilsul-pdf";
import { aguardarMapaPdfNoDom } from "@/lib/aguardar-mapa-pdf-dom";
import { html2canvasReportOptions } from "@/lib/html2canvas-report-options";
import { CoordenadasUtmFuroPanel } from "@/components/coordenadas-utm-furo-panel";
import { CamadasGeologicasEditor } from "@/components/camadas-geologicas-editor";
import { SoloNomenclaturaCampo } from "@/components/solo-nomenclatura-campo";
import {
  type CamadaGeol,
  novaCamadaGeolNoFinal,
} from "@/lib/camadas-geologicas";
import { utmDeWgs84, wgs84DeUtm } from "@/lib/coordenadas-utm-campo";
import {
  buildSptDadosCampo,
  normalizeSptDadosCampo,
} from "@/lib/spt-dados-campo";
import { corSoloSpt } from "@/lib/spt-solo-cor";
import { wgsPairFromInputs } from "@/lib/spt-map-coords";
import { LS_SPT_LOCAL_DRAFT, LS_SPT_NOME } from "@/lib/sondagem-nome-storage";
import { waitReportImagesLoaded } from "@/lib/wait-report-images";
import { apiUrl } from "@/lib/api-url";
import {
  avancoPadraoParaProfSpt,
  exibirSomaGolpes30cm,
  golpesParaSomas30cmNaLinha,
  golpesSptNum,
  inferNumeroCliquesSptDeContagemLinhas,
  numeroAmostraSpt,
  parProfundidadesSptParaClique,
  profDesdeMetroESuplemento,
  profParaMetroESuplemento,
  formatarProfSptPt,
  round2ProfSpt,
  rowSpanGrupoAmostraSpt,
  somasGolpes30cm,
  temGolpesParaColuna30cm,
} from "@/lib/spt-profundidade-tabela";
import {
  FIELD_GPS_OPTIONS,
  readStoredUserLatLng,
  writeStoredUserLatLng,
} from "@/lib/user-gps-storage";

type MapLngLat = { lat: number; lng: number };

const TIPOS_SOLO = [
  "Argila mole",
  "Argila média",
  "Argila rija",
  "Silte",
  "Silte arenoso",
  "Areia fina",
  "Areia média",
  "Areia grossa",
  "Areia compacta",
  "Areia fofa",
  "Cascalho",
  "Rocha alterada",
  "Rocha sã",
] as const;

const AVANCO_OPTS = ["", "TD", "LV", "BT"] as const;

const COR_SOLO_PADRAO = "#ECEFF1";

type Linha = {
  /** Presente quando a linha já foi guardada no servidor. */
  id?: number;
  prof: number;
  g1: number;
  g2: number;
  g3: number;
  /** Penetração observada no intervalo (cm), ex. 2/17. */
  cm1: number;
  cm2: number;
  cm3: number;
  solo: string;
  /** Cor do material no PDF (hex), alinhada ao tipo de solo. */
  cor: string;
  soloDetalhe: string;
  obs: string;
  avanco: string;
  reves: string;
  consistencia: string;
};

type ApiSptRow = {
  id?: number;
  prof: number;
  g1: number;
  g2: number;
  g3: number;
  solo: string;
  cm1?: number;
  cm2?: number;
  cm3?: number;
};

function parseCmApi(v: unknown): number {
  if (v === undefined || v === null) return 15;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 15;
  return Math.min(999, Math.round(n));
}

function mapApiToLinha(s: ApiSptRow): Linha {
  const solo = s.solo ?? "";
  return {
    id: typeof s.id === "number" && Number.isFinite(s.id) ? s.id : undefined,
    prof: round2ProfSpt(s.prof),
    g1: golpesSptNum(s.g1),
    g2: golpesSptNum(s.g2),
    g3: golpesSptNum(s.g3),
    cm1: parseCmApi(s.cm1),
    cm2: parseCmApi(s.cm2),
    cm3: parseCmApi(s.cm3),
    solo,
    cor: corSoloSpt(solo),
    soloDetalhe: "",
    obs: "",
    avanco: avancoPadraoParaProfSpt(round2ProfSpt(s.prof)),
    reves: "",
    consistencia: "",
  };
}

function novaLinhaSptVazia(prof: number): Linha {
  const p = round2ProfSpt(prof);
  return {
    prof: p,
    g1: 0,
    g2: 0,
    g3: 0,
    cm1: 15,
    cm2: 15,
    cm3: 15,
    solo: "",
    cor: COR_SOLO_PADRAO,
    soloDetalhe: "",
    obs: "",
    avanco: avancoPadraoParaProfSpt(p),
    reves: "",
    consistencia: "",
  };
}

/** Preserva texto só no cliente (obs, avanço, etc.) após GET da API. */
function mergeSptLinhasFromApi(anterior: Linha[], apiRows: ApiSptRow[]): Linha[] {
  const byId = new Map(
    anterior.filter((l) => l.id != null).map((l) => [l.id as number, l]),
  );
  return apiRows.map((s) => {
    const m = mapApiToLinha(s);
    const old = m.id != null ? byId.get(m.id) : undefined;
    if (!old) return m;
    return {
      ...m,
      soloDetalhe: old.soloDetalhe,
      obs: old.obs,
      avanco:
        String(old.avanco ?? "").trim() !== "" ? old.avanco : m.avanco,
      reves: old.reves,
      consistencia: old.consistencia,
      cor: m.solo === old.solo ? old.cor : m.cor,
    };
  });
}

async function sincronizarLinhasSptNoServidor(linhas: Linha[]) {
  const comId = linhas.filter((l) => l.id != null);
  await Promise.all(
    comId.map((l) =>
      fetch(apiUrl(`/api/spt/${l.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prof: l.prof,
          g1: l.g1,
          g2: l.g2,
          g3: l.g3,
          cm1: l.cm1,
          cm2: l.cm2,
          cm3: l.cm3,
          solo: l.solo,
        }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(
            typeof err.error === "string" ? err.error : "Erro ao sincronizar SPT",
          );
        }
      }),
    ),
  );
}

export type SptRegistroCampoProps = {
  furoId?: number;
};

export function SptRegistroCampo({ furoId }: SptRegistroCampoProps) {
  const [dados, setDados] = useState<Linha[]>([]);
  /** Nº de vezes que se usou "Adicionar metro" (cada vez = par 0,00/0,05 ou n,00/n,45). */
  const [sptMetrosClicks, setSptMetrosClicks] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfErro, setPdfErro] = useState<string | null>(null);
  const pdfRef = useRef<HTMLDivElement>(null);

  const [codigoFuro, setCodigoFuro] = useState("");
  const [nomeLocalReady, setNomeLocalReady] = useState(false);
  const [nomeFuroErro, setNomeFuroErro] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [obra, setObra] = useState("");
  const [localObra, setLocalObra] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [paginaPdf, setPaginaPdf] = useState(1);
  const [totalPaginasPdf, setTotalPaginasPdf] = useState(1);
  const [amostradorExt, setAmostradorExt] = useState("50,8");
  const [amostradorInt, setAmostradorInt] = useState("34,9");
  const [revestimentoMeta, setRevestimentoMeta] = useState("");
  const [trado, setTrado] = useState("");
  const [alturaQueda, setAlturaQueda] = useState("75 cm");
  const [pesoMartelo, setPesoMartelo] = useState("65 kgf");
  const [sistema, setSistema] = useState("manual");
  const [cota, setCota] = useState("");
  const [nivelAgua, setNivelAgua] = useState("");
  const [naProfundidade, setNaProfundidade] = useState("");
  const [coordN, setCoordN] = useState("");
  const [coordE, setCoordE] = useState("");
  const [fuso, setFuso] = useState("22S");
  const [responsavel, setResponsavel] = useState("");
  const [crea, setCrea] = useState("");
  const [sondador, setSondador] = useState("");
  const [revestimentoComprimento, setRevestimentoComprimento] = useState("");
  const [rodapeContato, setRodapeContato] = useState("");
  const [enderecoEmpresa, setEnderecoEmpresa] = useState(
    "Rua Flávio Pires, 131, Araranguá - SC",
  );
  const [obraIdMapa, setObraIdMapa] = useState<number | null>(null);
  /** Furos SPT da mesma obra (SPT01, SPT02, …) para o mapa de localização. */
  const [furosSptObra, setFurosSptObra] = useState<FieldFuroPin[]>([]);
  const [mapRecenterKey, setMapRecenterKey] = useState(0);
  const [userGpsSpt, setUserGpsSpt] = useState<MapLngLat | null>(null);
  const [userGpsSptIsStored, setUserGpsSptIsStored] = useState(false);
  const [mapaFuroMsg, setMapaFuroMsg] = useState<string | null>(null);
  const [aGuardarFuroGps, setAGuardarFuroGps] = useState(false);
  /**
   * Latitude / longitude em graus decimais WGS84 para o mapa no relatório.
   * Preenchidas a partir do furo/obra quando existirem; pode editar à mão.
   */
  const [mapaRelLatStr, setMapaRelLatStr] = useState("");
  const [mapaRelLngStr, setMapaRelLngStr] = useState("");
  const [fotosRelatorio, setFotosRelatorio] = useState<string[]>([]);
  const [camadasGeologicas, setCamadasGeologicas] = useState<CamadaGeol[]>([]);
  const [projetoSaving, setProjetoSaving] = useState(false);
  const [projetoMsg, setProjetoMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const rascunhoLocalCarregado = useRef(false);

  const profundidadesTabela = useMemo(
    () => dados.map((l) => l.prof),
    [dados],
  );

  const linhasPdf = useMemo(
    () =>
      dados.map((l) => ({
        prof: l.prof,
        g1: golpesSptNum(l.g1),
        g2: golpesSptNum(l.g2),
        g3: golpesSptNum(l.g3),
        cm1: l.cm1,
        cm2: l.cm2,
        cm3: l.cm3,
        solo: l.solo,
        soloDetalhe: l.soloDetalhe,
        obs: l.obs,
        avanco: l.avanco,
        reves: l.reves,
        consistencia: l.consistencia,
        cor: l.cor,
      })),
    [dados],
  );

  const mapCoordsForPdf = useMemo(() => {
    const manual = wgsPairFromInputs(mapaRelLatStr, mapaRelLngStr);
    if (manual) return manual;
    const fromUtm = wgs84DeUtm(coordN, coordE, fuso);
    if (fromUtm) return { lat: fromUtm.lat, lng: fromUtm.lng };
    if (userGpsSpt) return { lat: userGpsSpt.lat, lng: userGpsSpt.lng };
    return null;
  }, [mapaRelLatStr, mapaRelLngStr, coordN, coordE, fuso, userGpsSpt]);
  useEffect(() => {
    const p = readStoredUserLatLng();
    if (!p) return;
    setUserGpsSpt(p);
    setUserGpsSptIsStored(true);
    setMapRecenterKey((k) => k + 1);
  }, []);

  const mapaFuroId = furoId ?? 0;

  const carregarFurosSptObra = useCallback(async () => {
    if (obraIdMapa == null || !Number.isFinite(obraIdMapa)) {
      setFurosSptObra([]);
      return;
    }
    try {
      const r = await fetch(
        apiUrl(`/api/furo?obraId=${obraIdMapa}&tipo=spt`),
      );
      const json = (await r.json()) as
        | {
            id: number;
            codigo: string;
            latitude?: number | null;
            longitude?: number | null;
          }[]
        | { error?: string };
      if (!r.ok || !Array.isArray(json)) {
        setFurosSptObra([]);
        return;
      }
      setFurosSptObra(
        json.map((f) => ({
          id: f.id,
          codigo: String(f.codigo ?? "").trim() || `SPT ${f.id}`,
          latitude:
            f.latitude != null && Number.isFinite(f.latitude)
              ? f.latitude
              : null,
          longitude:
            f.longitude != null && Number.isFinite(f.longitude)
              ? f.longitude
              : null,
        })),
      );
    } catch {
      setFurosSptObra([]);
    }
  }, [obraIdMapa]);

  useEffect(() => {
    void carregarFurosSptObra();
  }, [carregarFurosSptObra]);

  const furosParaMapa = useMemo((): FieldFuroPin[] => {
    const p = wgsPairFromInputs(mapaRelLatStr, mapaRelLngStr);
    const idAtual =
      furoId !== undefined && Number.isFinite(furoId) ? furoId : mapaFuroId;
    const codigoAtual = codigoFuro.trim() || "Furo";

    if (furosSptObra.length > 0) {
      const lista = furosSptObra.map((f) =>
        f.id === idAtual
          ? {
              ...f,
              codigo: codigoAtual || f.codigo,
              latitude: p?.lat ?? f.latitude,
              longitude: p?.lng ?? f.longitude,
            }
          : f,
      );
      if (
        furoId !== undefined &&
        Number.isFinite(furoId) &&
        !lista.some((f) => f.id === furoId)
      ) {
        lista.push({
          id: furoId,
          codigo: codigoAtual,
          latitude: p?.lat ?? null,
          longitude: p?.lng ?? null,
        });
      }
      return lista;
    }

    return [
      {
        id: idAtual,
        codigo: codigoAtual,
        latitude: p?.lat ?? null,
        longitude: p?.lng ?? null,
      },
    ];
  }, [
    furosSptObra,
    furoId,
    mapaFuroId,
    codigoFuro,
    mapaRelLatStr,
    mapaRelLngStr,
  ]);

  const atualizarPinFuroNoMapaObra = useCallback(
    (fid: number, lat: number | null, lng: number | null) => {
      setFurosSptObra((prev) =>
        prev.map((f) =>
          f.id === fid
            ? { ...f, latitude: lat, longitude: lng }
            : f,
        ),
      );
    },
    [],
  );

  const aplicarUtmDeWgs = useCallback(
    (lat: number, lng: number) => {
      const utm = utmDeWgs84(lat, lng, fuso);
      if (utm) {
        setCoordN(utm.norte);
        setCoordE(utm.este);
        setFuso(utm.fuso);
      }
    },
    [fuso],
  );

  const aplicarPosicaoWgsNoMapa = useCallback(
    (lat: number, lng: number, persistirApi: boolean) => {
      setMapaRelLatStr(lat.toFixed(6));
      setMapaRelLngStr(lng.toFixed(6));
      aplicarUtmDeWgs(lat, lng);
      setMapRecenterKey((k) => k + 1);
      if (
        persistirApi &&
        furoId !== undefined &&
        Number.isFinite(furoId)
      ) {
        return fetch(apiUrl(`/api/furo/${furoId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: lat, longitude: lng }),
        });
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    },
    [aplicarUtmDeWgs, furoId],
  );

  const guardarClickMapaFuro = useCallback(
    async (_fid: number, lng: number, lat: number) => {
      setAGuardarFuroGps(true);
      setMapaFuroMsg(null);
      try {
        const r = await aplicarPosicaoWgsNoMapa(lat, lng, true);
        if (r && !r.ok) {
          const data = (await r.json().catch(() => ({}))) as {
            error?: string;
          };
          setMapaFuroMsg(
            typeof data.error === "string"
              ? data.error
              : "Erro ao guardar posição do furo",
          );
          return;
        }
        if (furoId !== undefined && Number.isFinite(furoId)) {
          atualizarPinFuroNoMapaObra(furoId, lat, lng);
        }
        setMapaFuroMsg(null);
      } catch {
        setMapaFuroMsg("Falha de rede ao guardar GPS");
      } finally {
        setAGuardarFuroGps(false);
      }
    },
    [aplicarPosicaoWgsNoMapa, furoId, atualizarPinFuroNoMapaObra],
  );

  async function limparGpsFuroSpt() {
    setAGuardarFuroGps(true);
    setMapaFuroMsg(null);
    try {
      if (furoId !== undefined && Number.isFinite(furoId)) {
        const r = await fetch(apiUrl(`/api/furo/${furoId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: null, longitude: null }),
        });
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) {
          setMapaFuroMsg(
            typeof data.error === "string"
              ? data.error
              : "Erro ao limpar posição",
          );
          return;
        }
      }
      setMapaRelLatStr("");
      setMapaRelLngStr("");
      setCoordN("");
      setCoordE("");
      if (furoId !== undefined && Number.isFinite(furoId)) {
        atualizarPinFuroNoMapaObra(furoId, null, null);
      }
      setMapRecenterKey((k) => k + 1);
    } catch {
      setMapaFuroMsg("Falha de rede");
    } finally {
      setAGuardarFuroGps(false);
    }
  }

  /** Só mostra o ponto azul no mapa (não grava no furo). */
  function verMinhaPosicaoNoMapa() {
    setMapaFuroMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMapaFuroMsg("Geolocalização não disponível neste dispositivo.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        writeStoredUserLatLng(lat, lng);
        setUserGpsSptIsStored(false);
        setUserGpsSpt({ lat, lng });
        setMapRecenterKey((k) => k + 1);
      },
      (err) => {
        const cached = readStoredUserLatLng();
        if (cached) {
          setUserGpsSpt(cached);
          setUserGpsSptIsStored(true);
          setMapRecenterKey((k) => k + 1);
          setMapaFuroMsg(
            "GPS indisponível — a mostrar a última posição guardada neste dispositivo.",
          );
          return;
        }
        setMapaFuroMsg(
          err.message === ""
            ? "Permissão negada ou posição indisponível."
            : err.message,
        );
      },
      FIELD_GPS_OPTIONS,
    );
  }

  /** Obtém GPS do dispositivo e grava como posição do furo (marcação automática). */
  function marcarFuroComGpsAutomatico() {
    setMapaFuroMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMapaFuroMsg("Geolocalização não disponível neste dispositivo.");
      return;
    }
    setAGuardarFuroGps(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        writeStoredUserLatLng(lat, lng);
        setUserGpsSptIsStored(false);
        setUserGpsSpt({ lat, lng });
        void (async () => {
          try {
            const r = await aplicarPosicaoWgsNoMapa(
              lat,
              lng,
              furoId !== undefined && Number.isFinite(furoId),
            );
            if (r && !r.ok) {
              const data = (await r.json().catch(() => ({}))) as {
                error?: string;
              };
              setMapaFuroMsg(
                typeof data.error === "string"
                  ? data.error
                  : "Erro ao guardar posição do furo",
              );
              return;
            }
            if (furoId !== undefined && Number.isFinite(furoId)) {
              atualizarPinFuroNoMapaObra(furoId, lat, lng);
            }
            setMapaFuroMsg(null);
          } catch {
            setMapaFuroMsg("Falha de rede ao guardar GPS");
          } finally {
            setAGuardarFuroGps(false);
          }
        })();
      },
      (err) => {
        setAGuardarFuroGps(false);
        const cached = readStoredUserLatLng();
        if (cached) {
          setUserGpsSpt(cached);
          setUserGpsSptIsStored(true);
          setMapRecenterKey((k) => k + 1);
          setMapaFuroMsg(
            "GPS indisponível — a mostrar a última posição guardada neste dispositivo (não gravada no furo).",
          );
          return;
        }
        setMapaFuroMsg(
          err.message === ""
            ? "Permissão negada ou posição indisponível."
            : err.message,
        );
      },
      FIELD_GPS_OPTIONS,
    );
  }

  const carregar = useCallback(async () => {
    if (furoId === undefined || !Number.isFinite(furoId)) return;
    setLoadError(null);
    try {
      const r = await fetch(apiUrl(`/api/spt?furoId=${furoId}`));
      const json = await r.json();
      if (!r.ok) {
        setLoadError(
          typeof json.error === "string" ? json.error : "Erro ao carregar SPT",
        );
        setDados([]);
        setSptMetrosClicks(0);
        return;
      }
      if (Array.isArray(json)) {
        setSptMetrosClicks(
          inferNumeroCliquesSptDeContagemLinhas(json.length),
        );
        setDados((prev) =>
          mergeSptLinhasFromApi(prev, json as ApiSptRow[]),
        );
      }
    } catch {
      setLoadError("Falha de rede");
      setDados([]);
      setSptMetrosClicks(0);
    }
  }, [furoId]);

  function buildDadosCampoSpt() {
    return buildSptDadosCampo({
      camadasGeologicas,
      fotosRelatorio,
      dataInicio,
      dataFim,
      paginaPdf,
      totalPaginasPdf,
      amostradorExt,
      amostradorInt,
      revestimentoMeta,
      revestimentoComprimento,
      trado,
      alturaQueda,
      pesoMartelo,
      sistema,
      cota,
      nivelAgua,
      naProfundidade,
      sondador,
      responsavel,
      crea,
      rodapeContato,
      enderecoEmpresa,
      mapaRelLatStr,
      mapaRelLngStr,
    });
  }

  function adicionarCamadaGeol() {
    setCamadasGeologicas((prev) => {
      const ultima = prev[prev.length - 1];
      const deSugerido = ultima?.ate?.trim() ?? "";
      const maxProf =
        dados.length > 0
          ? Math.max(...dados.map((l) => round2ProfSpt(l.prof)))
          : 0;
      const ateSugerido =
        prev.length === 0 && maxProf > 0 ? formatarProfSptPt(maxProf) : "";
      return novaCamadaGeolNoFinal(prev, { deSugerido, ateSugerido });
    });
  }

  function aplicarDadosCampoSpt(raw: unknown) {
    const dc = normalizeSptDadosCampo(raw);
    if (!dc) return;
    if (dc.camadasGeologicas && dc.camadasGeologicas.length > 0) {
      setCamadasGeologicas(dc.camadasGeologicas);
    }
    if (dc.fotosRelatorio && dc.fotosRelatorio.length > 0) {
      setFotosRelatorio(dc.fotosRelatorio);
    }
    if (dc.dataInicio) setDataInicio(dc.dataInicio);
    if (dc.dataFim) setDataFim(dc.dataFim);
    if (dc.paginaPdf != null) setPaginaPdf(dc.paginaPdf);
    if (dc.totalPaginasPdf != null) setTotalPaginasPdf(dc.totalPaginasPdf);
    if (dc.amostradorExt) setAmostradorExt(dc.amostradorExt);
    if (dc.amostradorInt) setAmostradorInt(dc.amostradorInt);
    if (dc.revestimentoMeta) setRevestimentoMeta(dc.revestimentoMeta);
    if (dc.revestimentoComprimento) {
      setRevestimentoComprimento(dc.revestimentoComprimento);
    }
    if (dc.trado) setTrado(dc.trado);
    if (dc.alturaQueda) setAlturaQueda(dc.alturaQueda);
    if (dc.pesoMartelo) setPesoMartelo(dc.pesoMartelo);
    if (dc.sistema) setSistema(dc.sistema);
    if (dc.cota) setCota(dc.cota);
    if (dc.nivelAgua) setNivelAgua(dc.nivelAgua);
    if (dc.naProfundidade) setNaProfundidade(dc.naProfundidade);
    if (dc.sondador) setSondador(dc.sondador);
    if (dc.responsavel) setResponsavel(dc.responsavel);
    if (dc.crea) setCrea(dc.crea);
    if (dc.rodapeContato) setRodapeContato(dc.rodapeContato);
    if (dc.enderecoEmpresa) setEnderecoEmpresa(dc.enderecoEmpresa);
    if (dc.mapaRelLatStr) setMapaRelLatStr(dc.mapaRelLatStr);
    if (dc.mapaRelLngStr) setMapaRelLngStr(dc.mapaRelLngStr);
  }

  const carregarMetaFuro = useCallback(async () => {
    if (furoId === undefined || !Number.isFinite(furoId)) return;
    try {
      const r = await fetch(apiUrl(`/api/relatorio?furoId=${furoId}`));
      const json = (await r.json()) as {
        codigo?: string;
        obraId?: number;
        latitude?: number | null;
        longitude?: number | null;
        dadosCampo?: unknown;
        obra?: {
          cliente?: string;
          nome?: string;
          local?: string;
          latitude?: number | null;
          longitude?: number | null;
        };
        error?: string;
      };
      if (!r.ok || json.error || typeof json.codigo !== "string") return;
      setCodigoFuro(json.codigo);
      aplicarDadosCampoSpt(json.dadosCampo);
      if (typeof json.obraId === "number" && Number.isFinite(json.obraId)) {
        setObraIdMapa(json.obraId);
      } else {
        setObraIdMapa(null);
      }

      const fLat = json.latitude;
      const fLng = json.longitude;
      const oLat = json.obra?.latitude;
      const oLng = json.obra?.longitude;
      if (
        fLat != null &&
        fLng != null &&
        Number.isFinite(fLat) &&
        Number.isFinite(fLng)
      ) {
        setMapaRelLatStr(fLat.toFixed(6));
        setMapaRelLngStr(fLng.toFixed(6));
        aplicarUtmDeWgs(fLat, fLng);
      } else if (
        oLat != null &&
        oLng != null &&
        Number.isFinite(oLat) &&
        Number.isFinite(oLng)
      ) {
        setMapaRelLatStr(oLat.toFixed(6));
        setMapaRelLngStr(oLng.toFixed(6));
        aplicarUtmDeWgs(oLat, oLng);
      }

      if (json.obra) {
        setCliente(String(json.obra.cliente ?? ""));
        setObra(String(json.obra.nome ?? ""));
        setLocalObra(String(json.obra.local ?? ""));
      }
    } catch {
      /* cabeçalho PDF continua editável manualmente */
    }
  }, [furoId, aplicarUtmDeWgs]);

  const guardarNomeSondagemNoFuro = useCallback(async () => {
    if (furoId === undefined || !Number.isFinite(furoId)) return;
    const codigo = codigoFuro.trim();
    if (!codigo) {
      setNomeFuroErro("Indique um nome para a sondagem.");
      return;
    }
    setNomeFuroErro(null);
    try {
      const r = await fetch(apiUrl(`/api/furo/${furoId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setNomeFuroErro(
          typeof j.error === "string" ? j.error : "Erro ao guardar nome",
        );
        return;
      }
    } catch {
      setNomeFuroErro("Falha de rede ao guardar nome");
    }
  }, [furoId, codigoFuro]);

  useEffect(() => {
    if (furoId !== undefined && Number.isFinite(furoId)) {
      setNomeLocalReady(true);
      return;
    }
    const v = localStorage.getItem(LS_SPT_NOME);
    setCodigoFuro(v === null ? "SPT 01" : v);
    setNomeLocalReady(true);
  }, [furoId]);

  useEffect(() => {
    if (!nomeLocalReady) return;
    if (furoId !== undefined && Number.isFinite(furoId)) return;
    localStorage.setItem(LS_SPT_NOME, codigoFuro.trim());
  }, [codigoFuro, furoId, nomeLocalReady]);

  useEffect(() => {
    if (furoId !== undefined && Number.isFinite(furoId)) {
      void carregar();
      void carregarMetaFuro();
    }
  }, [furoId, carregar, carregarMetaFuro]);

  useEffect(() => {
    if (furoId === undefined || !Number.isFinite(furoId)) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void carregarMetaFuro();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [furoId, carregarMetaFuro]);

  useEffect(() => {
    if (furoId !== undefined && Number.isFinite(furoId)) return;
    if (!nomeLocalReady || rascunhoLocalCarregado.current) return;
    try {
      const raw = localStorage.getItem(LS_SPT_LOCAL_DRAFT);
      if (!raw) return;
      const j = JSON.parse(raw) as {
        codigoFuro?: string;
        dados?: Linha[];
        dadosCampo?: unknown;
        coordN?: string;
        coordE?: string;
        fuso?: string;
        mapaRelLatStr?: string;
        mapaRelLngStr?: string;
      };
      rascunhoLocalCarregado.current = true;
      if (typeof j.codigoFuro === "string" && j.codigoFuro.trim())
        setCodigoFuro(j.codigoFuro);
      aplicarDadosCampoSpt(j.dadosCampo);
      if (typeof j.coordN === "string") setCoordN(j.coordN);
      if (typeof j.coordE === "string") setCoordE(j.coordE);
      if (typeof j.fuso === "string" && j.fuso.trim()) setFuso(j.fuso);
      if (typeof j.mapaRelLatStr === "string") setMapaRelLatStr(j.mapaRelLatStr);
      if (typeof j.mapaRelLngStr === "string") setMapaRelLngStr(j.mapaRelLngStr);
      if (Array.isArray(j.dados) && j.dados.length > 0) {
        const rows = j.dados.map((row) => {
          const { id: _id, ...rest } = row;
          const r = { ...rest } as Linha;
          r.g1 = golpesSptNum(r.g1);
          r.g2 = golpesSptNum(r.g2);
          r.g3 = golpesSptNum(r.g3);
          if (!String(r.avanco ?? "").trim()) {
            r.avanco = avancoPadraoParaProfSpt(round2ProfSpt(r.prof));
          }
          return r;
        });
        setDados(rows);
        setSptMetrosClicks(
          inferNumeroCliquesSptDeContagemLinhas(rows.length),
        );
      }
    } catch {
      rascunhoLocalCarregado.current = false;
    }
  }, [furoId, nomeLocalReady]);

  async function guardarProjeto() {
    setProjetoMsg(null);
    setNomeFuroErro(null);

    if (furoId !== undefined && Number.isFinite(furoId)) {
      const codigo = codigoFuro.trim();
      if (!codigo) {
        setProjetoMsg({
          type: "err",
          text: "Indique o nome da sondagem antes de guardar.",
        });
        return;
      }
      setProjetoSaving(true);
      try {
        const rNome = await fetch(apiUrl(`/api/furo/${furoId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo,
            dadosCampo: buildDadosCampoSpt(),
          }),
        });
        const jNome = (await rNome.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!rNome.ok) {
          throw new Error(
            typeof jNome.error === "string"
              ? jNome.error
              : "Erro ao guardar o nome do furo",
          );
        }

        await sincronizarLinhasSptNoServidor(dados.filter((l) => l.id != null));

        const semId = dados.filter((l) => l.id == null);
        for (const l of semId) {
          const r = await fetch(apiUrl("/api/spt"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prof: l.prof,
              g1: l.g1,
              g2: l.g2,
              g3: l.g3,
              cm1: l.cm1,
              cm2: l.cm2,
              cm3: l.cm3,
              solo: l.solo,
              furoId,
            }),
          });
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(
              typeof err.error === "string"
                ? err.error
                : "Erro ao criar linha SPT",
            );
          }
        }

        if (semId.length > 0) await carregar();

        setProjetoMsg({
          type: "ok",
          text: "Projeto guardado na obra. Pode fechar e voltar a editar quando quiser.",
        });
      } catch (e) {
        setProjetoMsg({
          type: "err",
          text:
            e instanceof Error ? e.message : "Erro ao guardar o projeto.",
        });
      } finally {
        setProjetoSaving(false);
      }
      return;
    }

    try {
      const payload = {
        v: 1 as const,
        codigoFuro: codigoFuro.trim(),
        coordN,
        coordE,
        fuso,
        mapaRelLatStr,
        mapaRelLngStr,
        dadosCampo: buildDadosCampoSpt(),
        dados: dados.map((l) => {
          const { id: _id, ...rest } = l;
          return rest;
        }),
      };
      localStorage.setItem(LS_SPT_LOCAL_DRAFT, JSON.stringify(payload));
      setProjetoMsg({
        type: "ok",
        text: "Rascunho guardado neste dispositivo.",
      });
    } catch {
      setProjetoMsg({
        type: "err",
        text: "Não foi possível guardar no dispositivo.",
      });
    }
  }

  async function adicionar() {
    const nextClick = sptMetrosClicks + 1;
    const [p1, p2] = parProfundidadesSptParaClique(nextClick);
    const nova1 = novaLinhaSptVazia(p1);
    const nova2 = novaLinhaSptVazia(p2);

    if (furoId !== undefined && Number.isFinite(furoId)) {
      const snapshot = dados;
      try {
        await sincronizarLinhasSptNoServidor(snapshot);
        for (const nova of [nova1, nova2]) {
          const r = await fetch(apiUrl("/api/spt"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prof: nova.prof,
              g1: nova.g1,
              g2: nova.g2,
              g3: nova.g3,
              cm1: nova.cm1,
              cm2: nova.cm2,
              cm3: nova.cm3,
              solo: nova.solo,
              furoId,
            }),
          });
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            setLoadError(
              typeof err.error === "string"
                ? err.error
                : "Erro ao criar linha SPT",
            );
            return;
          }
        }
        const listR = await fetch(apiUrl(`/api/spt?furoId=${furoId}`));
        const listJson = await listR.json();
        if (!listR.ok || !Array.isArray(listJson)) {
          setLoadError("Erro ao atualizar lista SPT");
          return;
        }
        setSptMetrosClicks(
          inferNumeroCliquesSptDeContagemLinhas(listJson.length),
        );
        setDados(mergeSptLinhasFromApi(snapshot, listJson as ApiSptRow[]));
        setLoadError(null);
      } catch (e) {
        setLoadError(
          e instanceof Error ? e.message : "Falha de rede ao guardar",
        );
      }
      return;
    }

    setSptMetrosClicks(nextClick);
    setDados((prev) => [...prev, nova1, nova2]);
  }

  function atualizar<K extends keyof Linha>(
    index: number,
    campo: K,
    valor: Linha[K],
  ) {
    setDados((prev) => {
      const novo = [...prev];
      const cur = novo[index];
      if (campo === "solo") {
        const s = String(valor);
        novo[index] = {
          ...cur,
          solo: s,
          cor: s.trim() ? corSoloSpt(s) : COR_SOLO_PADRAO,
        };
      } else if (campo === "g1" || campo === "g2" || campo === "g3") {
        novo[index] = { ...cur, [campo]: golpesSptNum(valor) };
      } else {
        novo[index] = { ...cur, [campo]: valor };
      }
      return novo;
    });
  }

  function atualizarProfMetroOuSuplemento(
    index: number,
    parte: "metro" | "suplemento",
    valorBruto: string,
  ) {
    const parseFlex = (raw: string): number | null => {
      const t = raw.trim().replace(",", ".");
      if (t === "") return null;
      const v = parseFloat(t);
      if (!Number.isFinite(v) || v < 0) return null;
      return parte === "metro" ? Math.round(v) : round2ProfSpt(v);
    };

    setDados((prev) => {
      const novo = [...prev];
      const cur = novo[index];
      const { metro: m0, suplemento: s0 } = profParaMetroESuplemento(cur.prof);
      const parsed = parseFlex(valorBruto);
      const m = parte === "metro" ? (parsed ?? m0) : m0;
      const s = parte === "suplemento" ? (parsed ?? s0) : s0;
      const p = profDesdeMetroESuplemento(m, s);
      novo[index] = {
        ...cur,
        prof: p,
        avanco: avancoPadraoParaProfSpt(p),
      };
      return novo;
    });
  }

  async function gerarPDF() {
    const el = pdfRef.current;
    if (!el || dados.length === 0) {
      setPdfErro("Adicione pelo menos um metro antes de gerar o PDF.");
      return;
    }
    setPdfErro(null);
    setPdfLoading(true);
    try {
      const mapHost = el.querySelector("[data-spt-pdf-has-map]");
      if (mapHost) {
        mapHost.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      const esperaMapa = mapCoordsForPdf != null;
      const esperaFotos = fotosRelatorio.length > 0;
      await new Promise((r) =>
        setTimeout(r, esperaMapa ? 2500 : esperaFotos ? 1100 : 500),
      );
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      await aguardarMapaPdfNoDom(el, 35_000);
      await waitReportImagesLoaded(el, 30_000);
      const canvas = await html2canvas(el, html2canvasReportOptions());
      if (canvas.width < 2 || canvas.height < 2) {
        throw new Error(
          "Captura vazia. Alarga a janela do browser e tente de novo.",
        );
      }
      const imgData = canvas.toDataURL("image/png");
      if (!imgData || imgData.length < 100) {
        throw new Error("Não foi possível converter a página para imagem.");
      }
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      const safe = (codigoFuro.trim() || "spt").replace(/[^\w.-]+/g, "_");
      pdf.save(`relatorio-spt-${safe}.pdf`);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Erro desconhecido ao gerar o PDF.";
      setPdfErro(msg);
      console.error(e);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="p-6">
      {furoId !== undefined && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <Link
            href="/obras"
            className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
          >
            ← Obras
          </Link>
          {obraIdMapa != null && (
            <Link
              href={`/obra/${obraIdMapa}#mapa-campo`}
              className="font-medium text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
            >
              Mapa da obra (GPS / furos)
            </Link>
          )}
          <span className="text-[var(--muted)]">Furo #{furoId}</span>
        </div>
      )}

      <h1 className="mb-4 text-2xl font-bold text-[var(--text)]">
        SPT - Registro de Campo
      </h1>
      <div className="mb-4 max-w-xl">
        <label
          className="block text-sm font-medium text-[var(--text)]"
          htmlFor="spt-nome-sondagem"
        >
          Nome da sondagem
        </label>
        <input
          id="spt-nome-sondagem"
          value={codigoFuro}
          onChange={(e) => {
            setCodigoFuro(e.target.value);
            setNomeFuroErro(null);
          }}
          onBlur={() => void guardarNomeSondagemNoFuro()}
          placeholder="ex.: SPT 01, SPT 02"
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          {furoId != null && Number.isFinite(furoId) ? (
            <>
              Use <strong className="text-[var(--text)]">Guardar projeto</strong>{" "}
              abaixo para gravar nome e todos os metros na obra. O nome também
              pode atualizar ao sair do campo.
              {obraIdMapa != null && (
                <>
                  {" "}
                  <Link
                    href={`/spt?obraId=${obraIdMapa}`}
                    className="font-medium text-teal-600 hover:underline dark:text-teal-400"
                  >
                    Ver SPT 01, SPT 02… desta obra
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              Modo local: use <strong className="text-[var(--text)]">Guardar projeto</strong>{" "}
              para gravar nome e grelha neste dispositivo. Para vários SPT na
              mesma obra, use o{" "}
              <Link
                href="/spt"
                className="font-medium text-teal-600 hover:underline dark:text-teal-400"
              >
                hub SPT
              </Link>{" "}
              (criar furo por registo).
            </>
          )}
        </p>
        {nomeFuroErro && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
            {nomeFuroErro}
          </p>
        )}
      </div>
      <p className="mb-4 max-w-3xl text-sm text-[var(--muted)]">
        Em cada intervalo (1º, 2º, 3º):{" "}
        <strong className="text-[var(--text)]">batidas</strong> na linha de cima e{" "}
        <strong className="text-[var(--text)]">penetração em cm</strong> na de baixo
        — por exemplo <strong className="text-[var(--text)]">2</strong> golpes e{" "}
        <strong className="text-[var(--text)]">17</strong> cm (2/17), depois 1/15 e
        1/30.
      </p>

      <section
        id="mapa-furo-spt"
        className="mb-8 print:hidden"
        aria-label="Localização do furo no mapa"
      >
        <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">
          Localização do furo (mapa)
        </h2>
        <p className="mb-3 max-w-3xl text-sm text-[var(--muted)]">
          Mostra os furos <strong className="text-[var(--text)]">SPT</strong> desta
          obra (ex.: SPT01, SPT02) — sem pino da obra. O furo em edição destaca-se a
          verde. <strong className="text-[var(--text)]">Automático:</strong> «Marcar
          com GPS» grava a posição neste furo.{" "}
          <strong className="text-[var(--text)]">Manual:</strong> toque no mapa no
          ponto do furo em edição.
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={aGuardarFuroGps}
            onClick={marcarFuroComGpsAutomatico}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
          >
            Marcar com GPS (automático)
          </button>
          <button
            type="button"
            disabled={aGuardarFuroGps}
            onClick={verMinhaPosicaoNoMapa}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
          >
            Ver só a minha posição
          </button>
          <button
            type="button"
            disabled={
              aGuardarFuroGps ||
              !wgsPairFromInputs(mapaRelLatStr, mapaRelLngStr)
            }
            onClick={() => void limparGpsFuroSpt()}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
          >
            Limpar posição do furo
          </button>
          {aGuardarFuroGps && (
            <span className="text-sm text-[var(--muted)]">A guardar…</span>
          )}
        </div>
        {mapaFuroMsg && (
          <p
            className="mb-3 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {mapaFuroMsg}
          </p>
        )}
        <FieldCampaignMap
          obraPosition={null}
          furos={furosParaMapa}
          mapMode="furo"
          selectedFuroId={mapaFuroId}
          userPosition={userGpsSpt}
          userPositionTitle={
            userGpsSptIsStored
              ? "A sua posição (última guardada neste dispositivo)"
              : "A sua posição (GPS)"
          }
          recenterKey={mapRecenterKey}
          onObraMapClick={() => {}}
          onFuroMapClick={(id, lng, lat) => void guardarClickMapaFuro(id, lng, lat)}
          hint={
            <p className="mt-2 text-xs text-[var(--muted)]">
              <strong className="text-[var(--text)]">Manual:</strong> toque no mapa
              para definir ou corrigir o pino do furo.
            </p>
          }
        />
        <CoordenadasUtmFuroPanel
          coordN={coordN}
          coordE={coordE}
          fuso={fuso}
          latStr={mapaRelLatStr}
          lngStr={mapaRelLngStr}
          onCoordN={setCoordN}
          onCoordE={setCoordE}
          onFuso={setFuso}
          onLatStr={setMapaRelLatStr}
          onLngStr={setMapaRelLngStr}
          onMapRecenter={() => setMapRecenterKey((k) => k + 1)}
          onPersistirWgs={
            furoId !== undefined && Number.isFinite(furoId)
              ? async (lat, lng) => {
                  const r = await fetch(apiUrl(`/api/furo/${furoId}`), {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ latitude: lat, longitude: lng }),
                  });
                  if (!r.ok) {
                    const data = (await r.json().catch(() => ({}))) as {
                      error?: string;
                    };
                    throw new Error(
                      typeof data.error === "string"
                        ? data.error
                        : "Erro ao guardar",
                    );
                  }
                  aplicarUtmDeWgs(lat, lng);
                }
              : undefined
          }
        />
      </section>

      {loadError && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {loadError}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void adicionar()}
          title="1.º clique: 0,00 e 0,05 m. Seguintes: 1,00/1,45; 2,00/2,45; …"
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          + Adicionar profundidades
        </button>
        <button
          type="button"
          disabled={projetoSaving}
          onClick={() => void guardarProjeto()}
          className="rounded border-2 border-teal-600 bg-[var(--card)] px-4 py-2 text-sm font-semibold text-teal-700 shadow-sm hover:bg-teal-50 disabled:opacity-50 dark:border-teal-500 dark:text-teal-300 dark:hover:bg-teal-950/40"
        >
          {projetoSaving ? "A guardar…" : "Guardar projeto"}
        </button>
      </div>
      {projetoMsg && (
        <p
          className={`mb-4 text-sm ${
            projetoMsg.type === "ok"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
          role={projetoMsg.type === "err" ? "alert" : "status"}
        >
          {projetoMsg.text}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-[var(--border)] text-sm">
          <thead className="bg-[var(--surface)]">
            <tr className="text-[var(--text)]">
              <th
                className="border border-[var(--border)] p-2 font-semibold"
                rowSpan={2}
              >
                <span className="block">Metro (m)</span>
                <span className="block text-[10px] font-normal text-[var(--muted)]">
                  Parte inteira (0, 1, 2…)
                </span>
              </th>
              <th
                className="border border-[var(--border)] p-2 font-semibold"
                rowSpan={2}
              >
                <span className="block">+ (m)</span>
                <span className="block text-[10px] font-normal text-[var(--muted)]">
                  Complemento: 0; 0,05; 0,45…
                </span>
              </th>
              <th
                className="w-14 border border-[var(--border)] p-2 font-semibold"
                rowSpan={2}
              >
                <span className="block">Nº Amost.</span>
                <span className="block text-[10px] font-normal text-[var(--muted)]">
                  0 m→0; 1–2 m→1…
                </span>
              </th>
              <th
                className="border border-[var(--border)] p-2 font-semibold"
                rowSpan={2}
              >
                Avanço
              </th>
              <th
                className="w-14 border border-[var(--border)] p-2 font-semibold"
                rowSpan={2}
              >
                Reves.
              </th>
              <th
                className="w-16 border border-[var(--border)] p-2 font-semibold"
                rowSpan={2}
              >
                Consist.
              </th>
              <th
                className="border border-[var(--border)] p-1 font-semibold"
                rowSpan={2}
              >
                <span className="block">1º</span>
                <span className="block text-[10px] font-normal text-[var(--muted)]">
                  bat. / cm
                </span>
              </th>
              <th
                className="border border-[var(--border)] p-1 font-semibold"
                rowSpan={2}
              >
                <span className="block">2º</span>
                <span className="block text-[10px] font-normal text-[var(--muted)]">
                  bat. / cm
                </span>
              </th>
              <th
                className="border border-[var(--border)] p-1 font-semibold"
                rowSpan={2}
              >
                <span className="block">3º</span>
                <span className="block text-[10px] font-normal text-[var(--muted)]">
                  bat. / cm
                </span>
              </th>
              <th
                className="border border-[var(--border)] px-1 py-2 text-center text-[10px] font-semibold leading-tight"
                colSpan={2}
              >
                Nº de Golpes de
                <br />
                Penetração 30 cm
              </th>
              <th
                className="w-64 border border-[var(--border)] p-2 font-semibold"
                rowSpan={2}
              >
                Descrição do Solo
              </th>
              <th
                className="w-48 border border-[var(--border)] p-2 font-semibold"
                rowSpan={2}
              >
                Observações
              </th>
            </tr>
            <tr className="text-[var(--text)]">
              <th className="border border-[var(--border)] p-1 text-xs font-semibold">
                1º + 2º
              </th>
              <th className="border border-[var(--border)] p-1 text-xs font-semibold">
                2º + 3º
              </th>
            </tr>
          </thead>

          <tbody>
            {dados.map((l, i) => {
              const { metro, suplemento } = profParaMetroESuplemento(l.prof);
              const avEfetivo =
                (l.avanco ?? "").trim() || avancoPadraoParaProfSpt(l.prof);
              const amostraSpan = rowSpanGrupoAmostraSpt(i, profundidadesTabela);
              const golpesSoma = golpesParaSomas30cmNaLinha(dados, i);
              const { s12, s23 } = somasGolpes30cm(
                golpesSoma.g1,
                golpesSoma.g2,
                golpesSoma.g3,
              );
              return (
              <tr
                key={l.id != null ? `spt-${l.id}` : `spt-row-${i}`}
                className="text-center text-[var(--text)]"
              >
                <td className="border border-[var(--border)] p-1">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={metro}
                    onChange={(e) =>
                      atualizarProfMetroOuSuplemento(i, "metro", e.target.value)
                    }
                    className="w-full min-w-[3rem] rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-center text-sm"
                    title="Parte inteira da profundidade (m)"
                    aria-label={`Linha ${i + 1}: metro (m)`}
                  />
                </td>
                <td className="border border-[var(--border)] p-1">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={Number.isFinite(suplemento) ? suplemento : 0}
                    onChange={(e) =>
                      atualizarProfMetroOuSuplemento(
                        i,
                        "suplemento",
                        e.target.value,
                      )
                    }
                    className="w-full min-w-[3.5rem] rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-center text-sm"
                    title="Complemento em metros (ex.: 0,05 ou 0,45)"
                    aria-label={`Linha ${i + 1}: complemento (m)`}
                  />
                </td>

                {amostraSpan.exibir ? (
                  <td
                    rowSpan={amostraSpan.span}
                    className="border border-[var(--border)] bg-[var(--surface)] p-2 align-middle font-semibold text-[var(--text)]"
                    title="1 amostra por metro: 0 m→0; de 1 m a antes de 2 m→1; etc."
                  >
                    {numeroAmostraSpt(l.prof)}
                  </td>
                ) : null}

                <td className="border border-[var(--border)] p-2">
                  <select
                    value={l.avanco}
                    onChange={(e) => atualizar(i, "avanco", e.target.value)}
                    className="w-full min-w-[3.5rem] rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-xs text-[var(--text)]"
                  >
                    {AVANCO_OPTS.map((o) => (
                      <option key={o || "—"} value={o}>
                        {o || "—"}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border border-[var(--border)] p-2">
                  <input
                    type="text"
                    value={l.reves}
                    onChange={(e) => atualizar(i, "reves", e.target.value)}
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-xs"
                    placeholder="—"
                  />
                </td>
                <td className="border border-[var(--border)] p-2">
                  <input
                    type="text"
                    value={l.consistencia}
                    onChange={(e) =>
                      atualizar(i, "consistencia", e.target.value)
                    }
                    className="w-full min-w-[3rem] rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-xs"
                    placeholder="MM, M…"
                  />
                </td>

                <td className="border border-[var(--border)] p-0 align-stretch">
                  <div className="flex min-w-[3.25rem] flex-col divide-y divide-[var(--border)]">
                    <input
                      type="number"
                      min={0}
                      value={l.g1}
                      onChange={(e) =>
                        atualizar(i, "g1", Number(e.target.value) || 0)
                      }
                      className="w-full border-0 bg-[var(--surface)] p-1 text-center text-sm"
                      title="Golpes 1º intervalo"
                    />
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={l.cm1}
                      onChange={(e) =>
                        atualizar(
                          i,
                          "cm1",
                          Math.min(999, Math.max(0, Number(e.target.value) || 0)),
                        )
                      }
                      className="w-full border-0 bg-[var(--surface)] p-1 text-center text-xs text-[var(--muted)]"
                      title="Penetração (cm) no 1º intervalo"
                    />
                  </div>
                </td>

                <td className="border border-[var(--border)] p-0 align-stretch">
                  <div className="flex min-w-[3.25rem] flex-col divide-y divide-[var(--border)]">
                    <input
                      type="number"
                      min={0}
                      value={l.g2}
                      onChange={(e) =>
                        atualizar(i, "g2", Number(e.target.value) || 0)
                      }
                      className="w-full border-0 bg-[var(--surface)] p-1 text-center text-sm"
                      title="Golpes 2º intervalo"
                    />
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={l.cm2}
                      onChange={(e) =>
                        atualizar(
                          i,
                          "cm2",
                          Math.min(999, Math.max(0, Number(e.target.value) || 0)),
                        )
                      }
                      className="w-full border-0 bg-[var(--surface)] p-1 text-center text-xs text-[var(--muted)]"
                      title="Penetração (cm) no 2º intervalo"
                    />
                  </div>
                </td>

                <td className="border border-[var(--border)] p-0 align-stretch">
                  <div className="flex min-w-[3.25rem] flex-col divide-y divide-[var(--border)]">
                    <input
                      type="number"
                      min={0}
                      value={l.g3}
                      onChange={(e) =>
                        atualizar(i, "g3", Number(e.target.value) || 0)
                      }
                      className="w-full border-0 bg-[var(--surface)] p-1 text-center text-sm"
                      title="Golpes 3º intervalo"
                    />
                    <input
                      type="number"
                      min={0}
                      max={999}
                      value={l.cm3}
                      onChange={(e) =>
                        atualizar(
                          i,
                          "cm3",
                          Math.min(999, Math.max(0, Number(e.target.value) || 0)),
                        )
                      }
                      className="w-full border-0 bg-[var(--surface)] p-1 text-center text-xs text-[var(--muted)]"
                      title="Penetração (cm) no 3º intervalo"
                    />
                  </div>
                </td>

                <td className="border border-[var(--border)] bg-[var(--surface)] p-2 font-bold tabular-nums">
                  {exibirSomaGolpes30cm(
                    s12,
                    avEfetivo,
                    "s12",
                    "campo",
                    temGolpesParaColuna30cm(
                      golpesSoma.g1,
                      golpesSoma.g2,
                      golpesSoma.g3,
                      "s12",
                    ),
                  )}
                </td>
                <td className="border border-[var(--border)] bg-[var(--surface)] p-2 font-bold tabular-nums">
                  {exibirSomaGolpes30cm(
                    s23,
                    avEfetivo,
                    "s23",
                    "campo",
                    temGolpesParaColuna30cm(
                      golpesSoma.g1,
                      golpesSoma.g2,
                      golpesSoma.g3,
                      "s23",
                    ),
                  )}
                </td>

                <td className="border border-[var(--border)] p-0 text-left align-top">
                  <div className="flex min-h-full gap-0">
                    <div
                      className="w-2 shrink-0 self-stretch border-r border-[var(--border)]"
                      style={{ backgroundColor: l.cor }}
                      title="Cor do material no PDF"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 p-2">
                      <SoloNomenclaturaCampo
                        compact
                        tipoPrincipal={l.solo}
                        detalhe={l.soloDetalhe}
                        onTipoChange={(tipo) => atualizar(i, "solo", tipo)}
                        onDetalheChange={(d) =>
                          atualizar(i, "soloDetalhe", d)
                        }
                      />
                    </div>
                  </div>
                </td>

                <td className="border border-[var(--border)] p-2">
                  <input
                    type="text"
                    value={l.obs}
                    onChange={(e) => atualizar(i, "obs", e.target.value)}
                    placeholder="NA, recusa, etc"
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-1 text-left"
                  />
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      {dados.length > 0 && (
        <section
          className="mt-10 border-t border-[var(--border)] pt-8"
          aria-label="Relatório PDF DataGeo Digital"
        >
          <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">
            Relatório (PDF) — DataGeo Digital / NBR 6484
          </h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Cabeçalho técnico e grelha de campo. O gráfico usa 2º+3º (azul) e
            1º+2º (vermelho), como nos relatórios de simples reconhecimento.
          </p>

          <div className="mb-4 print:hidden">
            <RelatorioFotosCampo
              fotos={fotosRelatorio}
              onChange={setFotosRelatorio}
              maxFotos={8}
            />
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 print:hidden">
            <LabeledInput
              id="spt-pdf-cliente"
              label="Cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-obra"
              label="Obra"
              value={obra}
              onChange={(e) => setObra(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-local"
              label="Local"
              value={localObra}
              onChange={(e) => setLocalObra(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-data-inicio"
              label="Data início"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              placeholder="dd/mm/aaaa"
            />
            <LabeledInput
              id="spt-pdf-data-fim"
              label="Data término"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              placeholder="dd/mm/aaaa"
            />
            <LabeledInput
              id="spt-pdf-pagina"
              label="Página"
              type="number"
              min={1}
              value={paginaPdf}
              onChange={(e) =>
                setPaginaPdf(Math.max(1, Number(e.target.value) || 1))
              }
            />
            <LabeledInput
              id="spt-pdf-total-paginas"
              label="Total de páginas"
              type="number"
              min={1}
              value={totalPaginasPdf}
              onChange={(e) =>
                setTotalPaginasPdf(Math.max(1, Number(e.target.value) || 1))
              }
            />
            <LabeledInput
              id="spt-pdf-amostrador-ext"
              label="Amostrador Ø ext. (mm)"
              value={amostradorExt}
              onChange={(e) => setAmostradorExt(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-amostrador-int"
              label="Amostrador Ø int. (mm)"
              value={amostradorInt}
              onChange={(e) => setAmostradorInt(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-revestimento"
              label="Revestimento (mm)"
              value={revestimentoMeta}
              onChange={(e) => setRevestimentoMeta(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-trado"
              label="Trado (mm)"
              value={trado}
              onChange={(e) => setTrado(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-altura-queda"
              label="Altura de queda"
              value={alturaQueda}
              onChange={(e) => setAlturaQueda(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-peso-martelo"
              label="Peso martelo"
              value={pesoMartelo}
              onChange={(e) => setPesoMartelo(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-sistema"
              label="Sistema"
              value={sistema}
              onChange={(e) => setSistema(e.target.value)}
              placeholder="ex.: manual"
            />
            <LabeledInput
              id="spt-pdf-cota"
              label="Cota (m)"
              value={cota}
              onChange={(e) => setCota(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-nivel-agua"
              label="Nível d'água (texto)"
              value={nivelAgua}
              onChange={(e) => setNivelAgua(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-na-prof"
              label="Prof. N.A. na grelha (m)"
              value={naProfundidade}
              onChange={(e) => setNaProfundidade(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-sondador"
              label="Sondador"
              value={sondador}
              onChange={(e) => setSondador(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-responsavel"
              label="Responsável técnico"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-crea"
              label="CREA"
              value={crea}
              onChange={(e) => setCrea(e.target.value)}
              placeholder="ex.: SC 137171-0"
            />
            <LabeledInput
              id="spt-pdf-rev-comp"
              label="Comprimento revestimento (m)"
              value={revestimentoComprimento}
              onChange={(e) => setRevestimentoComprimento(e.target.value)}
            />
            <LabeledInput
              id="spt-pdf-endereco"
              label="Endereço (rodapé)"
              value={enderecoEmpresa}
              onChange={(e) => setEnderecoEmpresa(e.target.value)}
              wrapperClassName="sm:col-span-2"
            />
            <LabeledInput
              id="spt-pdf-rodape"
              label="Contacto rodapé"
              value={rodapeContato}
              onChange={(e) => setRodapeContato(e.target.value)}
              placeholder="tel., e-mail, site"
              wrapperClassName="sm:col-span-2"
            />
          </div>

          <CamadasGeologicasEditor
            camadas={camadasGeologicas}
            onChange={setCamadasGeologicas}
            onAdicionar={adicionarCamadaGeol}
            descricao="Litologia da sondagem para o boletim. Cada «+ Camada» acrescenta uma linha no final da lista; use ✕ para apagar."
          />

          <button
            type="button"
            onClick={() => void gerarPDF()}
            disabled={pdfLoading}
            className="mb-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 print:hidden"
          >
            {pdfLoading ? "A gerar PDF…" : "Gerar PDF"}
          </button>

          {pdfErro && (
            <p
              className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 print:hidden"
              role="alert"
            >
              {pdfErro}
            </p>
          )}

          {!mapCoordsForPdf && (
            <p className="mb-4 text-sm text-amber-800 dark:text-amber-200 print:hidden">
              Mapa de localização: defina o pino no mapa, use GPS ou preencha
              Coord. Norte/Este e clique em «Atualizar mapa».
            </p>
          )}

          <SptRelatorioSoilsulPdf
            ref={pdfRef}
            linhas={linhasPdf}
            meta={{
              furoCodigo: codigoFuro,
              cliente,
              obra,
              local: localObra,
              dataInicio,
              dataFim,
              pagina: paginaPdf,
              totalPaginas: totalPaginasPdf,
              amostradorExt,
              amostradorInt,
              revestimento: revestimentoMeta,
              revestimentoComprimento: revestimentoComprimento || undefined,
              trado,
              alturaQueda,
              pesoMartelo,
              sistema,
              cota,
              nivelAgua,
              naProfundidade,
              coordN,
              coordE,
              fuso,
              sondador: sondador || undefined,
              responsavel,
              crea: crea || undefined,
              endereco: enderecoEmpresa,
              rodapeContato: rodapeContato || undefined,
              mapaLatitude: mapCoordsForPdf?.lat,
              mapaLongitude: mapCoordsForPdf?.lng,
              mapaZoom: 16,
              fotosCampo:
                fotosRelatorio.length > 0 ? fotosRelatorio : undefined,
            }}
          />
        </section>
      )}
    </div>
  );
}
