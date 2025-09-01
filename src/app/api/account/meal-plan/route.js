import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";

function getCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

// Estimación heurística por nombre cuando no hay datos en la BD
// Valores aproximados por 100g
const HEUR = {
  protein: { kcal: 165, p: 31, g: 3.6, c: 0 }, // pechuga pollo
  egg: { kcal: 155, p: 13, g: 11, c: 1.1 },
  fish: { kcal: 120, p: 20, g: 4, c: 0 },
  carb_rice_cooked: { kcal: 130, p: 2.7, g: 0.3, c: 28 },
  carb_quinoa_cooked: { kcal: 120, p: 4.4, g: 1.9, c: 21.3 },
  carb_bread_whole: { kcal: 247, p: 13, g: 4.2, c: 41 },
  potato: { kcal: 87, p: 2, g: 0.1, c: 20 },
  oil_olive: { kcal: 884, p: 0, g: 100, c: 0 },
  nuts: { kcal: 600, p: 20, g: 50, c: 20 },
  veg: { kcal: 30, p: 2, g: 0.2, c: 5 },
  fruit_banana: { kcal: 89, p: 1.1, g: 0.3, c: 23 },
  yogurt_greek: { kcal: 97, p: 9, g: 5, c: 3.9 },
  cheese: { kcal: 350, p: 25, g: 27, c: 2 },
  beef: { kcal: 250, p: 26, g: 17, c: 0 },
};

