"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { TerrainProfileChart } from "@/components/rtk-validation/terrain-profile-chart";
import {
  profileKindFromLayer,
  resolveTerrainProfile,
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

  const profile = useMemo(
    () => resolveTerrainProfile(project.entities, selectedId),
    [project.entities, selectedId],
  );
  const profileKind = profile ? profileKindFromLayer(profile.layerId) : "longitudinal";

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
        kind: profileKind,
      });
      setNotice(t("profileOps.pdfOk"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setExporting(false);
    }
  };

  const sendToTaludes = () => {
    if (!profile || profile.vertices.length < 2) {
      setError(t("profileOps.needProfile"));
      return;
    }

    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const payload = buildCadTaludesImportFromProfile(profile, project.name);
      saveCadTaludesImport(payload);
      setNotice(t("profileOps.sendToTaludesOk"));
      router.push("/taludes?from=cad");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setSending(false);
    }
  };

  if (!profile) return null;

  const chartTitle =
    profileKind === "transversal"
      ? t("profileOps.chartTitleTransversal")
      : t("profileOps.chartTitle");

  return (
    <section className="rounded-xl border border-[#1e293b] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#0f2848]">{chartTitle}</h3>
          <p className="mt-0.5 text-[10px] text-[#6b7280]">{profile.name ?? t("profileOps.title")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={sending}
            onClick={sendToTaludes}
            title={t("profileOps.sendToTaludesHint")}
            className="rounded-lg bg-[#0f2848] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a3a5c] disabled:opacity-50"
          >
            {sending ? "…" : t("profileOps.sendToTaludes")}
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportProfilePdf()}
            className="rounded-lg border border-[#0f2848] px-3 py-1.5 text-xs font-semibold text-[#0f2848] hover:bg-[#f8fafc] disabled:opacity-50"
          >
            {exporting ? t("profileOps.pdfExporting") : t("profileOps.exportPdf")}
          </button>
        </div>
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
