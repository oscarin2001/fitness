#!/usr/bin/env node
// Limpieza segura de la base de datos (solo usuarios y datos dependientes)
// Compatible con SQLite local y Turso (libSQL). No elimina tablas de catálogo (Alimento, Receta) por defecto.
// Protección:
//  - Requiere CONFIRM_DB_CLEAN=TRUE
//  - Si detecta TURSO_DATABASE_URL requiere además ALLOW_TURSO_CLEAN=TRUE
//  - En production (NODE_ENV=production) también requiere FORCE_DB_CLEAN=1

import { PrismaClient } from '@prisma/client';

function envFlag(name, expected='TRUE') {
  const v = process.env[name];
  return v && v.toString().toUpperCase() === expected.toUpperCase();
}

if (!envFlag('CONFIRM_DB_CLEAN')) {
  console.error('\n[ABORT] Falta variable de confirmación CONFIRM_DB_CLEAN=TRUE.');
  process.exit(1);
}

const usingTurso = !!process.env.TURSO_DATABASE_URL;
if (usingTurso && !envFlag('ALLOW_TURSO_CLEAN')) {
  console.error('\n[ABORT] Detectado TURSO_DATABASE_URL. Añade ALLOW_TURSO_CLEAN=TRUE si realmente quieres limpiar Turso.');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && process.env.FORCE_DB_CLEAN !== '1') {
  console.error('\n[ABORT] NODE_ENV=production requiere FORCE_DB_CLEAN=1 para continuar.');
  process.exit(1);
}

const prisma = new PrismaClient();

// Orden de eliminación cuidando dependencias (solo datos ligados a Usuario):
// CumplimientoComida -> CumplimientoDieta -> PlanComida -> Comida -> HidratacionDia -> ProgresoCorporal -> UsuarioAlimento -> UsuarioBebida -> Auth -> Usuario
const deletionPlan = [
  'CumplimientoComida',
  'CumplimientoDieta',
  'PlanComida',
  'Comida',
  'HidratacionDia',
  'ProgresoCorporal',
  'UsuarioAlimento',
  'UsuarioBebida',
  'Auth',
  'Usuario'
];

// Tablas opcionales para recetas / alimentos si se quiere un reset TOTAL (controlado por INCLUDE_CATALOG=TRUE)
const catalogTables = ['RecetaAlimento','Receta','Alimento'];
const includeCatalog = envFlag('INCLUDE_CATALOG');

async function run() {
  console.log(`\n== Limpieza de base de datos ==`);
  console.log(`Destino: ${usingTurso ? 'Turso (libSQL)' : 'SQLite local'}`);
  console.log('Incluye catálogo:', includeCatalog);

  // Desactivar FK para SQLite/libSQL (PRAGMA) para evitar problemas de orden
  try { await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;'); } catch {}

  for (const table of deletionPlan) {
    try {
      const r = await prisma.$executeRawUnsafe(`DELETE FROM ${table};`);
      console.log(`✔ ${table} limpiada (${r || 0} filas)`);
    } catch (e) {
      console.warn(`⚠ No se pudo limpiar ${table}:`, e.message);
    }
  }

  if (includeCatalog) {
    for (const table of catalogTables) {
      try {
        const r = await prisma.$executeRawUnsafe(`DELETE FROM ${table};`);
        console.log(`✔ ${table} limpiada (${r || 0} filas)`);
      } catch (e) {
        console.warn(`⚠ No se pudo limpiar ${table}:`, e.message);
      }
    }
  }

  // Reset de secuencias (solo SQLite / libsql)
  try {
    // Borrar entradas de sqlite_sequence para reiniciar autoincrement
    const all = deletionPlan.concat(includeCatalog ? catalogTables : []);
    for (const t of all) {
      try { await prisma.$executeRawUnsafe(`DELETE FROM sqlite_sequence WHERE name='${t}';`); } catch {}
    }
    console.log('✔ Secuencias reiniciadas');
  } catch {}

  // Reactivar FK
  try { await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;'); } catch {}

  await prisma.$disconnect();
  console.log('\n✅ Limpieza completada.');
}

run().catch(async (e) => {
  console.error('Error crítico durante limpieza:', e);
  await prisma.$disconnect();
  process.exit(1);
});
