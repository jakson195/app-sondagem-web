"use client";

import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import { ClickToEdit, PRINT_BOTTOM_STRIP_TYPO, PRINT_CELL_BORDER, type LayoutState } from "@/components/rtk-validation/cad-print-shared";

type AbntLegendBlockProps = {
  layout: LayoutState;
  patchLayout: (patch: Partial<LayoutState>) => void;
  widthMm: number;
  heightMm: number;
};

const cellBorder = PRINT_CELL_BORDER;

const labelStyle: React.CSSProperties = {
  fontSize: PRINT_BOTTOM_STRIP_TYPO.labelSize,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  lineHeight: 1.15,
  color: PRINT_BOTTOM_STRIP_TYPO.label,
  fontFamily: PRINT_BOTTOM_STRIP_TYPO.fontFamily,
};

const valueStyle: React.CSSProperties = {
  fontSize: PRINT_BOTTOM_STRIP_TYPO.bodySize,
  lineHeight: PRINT_BOTTOM_STRIP_TYPO.lineHeight,
  marginTop: "0.45mm",
  color: PRINT_BOTTOM_STRIP_TYPO.text,
  fontFamily: PRINT_BOTTOM_STRIP_TYPO.fontFamily,
  fontWeight: 500,
};

/**
 * Legenda ABNT (NBR 10068) — modelo da Fig. 6 adaptado para prancha técnica.
 * Título centralizado; coluna direita (logo/empresa); campos DATA, ESCALA e FOLHA.
 */
