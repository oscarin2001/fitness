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
  "advice",
  "meals-terms",
];

function firstMissingStep(user) {
  // Determine required fields for advice and afterwards
  const required = {
    sex: !!user?.sexo,
    metrics: user?.altura_cm != null && user?.peso_kg != null,
    birthdate: !!user?.fecha_nacimiento,
    activity: !!user?.nivel_actividad,
    country: !!user?.pais,
    objective: !!user?.objetivo,
    "target-weight": user?.peso_objetivo_kg != null,
    speed: !!user?.velocidad_cambio,
    advice: true, // advice itself is not a persisted field; it's a step gate
    "meals-terms": !!user?.terminos_aceptados,
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
      : (missing ?? "meals-terms");

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
