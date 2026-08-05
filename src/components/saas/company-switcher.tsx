"use client";

import { useCallback, useEffect, useState } from "react";

type CompanyRow = { id: number; name: string; slug: string };

export function CompanySwitcher({
  isPlatformAdmin = false,
}: {
  isPlatformAdmin?: boolean;
}) {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [companiesRes, meRes] = await Promise.all([
        fetch("/api/auth/companies", { credentials: "include" }),
        fetch("/api/auth/me", { credentials: "include" }),
      ]);
      const companiesJson = (await companiesRes.json()) as { companies?: CompanyRow[] };
      const meJson = (await meRes.json()) as {
        activeCompany?: { companyId: number } | null;
      };
      if (companiesRes.ok && companiesJson.companies) {
        setCompanies(companiesJson.companies);
      }
      if (meRes.ok && meJson.activeCompany) {
        setActiveId(meJson.activeCompany.companyId);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isPlatformAdmin || loading || companies.length <= 1) return null;

  async function onChange(companyId: number) {
    const res = await fetch("/api/auth/active-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ companyId }),
    });
    if (res.ok) {
      setActiveId(companyId);
      window.location.reload();
    }
  }

  return (
    <div className="px-3 pb-2">
      <label htmlFor="dg-company-switch" className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-dg-muted">
        Empresa activa
      </label>
      <select
        id="dg-company-switch"
        value={activeId ?? ""}
        onChange={(e) => void onChange(Number(e.target.value))}
        className="dg-input w-full px-2 py-1.5 text-xs"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
