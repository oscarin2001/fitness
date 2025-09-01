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

function kcalPerGram(alim) {
  return (alim?.calorias || 0) / 100; // kcal por gramo
}

export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const tipo = body?.tipo; // ComidaTipo
    const fromId = Number(body?.replaceFromId);
    const toId = Number(body?.replaceToId);

    if (!tipo || !fromId || !toId) {
      return NextResponse.json({ error: "tipo, replaceFromId y replaceToId son requeridos" }, { status: 400 });
    }

    // Validar que el ingrediente de reemplazo esté permitido por el usuario
    const allowed = await prisma.usuarioAlimento.findFirst({ where: { usuarioId: userId, alimentoId: toId } });
    if (!allowed) {
      return NextResponse.json({ error: "El ingrediente elegido no está en tus alimentos guardados" }, { status: 400 });
    }

    const plan = await prisma.planComida.findUnique({
      where: { usuarioId_comida_tipo: { usuarioId: userId, comida_tipo: tipo } },
      include: { receta: { include: { alimentos: { include: { alimento: true } } } } },
    });
    if (!plan) return NextResponse.json({ error: "No hay plan para ese tipo" }, { status: 404 });

    // construir lista efectiva con overrides actuales
    const currentOverrides = (plan.overrides && typeof plan.overrides === "object") ? plan.overrides : {};
    const presentIds = new Set(plan.receta.alimentos.map((ra) => ra.alimentoId));

    // gramos base del ingrediente a reemplazar
    let gramsFrom = null;
    for (const ra of plan.receta.alimentos) {
      if (ra.alimentoId === fromId) {
        gramsFrom = (currentOverrides[fromId]?.grams ?? currentOverrides[fromId]) ?? ra.gramos;
        break;
      }
    }
    if (gramsFrom == null) {
      return NextResponse.json({ error: "Ingrediente a reemplazar no está en la receta" }, { status: 400 });
    }

    const [fromAlim, toAlim] = await Promise.all([
      prisma.alimento.findUnique({ where: { id: fromId } }),
      prisma.alimento.findUnique({ where: { id: toId } }),
    ]);
    if (!toAlim) return NextResponse.json({ error: "Ingrediente de reemplazo no encontrado" }, { status: 400 });

    // Calcular gramos nuevos para mantener kcal similares
    const kcalGFrom = kcalPerGram(fromAlim);
    const kcalGTo = kcalPerGram(toAlim) || 0.01; // evitar div 0
    const targetKcal = gramsFrom * kcalGFrom;
    let newGrams = targetKcal / kcalGTo;
    // límites razonables
    newGrams = Math.max(0, Math.min(1000, Math.round(newGrams)));

    // aplicar overrides: poner 0g al fromId y sumar newGrams a toId (si ya existe, sobreescribe gramos; si no, añádelo)
    const overrides = { ...currentOverrides };
    overrides[fromId] = 0;
    overrides[toId] = newGrams;

    const updated = await prisma.planComida.update({
      where: { id: plan.id },
      data: { overrides },
      include: { receta: { include: { alimentos: { include: { alimento: true } } } } },
    });

    // Reutilizamos la lógica del otro handler para responder con macros recalculados
    // Construir lista efectiva
    const baseList = [...updated.receta.alimentos];
    const baseIds = new Set(baseList.map((ra) => ra.alimentoId));
    let effectiveList = baseList.map((ra) => ({ ...ra, gramos: overrides[ra.alimentoId]?.grams ?? overrides[ra.alimentoId] ?? ra.gramos }));
    const extraIds = Object.keys(overrides).map(Number).filter((id) => !baseIds.has(id) && ((overrides[id]?.grams ?? overrides[id]) > 0));
    if (extraIds.length) {
      const extras = await prisma.alimento.findMany({ where: { id: { in: extraIds } } });
      for (const ex of extras) {
        const grams = overrides[ex.id]?.grams ?? overrides[ex.id];
        effectiveList.push({ alimentoId: ex.id, gramos: grams, alimento: ex });
      }
    }

    // calcular macros
    let kcal = 0, p = 0, g = 0, c = 0;
    for (const ra of effectiveList) {
      const factor = (ra.gramos || 0) / 100;
      const alim = ra.alimento;
      if (!alim) continue;
      kcal += (alim.calorias || 0) * factor;
      p += (alim.proteinas || 0) * factor;
      g += (alim.grasas || 0) * factor;
      c += (alim.carbohidratos || 0) * factor;
    }
    const macros = {
      kcal: Math.round(kcal * (updated.porciones || 1)),
      proteinas: Number((p * (updated.porciones || 1)).toFixed(1)),
      grasas: Number((g * (updated.porciones || 1)).toFixed(1)),
      carbohidratos: Number((c * (updated.porciones || 1)).toFixed(1)),
    };

    return NextResponse.json({
      item: {
        id: updated.id,
        tipo: updated.comida_tipo,
        porciones: updated.porciones,
        overrides: updated.overrides || null,
        receta: {
          id: updated.receta.id,
          nombre: updated.receta.nombre,
          porciones: updated.receta.porciones,
          tipo: updated.receta.tipo,
          alimentos: effectiveList.map((ra) => ({ id: ra.alimentoId, nombre: ra.alimento?.nombre || "", gramos: ra.gramos })),
          macros,
        },
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
