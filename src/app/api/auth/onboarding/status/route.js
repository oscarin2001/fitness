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

const stepOrder = [
  "sex",
  "metrics",
  "birthdate",
  "activity",
  "country",
  "objective",
  "target-weight",
  "speed",
  // Nuevos pasos del flujo nutricional
  "meal-days",        // seleccionar días (mínimo 5)
  "protein-target",   // objetivo de proteína
  "meals-terms",      // habilitar comidas y horarios
  "foods",            // preferencias de alimentos
  "review",           // revisar y aceptar términos
  "advice",           // generación de consejo/plan
];

function firstMissingStep(user) {
  // Determine required fields for each step
  const prefs = (user?.preferencias_alimentos && typeof user.preferencias_alimentos === 'object')
    ? user.preferencias_alimentos
    : {};
  const enabledMeals = prefs?.enabledMeals && typeof prefs.enabledMeals === 'object' ? prefs.enabledMeals : null;
  const enabledMealsCount = enabledMeals ? Object.values(enabledMeals).filter(Boolean).length : 0;
  const hasFoodPrefs = (
    (Array.isArray(prefs?.carbs) && prefs.carbs.length > 0) ||
    (Array.isArray(prefs?.proteins) && prefs.proteins.length > 0) ||
    (Array.isArray(prefs?.fiber) && prefs.fiber.length > 0) ||
    (Array.isArray(prefs?.fats) && prefs.fats.length > 0) ||
    (Array.isArray(prefs?.snacks) && prefs.snacks.length > 0)
  );
  const proteinRange = (prefs?.proteinRangeKg && typeof prefs.proteinRangeKg === 'object') ? prefs.proteinRangeKg : null;
  const diasDieta = Array.isArray(user?.dias_dieta) ? user.dias_dieta : [];

  const required = {
    sex: !!user?.sexo,
    metrics: user?.altura_cm != null && user?.peso_kg != null,
    birthdate: !!user?.fecha_nacimiento,
    activity: !!user?.nivel_actividad,
    country: !!user?.pais,
    objective: !!user?.objetivo,
    "target-weight": user?.peso_objetivo_kg != null,
    speed: !!user?.velocidad_cambio,
    // Nuevos requisitos
    "meal-days": diasDieta.length >= 5,
    "protein-target": (typeof user?.proteinas_g_obj === 'number' && user.proteinas_g_obj > 0) || !!proteinRange,
    "meals-terms": enabledMealsCount >= 1, // al menos una comida habilitada
    "foods": hasFoodPrefs,
    review: !!user?.terminos_aceptados,
    advice: true, // advice se permite siempre que lo previo esté
  };
  for (const step of stepOrder) {
    if (!required[step]) return step;
  }
  return null;
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const user = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) {
      const cookieName = getCookieName();
      const res = NextResponse.json({ error: "No autorizado" }, { status: 401 });
      res.cookies.set(cookieName, "", { path: "/", maxAge: 0 });
      return res;
    }

    const missing = firstMissingStep(user);
    const completed = !missing;

    // prefer DB-tracked step if present and sensible
    const step = user.onboarding_step && stepOrder.includes(user.onboarding_step)
      ? user.onboarding_step
      : (missing ?? "review");

    if (completed && !user.onboarding_completed) {
      await prisma.usuario.update({
        where: { id: userId },
        data: { onboarding_completed: true },
      });
    }

    return NextResponse.json({ step, completed }, { status: 200 });
  } catch (e) {
    console.error("/api/auth/onboarding/status GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
