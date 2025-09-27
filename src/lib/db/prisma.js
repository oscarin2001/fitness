import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// Mantiene una sola instancia de PrismaClient en desarrollo para evitar múltiples conexiones
const globalForPrisma = globalThis;

// Conditional Turso adapter: if TURSO_DATABASE_URL is present we use LibSQL adapter.
function buildPrisma() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  if (tursoUrl) {
    const adapter = new PrismaLibSQL({ url: tursoUrl, authToken: tursoToken });
    return new PrismaClient({ adapter });
  }
  const datasourceUrl = process.env.DATABASE_URL || "file:./dev.db";
  return new PrismaClient({ datasources: { db: { url: datasourceUrl } } });
}

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = buildPrisma();
}

const prisma = globalForPrisma.prisma;

export default prisma;
