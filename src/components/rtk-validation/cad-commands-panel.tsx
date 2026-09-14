"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { runQueuedInEffect } from "@/lib/react/queue-in-effect";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { executeCadAiCommand, importKmzIntoProject } from "@/lib/rtk-validation/cad/ai-command-executor";
import { importSurveyPointsToProject } from "@/lib/rtk-validation/cad/import-survey-points";
import { parseSurveyUpload } from "@/lib/rtk-validation/parsers";
import type { CadAiCommand, CadAiSideEffect } from "@/lib/rtk-validation/cad/ai-command-types";
import { closedPolygonLabel, listClosedPolygons } from "@/lib/rtk-validation/cad/polygon-utils";
import { parseDrawNumber } from "@/lib/rtk-validation/cad/draw-utils";
import {
  applyTerrainCrossSectionsFromAlignment,
  applyTerrainProfileFromAlignment,
  findSelectedAlignment,
  listSelectableAlignments,
  polylineLengthM,
  resolveTerrainProfile,
} from "@/lib/rtk-validation/cad/profile";
import type { CadPointEntity, CadProject } from "@/lib/rtk-validation/cad/types";
import type { MemorialFormDefaults } from "@/lib/rtk-validation/cad/memorial-types";
import {
  buildCadTaludesImportFromProfile,
  saveCadTaludesImport,
} from "@/lib/taludes/cad-profile-bridge";


export interface CadCommandsPanelProps {
  project: CadProject;
  selectedId: string | null;
  memorialForm: MemorialFormDefaults;
  onProjectChange: (project: CadProject) => void;
  onSelectedIdChange: (id: string | null) => void;
  onSideEffect: (effect: CadAiSideEffect) => void;
  onOpenAiChat?: () => void;
  areaPickActive?: boolean;
  onStartAreaPick?: () => void;
  onCancelAreaPick?: () => void;
  areaPickResult?: string | null;
  onClearAreaPickResult?: () => void;
  distancePickActive?: boolean;
  onStartDistancePick?: () => void;
  onCancelDistancePick?: () => void;
  distancePickResult?: string | null;
  onClearDistancePickResult?: () => void;
  profilePickActive?: boolean;
  onStartProfilePick?: () => void;
  onCancelProfilePick?: () => void;
  profilePickResult?: string | null;
  onClearProfilePickResult?: () => void;
  alignmentPickActive?: boolean;
  onStartAlignmentPick?: () => void;
  onCancelAlignmentPick?: () => void;
  variant?: "full" | "profileOnly" | "embedded";
  selectedSegmentIndex?: number | null;
}

type CadCommandTab = "createPoint" | "point" | "distance" | "area" | "terrain" | "quick";

const COMMAND_TAB_ORDER: CadCommandTab[] = [
  "createPoint",
  "point",
  "distance",
  "area",
  "terrain",
  "quick",
];

const TOOL_BUTTONS: Array<{ ferramenta: string; labelKey: string }> = [
  { ferramenta: "selecionar", labelKey: "select" },
  { ferramenta: "pan", labelKey: "pan" },
  { ferramenta: "linha", labelKey: "line" },
  { ferramenta: "polilinha", labelKey: "polyline" },
  { ferramenta: "editar_poligono", labelKey: "editPolygon" },
  { ferramenta: "confrontacao", labelKey: "confrontacao" },
];

function commandTabClass(active: boolean, stacked: boolean) {
  return `whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
    stacked ? "xl:w-full" : ""
  } ${active ? "bg-[#0f2848] text-white" : "text-[#374151] hover:bg-[#f3f4f6]"}`;
}

const BTN_PRIMARY =
  "rounded-lg bg-[#0f2848] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1a3a5c] disabled:opacity-50";
const BTN_SECONDARY =
  "rounded-lg border border-[#d1d5db] px-3 py-2 text-xs font-medium text-[#0f2848] hover:bg-[#f9fafb] disabled:opacity-50";
const BTN_OUTLINE =
  "rounded-lg border border-[#0f2848] px-3 py-2 text-xs font-medium text-[#0f2848] hover:bg-[#f0f4f8] disabled:opacity-50";
const BTN_DANGER =
  "rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50";

type CommandBtn = {
  id: string;
  labelKey: string;
  command: CadAiCommand;
  accept?: string;
  importKmz?: boolean;
};

const COMMAND_BUTTONS: CommandBtn[] = [
  { id: "measure", labelKey: "measure", command: { acao: "medir" } },
  { id: "text", labelKey: "text", command: { acao: "inserir_texto", texto: "Lote 01" } },
  { id: "importTxt", labelKey: "importTxt", command: { acao: "importar", arquivo: "txt" }, accept: ".txt,.csv" },
  { id: "importExcel", labelKey: "importExcel", command: { acao: "importar", arquivo: "xlsx" }, accept: ".xlsx,.xls" },
  { id: "importKml", labelKey: "importKml", command: { acao: "importar", arquivo: "kml" }, accept: ".kml" },
  { id: "importKmz", labelKey: "importKmz", command: { acao: "importar", arquivo: "kmz" }, accept: ".kmz", importKmz: true },
  { id: "importDxf", labelKey: "importDxf", command: { acao: "importar", arquivo: "dxf" }, accept: ".dxf" },
  { id: "exportKml", labelKey: "exportKml", command: { acao: "exportar", formato: "kml" } },
  { id: "exportKmz", labelKey: "exportKmz", command: { acao: "exportar", formato: "kmz" } },
  { id: "contourLabel", labelKey: "contourLabel", command: { acao: "cota_curva" } },
];

