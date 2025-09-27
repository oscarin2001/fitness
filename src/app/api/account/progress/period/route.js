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
    const endingStr = searchParams.get("ending");
    const ending = endingStr ? new Date(endingStr + "T00:00:00Z") : new Date();

    const u = await prisma.usuario.findUnique({ where: { id: Number(userId) }, select: { measurement_interval_weeks: true } });
    const weeksParam = searchParams.get("weeks");
    const weeks = weeksParam ? Number(weeksParam) : Number(u?.measurement_interval_weeks ?? 2);
    const safeWeeks = [2,3,4].includes(weeks) ? weeks : 2;

    const start = new Date(ending);
    start.setUTCDate(start.getUTCDate() - safeWeeks * 7);

    // Traer mediciones en la ventana [start, ending]
    const items = await prisma.progresoCorporal.findMany({
      where: {
        usuarioId: Number(userId),
        fecha: { gte: start, lte: ending },
      },
      orderBy: { fecha: "desc" },
      select: { fecha: true, peso_kg: true },
    });

    let startVal = null, currentVal = null, delta = null, startDate = null, currentDate = null;

    if (items.length > 0) {
      currentVal = items[0]?.peso_kg ?? null;
      currentDate = items[0] ? new Date(items[0].fecha).toISOString().slice(0,10) : null;
      const oldest = items[items.length - 1];
      startVal = oldest?.peso_kg ?? null;
      startDate = oldest ? new Date(oldest.fecha).toISOString().slice(0,10) : null;
      if (currentVal != null && startVal != null) delta = Number((currentVal - startVal).toFixed(1));
    } else {
      // fallback: usar más reciente de siempre y el más antiguo de siempre
      const mostRecent = await prisma.progresoCorporal.findFirst({ where: { usuarioId: Number(userId) }, orderBy: { fecha: "desc" }, select: { fecha: true, peso_kg: true } });
      const mostOld = await prisma.progresoCorporal.findFirst({ where: { usuarioId: Number(userId) }, orderBy: { fecha: "asc" }, select: { fecha: true, peso_kg: true } });
      if (mostRecent && mostOld) {
        currentVal = mostRecent.peso_kg;
        currentDate = new Date(mostRecent.fecha).toISOString().slice(0,10);
        startVal = mostOld.peso_kg;
        startDate = new Date(mostOld.fecha).toISOString().slice(0,10);
        delta = Number((currentVal - startVal).toFixed(1));
      }
    }

    return NextResponse.json({
      weeks: safeWeeks,
      start: startVal,
      current: currentVal,
      delta,
      startDate,
      currentDate,
      ending: ending.toISOString().slice(0,10),
    }, { status: 200 });
  } catch (e) {
    console.error("/api/account/progress/period GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
