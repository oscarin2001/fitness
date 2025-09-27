import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getToken } from "next-auth/jwt";
import jwt from "jsonwebtoken"; // legacy fallback

async function resolveUserId(req) {
  // NextAuth token first
  try {
    const token = await getToken({ req });
    if (token) {
      if (token.userId != null) {
        const n = Number(token.userId); if (Number.isFinite(n)) return n;
      }
      const raw = token.id || token.sub;
      if (raw && String(raw).length > 15 && token.email) {
        try {
          const auth = await prisma.auth.findUnique({ where: { email: String(token.email).toLowerCase() }, select: { usuarioId: true } });
          if (auth?.usuarioId) return auth.usuarioId;
        } catch {}
      } else if (raw) {
        const n = Number(raw); if (Number.isFinite(n)) return n;
      }
      if (token.email) {
        try {
          const auth = await prisma.auth.findUnique({ where: { email: String(token.email).toLowerCase() }, select: { usuarioId: true } });
          if (auth?.usuarioId) return auth.usuarioId;
        } catch {}
      }
    }
  } catch {}
  // Legacy cookie fallback
  try {
    const cookieName = process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';
    const raw = req.cookies.get(cookieName)?.value;
    const secret = process.env.AUTH_SECRET;
    if (!raw || !secret) return null;
    const decoded = jwt.verify(raw, secret);
    let val = decoded?.userId ?? decoded?.sub;
    if (val && String(val).length > 15 && decoded?.email) {
      try {
        const auth = await prisma.auth.findUnique({ where: { email: String(decoded.email).toLowerCase() }, select: { usuarioId: true } });
        if (auth?.usuarioId) return auth.usuarioId;
      } catch {}
    }
    const n = Number(val); if (Number.isFinite(n)) return n;
  } catch {}
  return null;
}

export async function GET(request) {
  try {
  const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    let days = parseInt(searchParams.get("days") || "14", 10);
    if (!Number.isFinite(days) || days <= 0) days = 14;
    if (days > 60) days = 60;

    // Fechas: hoy a medianoche y rango [start, end]
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));

    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { agua_litros_obj: true },
    });
    const objetivo = usuario?.agua_litros_obj ?? null;

    const rows = await prisma.hidratacionDia.findMany({
      where: { usuarioId: userId, fecha: { gte: start, lte: end } },
      orderBy: { fecha: "asc" },
    });

    const byYMD = new Map();
    for (const r of rows) {
      const d = new Date(r.fecha);
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      byYMD.set(ymd, r);
    }

    const items = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const r = byYMD.get(ymd);
      const litros = r?.litros ?? 0;
      const obj = objetivo;
      const completado = obj != null ? litros >= obj : false;
      items.push({ fecha: ymd, litros, objetivo: obj, completado });
    }

    return NextResponse.json({ items });
  } catch (e) {
    console.error("/api/account/hydration/history error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