export function AbntLegendBlock({ layout, patchLayout, widthMm, heightMm }: AbntLegendBlockProps) {
  const t = useTranslations("rtkCad.printLayout");

  const midColW = "24mm";
  const rightColW = "40mm";
  const titleRowH = "11mm";
  const rowH = `${Math.max(11, (heightMm - 11) / 4)}mm`;

  return (
    <div
      className="abnt-legend"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        boxSizing: "border-box",
        border: cellBorder,
        display: "grid",
        gridTemplateRows: `${titleRowH} repeat(4, ${rowH})`,
        gridTemplateColumns: `1fr ${midColW} ${midColW} ${rightColW}`,
        fontSize: PRINT_BOTTOM_STRIP_TYPO.bodySize,
        lineHeight: PRINT_BOTTOM_STRIP_TYPO.lineHeight,
        fontFamily: PRINT_BOTTOM_STRIP_TYPO.fontFamily,
        color: PRINT_BOTTOM_STRIP_TYPO.text,
        background: "#fff",
        flexShrink: 0,
      }}
    >
      {/* TÍTULO — linha inteira, centralizado */}
      <div
        style={{
          gridColumn: "1 / -1",
          borderBottom: cellBorder,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.5mm 2mm",
          textAlign: "center",
        }}
      >
        <div style={{ ...labelStyle, fontSize: PRINT_BOTTOM_STRIP_TYPO.labelSize }}>{t("abntLegendTitle")}</div>
        <ClickToEdit
          value={layout.titulo}
          onChange={(titulo) => patchLayout({ titulo })}
          className="!text-center"
          wrap
        />
      </div>

      {/* Coluna direita — logo + empresa (rowspan 4) */}
      <div
        style={{
          gridColumn: 4,
          gridRow: "2 / 6",
          borderLeft: cellBorder,
          borderBottom: cellBorder,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1mm",
          gap: "0.5mm",
          overflow: "hidden",
        }}
      >
        {layout.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={layout.logo} alt="Logo" style={{ maxWidth: "100%", maxHeight: "55%", objectFit: "contain" }} />
        ) : (
          <span style={{ fontSize: PRINT_BOTTOM_STRIP_TYPO.smallSize, color: PRINT_BOTTOM_STRIP_TYPO.muted }}>{t("logo")}</span>
        )}
        <ClickToEdit
          value={layout.empresa}
          onChange={(empresa) => patchLayout({ empresa })}
          placeholder={t("companyPlaceholder")}
          className="!text-center"
          wrap
        />
      </div>

      {/* Linha 2 — PROJETO | DATA */}
      <LegendField
        label={t("fieldProject")}
        value={layout.projeto}
        onChange={(projeto) => patchLayout({ projeto })}
        style={{ gridColumn: 1, gridRow: 2, borderRight: cellBorder, borderBottom: cellBorder }}
        multiline
        wrap
      />
      <LegendField
        label={t("fieldDate")}
        value={layout.data}
        onChange={(data) => patchLayout({ data })}
        mono
        style={{ gridColumn: 2, gridRow: 2, borderRight: cellBorder, borderBottom: cellBorder }}
      />
      <LegendField
        label={t("fieldDrawingNo")}
        value={layout.numeroDesenho}
        onChange={(numeroDesenho) => patchLayout({ numeroDesenho })}
        mono
        style={{ gridColumn: 3, gridRow: 2, borderRight: cellBorder, borderBottom: cellBorder }}
      />

      {/* Linha 3 — LOCAL | ESCALA */}
      <LegendField
        label={t("fieldPlace")}
        value={layout.local}
        onChange={(local) => patchLayout({ local })}
        style={{ gridColumn: 1, gridRow: 3, borderRight: cellBorder, borderBottom: cellBorder }}
        wrap
      />
      <LegendField
        label={t("fieldScale")}
        value={layout.escala}
        onChange={(escala) => patchLayout({ escala })}
        mono
        style={{ gridColumn: 2, gridRow: 3, borderRight: cellBorder, borderBottom: cellBorder }}
      />
      <LegendField
        label={t("fieldRev")}
        value={layout.revisao}
        onChange={(revisao) => patchLayout({ revisao })}
        mono
        style={{ gridColumn: 3, gridRow: 3, borderRight: cellBorder, borderBottom: cellBorder }}
      />

      {/* Linha 4 — PROPRIETÁRIO | FOLHA */}
      <LegendField
        label={t("fieldOwner")}
        value={layout.proprietario}
        onChange={(proprietario) => patchLayout({ proprietario })}
        style={{ gridColumn: 1, gridRow: 4, borderRight: cellBorder, borderBottom: cellBorder }}
        wrap
      />
      <LegendField
        label={t("fieldSheet")}
        value=""
        onChange={() => {}}
        style={{ gridColumn: "2 / 4", gridRow: 4, borderRight: cellBorder, borderBottom: cellBorder }}
        renderValue={
          <div style={{ display: "flex", gap: "0.5mm", alignItems: "center", ...valueStyle }}>
            <ClickToEdit value={layout.folha} onChange={(folha) => patchLayout({ folha })} mono />
            <span>/</span>
            <ClickToEdit value={layout.totalFolhas} onChange={(totalFolhas) => patchLayout({ totalFolhas })} mono />
          </div>
        }
      />

      {/* Linha 5 — RESP. TÉCNICO | ARQUIVO */}
      <LegendField
        label={t("fieldTechnical")}
        value={layout.desenhista}
        onChange={(desenhista) => patchLayout({ desenhista })}
        style={{ gridColumn: 1, gridRow: 5, borderRight: cellBorder }}
        wrap
      />
      <LegendField
        label={t("fieldFile")}
        value={layout.arquivo}
        onChange={(arquivo) => patchLayout({ arquivo })}
        mono
        style={{ gridColumn: "2 / 4", gridRow: 5, borderRight: cellBorder }}
      />
    </div>
  );
}

function LegendField({
  label,
  value,
  onChange,
  style,
  mono,
  multiline,
  wrap,
  readOnly,
  renderValue,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
  mono?: boolean;
  multiline?: boolean;
  wrap?: boolean;
  readOnly?: boolean;
  renderValue?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "0.75mm 1.1mm", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", ...style }}>
      <div style={labelStyle}>{label.replace(/:$/, "")}</div>
      {renderValue ?? (
        readOnly ? (
          <div style={valueStyle}>{value}</div>
        ) : (
          <ClickToEdit value={value} onChange={onChange} mono={mono} multiline={multiline} wrap={wrap} />
        )
      )}
    </div>
  );
}
