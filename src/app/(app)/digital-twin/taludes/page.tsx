import { TaludeMonitoringApp } from "@/components/taludes/talude-monitoring-app";

export const metadata = {
  title: "Monitoramento de taludes | DataGeo Digital",
  description:
    "Comparação temporal de ortofotos drone (TIFF/ECW), deteção de deslocamento, erosão e trincas, previsão de deslizamento.",
};

export default function TaludesPage() {
  return <TaludeMonitoringApp />;
}
