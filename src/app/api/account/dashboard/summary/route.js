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

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    // Objetivos del usuario
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        kcal_objetivo: true,
        proteinas_g_obj: true,
        grasas_g_obj: true,
        carbohidratos_g_obj: true,
        agua_litros_obj: true,
      },
    });

    // Consumo de hoy
    const comidas = await prisma.comida.findMany({
      where: { usuarioId: userId, fecha: { gte: start, lte: end } },
      select: { calorias: true, proteinas: true, grasas: true, carbohidratos: true },
    });

    const totals = comidas.reduce(
      (acc, c) => ({
        calorias: acc.calorias + (c.calorias || 0),
        proteinas: acc.proteinas + (c.proteinas || 0),
        grasas: acc.grasas + (c.grasas || 0),
        carbohidratos: acc.carbohidratos + (c.carbohidratos || 0),
      }),
      { calorias: 0, proteinas: 0, grasas: 0, carbohidratos: 0 }
    );

    // Hidratación de hoy
    const todayHydration = await prisma.hidratacionDia.findFirst({
      where: { usuarioId: userId, fecha: { gte: start, lte: end } },
      select: { litros: true, completado: true },
    });

    const objetivos = {
      kcal: usuario?.kcal_objetivo ?? null,
      proteinas: usuario?.proteinas_g_obj ?? null,
      grasas: usuario?.grasas_g_obj ?? null,
      carbohidratos: usuario?.carbohidratos_g_obj ?? null,
      agua_litros: usuario?.agua_litros_obj ?? null,
    };

    const restantes = objetivos.kcal != null
      ? Math.max(0, objetivos.kcal - totals.calorias)
      : null;

    const macrosRestantes = {
      proteinas: objetivos.proteinas != null ? Math.max(0, objetivos.proteinas - totals.proteinas) : null,
      grasas: objetivos.grasas != null ? Math.max(0, objetivos.grasas - totals.grasas) : null,
      carbohidratos: objetivos.carbohidratos != null ? Math.max(0, objetivos.carbohidratos - totals.carbohidratos) : null,
    };

    return NextResponse.json({
      objetivos,
      consumidos: totals,
      kcal_restantes: restantes,
      macros_restantes: macrosRestantes,
      hidratacion: {
        hoy_litros: todayHydration?.litros ?? 0,
        objetivo_litros: objetivos.agua_litros ?? null,
        completado: todayHydration?.completado ?? false,
      },
    });
  } catch (e) {
    console.error("/api/account/dashboard/summary error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
