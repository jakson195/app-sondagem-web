import { requirePlatformAdminPage } from "@/lib/platform-admin-page-guard";

export default async function EmpresaGestaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdminPage();
  return children;
}
