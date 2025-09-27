import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getToken } from "next-auth/jwt";
import jwt from "jsonwebtoken"; // legacy

async function resolveUserId(req) {
  try {
    const token = await getToken({ req });
    if (token) {
      if (token.userId != null) { const n = Number(token.userId); if (Number.isFinite(n)) return n; }
      const raw = token.id || token.sub;
      if (raw && String(raw).length > 15 && token.email) {
        try { const auth = await prisma.auth.findUnique({ where: { email: String(token.email).toLowerCase() }, select: { usuarioId: true } }); if (auth?.usuarioId) return auth.usuarioId; } catch {}
      } else if (raw) {
        const n = Number(raw); if (Number.isFinite(n)) return n;
      }
      if (token.email) {
        try { const auth = await prisma.auth.findUnique({ where: { email: String(token.email).toLowerCase() }, select: { usuarioId: true } }); if (auth?.usuarioId) return auth.usuarioId; } catch {}
      }
    }
  } catch {}
  try {
    const cookieName = process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';
    const raw = req.cookies.get(cookieName)?.value;
    const secret = process.env.AUTH_SECRET;
    if (!raw || !secret) return null;
    const decoded = jwt.verify(raw, secret);
    let val = decoded?.userId ?? decoded?.sub;
    if (val && String(val).length > 15 && decoded?.email) {
      try { const auth = await prisma.auth.findUnique({ where: { email: String(decoded.email).toLowerCase() }, select: { usuarioId: true } }); if (auth?.usuarioId) return auth.usuarioId; } catch {}
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
    const year = Number(searchParams.get("year") || new Date().getFullYear());
    const month1 = Number(searchParams.get("month") || (new Date().getMonth() + 1)); // 1-12
    const month = Math.min(12, Math.max(1, month1));

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));

    // Preferencia de intervalo del usuario (fallback 2)
    const u = await prisma.usuario.findUnique({ where: { id: userId }, select: { measurement_interval_weeks: true } });
    const weeks = u?.measurement_interval_weeks && [2,3,4].includes(Number(u.measurement_interval_weeks)) ? Number(u.measurement_interval_weeks) : 2;

    // Mediciones del mes
    const items = await prisma.progresoCorporal.findMany({
      where: { usuarioId: Number(userId), fecha: { gte: monthStart, lt: monthEnd } },
      orderBy: { fecha: "asc" },
      select: { id: true, fecha: true, peso_kg: true }
    });

    // Última medición histórica
    const last = await prisma.progresoCorporal.findFirst({
      where: { usuarioId: Number(userId) },
      orderBy: { fecha: "desc" },
      select: { fecha: true }
    });

    let nextControl = null;
    if (last?.fecha) {
      const next = new Date(last.fecha);
      next.setDate(next.getDate() + weeks * 7);
      nextControl = next.toISOString().slice(0,10);
    }

    const days = items.map((it) => new Date(it.fecha).toISOString().slice(0,10));

    return NextResponse.json({
      year,
      month,
      weeks,
      markedDays: days, // YYYY-MM-DD
      nextControl,
    }, { status: 200 });
  } catch (e) {
    console.error("/api/account/progress/calendar GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
