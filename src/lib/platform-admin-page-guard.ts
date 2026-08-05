import { redirect } from "next/navigation";
import { isPlatformSuperAdmin } from "@/lib/platform-admin";
import { getAuthUserFromCookies } from "@/lib/server-auth";

/** Guarda de páginas — redireciona utilizadores normais para o painel. */
export async function requirePlatformAdminPage() {
  const user = await getAuthUserFromCookies();
  if (!user) redirect("/login");
  if (!isPlatformSuperAdmin(user.systemRole)) redirect("/dashboard");
  return user;
}
