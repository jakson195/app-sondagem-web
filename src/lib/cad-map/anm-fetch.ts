import "server-only";

import https from "node:https";
import { URL } from "node:url";

/** Host oficial do MapServer/WMS ANM SIGMINE. */
export const ANM_GEO_HOST = "geo.anm.gov.br";

/**
 * geo.anm.gov.br entrega cadeia TLS incompleta (UNABLE_TO_VERIFY_LEAF_SIGNATURE)
 * em vários ambientes Node — o fetch nativo (undici) ignora `agent` e falha.
 */
const anmHttpsAgent = new https.Agent({ rejectUnauthorized: false });

export function isAnmGeoUrl(url: string | URL): boolean {
  try {
    return new URL(url).hostname === ANM_GEO_HOST;
  } catch {
    return false;
  }
}

function normalizeHeaders(init?: RequestInit): Record<string, string> {
  if (!init?.headers) return {};
  if (init.headers instanceof Headers) {
    return Object.fromEntries(init.headers.entries());
  }
  if (Array.isArray(init.headers)) {
    return Object.fromEntries(init.headers);
  }
  return init.headers as Record<string, string>;
}

function requestBody(init?: RequestInit): string | Buffer | undefined {
  if (!init?.body) return undefined;
  if (typeof init.body === "string") return init.body;
  if (init.body instanceof URLSearchParams) return init.body.toString();
  if (Buffer.isBuffer(init.body)) return init.body;
  return undefined;
}

/** Fetch server-side para REST/WMS/export do geo.anm.gov.br via node:https. */
export async function fetchAnmGeoService(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const parsed = new URL(url.toString());
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = normalizeHeaders(init);
  const body = requestBody(init);
  const signal = init?.signal;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
        agent: anmHttpsAgent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value == null) continue;
            if (Array.isArray(value)) {
              for (const v of value) responseHeaders.append(key, v);
            } else {
              responseHeaders.set(key, value);
            }
          }
          resolve(
            new Response(buf, {
              status: res.statusCode ?? 502,
              statusText: res.statusMessage,
              headers: responseHeaders,
            }),
          );
        });
      },
    );

    req.on("error", reject);

    if (signal) {
      if (signal.aborted) {
        req.destroy();
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      const onAbort = () => {
        req.destroy();
        reject(new DOMException("The operation was aborted.", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      req.on("close", () => signal.removeEventListener("abort", onAbort));
    }

    if (body != null && method !== "GET" && method !== "HEAD") {
      req.write(body);
    }
    req.end();
  });
}

/** Escolhe fetch normal ou tolerante ao TLS incompleto da ANM. */
export async function fetchGeoService(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isAnmGeoUrl(url)) {
    return fetchAnmGeoService(url, init);
  }
  return fetch(url, init);
}
