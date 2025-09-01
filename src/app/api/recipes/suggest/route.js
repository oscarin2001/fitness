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
    const body = await request.json();
    const providedIds = Array.isArray(body.ingredientIds) ? body.ingredientIds.map(Number).filter(Boolean) : [];
    const mealType = body.mealType || null;

    // Identificar usuario y sus alimentos seleccionados (onboarding)
    const userId = await getUserIdFromRequest(request);
    let userIds = [];
    if (userId) {
      const rows = await prisma.usuarioAlimento.findMany({
        where: { usuarioId: userId },
        select: { alimentoId: true },
      });
      userIds = rows.map((r) => r.alimentoId);
    }

    // Conjunto permitido: por defecto, los del usuario; si viene una lista, intersectar con los del usuario (si existen), o usar la provista si no hay usuario
    let allowedIds = providedIds.length > 0 ? providedIds : userIds;
    if (providedIds.length > 0 && userIds.length > 0) {
      const set = new Set(userIds);
      allowedIds = providedIds.filter((id) => set.has(id));
    }

    if (!allowedIds || allowedIds.length === 0) {
      return NextResponse.json({ items: [], mealType, reason: "Sin alimentos del usuario ni selección manual" });
    }

    // Buscar recetas candidatas filtrando por tipo si corresponde
    const recetas = await prisma.receta.findMany({
      where: {
        ...(mealType ? { tipo: mealType } : {}),
        alimentos: { some: { alimentoId: { in: allowedIds } } },
      },
      include: { alimentos: { include: { alimento: true } } },
      orderBy: { nombre: "asc" },
    });

    // Filtrar recetas para que TODOS sus alimentos estén dentro de allowedIds
    const setAllowed = new Set(allowedIds);
    let filtered = recetas.filter((r) => r.alimentos.every((ra) => setAllowed.has(ra.alimentoId)));
    // Si no hay coincidencias estrictas, permitir parciales (al menos 1 coincide)
    if (filtered.length === 0) {
      filtered = recetas.filter((r) => r.alimentos.some((ra) => setAllowed.has(ra.alimentoId)));
    }

    // Calcular score y macros
    const scored = filtered.map((r) => {
      const matchCount = r.alimentos.reduce((acc, ra) => acc + (setAllowed.has(ra.alimentoId) ? 1 : 0), 0);
      let kcal = 0, p = 0, g = 0, c = 0;
      for (const ra of r.alimentos) {
        const gramos = ra.gramos || 0;
        const alim = ra.alimento;
        if (!alim) continue;
        const factor = gramos / 100;
        kcal += (alim.calorias || 0) * factor;
        p += (alim.proteinas || 0) * factor;
        g += (alim.grasas || 0) * factor;
        c += (alim.carbohidratos || 0) * factor;
      }
      return {
        id: r.id,
        nombre: r.nombre,
        porciones: r.porciones,
        matchCount,
        macros: {
          kcal: Math.round(kcal),
          proteinas: Number(p.toFixed(1)),
          grasas: Number(g.toFixed(1)),
          carbohidratos: Number(c.toFixed(1)),
        },
        alimentos: r.alimentos.map((ra) => ({ id: ra.alimentoId, nombre: ra.alimento?.nombre || "", gramos: ra.gramos })),
      };
    });

    // Ordenar: más coincidencias primero, luego menor kcal
    scored.sort((a, b) => (b.matchCount - a.matchCount) || (a.macros.kcal - b.macros.kcal));

    return NextResponse.json({ items: scored, mealType });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo sugerir recetas" }, { status: 500 });
  }
}
