import { PrismaClient } from "@prisma/client";
// Import del adaptador libsql eliminado a nivel superior para evitar que Next/Webpack
// intente parsear binarios (.node) durante el build. Lo cargamos dinámicamente
// solo cuando realmente existe TURSO_DATABASE_URL en runtime (Node server).

// Mantiene una sola instancia de PrismaClient en desarrollo para evitar múltiples conexiones
const globalForPrisma = globalThis;

// Conditional Turso adapter: if TURSO_DATABASE_URL is present we use LibSQL adapter.
function buildPrisma() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  const debug = process.env.DB_DEBUG === '1' || process.env.NODE_ENV === 'development';

  if (tursoUrl) {
    try {
      // Usamos eval("require") para que el bundler NO siga este módulo en build.
      // eslint-disable-next-line no-eval
      const { PrismaLibSQL } = eval("require")("@prisma/adapter-libsql");
      const adapter = new PrismaLibSQL({ url: tursoUrl, authToken: tursoToken });
      if (debug) {
        console.log('[prisma] Inicializando con Turso libsql. URL base:', tursoUrl);
      }
      return new PrismaClient({ adapter });
    } catch (e) {
      console.error("[prisma] No se pudo cargar @prisma/adapter-libsql dinámicamente:", e);
      throw new Error("Fallo cargando adaptador Turso. Verifica dependencias e instalación.");
    }
  }

  if (process.env.VERCEL) {
    // En entorno Vercel (preview/prod) exigimos Turso.
    throw new Error('Falta TURSO_DATABASE_URL en entorno Vercel. Configura las variables Turso.');
  }

  const datasourceUrl = process.env.DATABASE_URL || "file:./dev.db";
  if (debug) {
    console.log('[prisma] Usando datasource local SQLite:', datasourceUrl);
  }
  return new PrismaClient({ datasources: { db: { url: datasourceUrl } } });
}

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = buildPrisma();
}

const prisma = globalForPrisma.prisma;

export default prisma;
