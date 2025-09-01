import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";

function getCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

async function getUserIdFromRequest(request) {
  try {
    const cookieName = getCookieName();
    const token = request.cookies.get(cookieName)?.value;
    const secret = process.env.AUTH_SECRET;
    if (!token || !secret) return null;
    const decoded = jwt.verify(token, secret);
    return parseInt(decoded.sub, 10);
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const rows = await prisma.usuarioAlimento.findMany({
      where: { usuarioId: userId },
      include: { alimento: { select: { id: true, nombre: true, categoria: true } } },
      orderBy: [{ prioridad: "asc" }, { id: "asc" }],
    });

    const items = rows.map((r) => ({
      alimentoId: r.alimentoId,
      nombre: r.alimento?.nombre || "",
      categoria: r.categoria ?? r.alimento?.categoria ?? null,
      prioridad: r.prioridad ?? null,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo obtener ingredientes del usuario" }, { status: 500 });
  }
}

// POST body: { items: Array<{ alimentoId: number, categoria?: string, prioridad?: number }> }
// Reemplaza las selecciones actuales por las provistas
export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const arr = Array.isArray(body.items) ? body.items : [];
    const mode = String(body.mode || "replace"); // 'replace' | 'append'

    // Normalizar entradas: pueden venir como {alimentoId} o {nombre, categoria?, prioridad?}
    const withIds = [];
    const byName = [];
    for (const x of arr) {
      if (x && (x.alimentoId || x.alimento_id)) {
        const id = Number(x.alimentoId ?? x.alimento_id);
        if (Number.isFinite(id) && id > 0) withIds.push({ alimentoId: id, categoria: x.categoria ?? null, prioridad: x.prioridad != null ? Number(x.prioridad) : null });
      } else if (x && typeof x.nombre === "string" && x.nombre.trim()) {
        byName.push({ nombre: x.nombre.trim(), categoria: x.categoria ?? null, prioridad: x.prioridad != null ? Number(x.prioridad) : null });
      }
    }

    // Resolver por nombre: upsert en Alimento por nombre (case-insensitive manual)
    for (const item of byName) {
      let existing = await prisma.alimento.findFirst({ where: { nombre: item.nombre } });
      if (!existing) {
        // Intento laxa: contains y validar en JS
        const cand = await prisma.alimento.findFirst({ where: { nombre: { contains: item.nombre } } });
        if (cand && (cand.nombre || "").toLowerCase() === item.nombre.toLowerCase()) existing = cand;
      }
      let alimId;
      if (existing) {
        alimId = existing.id;
        if (!existing.categoria && item.categoria) {
          await prisma.alimento.update({ where: { id: existing.id }, data: { categoria: item.categoria } });
        }
      } else {
        const created = await prisma.alimento.create({ data: { nombre: item.nombre, categoria: item.categoria ?? null } });
        alimId = created.id;
      }
      withIds.push({ alimentoId: alimId, categoria: item.categoria ?? null, prioridad: item.prioridad ?? null });
    }

    // Validar que los alimentoId existan para evitar errores de FK
    const ids = withIds.map((x) => x.alimentoId).filter((n) => Number.isFinite(n) && n > 0);
    let validIdSet = new Set();
    if (ids.length) {
      const existing = await prisma.alimento.findMany({ where: { id: { in: ids } }, select: { id: true } });
      validIdSet = new Set(existing.map((r) => r.id));
    }
    // Filtrar por existencia
    const finalItems = withIds.filter((x) => validIdSet.has(x.alimentoId));
    // Deduplicar por alimentoId para evitar errores de UNIQUE (SQLite no soporta skipDuplicates de forma nativa)
    const seen = new Set();
    const uniqueItems = [];
    for (const it of finalItems) {
      if (seen.has(it.alimentoId)) continue;
      seen.add(it.alimentoId);
      uniqueItems.push(it);
    }

    // Si no hay items válidos, no hacer nada pero devolver ok para no bloquear flujo
    if (uniqueItems.length === 0) {
      if (mode === 'replace') {
        // Limpia selección si el usuario decidió reemplazar con vacío
        await prisma.usuarioAlimento.deleteMany({ where: { usuarioId: userId } });
      }
      const total = await prisma.usuarioAlimento.count({ where: { usuarioId: userId } });
      return NextResponse.json({ ok: true, count: total, note: "sin items válidos" });
    }

    if (mode === "append") {
      // Añadir sin duplicar (upsert por índice compuesto)
      for (const x of uniqueItems) {
        await prisma.usuarioAlimento.upsert({
          where: { usuarioId_alimentoId: { usuarioId: userId, alimentoId: x.alimentoId } },
          update: { categoria: x.categoria, prioridad: x.prioridad },
          create: { usuarioId: userId, alimentoId: x.alimentoId, categoria: x.categoria, prioridad: x.prioridad },
        });
      }
      const total = await prisma.usuarioAlimento.count({ where: { usuarioId: userId } });
      return NextResponse.json({ ok: true, count: total, mode: "append" });
    } else {
      // Reemplazar por lista exacta
      await prisma.usuarioAlimento.deleteMany({ where: { usuarioId: userId } });
      for (const x of uniqueItems) {
        await prisma.usuarioAlimento.create({ data: { usuarioId: userId, alimentoId: x.alimentoId, categoria: x.categoria, prioridad: x.prioridad } });
      }
      return NextResponse.json({ ok: true, count: uniqueItems.length, mode: "replace" });
    }
  } catch (e) {
    const msg = process.env.NODE_ENV !== 'production' && e && (e.message || e.code) ? `${e.message || e.code}` : "No se pudo guardar ingredientes del usuario";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