export function CadCommandsPanel({
  project,
  selectedId,
  memorialForm,
  onProjectChange,
  onSelectedIdChange,
  onSideEffect,
  onOpenAiChat,
  areaPickActive,
  onStartAreaPick,
  onCancelAreaPick,
  areaPickResult,
  onClearAreaPickResult,
  distancePickActive,
  onStartDistancePick,
  onCancelDistancePick,
  distancePickResult,
  onClearDistancePickResult,
  profilePickActive,
  onStartProfilePick,
  onCancelProfilePick,
  profilePickResult,
  onClearProfilePickResult,
  alignmentPickActive,
  onStartAlignmentPick,
  onCancelAlignmentPick,
  variant = "full",
  selectedSegmentIndex = null,
}: CadCommandsPanelProps) {
  const t = useTranslations("rtkCad.commands");
  const tAi = useTranslations("rtkCad.ai");
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CadCommandTab>("createPoint");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sendingToTaludes, setSendingToTaludes] = useState(false);
  const [labelText, setLabelText] = useState("Lote 01");
  const [pointRef, setPointRef] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [elevationZ, setElevationZ] = useState("");
  const [createPointId, setCreatePointId] = useState("");
  const [createPointE, setCreatePointE] = useState("");
  const [createPointN, setCreatePointN] = useState("");
  const [createPointZ, setCreatePointZ] = useState("0");
  const [profileStart, setProfileStart] = useState("");
  const [profileEnd, setProfileEnd] = useState("");
  const [pendingProfileStart, setPendingProfileStart] = useState<string | null>(null);
  const [alignmentId, setAlignmentId] = useState("");
  const [sectionInterval, setSectionInterval] = useState("20");
  const [sectionHalfWidth, setSectionHalfWidth] = useState("10");
  const [areaPolygonId, setAreaPolygonId] = useState("");
  const [contourInterval, setContourInterval] = useState("1");
  const [volumeZ, setVolumeZ] = useState("");
  const [subdivideTestada, setSubdivideTestada] = useState("12");
  const [subdivideLado, setSubdivideLado] = useState("frente");
  const [streetName, setStreetName] = useState("");
  const [reserveTipo, setReserveTipo] = useState<"institucional" | "reserva_legal">("institucional");
  const [reservePercent, setReservePercent] = useState("20");
  const [reserveLado, setReserveLado] = useState("fundo");
  const [layerId, setLayerId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingImport = useRef<CommandBtn | null>(null);
  const [fileAccept, setFileAccept] = useState(".txt,.csv,.xlsx,.xls,.kml,.kmz");

  const selectedPoint = useMemo((): CadPointEntity | null => {
    if (!selectedId) return null;
    const entity = project.entities.find((e) => e.id === selectedId);
    return entity?.type === "point" ? entity : null;
  }, [project.entities, selectedId]);

  const terrainProfile = useMemo(
    () => resolveTerrainProfile(project.entities, selectedId),
    [project.entities, selectedId],
  );

  const alignments = useMemo(
    () => listSelectableAlignments(project.entities),
    [project.entities],
  );

  const activeAlignment = useMemo(
    () => findSelectedAlignment(project.entities, alignmentId || selectedId),
    [project.entities, alignmentId, selectedId],
  );

  const sendProfileToTaludes = useCallback(() => {
    if (!terrainProfile || terrainProfile.vertices.length < 2) {
      setError(t("profileOps.needProfile"));
      return;
    }

    setSendingToTaludes(true);
    setError(null);
    setNotice(null);

    try {
      const payload = buildCadTaludesImportFromProfile(terrainProfile, project.name);
      saveCadTaludesImport(payload);
      setNotice(t("profileOps.sendToTaludesOk"));
      router.push("/taludes?from=cad");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setSendingToTaludes(false);
    }
  }, [terrainProfile, project.name, router, t]);

  const closedPolygons = useMemo(
    () => listClosedPolygons(project.entities),
    [project.entities],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!selectedId) return;
        if (closedPolygons.some((p) => p.id === selectedId)) {
          setAreaPolygonId(selectedId);
        }
      }),
    [selectedId, closedPolygons],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (areaPickResult) {
          setNotice(areaPickResult);
          onClearAreaPickResult?.();
        }
      }),
    [areaPickResult, onClearAreaPickResult],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (distancePickResult) {
          setNotice(distancePickResult);
          onClearDistancePickResult?.();
        }
      }),
    [distancePickResult, onClearDistancePickResult],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (profilePickResult) {
          setNotice(profilePickResult);
          setPendingProfileStart(null);
          onClearProfilePickResult?.();
        }
      }),
    [profilePickResult, onClearProfilePickResult],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        const picked = findSelectedAlignment(project.entities, selectedId);
        if (picked) setAlignmentId(picked.id);
      }),
    [selectedId, project.entities],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (selectedPoint) {
          setPointRef(selectedPoint.label ?? selectedPoint.id);
          setElevationZ(selectedPoint.z.toFixed(4));
          if (!profileStart) setProfileStart(selectedPoint.label ?? selectedPoint.id);
        }
      }),
    [selectedPoint, profileStart],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (selectedPoint && !createPointE && !createPointN) {
          setCreatePointE(selectedPoint.x.toFixed(3));
          setCreatePointN(selectedPoint.y.toFixed(3));
          setCreatePointZ(selectedPoint.z.toFixed(4));
        }
      }),
    [selectedPoint, createPointE, createPointN],
  );

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (!layerId && project.layers[0]) setLayerId(project.layers[0].id);
      }),
    [layerId, project.layers],
  );

  useEffect(() => {
    return () => setBusy(null);
  }, []);

  const run = useCallback(
    (command: CadAiCommand, btnId?: string) => {
      setBusy(btnId ?? "run");
      setError(null);
      setNotice(null);
      try {
        const result = executeCadAiCommand(project, command, {
          selectedId,
          memorialForm,
          pendingProfileStart,
          selectedSegmentIndex,
        });
        if (result.ok === false) {
          setError(result.message);
          return;
        }
        onProjectChange(result.project);
        if (result.selectedId !== undefined) onSelectedIdChange(result.selectedId);
        if (result.meta?.pendingProfileStart !== undefined) {
          setPendingProfileStart(result.meta.pendingProfileStart);
        }
        for (const effect of result.sideEffects ?? []) {
          onSideEffect(effect);
        }
        setNotice(result.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error"));
      } finally {
        setBusy(null);
      }
    },
    [project, selectedId, memorialForm, pendingProfileStart, selectedSegmentIndex, onProjectChange, onSelectedIdChange, onSideEffect, t],
  );

  const parseCoordInput = (raw: string): number | null => {
    const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
    if (!normalized) return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  };

  const resolvePointRef = () => pointRef.trim() || selectedPoint?.label?.trim() || "";

  const applyRename = () => {
    const origem = resolvePointRef();
    const novo = renameTo.trim();
    if (!origem || !novo) {
      setError(t("pointOps.needRename"));
      return;
    }
    run({ acao: "alterar_id", id_origem: origem, novo_id: novo }, "renameApply");
  };

  const applyCreatePoint = () => {
    const e = parseCoordInput(createPointE);
    const n = parseCoordInput(createPointN);
    const z = parseCoordInput(createPointZ) ?? 0;
    if (e == null || n == null) {
      setError(t("createPointOps.invalidCoords"));
      return;
    }
    run(
      {
        acao: "criar_ponto",
        x: e,
        y: n,
        z,
        novo_id: createPointId.trim() || undefined,
      },
      "createPointApply",
    );
  };

  const applyProfile = () => {
    const start = profileStart.trim() || selectedPoint?.label?.trim() || "";
    const end = profileEnd.trim();
    if (!start) {
      setError(t("profileOps.needStart"));
      return;
    }

    if (!end) {
      run({ acao: "perfil_longitudinal", pontos: [start] }, "profileApply");
      return;
    }
    run({ acao: "perfil_longitudinal", pontos: [start, end] }, "profileApply");
  };

  const applyElevation = () => {
    const ref = resolvePointRef();
    const z = Number(elevationZ.replace(",", "."));
    if (!ref) {
      setError(t("pointOps.needPoint"));
      return;
    }
    if (!Number.isFinite(z)) {
      setError(t("pointOps.invalidZ"));
      return;
    }
    run({ acao: "alterar_cota", id_origem: ref, z }, "elevationApply");
  };

  const deletePoint = () => {
    const target = selectedPoint ?? (() => {
      const ref = resolvePointRef();
      if (!ref) return null;
      const hit = project.entities.find(
        (e) => e.type === "point" && (e.id === ref || e.label?.toLowerCase() === ref.toLowerCase()),
      );
      return hit?.type === "point" ? hit : null;
    })();

    if (!target) {
      setError(t("pointOps.needPoint"));
      return;
    }

    if (target.locked) {
      const name = target.label ?? target.id;
      if (!window.confirm(t("pointOps.confirmDeleteLocked", { name }))) return;
      run({ acao: "apagar", entidade_id: target.id, forcar: true }, "deletePoint");
      return;
    }

    run({ acao: "apagar", entidade_id: target.id }, "deletePoint");
  };

  const applyArea = () => {
    const id = areaPolygonId.trim();
    if (!id) {
      setError(t("areaOps.needPolygon"));
      return;
    }
    run({ acao: "medir_area", entidade_id: id }, "areaApply");
  };

  const startAreaPick = () => {
    setError(null);
    setNotice(t("areaOps.pickHint"));
    onStartAreaPick?.();
  };

  const cancelAreaPick = () => {
    onCancelAreaPick?.();
    setNotice(null);
  };

  const startDistancePick = () => {
    setError(null);
    setNotice(t("distanceOps.pickFirst"));
    onStartDistancePick?.();
  };

  const cancelDistancePick = () => {
    onCancelDistancePick?.();
    setNotice(null);
  };

  const startProfilePick = () => {
    setError(null);
    setPendingProfileStart(null);
    setNotice(t("profileOps.pickFirst"));
    onStartProfilePick?.();
  };

  const cancelProfilePick = () => {
    onCancelProfilePick?.();
    setPendingProfileStart(null);
    setNotice(null);
  };

  const startAlignmentPick = () => {
    setError(null);
    setNotice(t("profileOps.pickAlignmentHint"));
    onStartAlignmentPick?.();
  };

  const cancelAlignmentPick = () => {
    onCancelAlignmentPick?.();
    setNotice(null);
  };

  const handleAlignmentSelect = (id: string) => {
    setAlignmentId(id);
    if (id) onSelectedIdChange(id);
  };

  const generateTerrainFromAlignment = () => {
    const id = alignmentId || activeAlignment?.id || "";
    if (!id) {
      setError(t("profileOps.needAlignment"));
      return;
    }
    setBusy("terrainProfile");
    setError(null);
    try {
      const result = applyTerrainProfileFromAlignment(project, id);
      onProjectChange(result.project);
      onSelectedIdChange(id);
      setNotice(
        t("profileOps.terrainDone", {
          name: result.profile.name ?? t("profileOps.title"),
          stations: result.stationCount,
          length: result.lengthM.toFixed(1),
        }),
      );
      if (result.zIncomplete) setError(t("profileOps.zIncomplete"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(null);
    }
  };

  const generateCrossSectionsFromAlignment = () => {
    const id = alignmentId || activeAlignment?.id || "";
    if (!id) {
      setError(t("profileOps.needAlignment"));
      return;
    }
    const interval = parseDrawNumber(sectionInterval);
    const half = parseDrawNumber(sectionHalfWidth);
    if (interval == null || interval <= 0 || half == null || half <= 0) {
      setError(t("profileOps.needInterval"));
      return;
    }
    setBusy("terrainSections");
    setError(null);
    try {
      const result = applyTerrainCrossSectionsFromAlignment(project, id, interval, half);
      onProjectChange(result.project);
      onSelectedIdChange(id);
      setNotice(
        t("profileOps.sectionsDone", {
          count: result.sections.length,
          interval: result.intervalM.toFixed(1),
          width: (result.halfWidthM * 2).toFixed(1),
        }),
      );
      if (result.zIncomplete) setError(t("profileOps.zIncomplete"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(null);
    }
  };

  const handleAreaSelect = (id: string) => {
    setAreaPolygonId(id);
    if (id) onSelectedIdChange(id);
  };

  const handleButton = (btn: CommandBtn) => {
    if (btn.accept) {
      pendingImport.current = btn;
      setFileAccept(btn.accept);
      window.requestAnimationFrame(() => fileRef.current?.click());
      return;
    }
    if (btn.id === "text") {
      const texto = labelText.trim() || "Lote 01";
      run({ acao: "inserir_texto", texto }, btn.id);
      return;
    }
    run(btn.command, btn.id);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const btn = pendingImport.current;
    e.target.value = "";
    pendingImport.current = null;
    if (!file || !btn) return;

    setBusy(btn.id);
    setError(null);

    if (btn.importKmz) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const result = importKmzIntoProject(project, reader.result as ArrayBuffer);
          if (result.ok === false) {
            setError(result.message);
            return;
          }
          onProjectChange(result.project);
          if (result.selectedId !== undefined) onSelectedIdChange(result.selectedId);
          for (const effect of result.sideEffects ?? []) {
            onSideEffect(effect);
          }
          setNotice(result.message);
        } catch (err) {
          setError(err instanceof Error ? err.message : t("error"));
        } finally {
          setBusy(null);
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const isExcel = btn.id === "importExcel" || /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => {
      setError(t("error"));
      setBusy(null);
    };
    reader.onload = () => {
      void (async () => {
        try {
          if (isExcel) {
            const parsed = await parseSurveyUpload(file.name, reader.result as ArrayBuffer);
            if (parsed.points.length === 0) {
              setError(parsed.warnings.join(" ") || t("error"));
              return;
            }
            const next = importSurveyPointsToProject(project, parsed.points, "PONTOS_EXCEL");
            onProjectChange(next);
            setNotice(t("importExcelOk", { count: parsed.points.length, name: file.name }));
            return;
          }
          const result = executeCadAiCommand(
            project,
            {
              acao: "importar",
              arquivo: btn.id === "importKml" ? "kml" : "txt",
              conteudo: String(reader.result ?? ""),
            },
            { selectedId, memorialForm },
          );
          if (result.ok === false) {
            setError(result.message);
            return;
          }
          onProjectChange(result.project);
          if (result.selectedId !== undefined) onSelectedIdChange(result.selectedId);
          for (const effect of result.sideEffects ?? []) {
            onSideEffect(effect);
          }
          setNotice(result.message);
        } catch (err) {
          setError(err instanceof Error ? err.message : t("error"));
        } finally {
          setBusy(null);
        }
      })();
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, "utf-8");
  };

  const profileSection = (
    <section>
      <h3 className="text-sm font-semibold text-[#0f2848]">{t("profileOps.title")}</h3>
      <p className="mt-1 text-xs text-[#6b7280]">{t("profileOps.hint")}</p>

      <div className="mt-3 rounded-lg border border-[#dbeafe] bg-[#f8fafc] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1e3a5f]">
          {t("profileOps.alignmentTitle")}
        </p>
        <p className="mt-1 text-[10px] text-[#6b7280]">{t("profileOps.alignmentHint")}</p>
        <label className="mt-2 block text-xs font-medium text-[#374151]">
          {t("profileOps.alignmentSelect")}
          <select
            value={alignmentId}
            onChange={(e) => handleAlignmentSelect(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d1d5db] bg-white px-2 py-2 text-xs"
          >
            <option value="">{t("profileOps.alignmentPlaceholder")}</option>
            {alignments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {activeAlignment ? (
          <p className="mt-2 text-[10px] font-medium text-[#0f2848]">
            {t("profileOps.alignmentSelected", {
              name: activeAlignment.name,
              length: polylineLengthM(activeAlignment.vertices).toFixed(1),
              vertices: activeAlignment.vertices.length,
            })}
          </p>
        ) : (
          <p className="mt-2 text-[10px] text-amber-800">
            {alignments.length === 0 ? t("profileOps.noAlignments") : t("profileOps.needAlignment")}
          </p>
        )}
        <button
          type="button"
          disabled={busy !== null || alignmentPickActive || profilePickActive}
          onClick={startAlignmentPick}
          className={`mt-2 w-full ${BTN_OUTLINE}`}
        >
          {alignmentPickActive ? t("profileOps.pickingAlignment") : t("profileOps.pickAlignment")}
        </button>
        {alignmentPickActive ? (
          <button type="button" onClick={cancelAlignmentPick} className={`mt-2 w-full ${BTN_SECONDARY}`}>
            {t("profileOps.cancelPick")}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        disabled={busy !== null || !activeAlignment}
        onClick={generateTerrainFromAlignment}
        className={`mt-3 w-full ${BTN_PRIMARY}`}
      >
        {busy === "terrainProfile" ? "…" : t("profileOps.generateTerrain")}
      </button>

      <p className="mt-3 text-[10px] text-[#6b7280]">{t("profileOps.sectionsParamsHint")}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-[#374151]">
          {t("profileOps.interval")}
          <input
            type="text"
            inputMode="decimal"
            value={sectionInterval}
            onChange={(e) => setSectionInterval(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 font-mono text-xs"
          />
        </label>
        <label className="block text-xs font-medium text-[#374151]">
          {t("profileOps.halfWidth")}
          <input
            type="text"
            inputMode="decimal"
            value={sectionHalfWidth}
            onChange={(e) => setSectionHalfWidth(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 font-mono text-xs"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy !== null || !activeAlignment}
        onClick={generateCrossSectionsFromAlignment}
        className="mt-2 w-full rounded-lg bg-[#7c3aed] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-50"
      >
        {busy === "terrainSections" ? "…" : t("profileOps.generateCrossSections")}
      </button>

      <button
        type="button"
        disabled={!terrainProfile || sendingToTaludes || busy !== null}
        onClick={sendProfileToTaludes}
        title={t("profileOps.sendToTaludesHint")}
        className={`mt-3 w-full ${BTN_PRIMARY}`}
      >
        {sendingToTaludes ? "…" : t("profileOps.sendToTaludes")}
      </button>
      {!terrainProfile ? (
        <p className="mt-1 text-[10px] text-[#6b7280]">{t("profileOps.needProfile")}</p>
      ) : null}

      <details className="mt-4 rounded-lg border border-[#e5e7eb] px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-[#0f2848]">
          {t("profileOps.twoPointsTitle")}
        </summary>
        <p className="mt-1 text-[10px] text-[#6b7280]">{t("profileOps.twoPointsHint")}</p>
        {pendingProfileStart ? (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            {t("profileOps.pendingStart", { point: pendingProfileStart })}
          </p>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block text-xs font-medium text-[#374151]">
            {t("profileOps.startPoint")}
            <input
              type="text"
              value={profileStart}
              onChange={(e) => setProfileStart(e.target.value)}
              placeholder="P1"
              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 text-xs"
            />
          </label>
          <label className="block text-xs font-medium text-[#374151]">
            {t("profileOps.endPoint")}
            <input
              type="text"
              value={profileEnd}
              onChange={(e) => setProfileEnd(e.target.value)}
              placeholder="P2"
              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 text-xs"
            />
          </label>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy !== null || profilePickActive || alignmentPickActive}
            onClick={startProfilePick}
            className={BTN_OUTLINE}
          >
            {profilePickActive ? t("profileOps.picking") : t("profileOps.pickOnCanvas")}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={applyProfile}
            className={BTN_PRIMARY}
          >
            {busy === "profileApply" ? "…" : t("profileOps.generate")}
          </button>
        </div>
        {profilePickActive ? (
          <button type="button" onClick={cancelProfilePick} className={`mt-2 w-full ${BTN_SECONDARY}`}>
            {t("profileOps.cancelPick")}
          </button>
        ) : null}
      </details>
    </section>
  );

  const statusMessages = (
    <>
      {notice ? <p className="text-xs text-emerald-700">{notice}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </>
  );

  const tabSections: Record<CadCommandTab, ReactNode> = {
    createPoint: (
      <section>
        <h3 className="text-sm font-semibold text-[#0f2848]">{t("createPointOps.title")}</h3>
        <p className="mt-1 text-xs text-[#6b7280]">{t("createPointOps.hint")}</p>
        <label className="mt-3 block text-xs font-medium text-[#374151]">
          {t("createPointOps.label")}
          <input
            type="text"
            value={createPointId}
            onChange={(e) => setCreatePointId(e.target.value)}
            placeholder={t("createPointOps.labelPlaceholder")}
            className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
          />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="block text-xs font-medium text-[#374151]">
            {t("createPointOps.east")}
            <input
              type="text"
              inputMode="decimal"
              value={createPointE}
              onChange={(e) => setCreatePointE(e.target.value)}
              placeholder="500123,456"
              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 font-mono text-xs"
            />
          </label>
          <label className="block text-xs font-medium text-[#374151]">
            {t("createPointOps.north")}
            <input
              type="text"
              inputMode="decimal"
              value={createPointN}
              onChange={(e) => setCreatePointN(e.target.value)}
              placeholder="7398456,789"
              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 font-mono text-xs"
            />
          </label>
          <label className="block text-xs font-medium text-[#374151]">
            {t("createPointOps.z")}
            <input
              type="text"
              inputMode="decimal"
              value={createPointZ}
              onChange={(e) => setCreatePointZ(e.target.value)}
              placeholder="812,345"
              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 font-mono text-xs"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={applyCreatePoint}
          className={`mt-3 w-full ${BTN_PRIMARY}`}
        >
          {busy === "createPointApply" ? t("working") : t("createPointOps.insert")}
        </button>
      </section>
    ),
    point: (
      <section>
        <h3 className="text-sm font-semibold text-[#0f2848]">{t("pointOps.title")}</h3>
        <p className="mt-1 text-xs text-[#6b7280]">{t("pointOps.hint")}</p>
        <label className="mt-3 block text-xs font-medium text-[#374151]">
          {t("pointOps.pointRef")}
          <input
            type="text"
            value={pointRef}
            onChange={(e) => setPointRef(e.target.value)}
            placeholder={t("pointOps.pointRefPlaceholder")}
            className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-2 font-mono text-xs"
          />
        </label>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <label className="block text-xs font-medium text-[#374151]">
            {t("pointOps.newName")}
            <input
              type="text"
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
              placeholder="V-01"
              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
            />
          </label>
          <button type="button" disabled={busy !== null} onClick={applyRename} className={`mt-5 ${BTN_OUTLINE}`}>
            {busy === "renameApply" ? "…" : t("pointOps.rename")}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <label className="block text-xs font-medium text-[#374151]">
            {t("pointOps.newZ")}
            <input
              type="text"
              inputMode="decimal"
              value={elevationZ}
              onChange={(e) => setElevationZ(e.target.value)}
              placeholder="245.500"
              className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-2 font-mono text-xs"
            />
          </label>
          <button type="button" disabled={busy !== null} onClick={applyElevation} className={`mt-5 ${BTN_PRIMARY}`}>
            {busy === "elevationApply" ? "…" : t("pointOps.applyZ")}
          </button>
        </div>
        <button type="button" disabled={busy !== null} onClick={deletePoint} className={`mt-3 w-full ${BTN_DANGER}`}>
          {busy === "deletePoint" ? t("working") : t("pointOps.delete")}
        </button>
      </section>
    ),
    distance: (
      <section>
        <h3 className="text-sm font-semibold text-[#0f2848]">{t("distanceOps.title")}</h3>
        <p className="mt-1 text-xs text-[#6b7280]">{t("distanceOps.hint")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy !== null || distancePickActive}
            onClick={startDistancePick}
            className={BTN_OUTLINE}
          >
            {distancePickActive ? t("distanceOps.picking") : t("distanceOps.pickOnCanvas")}
          </button>
          <button
            type="button"
            disabled={busy !== null || !selectedPoint}
            onClick={() => {
              const second = window.prompt(t("distanceOps.secondPointPrompt"));
              if (!second?.trim() || !selectedPoint) return;
              run(
                {
                  acao: "medir_distancia",
                  pontos: [selectedPoint.label ?? selectedPoint.id, second.trim()],
                },
                "distanceApply",
              );
            }}
            className={BTN_PRIMARY}
          >
            {busy === "distanceApply" ? "…" : t("buttons.distance")}
          </button>
        </div>
        {distancePickActive ? (
          <button type="button" onClick={cancelDistancePick} className={`mt-2 w-full ${BTN_SECONDARY}`}>
            {t("distanceOps.cancelPick")}
          </button>
        ) : null}
      </section>
    ),
    area: (
      <section>
        <h3 className="text-sm font-semibold text-[#0f2848]">{t("areaOps.title")}</h3>
        <p className="mt-1 text-xs text-[#6b7280]">{t("areaOps.hint")}</p>
        {closedPolygons.length === 0 ? (
          <p className="mt-3 text-xs text-amber-700">{t("areaOps.noPolygons")}</p>
        ) : (
          <>
            <label className="mt-3 block text-xs font-medium text-[#374151]">
              {t("areaOps.polygonSelect")}
              <select
                value={areaPolygonId}
                onChange={(e) => handleAreaSelect(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
              >
                <option value="">{t("areaOps.polygonPlaceholder")}</option>
                {closedPolygons.map((poly, index) => (
                  <option key={poly.id} value={poly.id}>
                    {closedPolygonLabel(poly, index)} ({poly.vertices.length} {t("areaOps.vertices")})
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy !== null || areaPickActive}
                onClick={startAreaPick}
                className={BTN_OUTLINE}
              >
                {areaPickActive ? t("areaOps.picking") : t("areaOps.pickOnCanvas")}
              </button>
              <button
                type="button"
                disabled={busy !== null || !areaPolygonId}
                onClick={applyArea}
                className={BTN_PRIMARY}
              >
                {busy === "areaApply" ? "…" : t("areaOps.calculate")}
              </button>
            </div>
            {areaPickActive ? (
              <button type="button" onClick={cancelAreaPick} className={`mt-2 w-full ${BTN_SECONDARY}`}>
                {t("areaOps.cancelPick")}
              </button>
            ) : null}
          </>
        )}
      </section>
    ),
    terrain: (
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-[#0f2848]">{t("terrainOps.title")}</h3>
          <p className="mt-1 text-xs text-[#6b7280]">{t("terrainOps.hint")}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-[#374151]">{t("terrainOps.toolsTitle")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {TOOL_BUTTONS.map((btn) => (
              <button
                key={btn.ferramenta}
                type="button"
                disabled={busy !== null}
                onClick={() => run({ acao: "ativar_ferramenta", ferramenta: btn.ferramenta }, `tool-${btn.ferramenta}`)}
                className={`${BTN_SECONDARY} text-left`}
              >
                {t(`terrainOps.tools.${btn.labelKey}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[#374151]">{t("terrainOps.layerTitle")}</p>
          <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
            <select
              value={layerId}
              onChange={(e) => setLayerId(e.target.value)}
              className="w-full rounded-lg border border-[#d1d5db] px-2 py-2 text-xs"
            >
              {project.layers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy !== null || !layerId}
              onClick={() => {
                const layer = project.layers.find((l) => l.id === layerId);
                run({ acao: "trocar_camada", camada: layer?.name ?? layerId, visivel: true }, "layerShow");
              }}
              className={BTN_OUTLINE}
            >
              {t("terrainOps.layerShow")}
            </button>
            <button
              type="button"
              disabled={busy !== null || !layerId}
              onClick={() => {
                const layer = project.layers.find((l) => l.id === layerId);
                run({ acao: "trocar_camada", camada: layer?.name ?? layerId, visivel: false }, "layerHide");
              }}
              className={BTN_SECONDARY}
            >
              {t("terrainOps.layerHide")}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[#374151]">{t("terrainOps.contourTitle")}</p>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <label className="block text-xs text-[#6b7280]">
              {t("terrainOps.contourInterval")}
              <input
                type="text"
                inputMode="decimal"
                value={contourInterval}
                onChange={(e) => setContourInterval(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 font-mono text-xs"
              />
            </label>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                const interval = parseCoordInput(contourInterval);
                if (interval == null || interval <= 0) {
                  setError(t("terrainOps.needInterval"));
                  return;
                }
                run({ acao: "curvas_nivel", intervalo: interval, equidistancia: interval }, "contourApply");
              }}
              className={`mt-5 ${BTN_PRIMARY}`}
            >
              {busy === "contourApply" ? "…" : t("terrainOps.contourGenerate")}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[#374151]">{t("terrainOps.volumeTitle")}</p>
          <p className="mt-1 text-[10px] text-[#6b7280]">{t("terrainOps.volumeHint")}</p>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <label className="block text-xs text-[#6b7280]">
              {t("terrainOps.volumeZ")}
              <input
                type="text"
                inputMode="decimal"
                value={volumeZ}
                onChange={(e) => setVolumeZ(e.target.value)}
                placeholder={t("terrainOps.volumeZPlaceholder")}
                className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 font-mono text-xs"
              />
            </label>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                const z = parseCoordInput(volumeZ);
                run(
                  { acao: "volume_corte", z: z ?? undefined, usarSelecao: true, entidade_id: selectedId ?? undefined },
                  "volumeApply",
                );
              }}
              className={`mt-5 ${BTN_PRIMARY}`}
            >
              {busy === "volumeApply" ? "…" : t("terrainOps.volumeCalculate")}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[#374151]">{t("terrainOps.subdivideTitle")}</p>
          <p className="mt-1 text-[10px] text-[#6b7280]">{t("terrainOps.subdivideHint")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block text-xs text-[#6b7280]">
              {t("terrainOps.subdivideTestada")}
              <input
                type="text"
                inputMode="decimal"
                value={subdivideTestada}
                onChange={(e) => setSubdivideTestada(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 font-mono text-xs"
              />
            </label>
            <label className="block text-xs text-[#6b7280]">
              {t("terrainOps.subdivideLado")}
              <select
                value={subdivideLado}
                onChange={(e) => setSubdivideLado(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 text-xs"
              >
                <option value="frente">{t("terrainOps.ladoFrente")}</option>
                <option value="norte">{t("terrainOps.ladoNorte")}</option>
                <option value="sul">{t("terrainOps.ladoSul")}</option>
                <option value="leste">{t("terrainOps.ladoLeste")}</option>
                <option value="oeste">{t("terrainOps.ladoOeste")}</option>
                <option value="selecionado_no_mapa">{t("terrainOps.ladoSelecionado")}</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              const testada = parseCoordInput(subdivideTestada);
              if (testada == null || testada <= 0) {
                setError(t("terrainOps.needTestada"));
                return;
              }
              if (!window.confirm(t("terrainOps.subdivideConfirm"))) return;
              run(
                {
                  acao: "subdividir_quadra",
                  testada_m: testada,
                  lado: subdivideLado,
                  usarSelecao: true,
                  entidade_id: selectedId ?? undefined,
                },
                "subdivideApply",
              );
            }}
            className={`mt-2 w-full ${BTN_PRIMARY}`}
          >
            {busy === "subdivideApply" ? t("working") : t("terrainOps.subdivideApply")}
          </button>
        </div>

        <div>
          <p className="text-xs font-medium text-[#374151]">{t("terrainOps.streetTitle")}</p>
          <p className="mt-1 text-[10px] text-[#6b7280]">{t("terrainOps.streetHint")}</p>
          <input
            type="text"
            value={streetName}
            onChange={(e) => setStreetName(e.target.value)}
            placeholder={t("terrainOps.streetNamePlaceholder")}
            className="mt-2 w-full rounded-lg border border-[#d1d5db] px-2 py-2 text-xs"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run(
                {
                  acao: "criar_rua_existente",
                  nome: streetName.trim() || undefined,
                  usarSelecao: true,
                  entidade_id: selectedId ?? undefined,
                },
                "streetApply",
              )
            }
            className={`mt-2 w-full ${BTN_OUTLINE}`}
          >
            {busy === "streetApply" ? t("working") : t("terrainOps.streetApply")}
          </button>
        </div>

        <div>
          <p className="text-xs font-medium text-[#374151]">{t("terrainOps.alterarEixo")}</p>
          <p className="mt-1 text-[10px] text-[#6b7280]">{t("terrainOps.alterarEixoHint")}</p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run({ acao: "alterar_eixo" }, "alterarEixo")}
            className={`mt-2 w-full ${BTN_OUTLINE}`}
          >
            {busy === "alterarEixo" ? t("working") : t("terrainOps.alterarEixo")}
          </button>
        </div>

        <div>
          <p className="text-xs font-medium text-[#374151]">{t("terrainOps.reserveTitle")}</p>
          <p className="mt-1 text-[10px] text-[#6b7280]">{t("terrainOps.reserveHint")}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <label className="block text-xs text-[#6b7280]">
              {t("terrainOps.reserveTipo")}
              <select
                value={reserveTipo}
                onChange={(e) => setReserveTipo(e.target.value as "institucional" | "reserva_legal")}
                className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 text-xs"
              >
                <option value="institucional">{t("terrainOps.reserveInstitucional")}</option>
                <option value="reserva_legal">{t("terrainOps.reserveLegal")}</option>
              </select>
            </label>
            <label className="block text-xs text-[#6b7280]">
              {t("terrainOps.reservePercent")}
              <input
                type="text"
                inputMode="decimal"
                value={reservePercent}
                onChange={(e) => setReservePercent(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 font-mono text-xs"
              />
            </label>
            <label className="block text-xs text-[#6b7280]">
              {t("terrainOps.reserveLado")}
              <select
                value={reserveLado}
                onChange={(e) => setReserveLado(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#d1d5db] px-2 py-2 text-xs"
              >
                <option value="frente">{t("terrainOps.ladoFrente")}</option>
                <option value="fundo">{t("terrainOps.ladoFundo")}</option>
                <option value="esquerda">{t("terrainOps.ladoEsquerda")}</option>
                <option value="direita">{t("terrainOps.ladoDireita")}</option>
                <option value="superior_direita">{t("terrainOps.cantoSuperiorDireita")}</option>
                <option value="superior_esquerda">{t("terrainOps.cantoSuperiorEsquerda")}</option>
                <option value="inferior_direita">{t("terrainOps.cantoInferiorDireita")}</option>
                <option value="inferior_esquerda">{t("terrainOps.cantoInferiorEsquerda")}</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              const percentual = parseCoordInput(reservePercent);
              if (percentual == null || percentual <= 0 || percentual >= 100) {
                setError(t("terrainOps.needPercent"));
                return;
              }
              if (!window.confirm(t("terrainOps.reserveConfirm"))) return;
              run(
                {
                  acao: "reservar_area",
                  tipo: reserveTipo,
                  percentual,
                  lado: reserveLado,
                  usarSelecao: true,
                  entidade_id: selectedId ?? undefined,
                },
                "reserveApply",
              );
            }}
            className={`mt-2 w-full ${BTN_PRIMARY}`}
          >
            {busy === "reserveApply" ? t("working") : t("terrainOps.reserveApply")}
          </button>
        </div>
      </section>
    ),
    quick: (
      <section>
        <h3 className="text-sm font-semibold text-[#0f2848]">{t("tabs.quick")}</h3>
        <p className="mt-1 text-xs text-[#6b7280]">{t("hint")}</p>
        <label className="mt-3 block text-xs font-medium text-[#374151]">
          {t("textLabel")}
          <input
            type="text"
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            placeholder={t("textPlaceholder")}
            className="mt-1 w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-xs"
          />
        </label>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {COMMAND_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              type="button"
              disabled={busy !== null}
              onClick={() => handleButton(btn)}
              className={`${BTN_SECONDARY} text-left`}
            >
              {t(`buttons.${btn.labelKey}`, { defaultMessage: btn.labelKey })}
            </button>
          ))}
        </div>
        {onOpenAiChat ? (
          <button type="button" onClick={onOpenAiChat} className={`mt-3 w-full ${BTN_OUTLINE}`}>
            {tAi("openChat")}…
          </button>
        ) : null}
      </section>
    ),
  };

  if (variant === "profileOnly") {
    return (
      <div className="space-y-3">
        {profileSection}
        {statusMessages}
      </div>
    );
  }

  const stackedTabs = variant !== "embedded";
  const body = (
    <>
      {variant === "embedded" ? (
        <p className="text-xs text-[#6b7280]">{t("hint")}</p>
      ) : (
        <div className="shrink-0 border-b border-[#e5e7eb] px-3 py-3">
          <h3 className="text-sm font-semibold text-[#0f2848]">{t("title")}</h3>
          <p className="mt-0.5 text-xs text-[#6b7280]">{t("hint")}</p>
        </div>
      )}
      <nav
        className={
          stackedTabs
            ? "flex shrink-0 flex-col gap-1 overflow-y-auto border-b border-[#e5e7eb] p-2"
            : "flex flex-wrap gap-1"
        }
      >
        {COMMAND_TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={commandTabClass(activeTab === tab, stackedTabs)}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </nav>
      <div className={variant === "embedded" ? "space-y-3" : "min-h-0 flex-1 space-y-3 overflow-y-auto p-3"}>
        {tabSections[activeTab]}
        {statusMessages}
      </div>
      <input ref={fileRef} type="file" accept={fileAccept} className="hidden" onChange={handleFile} />
    </>
  );

  if (variant === "embedded") {
    return <div className="space-y-3">{body}</div>;
  }

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm xl:max-h-[calc(100vh-12rem)]">
      {body}
    </aside>
  );
}
