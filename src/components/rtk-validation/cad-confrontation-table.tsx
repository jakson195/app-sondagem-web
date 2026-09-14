"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import {
  formatAzimuthDmsInt,
  formatDistanceBr,
  type PolygonSegment,
} from "@/lib/rtk-validation/cad/polygon-utils";

type CadConfrontationTableProps = {
  segments: PolygonSegment[];
  confrontations: string[];
  selectedSegmentIndex: number | null;
  onSelectSegment: (index: number) => void;
  onChangeConfrontation: (index: number, value: string) => void;
};

export function CadConfrontationTable({
  segments,
  confrontations,
  selectedSegmentIndex,
  onSelectSegment,
  onChangeConfrontation,
}: CadConfrontationTableProps) {
  const t = useTranslations("rtkCad.memorial");
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (selectedSegmentIndex === null) return;
    inputRefs.current[selectedSegmentIndex]?.focus();
  }, [selectedSegmentIndex]);

  if (segments.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-[#374151]">{t("confrontation")}</p>
      <p className="text-[11px] leading-snug text-[#6b7280]">{t("confrontationHint")}</p>
      <div className="max-h-64 overflow-auto rounded-lg border border-[#e5e7eb]">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-[#f3f4f6] text-left text-[#4b5563]">
            <tr>
              <th className="px-2 py-1.5 font-medium">{t("confrontationSide")}</th>
              <th className="px-2 py-1.5 font-medium">{t("confrontationAzimuth")}</th>
              <th className="px-2 py-1.5 font-medium">{t("confrontationDistance")}</th>
              <th className="px-2 py-1.5 font-medium">{t("confrontationNeighbor")}</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((seg, index) => {
              const active = index === selectedSegmentIndex;
              return (
                <tr
                  key={`${seg.from}-${seg.to}`}
                  className={active ? "bg-[#ecfeff]" : "bg-white even:bg-[#fafafa]"}
                  onClick={() => onSelectSegment(index)}
                >
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-[#0f2848]">
                    {seg.fromLabel} → {seg.toLabel}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-[#374151]">
                    {formatAzimuthDmsInt(seg.azimuthDeg)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-[#374151]">
                    {formatDistanceBr(seg.distance)} m
                  </td>
                  <td className="px-2 py-1">
                    <input
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      value={confrontations[index] ?? ""}
                      onChange={(e) => onChangeConfrontation(index, e.target.value)}
                      onFocus={() => onSelectSegment(index)}
                      placeholder={t("confrontationPlaceholder")}
                      className="w-full min-w-[8rem] rounded border border-[#d1d5db] bg-white px-1.5 py-1 text-[11px]"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
