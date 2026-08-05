"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { TerrainProfileChart } from "@/components/rtk-validation/terrain-profile-chart";
import { PROFILE_LAYER } from "@/lib/rtk-validation/cad/profile";
import type { CadPolylineEntity, CadProject } from "@/lib/rtk-validation/cad/types";

type CadProfileViewProps = {
  project: CadProject;
  selectedId: string | null;
};

export function CadProfileView({ project, selectedId }: CadProfileViewProps) {
  const t = useTranslations("rtkCad.commands");
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProfile = useMemo((): CadPolylineEntity | null => {
    if (!selectedId) return null;
    const entity = project.entities.find((e) => e.id === selectedId);
    return entity?.type === "polyline" && entity.layerId === PROFILE_LAYER.id ? entity : null;
  }, [project.entities, selectedId]);

  const latestProfile = useMemo((): CadPolylineEntity | null => {
    const profiles = project.entities.filter(
      (e): e is CadPolylineEntity => e.type === "polyline" && e.layerId === PROFILE_LAYER.id,
    );
    return profiles.length > 0 ? profiles[profiles.length - 1] : null;
  }, [project.entities]);

  const profile = selectedProfile ?? latestProfile;

  const exportProfilePdf = async () => {
    if (!profile) return;
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const { downloadTerrainProfilePdf } = await import("@/lib/rtk-validation/cad/profile-pdf");
      downloadTerrainProfilePdf({
        profile,
        projectName: project.name,
        kind: "longitudinal",
      });
      setNotice(t("profileOps.pdfOk"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setExporting(false);
    }
  };

  if (!profile) return null;

  return (
    <section className="rounded-xl border border-[#1e293b] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#0f2848]">{t("profileOps.chartTitle")}</h3>
          <p className="mt-0.5 text-[10px] text-[#6b7280]">{profile.name ?? t("profileOps.title")}</p>
        </div>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void exportProfilePdf()}
          className="rounded-lg border border-[#0f2848] px-3 py-1.5 text-xs font-semibold text-[#0f2848] hover:bg-[#f8fafc] disabled:opacity-50"
        >
          {exporting ? t("profileOps.pdfExporting") : t("profileOps.exportPdf")}
        </button>
      </div>

      <div className="mt-3">
        <TerrainProfileChart
          profile={profile}
          title={profile.name ?? undefined}
          distanceLabel={t("profileOps.distanceAxis")}
          elevationLabel={t("profileOps.elevationAxis")}
        />
      </div>

      {notice ? <p className="mt-2 text-xs text-emerald-700">{notice}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
