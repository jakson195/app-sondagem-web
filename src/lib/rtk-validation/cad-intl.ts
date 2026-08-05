"use client";

import messages from "./cad-messages.pt-BR.json";

type Values = Record<string, string | number | boolean | undefined>;

function resolvePath(obj: unknown, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function interpolate(template: string, values?: Values): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = values[k];
    return v === undefined ? `{${k}}` : String(v);
  });
}

/** Substitui next-intl nos componentes CAD (pt-BR fixo). */
export function useTranslations(namespace: string) {
  const root = namespace.startsWith("rtkCad")
    ? (messages as { rtkCad: Record<string, unknown> }).rtkCad
    : resolvePath(messages, namespace);

  const base =
    namespace === "rtkCad"
      ? root
      : namespace.startsWith("rtkCad.")
        ? resolvePath((messages as { rtkCad: Record<string, unknown> }).rtkCad, namespace.slice("rtkCad.".length))
        : root;

  return (key: string, values?: Values): string => {
    const val = resolvePath(base, key);
    if (typeof val === "string") return interpolate(val, values);
    return interpolate(key, values);
  };
}
