"use client";

import { SecaoTipoPreview } from "@/components/rtk-validation/secao-tipo-preview";
import { StreetProfileChart } from "@/components/rtk-validation/street-profile-chart";
import { TerrainProfileChart } from "@/components/rtk-validation/terrain-profile-chart";
import type { SecaoTipoParams, StreetProfileDraft } from "@/lib/rtk-validation/cad/street-profile";
import type { CadPolylineEntity } from "@/lib/rtk-validation/cad/types";

export type PrintSheetContent = "planta" | "secao-tipo" | "perfil";

type CadPrintStreetSheetProps = {
  kind: Exclude<PrintSheetContent, "planta">;
  params?: SecaoTipoParams | null;
  profile?: StreetProfileDraft | null;
  terrainSection?: CadPolylineEntity | null;
  emptyLabel: string;
  pistaLabel: string;
  calcadaLabel: string;
  corteLabel: string;
  aterroLabel: string;
  axisLabel: string;
  secaoTitle: string;
  perfilTitle?: string;
};

export function CadPrintStreetSheet({
  kind,
  params,
  profile,
  terrainSection = null,
  emptyLabel,
  pistaLabel,
  calcadaLabel,
  corteLabel,
  aterroLabel,
  axisLabel,
  secaoTitle,
  perfilTitle,
}: CadPrintStreetSheetProps) {
  if (kind === "secao-tipo") {
    if (!params && terrainSection) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            padding: "6mm",
            boxSizing: "border-box",
            background: "#fff",
          }}
        >
          <TerrainProfileChart
            profile={terrainSection}
            title={terrainSection.name ?? secaoTitle}
            distanceLabel="Offset (m)"
            elevationLabel="Cota (m)"
          />
        </div>
      );
    }
    if (!params) {
      return <PrintSheetEmpty label={emptyLabel} />;
    }
    const greideZ = profile ? profile.greide[0]?.z ?? 100 : 100;
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: "5mm",
          boxSizing: "border-box",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: "3mm",
        }}
      >
        <div style={{ flex: profile ? "1.2 1 0" : "1 1 auto", minHeight: 0 }}>
          <SecaoTipoPreview
            variant="print"
            params={params}
            greideZ={greideZ}
            title={secaoTitle}
            streetName={profile?.streetName}
            pistaLabel={pistaLabel}
            calcadaLabel={calcadaLabel}
            corteLabel={corteLabel}
            aterroLabel={aterroLabel}
            axisLabel={axisLabel}
          />
        </div>
        {profile ? (
          <div
            style={{
              flex: "0.85 1 0",
              minHeight: 0,
              borderTop: "0.2mm solid #cbd5e1",
              paddingTop: "2mm",
            }}
          >
            <StreetProfileChart
              profile={profile}
              variant="print"
              title={perfilTitle ?? profile.streetName}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (!profile) {
    return <PrintSheetEmpty label={emptyLabel} />;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "5mm",
        boxSizing: "border-box",
        background: "#fff",
      }}
    >
      <StreetProfileChart profile={profile} variant="print" title={perfilTitle} />
    </div>
  );
}

function PrintSheetEmpty({ label }: { label: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#9ca3af",
        fontSize: "3mm",
        textAlign: "center",
        padding: "4mm",
        background: "#fff",
      }}
    >
      {label}
    </div>
  );
}
