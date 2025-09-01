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
    const password = String(body?.password || "");
    if (!password) {
      return NextResponse.json({ error: "Contraseña requerida" }, { status: 400 });
    }

    const auth = await prisma.auth.findUnique({ where: { usuarioId: Number(userId) }, select: { password_hash: true } });
    if (!auth || !auth.password_hash) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const ok = await bcrypt.compare(password, auth.password_hash);
    if (!ok) return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 403 });

    // Reset de configuración: puedes ampliar según necesidades
    await prisma.usuario.update({
      where: { id: Number(userId) },
      data: {
        measurement_interval_weeks: null,
        // Puedes resetear otros flags de configuración si aplica
        // onboarding_completed: false,
        // onboarding_step: null,
        // preferencias_alimentos: null,
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/account/profile/reset POST error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
