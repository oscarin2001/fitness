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

const WEEK_DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

function normalizeMeals(enabled) {
  // Mapea flags a tipos esperados por el sistema
  const out = [];
  if (enabled?.desayuno) out.push("Desayuno");
  if (enabled?.snack_manana || enabled?.["snack_mañana"]) out.push("Snack_manana");
  if (enabled?.almuerzo) out.push("Almuerzo");
  if (enabled?.snack_tarde) out.push("Snack_tarde");
  if (enabled?.cena) out.push("Cena");
  return out.length ? out : ["Desayuno", "Almuerzo", "Cena", "Snack"]; // fallback
}

export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    let daysSelected = Array.isArray(body.daysSelected) ? body.daysSelected : null;
    const mealsSelection = body.mealsSelection && typeof body.mealsSelection === "object" ? body.mealsSelection : null;

    // Leer enabledMeals del perfil como default
    let enabledMeals = mealsSelection;
    try {
      if (!enabledMeals) {
        const u = await prisma.usuario.findUnique({ where: { id: userId }, select: { preferencias_alimentos: true } });
        const prefs = u?.preferencias_alimentos || null;
        const em = prefs && typeof prefs === "object" ? prefs.enabledMeals : null;
        if (em && typeof em === "object") enabledMeals = em;
      }
    } catch {}

    const MEAL_TYPES = normalizeMeals(enabledMeals || {});

    // Leer perfil para objetivos y preferencias
    let user = null;
    try {
      user = await prisma.usuario.findUnique({ where: { id: userId } });
    } catch {}
    // Determinar días desde el perfil si no fueron provistos
    if (!daysSelected || daysSelected.length === 0) {
      const userDays = Array.isArray(user?.dias_dieta) ? user.dias_dieta.filter((d) => typeof d === 'string') : [];
      if (userDays.length >= 5) {
        daysSelected = userDays;
      }
    }
    // Validar días seleccionados (min 5) o usar todos los 7 por defecto
    if (!daysSelected || daysSelected.length < 5) {
      daysSelected = [...WEEK_DAYS];
    }
    const pesoKg = Number(user?.peso_kg) || null;
    const objetivo = user?.objetivo || null; // Bajar_grasa | Mantenimiento | Ganar_musculo
    const prefsPA = (user?.preferencias_alimentos && typeof user.preferencias_alimentos === 'object') ? user.preferencias_alimentos : {};
    let proteinRange = (prefsPA?.proteinRangeKg && typeof prefsPA.proteinRangeKg === 'object') ? prefsPA.proteinRangeKg : null;
    if (!proteinRange) {
      const byGoal = {
        Bajar_grasa: [1.2, 1.6],
        Mantenimiento: [1.6, 1.8],
        Ganar_musculo: [1.8, 2.0],
      };
      proteinRange = byGoal[objetivo] ? { min: byGoal[objetivo][0], max: byGoal[objetivo][1] } : { min: 1.6, max: 1.8 };
    }
    const proteinDailyTarget = Number(user?.proteinas_g_obj) || (pesoKg ? Math.round(((proteinRange.min + proteinRange.max) / 2) * pesoKg) : null);
    const objectiveLabel = objetivo === 'Bajar_grasa' ? 'Bajar de peso' : (objetivo === 'Ganar_musculo' ? 'Subir masa muscular' : (objetivo ? 'Mantener peso' : 'Objetivo'));

    // Alimentos permitidos del usuario
    const rows = await prisma.usuarioAlimento.findMany({ where: { usuarioId: userId }, select: { alimentoId: true } });
    const allowedIds = rows.map((r) => r.alimentoId);
    const setAllowed = new Set(allowedIds);

    // Función para obtener hasta N recetas ordenadas por score para un tipo
    function mapTipoToEnum(t) {
      const s = String(t || "");
      if (/^desayuno$/i.test(s)) return "Desayuno";
      if (/^almuerzo|comida$/i.test(s)) return "Almuerzo";
      if (/^cena$/i.test(s)) return "Cena";
      if (/^snack/i.test(s)) return "Snack";
      return null;
    }

    async function topNRecipesForType(tipo, N = 50) {
      const tipoEnum = mapTipoToEnum(tipo);
      const where = {};
      if (tipoEnum) {
        where.tipo = tipoEnum;
      }
      if (Array.isArray(allowedIds) && allowedIds.length > 0) {
        where.alimentos = { some: { alimentoId: { in: allowedIds } } };
      }
      const recetas = await prisma.receta.findMany({
        where,
        include: { alimentos: { include: { alimento: true } } },
        orderBy: { nombre: "asc" },
        take: Math.max(N, 50),
      });
      if (!recetas.length) return [];
      const scored = recetas.map((r) => {
        const matchCount = r.alimentos.reduce((acc, ra) => acc + (setAllowed.has(ra.alimentoId) ? 1 : 0), 0);
        let kcal = 0;
        for (const ra of r.alimentos) {
          const factor = (ra.gramos || 0) / 100;
          const alim = ra.alimento; if (!alim) continue;
          kcal += (alim.calorias || 0) * factor;
        }
        return { receta: r, score: matchCount * 1000 - kcal };
      });
      scored.sort((a, b) => b.score - a.score);
      const picked = [];
      const seen = new Set();
      for (const sc of scored) {
        if (picked.length >= N) break;
        if (seen.has(sc.receta.id)) continue;
        picked.push(sc.receta);
        seen.add(sc.receta.id);
      }
      return picked;
    }

    // Utilidades para barajado determinista basado en usuario y semana
    function seededRandom(seed) {
      let s = seed >>> 0;
      return function () {
        // xorshift32 simple
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
        return (s % 100000) / 100000;
      };
    }

    function hashStr(str) {
      let h = 2166136261 >>> 0; // FNV-1a base
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    function shuffleDeterministic(arr, seed) {
      const a = arr.slice();
      const rnd = seededRandom(seed);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // Calcular índice de semana para variar a través del tiempo (UTC)
    const now = new Date();
    const weekIdx = Math.floor((Date.UTC(now.getUTCFullYear(), 0, 1) - Date.UTC(1970,0,1)) / (7*24*3600*1000) + (now.getTime() - now.getTimezoneOffset()*60000) / (7*24*3600*1000));

    // Construir 3 propuestas base para compatibilidad (top3 por tipo)
    const proposals = [0,1,2].map(() => ({}));
    // También preparar picks por día (hasta 7 distintos) por tipo
    const perTypePicks = {};
    for (const tipo of MEAL_TYPES) {
      const pool = await topNRecipesForType(tipo, 50);
      const seed = hashStr(`${userId}|${tipo}|${weekIdx}`);
      const shuffled = shuffleDeterministic(pool, seed);
      const distinct = [];
      const seen = new Set();
      for (const r of shuffled) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        distinct.push(r);
        if (distinct.length >= 7) break;
      }
      // para proposals, tomar los primeros 3 del pool ordenado por score (o de distinct si no hay suficientes)
      const top3 = pool.slice(0, 3).length === 3 ? pool.slice(0,3) : distinct.slice(0,3);
      while (top3.length < 3) top3.push(...distinct);
      for (let i = 0; i < 3; i++) {
        proposals[i][tipo] = top3[i % top3.length];
      }
      perTypePicks[tipo] = distinct.length ? distinct : pool;
      // Log de depuración: cuántas recetas únicas por tipo
      try {
        console.debug(`[weekly-proposals] tipo=${tipo} pool=${pool.length} uniqueForWeek=${perTypePicks[tipo].length}`);
      } catch {}
    }

    // Rotación semanal: L-J -> var0, M-V -> var1, Mi-S -> var2, D -> var3 (distinto)
    const rotation = {
      "Lunes": 0,
      "Jueves": 0,
      "Martes": 1,
      "Viernes": 1,
      "Miércoles": 2,
      "Sábado": 2,
      "Domingo": 3,
    };

    // Heurísticas de medidas caseras por nombre
    function householdMeasure(name, grams) {
      const n = String(name || '').toLowerCase();
      const g = Number(grams) || 0;
      const approx = (val, base) => Math.abs(val - base) <= base * 0.25;
      if (/arroz/.test(n)) {
        // 1 taza ~ 180g cocido, 1/2 taza ~ 90g
        if (approx(g, 90)) return `1/2 taza de arroz cocido (${g} g)`;
        if (approx(g, 180)) return `1 taza de arroz cocido (${g} g)`;
      }
      if (/pollo|pechuga|filete/.test(n)) {
        // filete mediano ~120g
        if (approx(g, 120)) return `1 filete mediano de pollo (${g} g, tamaño palma)`;
      }
      if (/papa|patata/.test(n)) {
        if (approx(g, 150)) return `1 papa mediana (${g} g)`;
      }
      if (/frutos?\s*secos|almendra|nuez|man[ií]|pistacho|avellana/.test(n)) {
        if (approx(g, 30)) return `1 puñado de frutos secos (${g} g)`;
      }
      if (/huevo/.test(n)) {
        if (approx(g, 100)) return `2 huevos (${g} g)`;
      }
      if (/pan.*integral|pan/.test(n)) {
        if (approx(g, 40)) return `1 rebanada de pan integral (${g} g)`;
      }
      if (/yogur|yogurt/.test(n)) {
        if (approx(g, 200)) return `1 taza de yogur (${g} g)`;
      }
      if (/verdura|ensalada|br[oó]coli|espinaca|zanahoria|pepino|tomate|lechuga/.test(n)) {
        if (approx(g, 150)) return `1 taza de verduras (${g} g)`;
      }
      if (/avena/.test(n)) {
        if (approx(g, 30)) return `3 cucharadas de avena (${g} g)`;
      }
      if (/banana|pl[aá]tano|manzana/.test(n)) {
        if (approx(g, 120) || approx(g, 150)) return `1 pieza mediana (${g} g)`;
      }
      return `${name} (${g} g)`;
    }

    function buildItemsText(receta) {
      try {
        const items = (receta?.alimentos || []).map((ra) => householdMeasure(ra.alimento?.nombre || '', ra.gramos || 0));
        return items;
      } catch {
        return [];
      }
    }

    function proteinSplit(meals) {
      // pesos relativos
      const weights = { Desayuno: 0.25, Almuerzo: 0.35, Cena: 0.3, Snack_manana: 0.05, Snack_tarde: 0.05, Snack: 0.1 };
      const present = meals.slice();
      let totalW = 0;
      for (const t of present) totalW += (weights[t] || (1 / present.length));
      return present.map((t) => ({ tipo: t, share: (weights[t] || (1 / present.length)) / totalW }));
    }

    const weekly = WEEK_DAYS.map((day) => {
      const active = daysSelected.includes(day);
      if (!active) {
        // Día libre: no generar menú
        return { day, active, objectiveLabel, proteinDailyTarget, meals: [] };
      }
      // Seleccionar una receta distinta por tipo para este día usando índice de rotación
      const rotIdx = rotation[day] ?? 0;
      const split = proteinSplit(MEAL_TYPES);
      const meals = MEAL_TYPES.map((t) => {
        const picks = perTypePicks[t] || [];
        let receta = null;
        if (picks.length) {
          if (day === "Domingo" && picks.length >= 2) {
            // Intentar un menú distinto a los de rotIdx 0,1,2
            const avoid = new Set([0,1,2].map(i => picks[i % picks.length]?.id).filter(Boolean));
            receta = picks.find(r => r && !avoid.has(r.id)) || picks[rotIdx % picks.length];
          } else {
            receta = picks[rotIdx % picks.length];
          }
        }
        const targetProteinG = proteinDailyTarget ? Math.round(proteinDailyTarget * (split.find((x) => x.tipo === t)?.share || (1 / MEAL_TYPES.length))) : null;
        const itemsText = receta ? buildItemsText(receta) : [];
        return { tipo: t, receta: receta ? { id: receta.id, nombre: receta.nombre } : null, targetProteinG, itemsText };
      });
      return { day, active, objectiveLabel, proteinDailyTarget, meals };
    });

    return NextResponse.json({
      proposals: proposals.map((p, i) => ({ index: i, meals: Object.entries(p).map(([tipo, receta]) => ({ tipo, receta: receta ? { id: receta.id, nombre: receta.nombre } : null })) })),
      weekly,
      protein: { targetDailyG: proteinDailyTarget, rangeKg: proteinRange, objective: objetivo },
    });
  } catch (e) {
    console.error("/api/account/meal-plan/weekly-proposals error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
