type CadAiLogPayload = {
  usuario?: string;
  intencao?: string;
  tool?: string;
  parametros?: unknown;
  resultado?: string;
};

function sanitize(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (/sk-[a-zA-Z0-9]/.test(value) || /api[_-]?key/i.test(value)) return "[redacted]";
    return value.length > 400 ? `${value.slice(0, 400)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/key|secret|token|password|authorization/i.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      if (/^(x|y|z|vertices|coordinates|coordenadas|geojson|dxf|points|geometry|geometria)$/i.test(key)) {
        out[key] = "[omitted]";
        continue;
      }
      out[key] = sanitize(item);
    }
    return out;
  }
  return value;
}

/** Log de desenvolvimento do assistente CAD. Nunca registra OPENAI_API_KEY. */
export function logCadAi(payload: CadAiLogPayload): void {
  if (process.env.NODE_ENV === "production") return;
  const parts = ["[CAD AI]"];
  if (payload.usuario) parts.push(`Usuário: ${payload.usuario}`);
  if (payload.intencao) parts.push(`Intenção: ${payload.intencao}`);
  if (payload.tool) parts.push(`Tool: ${payload.tool}`);
  if (payload.parametros !== undefined) parts.push(`Parâmetros: ${JSON.stringify(sanitize(payload.parametros))}`);
  if (payload.resultado) parts.push(`Resultado: ${payload.resultado}`);
  console.info(parts.join(" | "));
}
