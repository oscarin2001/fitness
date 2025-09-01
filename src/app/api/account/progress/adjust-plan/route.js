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
    if (!token) return null;
    const payload = jwt.verify(token, process.env.AUTH_SECRET);
    return payload?.userId || payload?.sub || null;
  } catch {
    return null;
  }
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

export async function POST(request) {
  try {
    const userIdRaw = await getUserIdFromRequest(request);
    const userId = Number(userIdRaw);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const user = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const windowDays = body.windowDays && Number(body.windowDays) >= 7 ? Number(body.windowDays) : 14;

    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - windowDays + 1);

    const items = await prisma.progresoCorporal.findMany({
      where: { usuarioId: userId, fecha: { gte: start, lte: end } },
      orderBy: { fecha: "asc" },
    });

    // Slope de peso por semana
    const series = items.filter(i => i.peso_kg != null).map((i, idx) => ({ x: idx, y: i.peso_kg }));
    let slopePerWeek = 0;
    if (series.length >= 2) {
      let n = series.length, sumX=0,sumY=0,sumXY=0,sumX2=0;
      for (const p of series) { sumX+=p.x; sumY+=p.y; sumXY+=p.x*p.y; sumX2+=p.x*p.x; }
      const denom = n*sumX2 - sumX*sumX;
      const slopePerIdx = denom === 0 ? 0 : (n*sumXY - sumX*sumY)/denom;
      slopePerWeek = slopePerIdx * 7; // asumiendo muestreo diario
    }

    // Determinar objetivo y velocidad
    const objetivo = user.objetivo; // Bajar_grasa | Ganar_musculo | Mantenimiento
    const velocidad = user.velocidad_cambio; // Rapido | Moderado | Lento

    // Definir target slope por semana (% del peso actual). Usar último peso conocido o user.peso_kg
    const lastWeight = series.length ? series[series.length-1].y : (user.peso_kg || null);
    // Valores en porcentaje por semana
    const targets = {
      Bajar_grasa: { Rapido: -0.009, Moderado: -0.006, Lento: -0.003 },
      Ganar_musculo: { Rapido: 0.005, Moderado: 0.0025, Lento: 0.00125 },
      Mantenimiento: { Rapido: 0.0, Moderado: 0.0, Lento: 0.0 },
    };
    const targetPct = (targets[objetivo] && targets[objetivo][velocidad]) ?? 0.0;
    const targetSlopeKgPerWeek = lastWeight ? targetPct * lastWeight : 0;

    // Heurística de ajuste kcal
    const currentKcal = user.kcal_objetivo ?? null;
    if (!currentKcal) {
      return NextResponse.json({ error: "kcal_objetivo no definido para el usuario" }, { status: 400 });
    }

    let delta = 0;
    const diff = slopePerWeek - targetSlopeKgPerWeek; // positivo: sube más de lo esperado
    // Si objetivo es bajar, queremos slope negativo. Si diff > 0, bajar kcal. Si muy negativo, subir un poco.
    // Si objetivo es ganar, queremos slope positivo. Si diff < 0, subir kcal.
    const step = 125; // ajuste base por iteración
    if (objetivo === "Bajar_grasa") {
      if (diff > 0.05) delta = -step; // no baja suficiente o está subiendo
      else if (diff < -0.15) delta = +step; // baja demasiado rápido
    } else if (objetivo === "Ganar_musculo") {
      if (diff < -0.05) delta = +step; // no sube suficiente
      else if (diff > 0.15) delta = -step; // sube demasiado rápido
    } else {
      if (Math.abs(diff) > 0.1) delta = diff > 0 ? -75 : +75; // mantener
    }

    // Limitar cambio por operación
    delta = clamp(delta, -300, 300);
    const newKcal = clamp(Math.round(currentKcal + delta), 1200, 5000);

    // Recalcular macros con reglas por kg
    const pesoRef = lastWeight || 70;
    const proteinas_g = Math.round(pesoRef * 2.0); // 2.0 g/kg
    const grasas_g = Math.round(pesoRef * 0.8); // 0.8 g/kg
    const kcalProte = proteinas_g * 4;
    const kcalGrasas = grasas_g * 9;
    const kcalCarbs = Math.max(0, newKcal - kcalProte - kcalGrasas);
    const carbs_g = Math.round(kcalCarbs / 4);

    const updated = await prisma.usuario.update({
      where: { id: userId },
      data: {
        kcal_objetivo: newKcal,
        proteinas_g_obj: proteinas_g,
        grasas_g_obj: grasas_g,
        carbohidratos_g_obj: carbs_g,
      },
    });

    return NextResponse.json({
      ok: true,
      prev: { kcal_objetivo: currentKcal },
      next: {
        kcal_objetivo: updated.kcal_objetivo,
        proteinas_g_obj: updated.proteinas_g_obj,
        grasas_g_obj: updated.grasas_g_obj,
        carbohidratos_g_obj: updated.carbohidratos_g_obj,
      },
      trend: { slope_kg_per_week: Number(slopePerWeek.toFixed(3)), target_kg_per_week: Number(targetSlopeKgPerWeek.toFixed(3)) },
    });
  } catch (e) {
    console.error("/api/account/progress/adjust-plan POST error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
