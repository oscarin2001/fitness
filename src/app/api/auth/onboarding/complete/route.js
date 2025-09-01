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

export async function POST(request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  await prisma.usuario.update({
    where: { id: userId },
    data: { onboarding_completed: true, onboarding_step: null },
  });

  const res = NextResponse.json({ status: "ok" }, { status: 200 });
  // Quitar indicador de primer login y marcar onboarding completado
  res.cookies.set("first_login", "", {
    httpOnly: false,
    path: "/",
    maxAge: 0,
  });
  // Sobre-escribir explícitamente para evitar valores antiguos en el navegador
  res.cookies.set("first_login", "false", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
  res.cookies.set("onboarded", "true", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
  return res;
}
