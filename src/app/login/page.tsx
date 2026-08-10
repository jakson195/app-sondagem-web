import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { isAuthBypassEnabled } from "@/lib/auth-bypass";

type Props = {
  searchParams?: Promise<{ next?: string; cadastro?: string; plan?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  if (isAuthBypassEnabled()) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const next =
    typeof params.next === "string" &&
    params.next.startsWith("/") &&
    !params.next.startsWith("//")
      ? params.next
      : "/dashboard";
  const initialMode = params.cadastro === "1" || params.cadastro === "true" ? "signup" : "login";
  const plan = typeof params.plan === "string" ? params.plan : "trial";

  return (
    <AuthShell
      title={initialMode === "signup" ? "Criar conta" : "Entrar na plataforma"}
      subtitle={
        initialMode === "signup"
          ? "Registe-se com nome, email e palavra-passe para aceder ao DataGeo Digital."
          : "Aceda ao dashboard e às suas obras com email e palavra-passe."
      }
      footer={
        <>
          <Link href="/" className="font-medium text-[var(--accent)] hover:underline">
            ← Site comercial
          </Link>
          {" · "}
          O acesso ao dashboard exige autenticação.{" "}
          <Link href="/login?next=/adm" className="font-medium text-[var(--accent)] hover:underline">
            ADM mestre
          </Link>
        </>
      }
    >
      <LoginForm next={next} initialMode={initialMode} plan={plan} />
    </AuthShell>
  );
}
