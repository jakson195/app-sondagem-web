import { PrismaClient } from "@prisma/client";

import { resolveDatabaseUrl } from "@/lib/resolve-database-url";

const PRISMA_CLIENT_REV = 3;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaRev?: number;
};

const dbUrl = withQueryTimeouts(resolveDatabaseUrl());

/** Evita que Prisma/Neon com ligação morta trave RSC (/cad) durante minutos. */
function withQueryTimeouts(url: string): string {
  if (!url) return url;
  const connect = "3";
  const pool = process.env.NODE_ENV === "development" ? "2" : "5";
  const socket = process.env.NODE_ENV === "development" ? "5" : "8";
  const extra: string[] = [];
  if (!url.includes("connect_timeout=")) extra.push(`connect_timeout=${connect}`);
  if (!url.includes("pool_timeout=")) extra.push(`pool_timeout=${pool}`);
  if (!url.includes("socket_timeout=")) extra.push(`socket_timeout=${socket}`);
  if (extra.length === 0) return url;
  return url.includes("?") ? `${url}&${extra.join("&")}` : `${url}?${extra.join("&")}`;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/** Cliente em cache pode ficar stale após `prisma generate` — validar delegados SaaS. */
function isPrismaClientStale(client: PrismaClient): boolean {
  return typeof (client as { subscription?: unknown }).subscription === "undefined";
}

let prismaInstance = globalForPrisma.prisma;
if (!prismaInstance || isPrismaClientStale(prismaInstance) || globalForPrisma.prismaRev !== PRISMA_CLIENT_REV) {
  prismaInstance = createPrismaClient();
  globalForPrisma.prismaRev = PRISMA_CLIENT_REV;
}

export const prisma = prismaInstance;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Permite `import prisma from "@/lib/prisma"` além de `import { prisma } from "..."`. */
export default prisma;
