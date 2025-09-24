import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";
import { scryptSync, timingSafeEqual } from "crypto";

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

    const [user, auth] = await Promise.all([
      prisma.usuario.findUnique({ where: { id: userId } }),
      prisma.auth.findUnique({ where: { usuarioId: userId } }),
    ]);
    if (!user) {
      // Si el token existe pero el usuario no, invalidar cookie y forzar re-login
      const cookieName = getCookieName();
      const res = NextResponse.json({ error: "No autorizado" }, { status: 401 });
      res.cookies.set(cookieName, "", { path: "/", maxAge: 0 });
      return res;
    }

    const { password_hash, token_verificacion, reset_token, ...safe } = user;
    // Adjuntar email proveniente del modelo Auth
    const result = { ...safe, email: auth?.email ?? null };
    return NextResponse.json({ user: result }, { status: 200 });
  } catch (e) {
    console.error("/api/account/profile GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const data = await request.json();

    // Solo permitir campos del perfil
    const allowed = [
      "sexo",
      "altura_cm",
      "peso_kg",
      "fecha_nacimiento",
      "nivel_actividad",
      "pais",
      "objetivo",
      "peso_objetivo_kg",
      "velocidad_cambio",
      "terminos_aceptados",
      // Objetivos nutricionales
      "proteinas_g_obj",
      // Preferencias de alimentos (JSON)
      "preferencias_alimentos",
      // tracking de onboarding
      "onboarding_step",
      "onboarding_completed",
      // email se maneja con autenticación adicional
      "email",
      // password solo para verificar cambios sensibles
      "password",
    ];

    const payload = {};
    for (const key of allowed) {
      if (key in data) payload[key] = data[key];
    }

    // Normalizar email vacío/null: evitar disparar flujo de cambio de email por accidente
    if (payload.email !== undefined) {
      const emailStr = String(payload.email ?? "").trim();
      if (!emailStr) {
        delete payload.email;
        if (payload.password !== undefined) delete payload.password;
      } else {
        payload.email = emailStr.toLowerCase();
      }
    }

    // Normalizar tipos
    if (payload.altura_cm !== undefined) payload.altura_cm = Number(payload.altura_cm);
    if (payload.peso_kg !== undefined) payload.peso_kg = Number(payload.peso_kg);
    if (payload.fecha_nacimiento) payload.fecha_nacimiento = new Date(payload.fecha_nacimiento);
    if (payload.peso_objetivo_kg !== undefined) payload.peso_objetivo_kg = Number(payload.peso_objetivo_kg);
  if (payload.proteinas_g_obj !== undefined) payload.proteinas_g_obj = Number(payload.proteinas_g_obj);

    // Leer usuario actual y auth para validar con datos existentes
    const [current, auth] = await Promise.all([
      prisma.usuario.findUnique({ where: { id: userId } }),
      prisma.auth.findUnique({ where: { usuarioId: userId } }),
    ]);
    if (!current) {
      const cookieName = getCookieName();
      const res = NextResponse.json({ error: "No autorizado" }, { status: 401 });
      res.cookies.set(cookieName, "", { path: "/", maxAge: 0 });
      return res;
    }

    // Si vienen preferencias_alimentos, hacer merge con las existentes para no perder claves (enabledMeals, mealHours, etc.)
    if (payload.preferencias_alimentos !== undefined) {
      try {
        const existing = current.preferencias_alimentos && typeof current.preferencias_alimentos === "object"
          ? current.preferencias_alimentos
          : {};
        const incoming = typeof payload.preferencias_alimentos === "string"
          ? JSON.parse(payload.preferencias_alimentos)
          : (payload.preferencias_alimentos || {});
        const deepMerge = (a, b) => {
          const out = { ...a };
          for (const k of Object.keys(b || {})) {
            const va = out[k];
            const vb = b[k];
            if (va && typeof va === "object" && !Array.isArray(va) && vb && typeof vb === "object" && !Array.isArray(vb)) {
              out[k] = { ...va, ...vb };
            } else {
              out[k] = vb;
            }
          }
          return out;
        };
        payload.preferencias_alimentos = deepMerge(existing, incoming);
      } catch {
        // Si falla el parse/merge, dejar lo entrante tal cual
      }
    }

    const nextState = { ...current, ...payload };

    // Validaciones
    // 1) Fecha de nacimiento: no futuro, edad >= 16
    if (payload.fecha_nacimiento) {
      const dob = new Date(payload.fecha_nacimiento);
      const now = new Date();
      if (dob > now) {
        return NextResponse.json({ error: "Fecha de nacimiento inválida (futuro)" }, { status: 400 });
      }
      const age = Math.floor((now.getTime() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
      if (age < 16) {
        return NextResponse.json({ error: "Debes tener al menos 16 años" }, { status: 400 });
      }
    }

    // 2) Peso objetivo consistente con objetivo y peso actual
    // Solo validar si hay suficiente información
    const objetivo = nextState.objetivo; // Bajar_grasa | Ganar_musculo | Mantenimiento | null
    const pesoActual = nextState.peso_kg;
    const pesoObjetivo = nextState.peso_objetivo_kg;
    if (pesoObjetivo != null && objetivo && pesoActual != null) {
      if (objetivo === "Ganar_musculo" && !(pesoObjetivo > pesoActual)) {
        return NextResponse.json({ error: "Para ganar músculo, el peso objetivo debe ser mayor al actual" }, { status: 400 });
      }
      if (objetivo === "Bajar_grasa" && !(pesoObjetivo < pesoActual)) {
        return NextResponse.json({ error: "Para bajar grasa, el peso objetivo debe ser menor al actual" }, { status: 400 });
      }
      if (objetivo === "Mantenimiento" && Math.abs(pesoObjetivo - pesoActual) > 0.5) {
        return NextResponse.json({ error: "Para mantenimiento, el peso objetivo debe ser similar al actual" }, { status: 400 });
      }
    }

    const updated = await prisma.usuario.update({
      where: { id: userId },
      data: payload,
    });

    // Manejar cambio de email si fue solicitado
    if (payload.email !== undefined) {
      const newEmail = String(payload.email || "").toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail)) {
        return NextResponse.json({ error: "Email inválido" }, { status: 400 });
      }
      // Verificar contraseña
      const pwd = payload.password;
      if (!pwd || typeof pwd !== "string") {
        return NextResponse.json({ error: "Contraseña requerida para cambiar email" }, { status: 400 });
      }
      if (!auth || !auth.password_hash) {
        return NextResponse.json({ error: "No se pudo validar credenciales" }, { status: 400 });
      }
      try {
        const [salt, stored] = String(auth.password_hash).split(":");
        const derived = scryptSync(pwd, salt, 64).toString("hex");
        const ok = timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(derived, "hex"));
        if (!ok) {
          return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: "Error validando contraseña" }, { status: 400 });
      }

      // Evitar colisiones de email
      const existing = await prisma.auth.findUnique({ where: { email: newEmail } });
      if (existing && existing.usuarioId !== userId) {
        return NextResponse.json({ error: "El email ya está en uso" }, { status: 409 });
      }

      await prisma.auth.update({
        where: { usuarioId: userId },
        data: { email: newEmail },
      });
    }

    return NextResponse.json({ ok: true, usuario: { id: updated.id } }, { status: 200 });
  } catch (e) {
    console.error("/api/account/profile error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
