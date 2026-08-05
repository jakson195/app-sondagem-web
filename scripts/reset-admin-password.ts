import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const emailArg = process.argv[2]?.trim().toLowerCase();
  const email = (
    emailArg ||
    process.env.MASTER_ADMIN_EMAIL?.trim() ||
    "admin@datageodigital.com.br"
  ).toLowerCase();
  const plain =
    process.env.MASTER_ADMIN_PASSWORD?.trim() ||
    process.env.NEW_PASSWORD?.trim() ||
    "Admin@DataGeo2026";

  if (plain.length < 8) {
    throw new Error("MASTER_ADMIN_PASSWORD deve ter pelo menos 8 caracteres.");
  }

  const passwordHash = await bcrypt.hash(plain, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      password: passwordHash,
      name: "Administrador DataGeo",
      systemRole: "MASTER_ADMIN",
    },
    update: {
      password: passwordHash,
      systemRole: "MASTER_ADMIN",
      name: "Administrador DataGeo",
    },
  });

  console.log("Login resetado com sucesso.");
  console.log("Email:", user.email);
  console.log("Senha:", plain);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
