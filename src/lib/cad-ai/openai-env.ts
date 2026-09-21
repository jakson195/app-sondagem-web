import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import tls from "node:tls";

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Fallback se OPENAI_MODEL não estiver no ambiente. */
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

function isUsableOpenAiKey(value: string): boolean {
  const key = value.trim();
  if (key.length < 16) return false;
  if (/^(sk-proj-\.\.\.|sk-\.\.\.|your-?key|changeme)$/i.test(key)) return false;
  return true;
}

/** Acesso dinâmico — evita o Next.js substituir process.env.OPENAI_* no bundle. */
function readProcessEnv(name: string): string | undefined {
  return process.env[name];
}

function envFileCandidates(): string[] {
  const cwd = process.cwd();
  return [
    resolve(cwd, ".env.local"),
    resolve(cwd, ".env"),
    resolve(cwd, "app-web/.env.local"),
    resolve(cwd, "../hidrogeo-brasil/backend/.env"),
    resolve(cwd, "hidrogeo-brasil/backend/.env"),
    resolve(cwd, "../../hidrogeo-brasil/backend/.env"),
  ];
}

function readEnvVarFromFile(filePath: string, name: string): string {
  if (!existsSync(filePath)) return "";
  const text = readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*(.*)$`);
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith("#")) continue;
    const match = raw.match(pattern);
    if (!match) continue;
    return stripQuotes(match[1] ?? "");
  }
  return "";
}

export function resolveOpenAIModel(): string {
  const fromEnv = readProcessEnv("OPENAI_MODEL")?.trim();
  if (fromEnv) return fromEnv;
  for (const file of envFileCandidates()) {
    const fromFile = readEnvVarFromFile(file, "OPENAI_MODEL");
    if (fromFile) return fromFile;
  }
  return DEFAULT_OPENAI_MODEL;
}

/** Lê a chave só no servidor. Nunca loga o valor. */
export function resolveOpenAIApiKey(): string {
  const fromProcess = readProcessEnv("OPENAI_API_KEY");
  if (fromProcess !== undefined) {
    const trimmed = fromProcess.trim();
    if (isUsableOpenAiKey(trimmed)) return trimmed;
    // String vazia explícita (testes) não deve ler arquivos.
    if (fromProcess === "") return "";
  }

  for (const file of envFileCandidates()) {
    const fromFile = readEnvVarFromFile(file, "OPENAI_API_KEY");
    if (isUsableOpenAiKey(fromFile)) {
      process.env.OPENAI_API_KEY = fromFile;
      return fromFile;
    }
  }
  return "";
}

export function hasOpenAIKey(): boolean {
  return Boolean(resolveOpenAIApiKey());
}

let systemCaInstalled = false;

type NodeTlsExtras = {
  getCACertificates?: (type?: string) => string[];
  setDefaultCACertificates?: (certs: readonly string[]) => void;
};

/** Windows/corporate TLS inspection: Node bundled CAs fail; system store works. */
export function useSystemCertificateAuthorities(): void {
  if (systemCaInstalled) return;
  const extras = tls as typeof tls & NodeTlsExtras;
  if (typeof extras.getCACertificates !== "function" || typeof extras.setDefaultCACertificates !== "function") {
    return;
  }
  try {
    const bundled = extras.getCACertificates("default");
    const system = extras.getCACertificates("system");
    extras.setDefaultCACertificates([...bundled, ...system]);
    systemCaInstalled = true;
    console.info("[CAD AI] TLS: system CAs enabled");
  } catch {
    console.error("[CAD AI] TLS: failed to load system CAs");
  }
}

export function logOpenAiKeyStatus(label = "[CAD AI]"): void {
  const openAIConfigured = hasOpenAIKey();
  console.info(`${label} OpenAI configured: ${openAIConfigured}`);
  console.info(`${label} Model: ${resolveOpenAIModel()}`);
}
