#!/usr/bin/env node
/**
 * Aplica todas las migraciones Prisma (archivos migration.sql) a una base Turso/libSQL.
 * Requisitos:
 *  - TURSO_DATABASE_URL
 *  - TURSO_AUTH_TOKEN (si la base lo requiere)
 *  - CLI `turso` instalado y usuario logueado (para usar su shell).
 * Uso:
 *  node scripts/apply-turso-migrations.mjs --db <nombre-db-en-turso>
 *  (si omites --db intenta inferirlo de TURSO_DATABASE_URL)
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function fail(msg){ console.error('\n[ERROR]', msg); process.exit(1); }

const args = process.argv.slice(2);
let dbName = null;
for (let i=0;i<args.length;i++) {
  if (args[i] === '--db' && args[i+1]) { dbName = args[i+1]; i++; }
}

if (!dbName) {
  const url = process.env.TURSO_DATABASE_URL || '';
  // libsql://<db-name>-something.turso.io
  const m = /^libsql:\/\/([^\.]+)\./.exec(url);
  if (m) dbName = m[1];
}

if (!dbName) fail('No se pudo determinar el nombre de la base. Usa --db <nombre> o exporta TURSO_DATABASE_URL.');

if (!process.env.TURSO_DATABASE_URL) {
  console.warn('[WARN] TURSO_DATABASE_URL no está definido. Aun así se intentará porque turso CLI usa su contexto local.');
}

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');
if (!existsSync(MIGRATIONS_DIR)) fail('No existe prisma/migrations');

// Leer carpetas ordenadas lexicográficamente
const dirs = readdirSync(MIGRATIONS_DIR)
  .filter(d => d !== 'migration_lock.toml')
  .filter(d => statSync(join(MIGRATIONS_DIR, d)).isDirectory())
  .sort();

if (!dirs.length) {
  console.log('No hay migraciones para aplicar.');
  process.exit(0);
}

console.log(`\n== Aplicando migraciones a Turso: ${dbName} ==`);
for (const d of dirs) {
  const sqlPath = join(MIGRATIONS_DIR, d, 'migration.sql');
  if (!existsSync(sqlPath)) { console.log(`(omitida) ${d} no tiene migration.sql`); continue; }
  const sqlPreview = readFileSync(sqlPath, 'utf8').split('\n').slice(0,3).join('\n');
  console.log(`\n-- ${d} --`);
  console.log(sqlPreview.length ? sqlPreview + '\n...' : '(vacío)');
  try {
    // Usar shell CLI; redirección de archivo
    execSync(`turso db shell ${dbName} < "${sqlPath}"`, { stdio: 'inherit' });
    console.log(`✔ Aplicada ${d}`);
  } catch (e) {
    console.error(`✖ Error aplicando ${d}`);
    console.error(e.message);
    process.exit(1);
  }
}
console.log('\n✅ Todas las migraciones aplicadas.');
