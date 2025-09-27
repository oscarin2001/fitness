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
    const litros = Number(body?.litros);
    if (!(litros > 0)) return NextResponse.json({ error: "Litros inválidos" }, { status: 400 });

    await prisma.usuario.update({ where: { id: userId }, data: { agua_litros_obj: litros } });

    // Crear o actualizar registro de hidratación para HOY
    const today = new Date();
    const ymd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const exists = await prisma.hidratacionDia.findFirst({ where: { usuarioId: userId, fecha: ymd } });
    if (!exists) {
      await prisma.hidratacionDia.create({ data: { usuarioId: userId, fecha: ymd, litros: 0 } });
    }

    return NextResponse.json({ ok: true, litros });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo guardar el objetivo de agua" }, { status: 500 });
  }
}
