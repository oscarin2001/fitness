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
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // Alimentos permitidos del usuario
    const rows = await prisma.usuarioAlimento.findMany({ where: { usuarioId: userId }, select: { alimentoId: true } });
    const allowedIds = rows.map((r) => r.alimentoId);
    if (!allowedIds.length) return NextResponse.json({ error: "No hay alimentos guardados en tu perfil" }, { status: 400 });
    const setAllowed = new Set(allowedIds);

    const MEALS = ["Desayuno", "Almuerzo", "Cena", "Snack"];
    const results = [];

    for (const tipo of MEALS) {
      // Buscar recetas candidatas por tipo
      const recetas = await prisma.receta.findMany({
        where: { tipo, alimentos: { some: { alimentoId: { in: allowedIds } } } },
        include: { alimentos: { include: { alimento: true } } },
        orderBy: { nombre: "asc" },
      });
      // Filtrado estricto -> fallback a parcial
      let candidates = recetas.filter((r) => r.alimentos.every((ra) => setAllowed.has(ra.alimentoId)));
      if (candidates.length === 0) candidates = recetas.filter((r) => r.alimentos.some((ra) => setAllowed.has(ra.alimentoId)));
      if (candidates.length === 0) continue;

      // Score: más coincidencias, luego menos kcal
      const scored = candidates.map((r) => {
        const matchCount = r.alimentos.reduce((acc, ra) => acc + (setAllowed.has(ra.alimentoId) ? 1 : 0), 0);
        let kcal = 0;
        for (const ra of r.alimentos) {
          const factor = (ra.gramos || 0) / 100;
          const alim = ra.alimento;
          if (!alim) continue;
          kcal += (alim.calorias || 0) * factor;
        }
        return { receta: r, matchCount, kcal: Math.round(kcal) };
      });
      scored.sort((a, b) => (b.matchCount - a.matchCount) || (a.kcal - b.kcal));
      const best = scored[0].receta;

      // Upsert PlanComida para ese tipo
      const up = await prisma.planComida.upsert({
        where: { usuarioId_comida_tipo: { usuarioId: userId, comida_tipo: tipo } },
        update: { recetaId: best.id, porciones: 1, overrides: null },
        create: { usuarioId: userId, comida_tipo: tipo, recetaId: best.id, porciones: 1, overrides: null },
        include: { receta: { include: { alimentos: { include: { alimento: true } } } } },
      });

      results.push({ tipo, planId: up.id, recetaId: up.recetaId, recetaNombre: up.receta.nombre });
    }

    if (!results.length) return NextResponse.json({ error: "No se encontraron recetas compatibles con tus alimentos" }, { status: 404 });
    return NextResponse.json({ ok: true, items: results });
  } catch (e) {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
