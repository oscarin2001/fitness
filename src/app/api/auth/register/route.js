import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

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

    return NextResponse.json(
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
  } catch (err) {
    console.error("[REGISTER_ERROR]", err);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
