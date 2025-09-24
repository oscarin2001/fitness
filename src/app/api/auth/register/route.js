import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { SignJWT } from "jose";

function validateRegister(body) {
  const errors = {};
  const { nombre, apellido, email, password } = body || {};

  if (!nombre || typeof nombre !== "string" || nombre.trim().length < 2) {
    errors.nombre = "Nombre es requerido (mínimo 2 caracteres)";
  }
  if (!apellido || typeof apellido !== "string" || apellido.trim().length < 2) {
    errors.apellido = "Apellido es requerido (mínimo 2 caracteres)";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== "string" || !emailRegex.test(email)) {
    errors.email = "Email inválido";
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    errors.password = "La contraseña debe tener al menos 8 caracteres";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { valid, errors } = validateRegister(body);
    if (!valid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const { nombre, apellido, email, password } = body;

    // Verificar si el email ya existe
    const existing = await prisma.auth.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "El email ya está registrado" }, { status: 409 });
    }

    const password_hash = hashPassword(password);

    // Crear usuario y credenciales en transacción
    const result = await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          fecha_nacimiento: new Date(0), // placeholder si luego pides fecha real
          sexo: "N/A",
        },
      });

      const auth = await tx.auth.create({
        data: {
          usuarioId: usuario.id,
          email: email.toLowerCase(),
          password_hash,
          verificado: false,
        },
        select: { id: true, email: true, verificado: true, usuarioId: true },
      });

      return { usuario, auth };
    });

    // Configurar token de sesión y cookies después del registro
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const token = await new SignJWT({
      sub: result.auth.id,
      email: result.auth.email,
      name: `${result.usuario.nombre} ${result.usuario.apellido}`,
      privilege: "Invitado",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);

    const response = NextResponse.json(
      {
        message: "Registro exitoso",
        user: {
          id: result.usuario.id,
          nombre: result.usuario.nombre,
          apellido: result.usuario.apellido,
          email: result.auth.email,
          verificado: result.auth.verificado,
        },
      },
      { status: 201 }
    );

    response.cookies.set("authjs.session-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 días
    });
    response.cookies.set("first_login", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24, // 1 día
    });

    return response;
  } catch (err) {
    console.error("[REGISTER_ERROR]", err);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
