import { NextResponse } from "next/server";

import {
  isPgUndefinedColumnError,
  isPostgisFunctionMissingError,
  isPrismaMissingTableError,
} from "@/lib/pg-error-utils";

function isPrismaClientValidationError(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as Error).name === "PrismaClientValidationError"
  );
}

function prismaErrorCode(cause: unknown): string | undefined {
  if (typeof cause !== "object" || cause === null) return undefined;
  const o = cause as { code?: unknown; errorCode?: unknown };
  if (typeof o.code === "string") return o.code;
  if (typeof o.errorCode === "string") return o.errorCode;
  return undefined;
}

function isMissingDatabaseUrl(cause: unknown): boolean {
  const msg = cause instanceof Error ? cause.message : String(cause);
  return /Environment variable not found:\s*DATABASE_URL/i.test(msg);
}

/** Servidor Postgres inacessível (Docker parado, porta errada, firewall). */
function isUnreachableDatabase(cause: unknown): boolean {
  const code = prismaErrorCode(cause);
  if (code === "P1001" || code === "P1000") return true;
  const msg = cause instanceof Error ? cause.message : String(cause);
  return /Can't reach database server|connection refused|ECONNREFUSED/i.test(msg);
}

function localDbHint(): string {
  return " Confirme PostgreSQL em execução (`npm run db:up` com Docker), depois `npm run db:push`. `DATABASE_URL` em `.env.local` (ver `.env.example`).";
}

function isBogusSystemDatabaseUrl(cause: unknown): boolean {
  const msg = cause instanceof Error ? cause.message : String(cause);
  return /database server at [`']?x:5432/i.test(msg) || /@[`']?x:5432/i.test(msg);
}

/** Resposta JSON quando Prisma falha (ex.: `DATABASE_URL` em falta ou DB offline). */
export function nextResponseDbFailure(cause: unknown) {
  console.error("[api/db]", cause);

  if (isPrismaClientValidationError(cause)) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json(
      {
        error:
          "Erro de validação Prisma (normalmente `@prisma/client` desatualizado ou pedido inválido).",
        detail: msg.slice(0, 2500),
        hint: "Na máquina local e na CI antes do deploy: `npx prisma generate`. Confirme que o painel da Vercel usa o mesmo commit que inclui `schema.prisma`. Algumas atualizações (AOI JSON, tipo de monitorização) usam `$executeRaw` para funcionar com clientes mais antigos; se o erro citar outro campo, sincronize o schema com `migrate deploy` e gere de novo o client.",
      },
      { status: 400 },
    );
  }

  if (isPrismaMissingTableError(cause, "Subscription")) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json(
      {
        error:
          "Tabela Subscription em falta — não é possível validar limites de obras.",
        detail: msg.slice(0, 2000),
        fixSqlFile: "scripts/sql/neon-subscription-table.sql",
        hint: "Neon → SQL Editor → executar fixSqlFile. Depois `npx tsx scripts/backfill-subscriptions.ts`. Confirme DATABASE_URL na Vercel (Production, Preview, Build).",
      },
      { status: 503 },
    );
  }

  if (isPgUndefinedColumnError(cause)) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json(
      {
        error:
          "PostgreSQL 42703: falta coluna ou tabela — a base não está alinhada com o schema da app.",
        detail: msg.slice(0, 2000),
        fixSqlFile: "scripts/sql/neon-obra-insar-columns.sql",
        hint: "Neon → SQL Editor → colar e executar o ficheiro fixSqlFile do repositório (cria description, status, tipo_monitoramento, area_of_interest_geojson na tabela Obra). Depois redeploy ou volte a gravar.",
      },
      { status: 503 },
    );
  }

  if (isPostgisFunctionMissingError(cause)) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json(
      {
        error:
          "PostGIS indisponível: funções espaciais (ST_GeomFromGeoJSON, etc.) não existem nesta base.",
        detail: msg.slice(0, 2000),
        hint: "Sem PostGIS o AOI vai para JSON: execute na Neon `scripts/sql/neon-obra-insar-columns.sql` (coluna `area_of_interest_geojson`). Opcionalmente ative a extensão «postgis» para usar também geometria nativa.",
      },
      { status: 503 },
    );
  }

  const missingUrl = isMissingDatabaseUrl(cause);
  const unreachable = isUnreachableDatabase(cause);
  const onVercel = process.env.VERCEL === "1";
  const prod = process.env.NODE_ENV === "production";

  const extra =
    !missingUrl &&
    !unreachable &&
    process.env.NODE_ENV !== "production" &&
    cause instanceof Error
      ? ` ${cause.message}`
      : "";

  let fixHint: string;
  if (missingUrl) {
    fixHint =
      onVercel || prod
        ? " Defina `DATABASE_URL` no painel do projeto (Postgres) e marque para Production, Preview e Build."
        : " Em `.env.local` defina `DATABASE_URL` (veja `.env.example`). Se já estiver definida, verifique se o Postgres está a correr.";
  } else if (unreachable) {
    fixHint =
      onVercel || prod
        ? " Verifique `DATABASE_URL` (host/porta/rede) e se o Postgres aceita ligações."
        : localDbHint();
  } else if (isBogusSystemDatabaseUrl(cause)) {
    fixHint =
      " O Prisma está a ligar a «x:5432» — remova `DATABASE_URL=postgresql://x` das variáveis de ambiente do Windows (Painel de controlo → Sistema → Variáveis de ambiente) ou use `STORAGE_POSTGRES_URL` na Vercel. Reinicie `npm run dev` após corrigir `.env.local`.";
  } else {
    fixHint =
      " Ver scripts/sql/neon-subscription-table.sql e scripts/sql/neon-obra-insar-columns.sql na Neon. Vercel: DATABASE_URL em Production, Preview e Build.";
  }

  return NextResponse.json(
    { error: `Base de dados indisponível.${extra}${fixHint}` },
    { status: 503 },
  );
}
