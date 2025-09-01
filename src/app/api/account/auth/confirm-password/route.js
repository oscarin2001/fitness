import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { scryptSync, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";

function getCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

async function getUserIdFromRequest(request) {
  try {
    const cookieName = getCookieName();
    // 1) Intentar por cookie de sesión
    let token = request.cookies.get(cookieName)?.value;
    // 2) Fallback: Authorization: Bearer <token>
    if (!token) {
      const authz = request.headers.get("authorization") || request.headers.get("Authorization");
      if (authz && authz.startsWith("Bearer ")) {
        token = authz.slice(7);
      }
    }
    if (!token) return null;
    const payload = jwt.verify(token, process.env.AUTH_SECRET);
    return Number(payload?.userId || payload?.sub || null);
  } catch {
    return null;
  }
}

function verifyPassword(password, stored) {
  // stored format: salt:hash (hex)
  const [salt, key] = (stored || "").split(":");
  if (!salt || !key) return false;
  const hashBuffer = Buffer.from(key, "hex");
  const derived = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  try {
    return timingSafeEqual(hashBuffer, derived);
  } catch {
    return false;
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

    const ok = verifyPassword(password, auth.password_hash);
    if (!ok) return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/account/auth/confirm-password POST error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
