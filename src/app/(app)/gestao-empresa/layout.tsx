import { requirePlatformAdminPage } from "@/lib/platform-admin-page-guard";

export default async function GestaoEmpresaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdminPage();
  return children;
}
