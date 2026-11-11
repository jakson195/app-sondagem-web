import PainelAgentes from "./painel";

/** Agentes comerciais da DataGeo. O layout de /adm já exige SUPER_ADMIN; a API confere de novo a cada pedido. */
export const dynamic = "force-dynamic";

export default function AgentesPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Agentes comerciais</h1>
      <p className="mb-6 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Descoberta, análise e contato com loteadoras, incorporadoras, projetistas e construtoras. E-mail automático só com a chave
        “Contato” ligada; WhatsApp sempre com 1 clique seu.
      </p>
      <PainelAgentes />
    </div>
  );
}
