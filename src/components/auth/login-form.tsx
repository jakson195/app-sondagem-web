"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  next: string;
  initialMode?: "login" | "signup";
  plan?: string;
};

type AuthMode = "login" | "signup";

const inputClassName =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2";

export function LoginForm({ next, initialMode = "login", plan = "trial" }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin(formData: FormData) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Falha ao entrar.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function onSignup(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, password, plan }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      checkoutRequired?: boolean;
    };
    if (!response.ok) {
      setError(data.error ?? "Falha ao criar a conta.");
      return;
    }
    if (data.checkoutRequired) {
      const checkout = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan: "pro" }),
      });
      const checkoutData = (await checkout.json()) as { url?: string };
      if (checkout.ok && checkoutData.url) {
        window.location.href = checkoutData.url;
        return;
      }
    }
    router.push(next);
    router.refresh();
  }

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") {
        await onLogin(formData);
      } else {
        await onSignup(formData);
      }
    } catch {
      setError("Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface)] p-1 ring-1 ring-[var(--border)]">
        <button
          type="button"
          onClick={() => switchMode("login")}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "login"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => switchMode("signup")}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "signup"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          Criar conta
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(new FormData(event.currentTarget));
        }}
        className="space-y-5"
      >
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {mode === "signup" ? (
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Nome completo
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              placeholder="Seu nome"
              className={inputClassName}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete={mode === "signup" ? "email" : "email"}
            required
            placeholder="voce@empresa.com"
            className={inputClassName}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-[var(--text)]">
              Palavra-passe
            </label>
            {mode === "login" ? (
              <Link href="/recuperar-senha" className="text-xs font-medium text-[var(--accent)] hover:underline">
                Recuperar acesso
              </Link>
            ) : null}
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            placeholder="••••••••"
            className={inputClassName}
          />
          {mode === "signup" ? (
            <p className="mt-1.5 text-xs text-[var(--muted)]">Mínimo de 8 caracteres.</p>
          ) : null}
        </div>

        {mode === "signup" ? (
          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm font-medium text-[var(--text)]"
            >
              Confirmar palavra-passe
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="••••••••"
              className={inputClassName}
            />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="dg-btn-primary w-full py-2.5 disabled:opacity-70"
        >
          {loading
            ? mode === "login"
              ? "A entrar..."
              : "A criar conta..."
            : mode === "login"
              ? "Entrar"
              : "Criar conta"}
        </button>
      </form>

      {mode === "signup" ? (
        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          Ao criar conta, abrimos automaticamente a sua área com trial de 90 dias.
        </p>
      ) : null}
    </>
  );
}
