import type { LucideIcon } from "lucide-react";
import type { ModuloPlataformaChave } from "@/lib/modulos-plataforma";
import type { ModuloProjetoChave } from "@/lib/modulos-projeto";

/** Identificador interno do módulo (pastas em src/modules/). */
export type ModuleId =
  | "geofisica"
  | "spt"
  | "rotativa"
  | "insar"
  | "lidar"
  | "digital-twin"
  | "relatorios";

export type ModuleNavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  description?: string;
  /** Filho de digital-twin na sidebar */
  parent?: "digital-twin";
};

export type PlatformModuleDef = {
  id: ModuleId;
  label: string;
  /** Chave em EmpresaModulo / gestão empresa */
  empresaKey?: ModuloPlataformaChave | "digital_twin" | "relatorios";
  /** Chave em modulos da obra (ObraModulo) */
  obraKey?: ModuloProjetoChave | "insar" | "lidar" | "digital_twin";
  nav: ModuleNavItem[];
  /** Rotas onde o bundle Cesium pode ser carregado */
  cesiumRoutes?: string[];
};
