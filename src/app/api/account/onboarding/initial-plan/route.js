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

// Normaliza strings de tipo de comida a valores del enum Prisma: Desayuno, Almuerzo, Cena, Snack
function normalizeTipoComida(raw) {
  if (!raw) return null;
  const s0 = String(raw).trim();
  const s = s0.toLowerCase();
  // exact
  const exact = new Map([
    ["desayuno", "Desayuno"],
    ["breakfast", "Desayuno"],
    ["almuerzo", "Almuerzo"],
    ["comida", "Almuerzo"],
    ["lunch", "Almuerzo"],
    ["cena", "Cena"],
    ["dinner", "Cena"],
    ["snack", "Snack"],
    ["merienda", "Snack"],
  ]);
  if (exact.has(s)) return exact.get(s);
  // contains-based
  if (/desayuno|breakfast|mañana|morning/.test(s)) return "Desayuno";
  if (/almuerzo|comida|lunch|mediod[ií]a|medio dia/.test(s)) return "Almuerzo";
  if (/cena|dinner|noche|night/.test(s)) return "Cena";
  if (/snack|merienda|colaci[oó]n|tentempi[eé]|snacks?/.test(s)) return "Snack";
  return null;
}

// Compute macros for a list of { alimentoId, gramos }
async function computeMacros(ings) {
  if (!ings || ings.length === 0) return { kcal: 0, proteinas: 0, grasas: 0, carbohidratos: 0 };
  const ids = ings.map((x) => x.alimentoId);
  const rows = await prisma.alimento.findMany({ where: { id: { in: ids } } });
  const map = new Map(rows.map((a) => [a.id, a]));
  let kcal = 0, p = 0, g = 0, c = 0;
  for (const it of ings) {
    const a = map.get(it.alimentoId);
    if (!a) continue;
    const factor = (Number(it.gramos) || 0) / 100;
    kcal += (a.calorias || 0) * factor;
    p += (a.proteinas || 0) * factor;
    g += (a.grasas || 0) * factor;
    c += (a.carbohidratos || 0) * factor;
  }
  let result = {
    kcal: Math.round(kcal),
    proteinas: Number(p.toFixed(1)),
    grasas: Number(g.toFixed(1)),
    carbohidratos: Number(c.toFixed(1)),
  };
  // Heurística si quedó en 0: estimar por nombre
  const zero = (m) => !m || ((m.kcal || 0) === 0 && (m.proteinas || 0) === 0 && (m.grasas || 0) === 0 && (m.carbohidratos || 0) === 0);
  if (zero(result)) {
    const HEUR = {
      protein: { kcal: 165, p: 31, g: 3.6, c: 0 },
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
    let ekcal = 0, ep = 0, eg = 0, ec = 0;
    for (const it of ings) {
      const a = map.get(it.alimentoId);
      if (!a) continue;
      const name = (a.nombre || '').toLowerCase();
      const grams = (Number(it.gramos) || 0) / 100;
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
      ekcal += base.kcal * grams;
      ep += base.p * grams;
      eg += base.g * grams;
      ec += base.c * grams;
    }
    result = {
      kcal: Math.round(ekcal),
      proteinas: Number(ep.toFixed(1)),
      grasas: Number(eg.toFixed(1)),
      carbohidratos: Number(ec.toFixed(1)),
    };
  }
  return result;
}

// Ensure ingredient entries are normalized to { alimentoId, gramos }.
// Accept { alimentoId } or { nombre }. Prefer user's saved Alimentos by name.
async function normalizeIngredients(items, userId) {
  const out = [];
  const names = [];
  for (const it of items || []) {
    // Permitir strings como ingredientes (nombre plano)
    const entry = typeof it === 'string' ? { nombre: it, gramos: 0 } : it || {};
    // Clamp grams to a reasonable range [10g, 800g]
    let gramos = Number(entry.gramos ?? entry.grams ?? entry.g ?? entry.cantidad_gramos ?? entry.cant_gramos);
    if (!Number.isFinite(gramos)) gramos = 0;
    if (gramos > 0) gramos = Math.min(800, Math.max(10, gramos));
    if (entry.alimentoId) {
      out.push({ alimentoId: Number(entry.alimentoId), gramos });
    } else if (entry.nombre || entry.name) {
      names.push({ nombre: String(entry.nombre || entry.name).trim(), gramos });
    }
  }
  if (names.length) {
    // find or create alimentos by name
    for (const n of names) {
      if (!n.nombre) continue;
      // 1) Prefer a user's saved ingredient with exact name
      let ali = null;
      let userAli = await prisma.usuarioAlimento.findFirst({
        where: { usuarioId: userId, alimento: { nombre: n.nombre } },
        include: { alimento: true },
      });
      if (!userAli) {
        const candUA = await prisma.usuarioAlimento.findFirst({
          where: { usuarioId: userId, alimento: { nombre: { contains: n.nombre } } },
          include: { alimento: true },
        });
        if (candUA?.alimento && (candUA.alimento.nombre || "").toLowerCase() === n.nombre.toLowerCase()) userAli = candUA;
      }
      if (userAli?.alimento) ali = userAli.alimento;
      // 2) Otherwise, any Alimento with that name
      if (!ali) {
        ali = await prisma.alimento.findFirst({ where: { nombre: n.nombre } });
        if (!ali) {
          const candA = await prisma.alimento.findFirst({ where: { nombre: { contains: n.nombre } } });
          if (candA && (candA.nombre || "").toLowerCase() === n.nombre.toLowerCase()) ali = candA;
        }
      }
      // 3) Otherwise, create a basic Alimento record
      if (!ali) {
        ali = await prisma.alimento.create({ data: { nombre: n.nombre } });
      }
      // Default grams if missing/zero, heuristics by category/name
      let g = n.gramos;
      if (!(g > 0)) {
        const cat = (ali.categoria || '').toLowerCase();
        const name = (ali.nombre || '').toLowerCase();
        const isProt = cat.includes('prote') || /huevo|pollo|carne|pavo|atun|queso|yogur|lomo/.test(name);
        const isCarb = cat.includes('carbo') || /arroz|papa|patata|pan|pasta|avena|quinoa|cereal/.test(name);
        const isFat  = cat.includes('grasa') || /aceite|nuez|man[ií]|almendra|aguacate|avellana|semilla|mantequilla/.test(name);
        const isFiber = cat.includes('fibra') || /brocol[ií]|lechuga|espinaca|zanahoria|berenjena|tomate|verdura|ensalada/.test(name);
        const isFruit = /banana|pl[aá]tano|fresa|frutilla|manzana|pera|uva|naranja|fruta/.test(name);
        if (isProt) g = 120; else if (isCarb) g = 120; else if (isFat) g = 15; else if (isFiber) g = 100; else if (isFruit) g = 100; else g = 80;
      }
      out.push({ alimentoId: ali.id, gramos: Math.min(800, Math.max(10, g)) });
    }
  }
  return out;
}

// Body format:
// {
//   items: [
//     {
//       tipo: "Desayuno" | "Almuerzo" | "Cena" | "Snack",
//       nombre: string,
//       porciones?: number,
//       ingredientes: Array<{ alimentoId?: number; nombre?: string; gramos: number }>,
//       macros?: { kcal: number; proteinas: number; grasas: number; carbohidratos: number }
//     }, ...
//   ]
// }
export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Sin items" }, { status: 400 });
    }

    const results = [];

    for (const r of items) {
      // admitir claves alternativas para tipo
      const tipoRaw = r?.tipo ?? r?.meal ?? r?.comida ?? r?.tiempo ?? r?.categoria;
      const tipo = normalizeTipoComida(tipoRaw);
      const nombre = String(r?.nombre || "").trim() || `${tipo || "Comida"} inicial`;
      const porciones = Number(r?.porciones) > 0 ? Math.floor(r.porciones) : 1;
      if (!tipo) continue;

      // admitir claves alternativas para lista de ingredientes
      const ingList = Array.isArray(r.ingredientes)
        ? r.ingredientes
        : (Array.isArray(r.alimentos)
            ? r.alimentos
            : (Array.isArray(r.ingredients) ? r.ingredients : []));
      const normIngs = await normalizeIngredients(ingList, userId);
      if (normIngs.length === 0) continue;

      // Create recipe with ingredients
      const receta = await prisma.receta.create({ data: { nombre, tipo, porciones } });
      await prisma.recetaAlimento.createMany({
        data: normIngs.map((x) => ({ recetaId: receta.id, alimentoId: x.alimentoId, gramos: x.gramos })),
      });

      // Compute macros
      const macros = r.macros || await computeMacros(normIngs);

      // Upsert plan for this meal type
      const plan = await prisma.planComida.upsert({
        where: { usuarioId_comida_tipo: { usuarioId: userId, comida_tipo: tipo } },
        update: { recetaId: receta.id, porciones, overrides: { macros, source: "onboarding" } },
        create: { usuarioId: userId, comida_tipo: tipo, recetaId: receta.id, porciones, overrides: { macros, source: "onboarding" } },
      });

      results.push({ tipo, recetaId: receta.id, planId: plan.id, macros });
    }

    return NextResponse.json({ ok: true, items: results });
  } catch (e) {
    console.error("/api/account/onboarding/initial-plan error", e);
    const msg = process.env.NODE_ENV !== 'production' && e && (e.message || e.code) ? `${e.message || e.code}` : "No se pudo guardar el plan inicial";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

