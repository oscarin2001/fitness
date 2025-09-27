#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function log(msg){
  console.log(`[verify-prisma] ${msg}`);
}

try {
  const schema = readFileSync('prisma/schema.prisma','utf8');
  if (schema.includes('env("DATABASE_URL")')) {
    log('ERROR: schema.prisma aún contiene env("DATABASE_URL"). Deteniendo build.');
    process.exit(1);
  }
  const hash = createHash('sha256').update(schema).digest('hex').slice(0,12);
  log(`schema OK (hash ${hash}).`);
} catch (e){
  log('No se pudo leer prisma/schema.prisma: ' + e.message);
  process.exit(1);
}
