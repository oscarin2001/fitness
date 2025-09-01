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
    const dateStr = searchParams.get("date"); // YYYY-MM-DD
    const date = dateStr ? new Date(dateStr) : new Date();
    const start = new Date(date); start.setHours(0,0,0,0);
    const end = new Date(date); end.setHours(23,59,59,999);

    const rows = await prisma.cumplimientoComida.findMany({
      where: { usuarioId: userId, fecha: { gte: start, lte: end } },
      orderBy: { comida_tipo: "asc" },
    });

    return NextResponse.json({ items: rows });
  } catch (e) {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const tipo = body?.tipo; // ComidaTipo
    const cumplido = !!body?.cumplido;
    const dateStr = body?.date; // YYYY-MM-DD opcional, default hoy
    const horaStr = body?.hora; // HH:MM opcional
    const date = dateStr ? new Date(dateStr) : new Date();
    const start = new Date(date); start.setHours(0,0,0,0);

    if (!tipo) return NextResponse.json({ error: "tipo requerido" }, { status: 400 });

    // Construir hora_real si viene HH:MM
    let hora_real = null;
    if (typeof horaStr === "string" && /^\d{2}:\d{2}$/.test(horaStr)) {
      const [h, m] = horaStr.split(":" ).map((v) => parseInt(v, 10));
      const dt = new Date(start);
      dt.setHours(h, m, 0, 0);
      hora_real = dt;
    }

    // Upsert por clave única compuesta (usuarioId, fecha, comida_tipo)
    // Nota: solo incluimos hora_real si no es null para evitar errores
    // cuando la migración aún no ha sido aplicada y el cliente Prisma no conoce el campo
    let up;
    try {
      const updateData = { cumplido, ...(hora_real != null ? { hora_real } : {}) };
      const createData = { usuarioId: userId, fecha: start, comida_tipo: tipo, cumplido, ...(hora_real != null ? { hora_real } : {}) };
      up = await prisma.cumplimientoComida.upsert({
        where: {
          usuarioId_fecha_comida_tipo: { usuarioId: userId, fecha: start, comida_tipo: tipo },
        },
        update: updateData,
        create: createData,
      });
    } catch (err) {
      // Fallback: buscar primero y actualizar/crear manualmente
      const existing = await prisma.cumplimientoComida.findFirst({
        where: { usuarioId: userId, fecha: start, comida_tipo: tipo },
        orderBy: { id: "desc" },
      });
      const updateData = { cumplido, ...(hora_real != null ? { hora_real } : {}) };
      const createData = { usuarioId: userId, fecha: start, comida_tipo: tipo, cumplido, ...(hora_real != null ? { hora_real } : {}) };
      if (existing) {
        up = await prisma.cumplimientoComida.update({ where: { id: existing.id }, data: updateData });
      } else {
        up = await prisma.cumplimientoComida.create({ data: createData });
      }
    }

    return NextResponse.json({ item: up });
  } catch (e) {
    console.error("/api/account/meal-plan/compliance error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
