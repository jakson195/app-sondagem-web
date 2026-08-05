"use client";

import Link from "next/link";
import { useState } from "react";

export function RecoverForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setSent(false);
    try {
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(formData.get("email") ?? "").trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        devResetLink?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(data.error ?? data.message ?? "Falha ao enviar o email.");
        return;
      }
      if (data.devResetLink) {
        setError(null);
        setSent(true);
        setDevLink(data.devResetLink);
        return;
      }
      setSent(true);
    } catch {
      setError("Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
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
        {sent ? (
          <div className="space-y-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <p>Se o email existir, enviámos um link para redefinir a palavra-passe.</p>
            {devLink ? (
              <p className="break-all text-xs">
                Dev (JWT):{" "}
                <a href={devLink} className="font-medium underline">
                  {devLink}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            Email da conta
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none ring-[var(--accent)] transition-shadow focus:border-[var(--accent)] focus:ring-2"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="dg-btn-primary w-full py-2.5 disabled:opacity-70"
        >
          {loading ? "A enviar..." : "Enviar link de recuperação"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
          Voltar ao login
        </Link>
      </p>
    </>
  );
}
