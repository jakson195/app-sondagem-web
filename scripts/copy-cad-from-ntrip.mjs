#!/usr/bin/env node
/**
 * Copia o Ambiente CAD do DatageoNTRIP (APP-SOLODATANTRIP) para app-web.
 * Uso: node scripts/copy-cad-from-ntrip.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_WEB = path.resolve(__dirname, "..");
const NTRIP = path.resolve(APP_WEB, "../../APP-SOLODATANTRIP/app-solodatantrip");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    console.warn("SKIP (missing):", srcDir);
    return;
  }
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else {
      ensureDir(path.dirname(d));
      fs.copyFileSync(s, d);
    }
  }
}

function patchFile(filePath, patches) {
  if (!fs.existsSync(filePath)) return;
  let text = fs.readFileSync(filePath, "utf8");
  for (const [from, to] of patches) {
    text = text.split(from).join(to);
  }
  fs.writeFileSync(filePath, text);
}

function patchTree(dir, patches) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) patchTree(p, patches);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) patchFile(p, patches);
  }
}

const PATCHES = [
  ['from "next-intl"', 'from "@/lib/rtk-validation/cad-intl"'],
  ["from 'next-intl'", "from '@/lib/rtk-validation/cad-intl'"],
  ['from "@/i18n/navigation"', 'from "next/navigation"'],
  ['from "@/lib/db/prisma"', 'from "@/lib/prisma"'],
  ['from "@/lib/auth"', 'from "@/lib/cad-auth"'],
];

// --- lib ---
copyDir(path.join(NTRIP, "lib/rtk-validation/cad"), path.join(APP_WEB, "src/lib/rtk-validation/cad"));
for (const f of ["project-coords.ts", "ods-writer.ts"]) {
  copyFile(path.join(NTRIP, "lib/rtk-validation", f), path.join(APP_WEB, "src/lib/rtk-validation", f));
}
copyDir(path.join(NTRIP, "lib/rtk-validation/parsers"), path.join(APP_WEB, "src/lib/rtk-validation/parsers"));
copyDir(path.join(NTRIP, "lib/cad-map"), path.join(APP_WEB, "src/lib/cad-map"));
copyFile(path.join(NTRIP, "lib/react/queue-in-effect.ts"), path.join(APP_WEB, "src/lib/react/queue-in-effect.ts"));

// --- components ---
const compSrc = path.join(NTRIP, "components/rtk-validation");
const compDest = path.join(APP_WEB, "src/components/rtk-validation");
ensureDir(compDest);
for (const name of fs.readdirSync(compSrc)) {
  if (name.startsWith("cad-") || name === "terrain-profile-chart.tsx") {
    copyFile(path.join(compSrc, name), path.join(compDest, name));
  }
}

// --- hooks ---
copyFile(path.join(NTRIP, "hooks/use-cad-speech.ts"), path.join(APP_WEB, "src/hooks/use-cad-speech.ts"));
copyFile(
  path.join(NTRIP, "hooks/use-location-map-image.ts"),
  path.join(APP_WEB, "src/hooks/use-location-map-image.ts"),
);

// --- API ---
copyDir(path.join(NTRIP, "app/api/cad"), path.join(APP_WEB, "src/app/api/cad"));
copyDir(path.join(NTRIP, "app/api/cad-map"), path.join(APP_WEB, "src/app/api/cad-map"));

// --- i18n messages ---
const ptBr = JSON.parse(fs.readFileSync(path.join(NTRIP, "messages/pt-BR.json"), "utf8"));
ensureDir(path.join(APP_WEB, "src/lib/rtk-validation"));
fs.writeFileSync(
  path.join(APP_WEB, "src/lib/rtk-validation/cad-messages.pt-BR.json"),
  JSON.stringify({ rtkCad: ptBr.rtkCad }, null, 2),
);

// --- patch imports ---
patchTree(path.join(APP_WEB, "src/components/rtk-validation"), PATCHES);
patchTree(path.join(APP_WEB, "src/app/api/cad"), PATCHES);
patchTree(path.join(APP_WEB, "src/app/api/cad-map"), PATCHES);

console.log("Ambiente CAD copiado de DatageoNTRIP → app-web");
