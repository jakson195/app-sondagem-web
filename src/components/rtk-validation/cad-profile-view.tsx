"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { runQueuedInEffect } from "@/lib/react/queue-in-effect";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { TerrainProfileChart } from "@/components/rtk-validation/terrain-profile-chart";
import {
  listLongitudinalTerrainProfiles,
  listTerrainCrossSections,
  PROFILE_LAYER,
  profileKindFromLayer,
  resolveTerrainProfile,
  terrainElevationCoverage,
} from "@/lib/rtk-validation/cad/profile";
import {
  buildCadTaludesImportFromProfile,
  saveCadTaludesImport,
} from "@/lib/taludes/cad-profile-bridge";
import type { CadProject } from "@/lib/rtk-validation/cad/types";

type CadProfileViewProps = {
  project: CadProject;
  selectedId: string | null;
};

export function CadProfileView({ project, selectedId }: CadProfileViewProps) {
  const t = useTranslations("rtkCad.commands");
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string>("");

  const longitudinals = useMemo(
    () => listLongitudinalTerrainProfiles(project.entities),
    [project.entities],
  );
  const sections = useMemo(
    () => listTerrainCrossSections(project.entities),
    [project.entities],
  );
  const coverage = useMemo(
    () => terrainElevationCoverage(project.entities),
    [project.entities],
  );

  const profile = useMemo(() => {
    if (selectedId) {
      const selected = project.entities.find((e) => e.id === selectedId);
      if (selected?.type === "polyline" && selected.layerId === PROFILE_LAYER.id) return selected;
    }
    return longitudinals[longitudinals.length - 1] ?? resolveTerrainProfile(project.entities, selectedId);
  }, [project.entities, selectedId, longitudinals]);

  const profileKind = profile ? profileKindFromLayer(profile.layerId) : "longitudinal";
  const activeSection =
    sections.find((s) => s.id === sectionId) ??
    sections.find((s) => s.id === selectedId) ??
    sections[0] ??
    null;

  useEffect(
    () =>
      runQueuedInEffect(() => {
        if (selectedId && sections.some((s) => s.id === selectedId)) {
          setSectionId(selectedId);
          return;
        }
        if (sectionId && sections.some((s) => s.id === sectionId)) return;
        setSectionId(sections[0]?.id ?? "");
      }),
    [selectedId, sections, sectionId],
  );

  const exportProfilePdf = async () => {
    const target = profileKind === "transversal" ? (activeSection ?? profile) : profile;
    if (!target) return;
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const { downloadTerrainProfilePdf } = await import("@/lib/rtk-validation/cad/profile-pdf");
      downloadTerrainProfilePdf({
        profile: target,
        projectName: project.name,
        kind: profileKindFromLayer(target.layerId),
      });
      setNotice(t("profileOps.pdfOk"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setExporting(false);
    }
  };

  const sendToTaludes = () => {
    const target = profile && profile.vertices.length >= 2 ? profile : activeSection;
    if (!target || target.vertices.length < 2) {
      setError(t("profileOps.needProfile"));
      return;
    }

    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const payload = buildCadTaludesImportFromProfile(target, project.name);
      saveCadTaludesImport(payload);
      setNotice(t("profileOps.sendToTaludesOk"));
      router.push("/taludes?from=cad");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setSending(false);
    }
  };

  if (!profile && sections.length === 0) return null;

  const chartTitle =
    profile && profileKind !== "transversal"
      ? t("profileOps.chartTitle")
      : t("profileOps.chartTitleTransversal");

  return (
    <section className="rounded-xl border border-[#1e293b] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#0f2848]">{chartTitle}</h3>
          <p className="mt-0.5 text-[10px] text-[#6b7280]">
            {profile?.name ?? activeSection?.name ?? t("profileOps.title")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={sending || (!profile && !activeSection)}
            onClick={sendToTaludes}
            title={t("profileOps.sendToTaludesHint")}
            className="rounded-lg bg-[#0f2848] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a3a5c] disabled:opacity-50"
          >
            {sending ? "…" : t("profileOps.sendToTaludes")}
          </button>
          <button
            type="button"
            disabled={exporting || (!profile && !activeSection)}
            onClick={() => void exportProfilePdf()}
            className="rounded-lg border border-[#0f2848] px-3 py-1.5 text-xs font-semibold text-[#0f2848] hover:bg-[#f8fafc] disabled:opacity-50"
          >
            {exporting ? t("profileOps.pdfExporting") : t("profileOps.exportPdf")}
          </button>
        </div>
      </div>

      {coverage.zIncomplete ? (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
          {t("profileOps.zIncomplete")}
        </p>
      ) : null}

      {profile && profileKind !== "transversal" ? (
        <div className="mt-3">
          <TerrainProfileChart
            profile={profile}
            title={profile.name ?? undefined}
            distanceLabel={t("profileOps.distanceAxis")}
            elevationLabel={t("profileOps.elevationAxis")}
          />
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-[#ede9fe] bg-[#faf5ff] p-3">
        <h4 className="text-xs font-semibold text-[#4c1d95]">{t("profileOps.sectionsTitle")}</h4>
        {sections.length === 0 ? (
          <p className="mt-1 text-[10px] text-[#6b7280]">{t("profileOps.sectionsEmpty")}</p>
        ) : (
          <>
            <label className="mt-2 block text-[10px] font-medium text-[#4c1d95]">
              {t("profileOps.sectionStation")}
              <select
                value={activeSection?.id ?? ""}
                onChange={(e) => setSectionId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#ddd6fe] bg-white px-2 py-1.5 text-xs text-[#0f2848]"
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name ?? section.id}
                  </option>
                ))}
              </select>
            </label>
            {activeSection ? (
              <div className="mt-2">
                <TerrainProfileChart
                  profile={activeSection}
                  title={activeSection.name ?? undefined}
                  distanceLabel={t("profileOps.distanceAxis")}
                  elevationLabel={t("profileOps.elevationAxis")}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      {notice ? <p className="mt-2 text-xs text-emerald-700">{notice}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
