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
