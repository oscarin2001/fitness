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

// GET: devuelve plan de bebidas guardado
export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const rows = await prisma.usuarioBebida.findMany({
      where: { usuarioId: userId },
      include: { bebida: { select: { id: true, nombre: true } } },
      orderBy: { id: "asc" },
    });
    const items = rows.map(r => ({ id: r.id, bebidaId: r.bebidaId, nombre: r.bebida?.nombre || "", ml: r.ml, momento: r.momento || null }));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo obtener plan de bebidas" }, { status: 500 });
  }
}

// POST body: { items: [ { nombre?: string, bebidaId?: number, ml: number, momento?: string } ], mode?: 'replace'|'append' }
export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const arr = Array.isArray(body.items) ? body.items : [];
    const mode = body.mode === 'append' ? 'append' : 'replace';

    // Normalizar y crear/usar alimentos (categoria BebidasInfusiones) para cada bebida
    const prepared = [];
    for (const x of arr) {
      if (!x) continue;
      let ml = Math.round(Number(x.ml) || 0);
      if (!(ml > 0)) continue;
      ml = Math.min(250, Math.max(30, ml));
      let bebidaId = null;
      if (x.bebidaId) bebidaId = Number(x.bebidaId);
      let nombre = (x.nombre || '').toString().trim();
      if (!bebidaId && !nombre) continue;
      if (bebidaId && !Number.isFinite(bebidaId)) bebidaId = null;
      if (!bebidaId && nombre) {
        // Buscar alimento existente exacto
        let ali = await prisma.alimento.findFirst({ where: { nombre } });
        if (!ali) {
          ali = await prisma.alimento.create({ data: { nombre, categoria: 'BebidasInfusiones', categoria_enum: 'BebidasInfusiones' } });
        } else if (!ali.categoria_enum) {
          await prisma.alimento.update({ where: { id: ali.id }, data: { categoria: ali.categoria || 'BebidasInfusiones', categoria_enum: 'BebidasInfusiones' } });
        }
        bebidaId = ali.id;
      }
      if (!bebidaId) continue;
      const momentoRaw = (x.momento || '').toString();
      const momento = /desayuno|almuerzo|cena|snack/i.test(momentoRaw) ? (momentoRaw.charAt(0).toUpperCase() + momentoRaw.slice(1)) : 'General';
      prepared.push({ bebidaId, ml, momento });
    }

    if (!prepared.length) {
      if (mode === 'replace') await prisma.usuarioBebida.deleteMany({ where: { usuarioId: userId } });
      return NextResponse.json({ ok: true, count: 0 });
    }

    if (mode === 'replace') {
      await prisma.usuarioBebida.deleteMany({ where: { usuarioId: userId } });
    }

    for (const it of prepared) {
      await prisma.usuarioBebida.create({ data: { usuarioId: userId, bebidaId: it.bebidaId, ml: it.ml, momento: it.momento } });
    }

    const total = await prisma.usuarioBebida.count({ where: { usuarioId: userId } });
    return NextResponse.json({ ok: true, count: total, mode });
  } catch (e) {
    const msg = process.env.NODE_ENV !== 'production' && e && (e.message || e.code) ? `${e.message || e.code}` : 'No se pudo guardar plan de bebidas';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
