"use client";

import { ArrowLeft, Menu, Search, Settings, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "@/lib/rtk-validation/cad-intl";
import type { CadImportKind, CadInsertKind } from "@/lib/rtk-validation/cad/cad-io-kinds";
import type { CadGoogleMapType } from "@/lib/google-maps-config";
import { CadMenu, CadMenuCheck, CadMenuItem, CadMenuSep } from "./cad-ui-menu";

export type CadChromeTabId = "desenho" | "layout" | "planilha";

type CityHit = { lat: number; lng: number; label: string };

type CadChromeHeaderProps = {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  projectMeta: string;
  projectNotice: string | null;
  projectNoticeError?: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  savingLocal: boolean;
  savingCloud: boolean;
  exportingFormat: string | null;
  importingDrawing: boolean;
  aiChatOpen: boolean;
  showGrid: boolean;
  paperTone: "white" | "black";
  satelliteOn: boolean;
  googleMapType: CadGoogleMapType;
  orthophotoOn: boolean;
  showOrthophotoToggle: boolean;
  reliefOn: boolean;
  showReliefToggle: boolean;
  isCadFullscreen: boolean;
  cityQuery: string;
  cityBusy: boolean;
  cityHits: CityHit[];
  cityNotice: string | null;
  onNewProject: () => void;
  onOpenProjects: () => void;
  onOpenFile: () => void;
  onSaveLocal: () => void;
  onSaveCloud: () => void;
  onImportKind: (kind: CadImportKind) => void;
  onInsertKind: (kind: CadInsertKind) => void;
  onExport: (format: "dxf" | "dwg" | "shp" | "kmz") => void;
  onExportOds: () => void;
  onToggleAi: () => void;
  onToggleGrid: (next: boolean) => void;
  onPaperTone: (tone: "white" | "black") => void;
  onToggleSatellite: (next: boolean) => void;
  onGoogleMapType: (type: CadGoogleMapType) => void;
  onToggleOrthophoto: (next: boolean) => void;
  onToggleRelief: (next: boolean) => void;
  onFitView: () => void;
  onToggleFullscreen: () => void;
  onTabChange: (tab: CadChromeTabId) => void;
  onCityQueryChange: (value: string) => void;
  onCitySearch: () => void;
  onCityHit: (hit: CityHit) => void;
};

export function CadChromeHeader(props: CadChromeHeaderProps) {
  const t = useTranslations("rtkCad");
  const router = useRouter();
  const [menu, setMenu] = useState<string | null>(null);
  const [locateOpen, setLocateOpen] = useState(false);

  const openMenu = (id: string) => setMenu((prev) => (prev === id ? null : id));
  const closeMenu = () => setMenu(null);
  const goBack = () => {
    if (typeof window !== "undefined") {
      try {
        const ref = document.referrer;
        if (ref) {
          const url = new URL(ref);
          if (url.origin === window.location.origin && !url.pathname.startsWith("/cad")) {
            router.back();
            return;
          }
        }
      } catch {
        /* referrer inválido — cai no dashboard */
      }
    }
    router.push("/dashboard");
  };

  return (
    <header className="cad-interface pointer-events-auto relative z-[80] isolate flex h-12 shrink-0 items-center gap-1 border-b border-[#e5e7eb] bg-white px-2">
      <button
        type="button"
        onClick={goBack}
        title={t("chrome.back")}
        aria-label={t("chrome.back")}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[#0f2848] hover:bg-[#f3f4f6]"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{t("chrome.back")}</span>
      </button>
      <button
        type="button"
        onClick={props.onToggleSidebar}
        title={props.sidebarCollapsed ? t("sidebar.show") : t("sidebar.hide")}
        aria-label={props.sidebarCollapsed ? t("sidebar.show") : t("sidebar.hide")}
        aria-expanded={!props.sidebarCollapsed}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#0f2848] hover:bg-[#f3f4f6]"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="min-w-0 max-w-[11rem] shrink-0">
        <label className="sr-only">{t("project.nameLabel")}</label>
        <input
          value={props.projectName}
          onChange={(e) => props.onProjectNameChange(e.target.value)}
          title={props.projectMeta}
          className="block h-8 w-full rounded-md border border-[#e5e7eb] bg-white px-2 text-xs font-semibold text-[#0f2848]"
        />
      </div>

      <CadMenu
        open={menu === "project"}
        onOpenChange={(open) => (open ? openMenu("project") : closeMenu())}
        label={t("chrome.project")}
        title={t("chrome.project")}
      >
        <CadMenuItem
          onClick={() => {
            closeMenu();
            props.onNewProject();
          }}
        >
          {t("actions.newProject")}
        </CadMenuItem>
        <CadMenuItem
          onClick={() => {
            closeMenu();
            props.onOpenProjects();
          }}
        >
          {t("actions.openProject")}
        </CadMenuItem>
        <CadMenuItem
          disabled={props.savingCloud}
          onClick={() => {
            closeMenu();
            props.onSaveCloud();
          }}
        >
          {props.savingCloud ? t("project.savingCloud") : t("actions.saveProject")}
        </CadMenuItem>
        <CadMenuItem
          disabled={props.savingLocal}
          onClick={() => {
            closeMenu();
            props.onSaveLocal();
          }}
        >
          {props.savingLocal ? t("project.saving") : t("chrome.saveAs")}
        </CadMenuItem>
        <CadMenuItem
          disabled={props.savingLocal}
          onClick={() => {
            closeMenu();
            props.onSaveLocal();
          }}
        >
          {t("actions.saveLocal")}
        </CadMenuItem>
        <CadMenuItem
          disabled={props.savingCloud}
          onClick={() => {
            closeMenu();
            props.onSaveCloud();
          }}
        >
          {t("actions.saveCloudDwg")}
        </CadMenuItem>
        <CadMenuSep />
        <CadMenuItem
          disabled={props.exportingFormat !== null}
          onClick={() => {
            closeMenu();
            props.onExport("dwg");
          }}
        >
          {t("actions.exportDwg")}
        </CadMenuItem>
        <CadMenuItem
          disabled={props.exportingFormat !== null}
          onClick={() => {
            closeMenu();
            props.onExport("dxf");
          }}
        >
          {t("actions.exportDxf")}
        </CadMenuItem>
        <CadMenuItem
          disabled={props.exportingFormat !== null}
          onClick={() => {
            closeMenu();
            props.onExport("kmz");
          }}
        >
          {t("actions.exportKmz")}
        </CadMenuItem>
        <CadMenuItem
          disabled={props.exportingFormat !== null}
          onClick={() => {
            closeMenu();
            props.onExport("shp");
          }}
        >
          {t("actions.exportShp")}
        </CadMenuItem>
        <CadMenuItem
          onClick={() => {
            closeMenu();
            props.onOpenFile();
          }}
        >
          {t("actions.openFile")}
        </CadMenuItem>
      </CadMenu>

      <CadMenu
        open={menu === "import"}
        onOpenChange={(open) => (open ? openMenu("import") : closeMenu())}
        label={t("chrome.import")}
        title={t("chrome.import")}
      >
        {(
          [
            ["dwg", "DWG"],
            ["dxf", "DXF"],
            ["points-txt", "TXT"],
            ["points-csv", "CSV"],
            ["points-xlsx", "Excel XLSX"],
            ["geotiff", "GeoTIFF"],
            ["ecw", "ECW"],
            ["jpg", "JPG"],
            ["png", "PNG"],
            ["tiff", "TIFF"],
            ["kml", "KML / KMZ"],
            ["shp", "SHP"],
            ["geojson", "GeoJSON"],
            ["rtk", "Pontos RTK"],
          ] as Array<[CadImportKind, string]>
        ).map(([kind, label]) => (
          <CadMenuItem
            key={kind}
            onClick={() => {
              closeMenu();
              props.onImportKind(kind);
            }}
          >
            {label}
          </CadMenuItem>
        ))}
      </CadMenu>

      <CadMenu
        open={menu === "insert"}
        onOpenChange={(open) => (open ? openMenu("insert") : closeMenu())}
        label={t("chrome.insert")}
        title={t("chrome.insert")}
      >
        {(
          [
            ["point", t("chrome.insertPoint")],
            ["line", t("chrome.insertLine")],
            ["polyline", t("chrome.insertPolyline")],
            ["polygon", t("chrome.insertPolygon")],
            ["circle", t("chrome.insertCircle")],
            ["arc", t("chrome.insertArc")],
            ["text", t("chrome.insertText")],
            ["dimension", t("chrome.insertDim")],
            ["block", t("chrome.insertBlock")],
            ["image", t("chrome.insertImage")],
          ] as Array<[CadInsertKind, string]>
        ).map(([kind, label]) => (
          <CadMenuItem
            key={kind}
            onClick={() => {
              closeMenu();
              props.onInsertKind(kind);
            }}
          >
            {label}
          </CadMenuItem>
        ))}
      </CadMenu>

      <CadMenu
        open={menu === "export"}
        onOpenChange={(open) => (open ? openMenu("export") : closeMenu())}
        label={t("chrome.export")}
        title={t("chrome.export")}
      >
        <CadMenuItem
          disabled={props.exportingFormat !== null}
          onClick={() => {
            closeMenu();
            props.onExport("dwg");
          }}
        >
          {props.exportingFormat === "dwg" ? t("export.working") : t("actions.exportDwg")}
        </CadMenuItem>
        <CadMenuItem
          disabled={props.exportingFormat !== null}
          onClick={() => {
            closeMenu();
            props.onExport("dxf");
          }}
        >
          {props.exportingFormat === "dxf" ? t("export.working") : t("actions.exportDxf")}
        </CadMenuItem>
        <CadMenuItem
          disabled={props.exportingFormat !== null}
          onClick={() => {
            closeMenu();
            props.onExport("kmz");
          }}
        >
          {props.exportingFormat === "kmz" ? t("export.working") : t("actions.exportKmz")}
        </CadMenuItem>
        <CadMenuItem
          disabled={props.exportingFormat !== null}
          onClick={() => {
            closeMenu();
            props.onExport("shp");
          }}
        >
          {props.exportingFormat === "shp" ? t("export.working") : t("actions.exportShp")}
        </CadMenuItem>
        <CadMenuItem
          onClick={() => {
            closeMenu();
            props.onExportOds();
          }}
        >
          {t("actions.exportOds")}
        </CadMenuItem>
      </CadMenu>

      <button
        type="button"
        onClick={props.onToggleAi}
        title={t("ai.openChat")}
        aria-label={t("ai.openChat")}
        aria-pressed={props.aiChatOpen}
        className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold ${
          props.aiChatOpen ? "bg-[#7c3aed] text-white" : "text-[#6d28d9] hover:bg-[#f5f3ff]"
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {t("chrome.ai")}
      </button>

      <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-[#e5e7eb] p-0.5">
        {(
          [
            ["satellite", t("basemap.mapTypeSatellite")],
            ["hybrid", t("basemap.mapTypeHybrid")],
            ["roadmap", t("basemap.mapTypeRoadmap")],
          ] as Array<[CadGoogleMapType, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            title={t("basemap.satelliteHint")}
            onClick={() => {
              if (props.satelliteOn && props.googleMapType === id) {
                props.onToggleSatellite(false);
                return;
              }
              props.onGoogleMapType(id);
              if (!props.satelliteOn) props.onToggleSatellite(true);
            }}
            className={`h-7 rounded px-1.5 text-[10px] font-semibold uppercase ${
              props.satelliteOn && props.googleMapType === id
                ? "bg-[#0f2848] text-white"
                : "text-[#374151] hover:bg-[#f3f4f6]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <CadMenu
        open={menu === "view"}
        onOpenChange={(open) => (open ? openMenu("view") : closeMenu())}
        label={t("chrome.view")}
        title={t("chrome.view")}
      >
        <CadMenuCheck
          checked={props.showGrid}
          label={t("grid.show")}
          onChange={props.onToggleGrid}
        />
        <CadMenuCheck
          checked={props.paperTone === "white"}
          label={t("chrome.paperWhite")}
          onChange={(on) => {
            if (on) props.onPaperTone("white");
          }}
        />
        <CadMenuCheck
          checked={props.paperTone === "black"}
          label={t("chrome.paperBlack")}
          onChange={(on) => {
            if (on) props.onPaperTone("black");
          }}
        />
        <CadMenuCheck
          checked={props.satelliteOn}
          label={t("basemap.satellite")}
          title={t("basemap.satelliteHint")}
          onChange={(on) => {
            props.onToggleSatellite(on);
            if (on) props.onGoogleMapType(props.googleMapType || "satellite");
          }}
        />
        <div className="flex gap-1 px-3 py-1" onMouseDown={(e) => e.stopPropagation()}>
          {(
            [
              ["satellite", t("basemap.mapTypeSatellite")],
              ["hybrid", t("basemap.mapTypeHybrid")],
              ["roadmap", t("basemap.mapTypeRoadmap")],
            ] as Array<[CadGoogleMapType, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                props.onGoogleMapType(id);
                if (!props.satelliteOn) props.onToggleSatellite(true);
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                props.satelliteOn && props.googleMapType === id
                  ? "bg-[#0f2848] text-white"
                  : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {props.showOrthophotoToggle ? (
          <CadMenuCheck
            checked={props.orthophotoOn}
            label={t("chrome.orthophoto")}
            onChange={props.onToggleOrthophoto}
          />
        ) : null}
        {props.showReliefToggle ? (
          <CadMenuCheck
            checked={props.reliefOn}
            label={t("chrome.relief")}
            onChange={props.onToggleRelief}
          />
        ) : null}
        <CadMenuSep />
        <CadMenuItem
          onClick={() => {
            closeMenu();
            props.onToggleFullscreen();
          }}
        >
          {props.isCadFullscreen ? t("actions.exitFullscreen") : t("actions.fullscreen")}
        </CadMenuItem>
        <CadMenuItem
          onClick={() => {
            closeMenu();
            props.onFitView();
          }}
        >
          {t("actions.fitView")}
        </CadMenuItem>
      </CadMenu>

      <div className="relative min-w-0">
        {locateOpen ? (
          <form
            className="flex items-center gap-1"
            title={t("citySearch.hint")}
            onSubmit={(e) => {
              e.preventDefault();
              props.onCitySearch();
            }}
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" />
            <input
              type="search"
              autoFocus
              value={props.cityQuery}
              onChange={(e) => props.onCityQueryChange(e.target.value)}
              placeholder={t("citySearch.placeholder")}
              className="h-8 w-[14rem] max-w-[40vw] rounded-md border border-[#e5e7eb] px-2 text-xs"
            />
            <button
              type="submit"
              disabled={props.cityBusy}
              className="h-8 rounded-md bg-[#0f2848] px-2 text-[11px] font-medium text-white disabled:opacity-50"
            >
              {props.cityBusy ? t("citySearch.working") : t("citySearch.go")}
            </button>
            {props.cityHits.length > 1 ? (
              <ul className="absolute left-0 top-full z-[60] mt-1 max-h-48 w-full overflow-auto rounded-md border border-[#e5e7eb] bg-white py-1 text-xs shadow-lg">
                {props.cityHits.map((hit) => (
                  <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-left hover:bg-[#eff6ff]"
                      onClick={() => props.onCityHit(hit)}
                    >
                      {hit.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setLocateOpen(true)}
            title={t("citySearch.hint")}
            aria-label={t("chrome.locate")}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide text-[#0f2848] hover:bg-[#f3f4f6]"
          >
            <Search className="h-3.5 w-3.5" />
            {t("chrome.locate")}
          </button>
        )}
        {props.cityNotice ? (
          <span className="absolute left-0 top-full z-20 mt-0.5 whitespace-nowrap text-[10px] text-[#374151]">
            {props.cityNotice}
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1">
        {props.projectNotice ? (
          <p
            className={`hidden max-w-[18rem] truncate text-[10px] font-medium lg:block ${
              props.projectNoticeError ? "text-red-600" : "text-emerald-700"
            }`}
            title={props.projectNotice}
          >
            {props.projectNotice}
          </p>
        ) : null}
        <CadMenu
          open={menu === "settings"}
          onOpenChange={(open) => (open ? openMenu("settings") : closeMenu())}
          label={<Settings className="h-3.5 w-3.5" />}
          title={t("chrome.settings")}
          align="right"
        >
          <CadMenuItem
            onClick={() => {
              closeMenu();
              props.onTabChange("desenho");
            }}
          >
            {t("tabs.draw")}
          </CadMenuItem>
          <CadMenuItem
            onClick={() => {
              closeMenu();
              props.onTabChange("planilha");
            }}
          >
            {t("tabs.planilha")}
          </CadMenuItem>
          <CadMenuItem
            onClick={() => {
              closeMenu();
              props.onTabChange("layout");
            }}
          >
            {t("tabs.printLayout")}
          </CadMenuItem>
          <CadMenuSep />
          <CadMenuItem
            onClick={() => {
              closeMenu();
              props.onToggleFullscreen();
            }}
          >
            {props.isCadFullscreen ? t("actions.exitFullscreen") : t("actions.fullscreen")}
          </CadMenuItem>
        </CadMenu>
      </div>
    </header>
  );
}
