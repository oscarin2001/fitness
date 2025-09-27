#!/usr/bin/env node
/**
 * Prisma prepare script para Vercel:
 * - Asegura que exista un DATABASE_URL (aunque usemos Turso vía adapter en runtime)
 * - Ejecuta prisma generate
 * - (Opcional) ejecuta prisma migrate deploy si RUN_PRISMA_MIGRATE_DEPLOY !== '0'
 *
 * Motivo: En Vercel el build corre `prisma generate`/`migrate deploy` antes de que nuestras
 * rutas usen el adapter Turso. Prisma requiere un datasource válido para generar el cliente.
 * No necesitamos que apunte a Turso porque en producción usamos driverAdapters (Turso se
 * conecta en runtime). Creamos/usa un archivo SQLite local temporal.
 */

import { execSync } from 'node:child_process';

function log(msg) {
  console.log(`[prisma-prepare] ${msg}`);
}

// Fallback si no viene DATABASE_URL del entorno
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
  log('DATABASE_URL no definido. Usando fallback file:./dev.db solo para generate.');
}

// Ejecutar prisma generate
try {
  log('Ejecutando prisma generate...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  log('prisma generate OK');
} catch (e) {
  log('Fallo prisma generate');
  process.exit(1);
}

// Ejecutar migrate deploy opcionalmente
if (process.env.RUN_PRISMA_MIGRATE_DEPLOY === '0') {
  log('Salteando prisma migrate deploy (RUN_PRISMA_MIGRATE_DEPLOY=0)');
  process.exit(0);
}

try {
  log('Ejecutando prisma migrate deploy (no aplica a Turso, solo asegura coherencia local)...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  log('migrate deploy OK (o sin migraciones pendientes)');
} catch (e) {
  log('Advertencia: migrate deploy falló. Continuando dado que en runtime usamos Turso adapter.');
}
