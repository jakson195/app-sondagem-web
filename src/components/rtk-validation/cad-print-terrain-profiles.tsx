"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { TerrainProfileChart } from "@/components/rtk-validation/terrain-profile-chart";
import {
  listLongitudinalTerrainProfiles,
  listTerrainCrossSections,
} from "@/lib/rtk-validation/cad/profile";
import type { CadProject } from "@/lib/rtk-validation/cad/types";

type CadPrintTerrainProfilesProps = {
  project: CadProject;
};

/** Pré-visualização dos perfis/seções gerados — encaixa no layout de impressão sem alterar a prancha ABNT. */
export function CadPrintTerrainProfiles({ project }: CadPrintTerrainProfilesProps) {
  const t = useTranslations("rtkCad.commands");
  const [sectionId, setSectionId] = useState("");

  const profiles = useMemo(
    () => listLongitudinalTerrainProfiles(project.entities),
    [project.entities],
  );
  const sections = useMemo(
    () => listTerrainCrossSections(project.entities),
    [project.entities],
  );

  if (profiles.length === 0 && sections.length === 0) return null;

  const profile = profiles[profiles.length - 1];
  const section = sections.find((s) => s.id === sectionId) ?? sections[0] ?? null;

  return (
    <section className="cad-print-terrain-profiles mt-4 rounded-xl border border-[#c7d2fe] bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-[#0f2848]">{t("profileOps.printProfilesTitle")}</h3>
      <p className="mt-1 text-[10px] text-[#6b7280]">{t("profileOps.printProfilesHint")}</p>
      {profile ? (
        <div className="mt-3">
          <TerrainProfileChart
            profile={profile}
            title={profile.name ?? t("profileOps.chartTitle")}
            distanceLabel={t("profileOps.distanceAxis")}
            elevationLabel={t("profileOps.elevationAxis")}
          />
        </div>
      ) : null}
      {sections.length > 0 ? (
        <div className="mt-3">
          <label className="block text-[10px] font-medium text-[#4c1d95]">
            {t("profileOps.sectionsTitle")}
            <select
              value={section?.id ?? ""}
              onChange={(e) => setSectionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#ddd6fe] bg-white px-2 py-1.5 text-xs"
            >
              {sections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name ?? item.id}
                </option>
              ))}
            </select>
          </label>
          {section ? (
            <div className="mt-2">
              <TerrainProfileChart
                profile={section}
                title={section.name ?? t("profileOps.chartTitleTransversal")}
                distanceLabel={t("profileOps.distanceAxis")}
                elevationLabel={t("profileOps.elevationAxis")}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
