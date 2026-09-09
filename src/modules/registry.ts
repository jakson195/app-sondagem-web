import {
  Activity,
  Bell,
  Box,
  Clock,
  Cloud,
  FileText,
  Globe,
  Image,
  LayoutDashboard,
  MapPinned,
  Mountain,
  Radar,
  Radio,
  Shovel,
  Waves,
} from "lucide-react";
import { filterNavByProductMode } from "@/lib/product-mode";
import type { ModuleId, PlatformModuleDef } from "@/modules/types";

export const DIGITAL_TWIN_BASE = "/digital-twin";

/** Rotas que podem carregar o bundle Cesium (lazy). */
export const CESIUM_ROUTE_PREFIXES = [
  DIGITAL_TWIN_BASE,
  `${DIGITAL_TWIN_BASE}/insar`,
  `${DIGITAL_TWIN_BASE}/lidar`,
  `${DIGITAL_TWIN_BASE}/taludes`,
  "/obra/nova",
] as const;

export function isCesiumRoute(pathname: string): boolean {
  return CESIUM_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export const platformModules: PlatformModuleDef[] = [
  {
    id: "geofisica",
    label: "Geofísica",
    empresaKey: "ves",
    obraKey: "resistividade",
    nav: [{ href: "/geofisica", label: "⚡ Geofísica" }],
  },
  {
    id: "spt",
    label: "Sondagem SPT",
    empresaKey: "spt",
    obraKey: "spt",
    nav: [{ href: "/spt", label: "📊 Sondagem SPT" }],
  },
  {
    id: "rotativa",
    label: "Sondagem rotativa",
    empresaKey: "rotativa",
    obraKey: "rotativa",
    nav: [{ href: "/rotativa", label: "🌀 Sondagem Rotativa" }],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    obraKey: "relatorios",
    nav: [{ href: "/relatorio", label: "📄 Relatórios", icon: FileText }],
  },
  {
    id: "digital-twin",
    label: "Digital Twin",
    empresaKey: "digital_twin",
    obraKey: "digital_twin",
    cesiumRoutes: [...CESIUM_ROUTE_PREFIXES],
    nav: [
      {
        href: `${DIGITAL_TWIN_BASE}/dashboard`,
        label: "Dashboard",
        icon: LayoutDashboard,
        parent: "digital-twin",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/insar`,
        label: "InSAR",
        icon: Radar,
        parent: "digital-twin",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/lidar`,
        label: "LiDAR",
        icon: Mountain,
        parent: "digital-twin",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/ortofotos`,
        label: "Ortofotos",
        icon: Image,
        parent: "digital-twin",
        description: "Comparação T0/T1 com heatmap e pontos de risco",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/taludes`,
        label: "Taludes · Drone",
        icon: Shovel,
        parent: "digital-twin",
        description:
          "Monitoramento temporal: optical flow, DSM, IA, mapa 2D/3D",
      },
      {
        href: "/taludes",
        label: "Estabilidade de Taludes",
        icon: Mountain,
        parent: "digital-twin",
        description: "Análise geotécnica de taludes (Bishop, Fellenius, Janbu)",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/nuvem-pontos`,
        label: "Nuvem de Pontos",
        icon: Cloud,
        parent: "digital-twin",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/sensores-iot`,
        label: "Sensores IoT",
        icon: Radio,
        parent: "digital-twin",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/monitoramento`,
        label: "Monitoramento",
        icon: Activity,
        parent: "digital-twin",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/timeline`,
        label: "Timeline",
        icon: Clock,
        parent: "digital-twin",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/alertas`,
        label: "Alertas",
        icon: Bell,
        parent: "digital-twin",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/modelos-3d`,
        label: "Modelos 3D",
        icon: Globe,
        parent: "digital-twin",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/deformacoes`,
        label: "Deformações",
        icon: Waves,
        parent: "digital-twin",
      },
      {
        href: `${DIGITAL_TWIN_BASE}/gnss-rtk`,
        label: "GNSS RTK",
        icon: MapPinned,
        parent: "digital-twin",
      },
    ],
  },
  {
    id: "insar",
    label: "InSAR",
    obraKey: "insar",
    nav: [],
  },
  {
    id: "lidar",
    label: "LiDAR",
    obraKey: "lidar",
    nav: [],
  },
  {
    id: "rtk",
    label: "RTK / GNSS",
    empresaKey: "rtk",
    obraKey: "rtk",
    nav: [
      {
        href: `${DIGITAL_TWIN_BASE}/gnss-rtk`,
        label: "📡 GNSS RTK",
        icon: MapPinned,
      },
    ],
  },
];

export const digitalTwinGroupIcon = Box;

export const tradoModule: PlatformModuleDef = {
  id: "rotativa",
  label: "Trado",
  empresaKey: "trado",
  obraKey: "trado",
  nav: [{ href: "/trado", label: "🪵 Sondagem Trado", icon: Shovel }],
};

/** Nav principal (fora do grupo Digital Twin). */
export function buildMainModuleNav(options: {
  obraModules: Record<string, boolean> | null;
  empresaModules: Set<string> | null;
  obraId: number | null;
}): { href: string; label: string }[] {
  const { obraModules, empresaModules, obraId } = options;
  const withObra = (href: string) =>
    obraId != null ? `${href}?obraId=${obraId}` : href;

  const items: { href: string; label: string }[] = [];

  const allow = (def: PlatformModuleDef): boolean => {
    if (def.id === "insar" || def.id === "lidar" || def.id === "geofisica") return false;
    if (obraModules && def.obraKey) {
      const key = def.obraKey as string;
      if (key in obraModules && !obraModules[key]) return false;
    }
    if (empresaModules && def.empresaKey) {
      if (!empresaModules.has(def.empresaKey)) return false;
    }
    return def.nav.length > 0 && def.id !== "digital-twin";
  };

  for (const def of platformModules) {
    if (!allow(def)) continue;
    for (const n of def.nav) {
      if (n.parent === "digital-twin") continue;
      items.push({ href: withObra(n.href), label: n.label });
    }
  }

  if (allow(tradoModule as PlatformModuleDef)) {
    for (const n of tradoModule.nav) {
      items.push({ href: withObra(n.href), label: n.label });
    }
  }

  const piezo = platformModules.find((m) => m.id === "spt");
  if (piezo) {
    items.push({ href: withObra("/pocos"), label: "💧 Poços Monitoramento" });
  }

  return filterNavByProductMode(items);
}

export function getModuleById(id: ModuleId): PlatformModuleDef | undefined {
  return platformModules.find((m) => m.id === id);
}
