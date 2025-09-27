import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";
import { getToken } from "next-auth/jwt";

function getCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

async function getUserIdFromRequest(request) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (secret) {
    try {
      const nt = await getToken({ req: request, secret });
      if (nt?.email) {
        const auth = await prisma.auth.findUnique({ where: { email: nt.email.toLowerCase() } });
        if (auth?.usuarioId) return auth.usuarioId;
      }
    } catch {}
  }
  try {
    const cookieName = getCookieName();
    const token = request.cookies.get(cookieName)?.value;
    const legacySecret = process.env.AUTH_SECRET;
    if (!token || !legacySecret) return null;
    const decoded = jwt.verify(token, legacySecret);
    return parseInt(decoded.sub, 10);
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const delta = typeof body?.deltaLitros === "number" ? body.deltaLitros : null;
    const setLitros = typeof body?.litros === "number" ? body.litros : null;

    if (delta == null && setLitros == null) {
      return NextResponse.json({ error: "Se requiere deltaLitros o litros" }, { status: 400 });
    }

    const now = new Date();
    const start = new Date(now); start.setHours(0,0,0,0);
    const end = new Date(now); end.setHours(23,59,59,999);

    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { agua_litros_obj: true },
    });

    const objetivo = usuario?.agua_litros_obj ?? null;

    let record = await prisma.hidratacionDia.findFirst({
      where: { usuarioId: userId, fecha: { gte: start, lte: end } },
    });

    if (!record) {
      record = await prisma.hidratacionDia.create({
        data: { usuarioId: userId, fecha: now, litros: 0, completado: false },
      });
    }

    let litros = setLitros != null ? setLitros : record.litros + (delta || 0);
    // Limitar a rango válido y al objetivo si existe
    if (litros < 0) litros = 0;
    if (objetivo != null && litros > objetivo) litros = objetivo;

    const completado = objetivo != null ? litros >= objetivo : false;

    const updated = await prisma.hidratacionDia.update({
      where: { id: record.id },
      data: { litros, completado },
    });

    return NextResponse.json({
      hoy_litros: updated.litros,
      objetivo_litros: objetivo,
      completado: updated.completado,
    });
  } catch (e) {
    console.error("/api/account/hydration/log error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
