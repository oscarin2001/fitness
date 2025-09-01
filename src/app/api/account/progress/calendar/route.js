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
    if (!token) return null;
    const payload = jwt.verify(token, process.env.AUTH_SECRET);
    return Number(payload?.userId || payload?.sub || null);
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
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
