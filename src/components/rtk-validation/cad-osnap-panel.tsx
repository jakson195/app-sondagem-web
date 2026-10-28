"use client";

import type { OsnapSettings, OsnapType } from "@/lib/rtk-validation/cad/snap-engine";
import { OSNAP_LABELS } from "@/lib/rtk-validation/cad/snap-engine";

const PANEL_MODES: OsnapType[] = [
  "ENDPOINT",
  "MIDPOINT",
  "CENTER",
  "INTERSECTION",
  "PERPENDICULAR",
  "TANGENT",
  "QUADRANT",
  "NODE",
  "NEAREST",
  "EXTENSION",
  "INSERTION",
  "APPARENT_INTERSECTION",
];

type CadOsnapPanelProps = {
  settings: OsnapSettings;
  overrideType?: OsnapType | null;
  onChange: (next: OsnapSettings) => void;
};

export function CadOsnapPanel({ settings, overrideType, onChange }: CadOsnapPanelProps) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#0f2848]">OSNAP</h3>
        <button
          type="button"
          aria-pressed={settings.enabled}
          title="F3 liga/desliga. Shift + botão direito: snap temporário."
          onClick={() => onChange({ ...settings, enabled: !settings.enabled })}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            settings.enabled ? "bg-emerald-600 text-white" : "bg-[#e5e7eb] text-[#374151]"
          }`}
        >
          {settings.enabled ? "ON" : "OFF"}
        </button>
      </div>
      {overrideType ? (
        <p className="text-[10px] text-[#0f2848]">Próximo clique: {OSNAP_LABELS[overrideType]}.</p>
      ) : null}
      <div className="grid grid-cols-2 gap-x-1.5 gap-y-0.5">
        {PANEL_MODES.map((type) => (
          <label key={type} className="flex items-center gap-1.5 text-[11px] text-[#374151]">
            <input
              type="checkbox"
              checked={settings.modes[type]}
              onChange={(e) =>
                onChange({
                  ...settings,
                  enabled: e.target.checked ? true : settings.enabled,
                  modes: { ...settings.modes, [type]: e.target.checked },
                })
              }
            />
            {OSNAP_LABELS[type]}
          </label>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2 text-[10px] text-[#6b7280]">
        Tol. px
        <input
          type="number"
          min={4}
          max={40}
          value={settings.tolerancePx}
          onChange={(e) =>
            onChange({
              ...settings,
              tolerancePx: Math.max(4, Math.min(40, Number(e.target.value) || 12)),
            })
          }
          className="w-16 rounded border border-[#d1d5db] px-1.5 py-0.5 font-mono text-[11px]"
        />
      </label>
    </section>
  );
}
