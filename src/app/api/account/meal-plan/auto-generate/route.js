import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUserId } from "@/lib/auth/resolveUserId";

export async function POST(request) {
  try {
  const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // Alimentos permitidos del usuario
    const rows = await prisma.usuarioAlimento.findMany({ where: { usuarioId: userId }, select: { alimentoId: true } });
    const allowedIds = rows.map((r) => r.alimentoId);
    if (!allowedIds.length) return NextResponse.json({ error: "No hay alimentos guardados en tu perfil" }, { status: 400 });
    const setAllowed = new Set(allowedIds);

    // Preferencias de comidas habilitadas desde el body o desde el perfil del usuario
    let enabledMeals = null;
    let body = null;
    try {
      body = await request.json();
    } catch {}
    const emBody = body?.enabledMeals;
    if (emBody && typeof emBody === "object") {
      enabledMeals = emBody;
    } else {
      try {
        const u = await prisma.usuario.findUnique({ where: { id: userId }, select: { preferencias_alimentos: true } });
        const prefs = u?.preferencias_alimentos || null;
        const em = prefs && typeof prefs === "object" ? prefs.enabledMeals : null;
        if (em && typeof em === "object") enabledMeals = em;
      } catch {}
    }

    // Construir lista de comidas a generar respetando preferencias
    // Orden sugerido: Desayuno, Snack_manana, Almuerzo, Snack_tarde, Cena
    // Construcción segura: solo valores permitidos por el enum Prisma (Desayuno, Almuerzo, Cena, Snack)
    // Unificamos cualquier variante de snack (mañana/tarde) en un único 'Snack' porque el modelo PlanComida
    // solo soporta una fila por comida_tipo (unique(usuarioId, comida_tipo)).
    let MEALS = [];
    if (enabledMeals) {
      const desayuno = enabledMeals.desayuno ? ["Desayuno"] : [];
      const almuerzo = enabledMeals.almuerzo ? ["Almuerzo"] : [];
      const cena = enabledMeals.cena ? ["Cena"] : [];
      const anySnack = enabledMeals.snack || enabledMeals.snack_manana || enabledMeals["snack_mañana"] || enabledMeals.snack_tarde;
      const snack = anySnack ? ["Snack"] : [];
      MEALS = [...desayuno, ...almuerzo, ...cena, ...snack];
      if (!MEALS.length) MEALS = ["Desayuno", "Almuerzo", "Cena", "Snack"]; // fallback
    } else {
      MEALS = ["Desayuno", "Almuerzo", "Cena", "Snack"];
    }

    const results = [];
    // Leer horas preferidas del usuario (si existen)
    let mealHours = null;
    try {
      const u = await prisma.usuario.findUnique({ where: { id: userId }, select: { preferencias_alimentos: true } });
      const prefs = u?.preferencias_alimentos || null;
      const mh = prefs && typeof prefs === "object" ? prefs.mealHours : null;
      if (mh && typeof mh === "object") mealHours = mh;
    } catch {}

    for (const tipo of MEALS) {
      // Para Snack usamos directamente el enum 'Snack'
      const tipoQuery = String(tipo); // siempre uno de los válidos ahora
      const recetas = await prisma.receta.findMany({
        where: { tipo: tipoQuery, alimentos: { some: { alimentoId: { in: allowedIds } } } },
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

      // Upsert PlanComida para ese tipo (soporta variantes como Snack_manana / Snack_tarde)
      // Definir overrides inicial, respetando hora preferida si existe
      const baseOverrides = (mealHours && mealHours[String(tipo)] && /^\d{2}:\d{2}$/.test(mealHours[String(tipo)]))
        ? { hora: mealHours[String(tipo)] }
        : null;

      const up = await prisma.planComida.upsert({
        where: { usuarioId_comida_tipo: { usuarioId: userId, comida_tipo: tipoQuery } },
        update: { recetaId: best.id, porciones: 1, overrides: baseOverrides },
        create: { usuarioId: userId, comida_tipo: tipoQuery, recetaId: best.id, porciones: 1, overrides: baseOverrides },
        include: { receta: { include: { alimentos: { include: { alimento: true } } } } },
      });

      results.push({ tipo, planId: up.id, recetaId: up.recetaId, recetaNombre: up.receta.nombre });
    }

    if (!results.length) return NextResponse.json({ error: "No se encontraron recetas compatibles con tus alimentos" }, { status: 404 });
    return NextResponse.json({ ok: true, items: results });
  } catch (e) {
    console.error("[meal-plan][auto-generate] error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
