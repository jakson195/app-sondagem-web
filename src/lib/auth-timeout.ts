/** Evita que chamadas de auth (Supabase/DB) travem o localhost indefinidamente. */
const DEFAULT_TIMEOUT_MS = process.env.NODE_ENV === "development" ? 1500 : 8000;

export const AUTH_REQUEST_TIMEOUT_MS = Number(
  process.env.AUTH_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
);

const CIRCUIT_COOLDOWN_MS = Number(
  process.env.AUTH_CIRCUIT_COOLDOWN_MS ??
    (process.env.NODE_ENV === "development" ? 30_000 : 10_000),
);

let circuitOpenUntil = 0;

export function isAuthRemoteUnavailable(): boolean {
  return Date.now() < circuitOpenUntil;
}

export function markAuthRemoteUnavailable(reason?: string): void {
  circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
  if (process.env.NODE_ENV === "development") {
    console.warn(
      `[auth] Circuito aberto ${CIRCUIT_COOLDOWN_MS}ms${reason ? `: ${reason}` : ""}`,
    );
  }
}

export function hasSupabaseAuthCookie(
  cookies: Iterable<{ name: string }> | { name: string }[],
): boolean {
  for (const cookie of cookies) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("auth-token")) {
      return true;
    }
  }
  return false;
}

export async function withAuthTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
  options?: { tripCircuit?: boolean },
): Promise<T | null> {
  const tripCircuit = options?.tripCircuit === true;
  if (tripCircuit && isAuthRemoteUnavailable()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch((err: unknown) => {
        if (tripCircuit) markAuthRemoteUnavailable(`${label} error`);
        if (process.env.NODE_ENV === "development") {
          console.warn(`[auth] Falha: ${label}`, err);
        }
        return null;
      }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          if (tripCircuit) markAuthRemoteUnavailable(`${label} timeout`);
          if (process.env.NODE_ENV === "development") {
            console.warn(`[auth] Timeout (${timeoutMs}ms): ${label}`);
          }
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
