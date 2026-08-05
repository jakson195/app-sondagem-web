import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const migrations = await prisma.$queryRaw<
    Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
      logs: string | null;
    }>
  >`
    SELECT migration_name, finished_at, rolled_back_at, logs
    FROM "_prisma_migrations"
    ORDER BY started_at
  `;
  console.log("=== _prisma_migrations ===");
  for (const m of migrations) {
    console.log(
      m.migration_name,
      m.finished_at ? "OK" : m.rolled_back_at ? "ROLLED_BACK" : "FAILED/PENDING",
      m.logs?.slice(0, 120) ?? "",
    );
  }

  const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Obra'
    ORDER BY ordinal_position
  `;
  console.log("\n=== Obra columns ===");
  console.log(cols.map((c) => c.column_name).join(", "));

  try {
    await prisma.obra.findFirst({ take: 1 });
    console.log("\nprisma.obra.findFirst: OK");
  } catch (e) {
    console.log("\nprisma.obra.findFirst: FAIL", e);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
