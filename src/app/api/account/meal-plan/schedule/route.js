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

// GET: devuelve horarios actuales por comida desde overrides.hora
export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const plans = await prisma.planComida.findMany({
      where: { usuarioId: userId },
      select: { comida_tipo: true, overrides: true },
      orderBy: { comida_tipo: "asc" },
    });
    const schedule = {};
    for (const p of plans) {
      const hora = p?.overrides?.hora;
      if (typeof hora === "string" && hora.length >= 4) schedule[p.comida_tipo] = hora;
    }
    return NextResponse.json({ schedule });
  } catch (e) {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// POST: body { tipo: "Desayuno"|"Almuerzo"|"Cena"|"Snack", hora: "HH:MM" }
// Actualiza overrides.hora del registro PlanComida del tipo indicado
export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const tipo = body?.tipo;
    const hora = body?.hora;
    if (!tipo || !hora || !/^\d{2}:\d{2}$/.test(hora)) {
      return NextResponse.json({ error: "tipo y hora (HH:MM) son requeridos" }, { status: 400 });
    }

    // Debe existir el plan para ese tipo; si no existe, devolvemos 404 (se podría crear en el futuro)
    const current = await prisma.planComida.findUnique({
      where: { usuarioId_comida_tipo: { usuarioId: userId, comida_tipo: tipo } },
      select: { overrides: true },
    });
    if (!current) {
      return NextResponse.json({ error: "No existe plan para esa comida" }, { status: 404 });
    }

    const overrides = (current.overrides && typeof current.overrides === "object") ? current.overrides : {};
    overrides.hora = hora;

    await prisma.planComida.update({
      where: { usuarioId_comida_tipo: { usuarioId: userId, comida_tipo: tipo } },
      data: { overrides },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
