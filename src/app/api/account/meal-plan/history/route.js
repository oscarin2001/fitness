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
    const val = payload?.userId ?? payload?.sub ?? null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function dayKey(d) {
  // returns YYYY-MM-DD in local time equivalent (server timezone)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const days = Math.min(90, Math.max(7, Number(searchParams.get("days") || 14)));

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));

    // Traer cumplimientos en rango
    const rows = await prisma.cumplimientoComida.findMany({
      where: {
        usuarioId: userId,
        fecha: {
          gte: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
          lt: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
        },
      },
      orderBy: { fecha: "asc" },
    });

    // Mapear por día: total por tipos y cuantos cumplidos
    const map = new Map();
    for (const r of rows) {
      const k = dayKey(new Date(r.fecha));
      if (!map.has(k)) map.set(k, { total: 0, ok: 0 });
      const cur = map.get(k);
      cur.total += 1;
      if (r.cumplido) cur.ok += 1;
    }

    const data = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const k = dayKey(d);
      const v = map.get(k) || { total: 0, ok: 0 };
      const adherence = v.total > 0 ? Math.round((v.ok / v.total) * 100) : 0;
      data.push({ date: k, adherence });
    }

    return NextResponse.json({ items: data }, { status: 200 });
  } catch (e) {
    console.error("/api/account/meal-plan/history GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
