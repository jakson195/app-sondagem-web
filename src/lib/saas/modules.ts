import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  FileText,
  Layers,
  Map,
  Mountain,
  PenTool,
} from "lucide-react";

export type MarketingModule = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tag?: string;
};

export const MARKETING_MODULES: MarketingModule[] = [
  {
    id: "spt",
    title: "SPT & sondagem",
    description:
      "Registo de campo, gráficos NSPT, perfis estratigráficos e relatórios PDF alinhados ao padrão Soilsul.",
    icon: Activity,
    tag: "Geotecnia",
  },
  {
    id: "cad",
    title: "Ambiente CAD",
    description: "Plantas, coordenadas, perfis e exportação técnica integrada ao projeto.",
    icon: PenTool,
    tag: "CAD",
  },
  {
    id: "geo",
    title: "GEO & temporal",
    description: "Mapas, InSAR, Landsat e camadas de contexto para obras e áreas de estudo.",
    icon: Map,
  },
  {
    id: "digital-twin",
    title: "Digital Twin",
    description: "GNSS, LiDAR, taludes e monitorização 3D integrada ao projeto.",
    icon: Mountain,
    tag: "3D",
  },
  {
    id: "relatorios",
    title: "Relatórios & portal",
    description:
      "Relatórios técnicos, partilha com cliente e portal white-label por empresa.",
    icon: FileText,
  },
  {
    id: "hidrologia",
    title: "Hidrologia",
    description:
      "HidroGeo Brasil (mapa 3D ANA + CPRM) e apoio a estudos hidrológicos regionais.",
    icon: BarChart3,
  },
  {
    id: "obras",
    title: "Gestão de obras",
    description: "Multi-obra, equipas, módulos por empresa e permissões granulares.",
    icon: Layers,
  },
];

export const MARKETING_BENEFITS = [
  {
    title: "Multi-empresa nativo",
    body: "Cada cliente é uma empresa isolada: utilizadores, obras, módulos e portal próprios.",
  },
  {
    title: "Geotecnia de ponta a ponta",
    body: "Do registo SPT no campo ao relatório PDF e à entrega no portal do cliente.",
  },
  {
    title: "Campo + escritório",
    body: "Mapas, perfis e resumos técnicos ligados à mesma obra.",
  },
  {
    title: "Escala cloud",
    body: "PostgreSQL, deploy Vercel e acesso por browser em qualquer dispositivo.",
  },
] as const;
