import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { scryptSync, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";

function validateLogin(body) {
  const errors = {};
  const { email, password } = body || {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== "string" || !emailRegex.test(email)) {
    errors.email = "Email inválido";
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    errors.password = "Contraseña inválida";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

function verifyPassword(password, stored) {
  // stored format: salt:hash
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
    const body = await request.json();
    const { valid, errors } = validateLogin(body);
    if (!valid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const { email, password, remember } = body || {};

    const auth = await prisma.auth.findUnique({
      where: { email: email.toLowerCase() },
      include: { usuario: true },
    });

    if (!auth || !verifyPassword(password, auth.password_hash)) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    // Detectar si es primer login (antes de actualizar last_login)
    const isFirstLogin = !auth.last_login;

    // Actualizar last_login
    await prisma.auth.update({ where: { id: auth.id }, data: { last_login: new Date() } });

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error("AUTH_SECRET no definido");
      return NextResponse.json({ error: "Configuración inválida del servidor" }, { status: 500 });
    }

    const payload = {
      sub: String(auth.usuarioId),
      email: auth.email,
      name: `${auth.usuario.nombre} ${auth.usuario.apellido}`.trim(),
      privilege: "Invitado", // por ahora sin roles en BD
    };

    // Token y cookie: si remember es true => 30 días, caso contrario cookie de sesión (sin maxAge)
    const maxDays = remember ? 30 : null;
    const token = jwt.sign(payload, secret, {
      algorithm: "HS256",
      expiresIn: maxDays ? `${maxDays}d` : "1d", // token corto si es sesión; la cookie no persiste
    });

    const cookieName = process.env.NODE_ENV === "production"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    const res = NextResponse.json({ message: "Login exitoso" }, { status: 200 });
    res.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      ...(maxDays ? { maxAge: 60 * 60 * 24 * maxDays } : {}),
    });

    // Si es primer login, establecer cookie first_login para que el middleware redirija a onboarding
    if (isFirstLogin) {
      res.cookies.set("first_login", "true", {
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24, // 1 día
      });
    }

    return res;
  } catch (err) {
    console.error("[LOGIN_ERROR]", err);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
