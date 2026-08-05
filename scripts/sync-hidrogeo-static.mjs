#!/usr/bin/env node
/** Copia o build Vite de hidrogeo-brasil/frontend/dist → app-web/public/hidrogeo-viewer */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.resolve(root, "../hidrogeo-brasil/frontend/dist");
const dest = path.join(root, "public", "hidrogeo-viewer");

function copyRecursive(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(src)) {
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    console.warn(`Origem inexistente (${src}); mantendo ${dest} já versionado.`);
    process.exit(0);
  }
  console.error(`Origem inexistente: ${src}`);
  console.error("Execute antes: cd hidrogeo-brasil/frontend && npm install && npm run build");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
copyRecursive(src, dest);
console.log(`HidroGeo estático sincronizado: ${dest}`);
