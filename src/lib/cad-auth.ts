import { getAuthUserFromCookies } from "@/lib/server-auth";

/** Sessão para rotas CAD — compatível com API copiada do DatageoNTRIP. */
export async function getSession() {
  const user = await getAuthUserFromCookies();
  if (!user) return null;
  return {
    id: user.id,
    idStr: String(user.id),
    email: user.email,
    name: user.name ?? null,
  };
}
