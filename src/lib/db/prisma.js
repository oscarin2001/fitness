import { PrismaClient } from "@prisma/client";

// Mantiene una sola instancia de PrismaClient en desarrollo para evitar múltiples conexiones
const globalForPrisma = globalThis;

// Use DATABASE_URL if provided; otherwise fall back to a path relative to schema directory (prisma/dev.db)
// This avoids accidentally creating prisma/prisma/dev.db during dev when env isn't loaded early.
const datasourceUrl = process.env.DATABASE_URL || "file:./dev.db";

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
  });
}

const prisma = globalForPrisma.prisma;

export default prisma;