function estimateMacrosFromNames(porciones, alimentosList) {
  let kcal = 0, p = 0, g = 0, c = 0;
  for (const ra of alimentosList) {
    const gramos = ra.gramos || 0;
    const factor = gramos / 100;
    const name = (ra.alimento?.nombre || "").toLowerCase();
    const pick = () => {
      if (/aceite.*oliva|olive/.test(name)) return HEUR.oil_olive;
      if (/pistacho|nuez|almendra|mani|maní|avellana|semilla|cacahuate/.test(name)) return HEUR.nuts;
      if (/quinoa/.test(name)) return HEUR.carb_quinoa_cooked;
      if (/(arroz|rice)/.test(name)) return HEUR.carb_rice_cooked;
      if (/pan.*integral|whole.*bread/.test(name)) return HEUR.carb_bread_whole;
      if (/papa|patata/.test(name)) return HEUR.potato;
      if (/banana|platan|plátano/.test(name)) return HEUR.fruit_banana;
      if (/yogur|yogurt/.test(name)) return HEUR.yogurt_greek;
      if (/queso|cheese/.test(name)) return HEUR.cheese;
      if (/marisco|pescado|atun|atún|salmon|salm[oó]n|tilapia|merluza/.test(name)) return HEUR.fish;
      if (/huevo/.test(name)) return HEUR.egg;
      if (/pollo|pavo|pechuga/.test(name)) return HEUR.protein;
      if (/carne|res|ternera|vacuno|lomo/.test(name)) return HEUR.beef;
      if (/pepino|calabac[ií]n|piment[oó]n|repollo|lechuga|espinaca|tomate|verdura|ensalada|br[oó]coli|zanahoria|cebolla/.test(name)) return HEUR.veg;
      return null;
    };
    const base = pick();
    if (!base) continue;
    kcal += base.kcal * factor;
    p += base.p * factor;
    g += base.g * factor;
    c += base.c * factor;
  }
  return {
    kcal: Math.round(kcal * (porciones || 1)),
    proteinas: Number((p * (porciones || 1)).toFixed(1)),
    grasas: Number((g * (porciones || 1)).toFixed(1)),
    carbohidratos: Number((c * (porciones || 1)).toFixed(1)),
  };
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

function computeMacrosFromList(porciones, alimentosList) {
  // alimentosList: [{ gramos, alimento: {calorias, proteinas, grasas, carbohidratos}}]
  let kcal = 0, p = 0, g = 0, c = 0;
  for (const ra of alimentosList) {
    const gramos = ra.gramos || 0;
    const factor = gramos / 100;
    const alim = ra.alimento;
    if (!alim) continue;
    kcal += (alim.calorias || 0) * factor;
    p += (alim.proteinas || 0) * factor;
    g += (alim.grasas || 0) * factor;
    c += (alim.carbohidratos || 0) * factor;
  }
  return {
    kcal: Math.round(kcal * (porciones || 1)),
    proteinas: Number((p * (porciones || 1)).toFixed(1)),
    grasas: Number((g * (porciones || 1)).toFixed(1)),
    carbohidratos: Number((c * (porciones || 1)).toFixed(1)),
  };
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const plan = await prisma.planComida.findMany({
      where: { usuarioId: userId },
      include: {
        receta: { include: { alimentos: { include: { alimento: true } } } },
      },
      orderBy: { comida_tipo: "asc" },
    });

    const items = [];
    for (const p of plan) {
      // aplicar overrides
      const overrides = (p.overrides && typeof p.overrides === "object") ? p.overrides : null;
      const baseList = [...p.receta.alimentos];
      const presentIds = new Set(baseList.map((ra) => ra.alimentoId));
      // ajustar gramos existentes
      let effectiveList = baseList.map((ra) => ({ ...ra, gramos: overrides && overrides[ra.alimentoId]?.grams != null ? overrides[ra.alimentoId].grams : (overrides && typeof overrides[ra.alimentoId] === 'number' ? overrides[ra.alimentoId] : ra.gramos) }));
      // añadir nuevos de overrides que no están
      if (overrides) {
        const extraIds = Object.keys(overrides).map(Number).filter((id) => !presentIds.has(id) && ((overrides[id]?.grams ?? overrides[id]) > 0));
        if (extraIds.length) {
          const extras = await prisma.alimento.findMany({ where: { id: { in: extraIds } } });
          for (const ex of extras) {
            const grams = overrides[ex.id]?.grams ?? overrides[ex.id];
            effectiveList.push({ alimentoId: ex.id, gramos: grams, alimento: ex });
          }
        }
      }

      let macros = computeMacrosFromList(p.porciones || 1, effectiveList);
      // Fallback 1: usar overrides si existen y no son cero
      const zero = (m) => !m || ((m.kcal || 0) === 0 && (m.proteinas || 0) === 0 && (m.grasas || 0) === 0 && (m.carbohidratos || 0) === 0);
      if (zero(macros) && p.overrides && typeof p.overrides === 'object' && p.overrides.macros && !zero(p.overrides.macros)) {
        macros = p.overrides.macros;
      }
      // Fallback 2: estimación heurística por nombre
      if (zero(macros)) {
        const est = estimateMacrosFromNames(p.porciones || 1, effectiveList);
        if (!zero(est)) macros = est;
      }
      items.push({
        id: p.id,
        tipo: p.comida_tipo,
        porciones: p.porciones,
        overrides: p.overrides || null,
        receta: {
          id: p.receta.id,
          nombre: p.receta.nombre,
          porciones: p.receta.porciones,
          tipo: p.receta.tipo,
          alimentos: effectiveList.map((ra) => ({ id: ra.alimentoId, nombre: ra.alimento?.nombre || "", gramos: ra.gramos })),
          macros,
        },
      });
    }

    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const tipo = body?.tipo; // ComidaTipo
    const recetaId = Number(body?.recetaId);
    const porciones = Number(body?.porciones) || 1;
    const overrides = body?.overrides && typeof body.overrides === "object" ? body.overrides : null;

    if (!tipo || !recetaId) {
      return NextResponse.json({ error: "tipo y recetaId son requeridos" }, { status: 400 });
    }

    const up = await prisma.planComida.upsert({
      where: { usuarioId_comida_tipo: { usuarioId, comida_tipo: tipo } },
      update: { recetaId, porciones, overrides },
      create: { usuarioId, comida_tipo: tipo, recetaId, porciones, overrides },
      include: { receta: { include: { alimentos: { include: { alimento: true } } } } },
    });

    // recomputar con overrides aplicados
    const presentIds = new Set(up.receta.alimentos.map((ra) => ra.alimentoId));
    let effectiveList = up.receta.alimentos.map((ra) => ({ ...ra, gramos: overrides && overrides[ra.alimentoId]?.grams != null ? overrides[ra.alimentoId].grams : (overrides && typeof overrides[ra.alimentoId] === 'number' ? overrides[ra.alimentoId] : ra.gramos) }));
    if (overrides) {
      const extraIds = Object.keys(overrides).map(Number).filter((id) => !presentIds.has(id) && ((overrides[id]?.grams ?? overrides[id]) > 0));
      if (extraIds.length) {
        const extras = await prisma.alimento.findMany({ where: { id: { in: extraIds } } });
        for (const ex of extras) {
          const grams = overrides[ex.id]?.grams ?? overrides[ex.id];
          effectiveList.push({ alimentoId: ex.id, gramos: grams, alimento: ex });
        }
      }
    }
    let macros = computeMacrosFromList(up.porciones || 1, effectiveList);
    const zero = (m) => !m || ((m.kcal || 0) === 0 && (m.proteinas || 0) === 0 && (m.grasas || 0) === 0 && (m.carbohidratos || 0) === 0);
    if (zero(macros) && up.overrides && typeof up.overrides === 'object' && up.overrides.macros) {
      macros = up.overrides.macros;
    }

    return NextResponse.json({
      item: {
        id: up.id,
        tipo: up.comida_tipo,
        porciones: up.porciones,
        overrides: up.overrides || null,
        receta: {
          id: up.receta.id,
          nombre: up.receta.nombre,
          porciones: up.receta.porciones,
          tipo: up.receta.tipo,
          alimentos: effectiveList.map((ra) => ({ id: ra.alimentoId, nombre: ra.alimento?.nombre || "", gramos: ra.gramos })),
          macros,
        },
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
