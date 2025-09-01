import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

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

export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const currentPassword = String(body?.currentPassword || "");
    const newPassword = String(body?.newPassword || "");
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "La nueva contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }

    const auth = await prisma.auth.findUnique({ where: { usuarioId: Number(userId) }, select: { password_hash: true } });
    if (!auth || !auth.password_hash) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const ok = await bcrypt.compare(currentPassword, auth.password_hash);
    if (!ok) return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 403 });

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.auth.update({ where: { usuarioId: Number(userId) }, data: { password_hash: newHash } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/account/auth/change-password POST error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
