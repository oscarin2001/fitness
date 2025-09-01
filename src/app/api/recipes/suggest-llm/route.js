import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

function getCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

// Expansión de sinónimos y equivalencias simples para freeText
function expandTokens(tokens) {
  const out = new Set();
  const add = (t) => { if (t && t.length >= 2) out.add(t); };
  for (const t0 of tokens) {
    const t = normalizeName(t0);
    add(t);
    if (t === "banana" || t === "banano") { add("platano"); add("platan"); }
    if (t === "platano" || t === "platan") { add("banana"); }
    if (t === "fresa" || t === "frutilla") { add("frutilla"); add("fresa"); }
    if (t === "naranja" || t === "mandarina") { add("naranj"); add("mandarin"); }
    if (t === "leche" || t === "milk") { add("leche"); add("milk"); }
    if (t === "yogur" || t === "yogurt" || t === "yoghurt") { add("yogur"); add("yogurt"); }
    if (t.includes("proteina") || t.includes("protein")) { add("proteina"); add("protein"); }
    if (t === "whey" || t === "wey") { add("whey"); add("suero"); }
    if (t === "huevo" || t === "huevos") { add("huevo"); }
  }
  return [...out];
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

function safeJsonFromText(text) {
  try {
    // remove code fences if present
    const m = text.match(/```(?:json)?\n([\s\S]*?)```/i);
    const raw = m ? m[1] : text;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Normaliza nombres para aumentar coincidencias (case/acento/puntuación simples)
function normalizeName(s) {
  try {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quitar acentos
      .replace(/[^a-z0-9\s]/g, "") // quitar signos
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const mealType = body.mealType || null; // "Desayuno" | "Almuerzo" | "Cena" | "Snack" | null
    const limit = Number(body.limit) > 0 ? Math.min(Number(body.limit), 10) : 6;
    const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds.filter((n) => Number.isFinite(Number(n))).map((n) => Number(n)) : [];
    const preference = typeof body.preference === "string" ? body.preference : null; // ej: "postre_batido"
    const freeText = typeof body.freeText === "string" ? body.freeText : "";

    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // Ingredientes permitidos del usuario (nombres + ids) o derivados de freeText
    const ua = await prisma.usuarioAlimento.findMany({
      where: { usuarioId: userId },
      include: { alimento: true },
    });
    let allowed = ua.filter((x) => !!x.alimento).map((x) => ({ id: x.alimentoId, nombre: x.alimento.nombre, categoria: x.alimento.categoria }));
    let matchedAllowed = null; // cuando viene freeText y hubo coincidencias

    // Si viene texto libre, buscar coincidencias en la base por tokens y sinónimos
    if (freeText && freeText.trim().length > 0) {
      const baseTokens = String(freeText)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9ñü]+/i)
        .filter((t) => t && t.length >= 3);
      const uniq = expandTokens(baseTokens);
      if (uniq.length > 0) {
        const found = await prisma.alimento.findMany({
          where: { OR: uniq.map((t) => ({ nombre: { contains: t, mode: "insensitive" } })) },
          select: { id: true, nombre: true, categoria: true },
          take: 25,
        });
        if (found.length > 0) {
          allowed = found;
          matchedAllowed = found;
        } else {
          // Fallback adicional: traer un conjunto y filtrar por normalización contiene
          const pool = await prisma.alimento.findMany({ select: { id: true, nombre: true, categoria: true }, take: 200 });
          const byNorm = pool.filter((a) => {
            const n = normalizeName(a.nombre);
            return uniq.some((t) => n.includes(t));
          });
          if (byNorm.length > 0) {
            allowed = byNorm;
            matchedAllowed = byNorm;
          }
        }
      }
    }
    // Si hay texto libre, NO recortar por selectedIds para no perder lo que pidió el usuario
    if (selectedIds.length && !freeText) {
      const setSel = new Set(selectedIds);
      allowed = allowed.filter((a) => setSel.has(a.id));
      // Si seleccionó pero ninguno pertenece a sus permitidos, caerá a un fallback global más abajo
    }

    // Si no hay permitidos
    let globalFallbackUsed = false;
    // Caso especial: vino freeText pero no reconocimos nada -> NO hacer fallback global ni inventar ingredientes
    if (freeText && (!matchedAllowed || matchedAllowed.length === 0)) {
      return NextResponse.json({ items: [], mealType, reason: "No se reconocieron ingredientes del texto" });
    }
    if (allowed.length === 0) {
      const some = await prisma.alimento.findMany({
        select: { id: true, nombre: true, categoria: true },
        take: 30,
      });
      allowed = some;
      globalFallbackUsed = true;
    }

    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const hasApiKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    const sys = `Eres un nutricionista asistente. Devuelve sugerencias de recetas SOLO usando los alimentos proporcionados. Devuelve JSON válido, sin explicaciones.`;
    const instruction = {
      objetivo: "Sugerir recetas compatibles",
      tipo: mealType,
      limite: limit,
      formato: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                tipo: { type: "string", enum: ["Desayuno", "Almuerzo", "Cena", "Snack"] },
                porciones: { type: "number" },
                macros: {
                  type: "object",
                  properties: {
                    kcal: { type: "number" },
                    proteinas: { type: "number" },
                    grasas: { type: "number" },
                    carbohidratos: { type: "number" },
                  },
                  required: ["kcal", "proteinas", "grasas", "carbohidratos"],
                },
                ingredientes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      nombre: { type: "string" }, // debe estar en la lista permitida
                      gramos: { type: "number" },
                    },
                    required: ["nombre", "gramos"],
                  },
                },
              },
              required: ["nombre", "tipo", "porciones", "ingredientes", "macros"],
            },
          },
        },
        required: ["items"],
      },
      restricciones: [
        "Usa solo nombres en la lista de alimentos permitidos",
        "Para cada ingrediente indica gramos, mínimo 10g",
        "Calcula y devuelve los macros TOTALES de la receta (kcal, proteinas, grasas, carbohidratos) en el objeto 'macros' usando los gramos indicados",
        "Si la preferencia es 'postre_batido': prioriza combinaciones lácteo + fruta (se puede incluir huevo) y el nombre DEBE comenzar con 'Batido de ' seguido de los ingredientes principales",
        "Devuelve EXACTAMENTE el JSON sin texto adicional",
      ],
      ...(freeText && matchedAllowed && matchedAllowed.length > 0
        ? { regla_texto_libre: "Cuando el usuario provee texto libre, usa EXCLUSIVAMENTE estos ingredientes reconocidos del texto. No agregues ingredientes que no estén en la lista." }
        : {}),
      ...(preference ? { preferencia: preference } : {}),
      alimentos_permitidos: (matchedAllowed && matchedAllowed.length > 0 ? matchedAllowed : allowed).map((a) => a.nombre),
    };

    let parsed = null;
    let reason = null;
    if (hasApiKey) {
      const { text } = await generateText({
        model: google(modelName),
        prompt: `${sys}\n\n${JSON.stringify(instruction, null, 2)}`,
        temperature: 0.6,
        maxTokens: 800,
      });
      parsed = safeJsonFromText(text);
      if (!parsed || !Array.isArray(parsed.items)) {
        reason = "La IA no devolvió JSON válido. Generando sugerencia básica.";
      }
    } else {
      reason = "Falta GOOGLE_GENERATIVE_AI_API_KEY. Generando sugerencia básica.";
    }

    // Si no hay respuesta válida del LLM, hacemos un fallback heurístico con los ingredientes permitidos
    if (!parsed || !Array.isArray(parsed.items)) {
      // Heurística: 1 receta combinando hasta 3-5 ingredientes variados
      const pick = (cat) => allowed.filter((a) => (a.categoria || '').toLowerCase().includes(cat))[0];
      const prot = pick('prote');
      const carb = pick('carbo') || pick('grano') || pick('arroz');
      const fat  = pick('grasa') || pick('aceite') || pick('nuez');
      const fiber = pick('fibra') || pick('verd');
      let chosen = [prot, carb, fat, fiber].filter(Boolean);
      // Si no encontramos por categorías, tomamos los primeros 3-4 permitidos
      if (chosen.length === 0) {
        chosen = allowed.slice(0, Math.min(4, allowed.length));
      }

      // Asignar gramos orientativos
      const gramsMap = new Map();
      if (prot) gramsMap.set(prot.id, 120);
      if (carb) gramsMap.set(carb.id, 120);
      if (fat) gramsMap.set(fat.id, 20);
      if (fiber) gramsMap.set(fiber.id, 80);
      for (const a of chosen) {
        if (!gramsMap.has(a.id)) gramsMap.set(a.id, 80);
      }

      const ids = [...gramsMap.keys()];
      const alimRows = await prisma.alimento.findMany({ where: { id: { in: ids } } });
      const map = new Map(alimRows.map((a) => [a.id, a]));
      let kcal = 0, p = 0, g = 0, c = 0;
      const alimentos = ids.map((id) => ({ alimentoId: id, gramos: gramsMap.get(id) }));
      for (const x of alimentos) {
        const a = map.get(x.alimentoId);
        if (!a) continue;
        const factor = x.gramos / 100;
        kcal += (a.calorias || 0) * factor;
        p += (a.proteinas || 0) * factor;
        g += (a.grasas || 0) * factor;
        c += (a.carbohidratos || 0) * factor;
      }

      const byId = new Map(allowed.map((a) => [a.id, a.nombre]));
      const outItem = {
        id: 0,
        nombre: mealType ? `${mealType} básico` : 'Comida básica',
        porciones: 1,
        matchCount: alimentos.length,
        macros: {
          kcal: Math.round(kcal),
          proteinas: Number(p.toFixed(1)),
          grasas: Number(g.toFixed(1)),
          carbohidratos: Number(c.toFixed(1)),
        },
        alimentos: alimentos.map((x) => ({ id: x.alimentoId, nombre: byId.get(x.alimentoId) || '', gramos: x.gramos })),
        tipo: mealType || 'Almuerzo',
      };

      return NextResponse.json({ items: [outItem], mealType, reason });
    }

    // Mapear a la base y validar ingredientes permitidos
    const byName = new Map(allowed.map((a) => [normalizeName(a.nombre), a.id]));

    const out = [];
    for (const r of parsed.items) {
      const tipo = r.tipo || mealType || null;
      if (!tipo) continue;
      const alimentos = [];
      for (const ing of r.ingredientes || []) {
        // Permitir que el LLM devuelva directamente alimentoId
        let id = Number(ing.alimentoId);
        if (!Number.isFinite(id) || id <= 0) {
          const key = normalizeName(ing.nombre || "");
          id = byName.get(key);
          // intento adicional: si no hay match exacto, probar contains simple
          if (!id && key) {
            for (const [nrm, valId] of byName.entries()) {
              if (nrm.includes(key) || key.includes(nrm)) { id = valId; break; }
            }
          }
        }
        const gramos = Number(ing.gramos) || 0;
        if (!id || gramos <= 0) continue;
        alimentos.push({ alimentoId: id, gramos });
      }
      if (alimentos.length === 0) continue;

      // Obtener datos nutricionales para macros (fallback si IA no provee o es inválido)
      const ids = alimentos.map((x) => x.alimentoId);
      const alimRows = await prisma.alimento.findMany({ where: { id: { in: ids } } });
      const map = new Map(alimRows.map((a) => [a.id, a]));
      let kcal = 0, p = 0, g = 0, c = 0;
      for (const x of alimentos) {
        const a = map.get(x.alimentoId);
        if (!a) continue;
        const factor = x.gramos / 100;
        kcal += (a.calorias || 0) * factor;
        p += (a.proteinas || 0) * factor;
        g += (a.grasas || 0) * factor;
        c += (a.carbohidratos || 0) * factor;
      }

      const iaMacros = r.macros || null;
      const iaValid = iaMacros && ["kcal", "proteinas", "grasas", "carbohidratos"].every((k) => Number.isFinite(Number(iaMacros[k])));
      const macros = iaValid
        ? {
            kcal: Math.round(Number(iaMacros.kcal)),
            proteinas: Number(Number(iaMacros.proteinas).toFixed(1)),
            grasas: Number(Number(iaMacros.grasas).toFixed(1)),
            carbohidratos: Number(Number(iaMacros.carbohidratos).toFixed(1)),
          }
        : {
            kcal: Math.round(kcal),
            proteinas: Number(p.toFixed(1)),
            grasas: Number(g.toFixed(1)),
            carbohidratos: Number(c.toFixed(1)),
          };

      // Forzar nombre 'Batido de ...' cuando aplica preferencia
      let forcedName = r.nombre || `${tipo} sugerido`;
      if (preference === "postre_batido") {
        const ingNames = alimentos
          .map((x) => allowed.find((a) => a.id === x.alimentoId)?.nombre)
          .filter(Boolean)
          .map((s) => String(s));
        if (ingNames.length > 0) {
          const main = ingNames.slice(0, 2);
          const extra = ingNames[2];
          forcedName = `Batido de ${main.join(" y ")}${extra ? ` con ${extra}` : ""}`;
        } else {
          forcedName = "Batido de frutas";
        }
      }

      out.push({
        id: 0, // no es una receta guardada; es sugerencia IA
        nombre: forcedName,
        porciones: Number(r.porciones) || 1,
        matchCount: alimentos.length,
        macros,
        alimentos: alimentos.map((x) => ({ id: x.alimentoId, nombre: allowed.find((a) => a.id === x.alimentoId)?.nombre || "", gramos: x.gramos })),
        tipo,
      });
    }

    // Si no se pudo mapear nada del LLM y hay allowed disponibles, generar un fallback básico
    if (out.length === 0 && allowed.length > 0) {
      const pick = (cat) => allowed.filter((a) => (a.categoria || '').toLowerCase().includes(cat))[0];
      const prot = pick('prote');
      const carb = pick('carbo') || pick('grano') || pick('arroz');
      const fat  = pick('grasa') || pick('aceite') || pick('nuez');
      const fiber = pick('fibra') || pick('verd');
      let chosen = [prot, carb, fat, fiber].filter(Boolean);
      if (chosen.length === 0) {
        chosen = allowed.slice(0, Math.min(4, allowed.length));
      }
      const gramsMap = new Map();
      if (prot) gramsMap.set(prot.id, 120);
      if (carb) gramsMap.set(carb.id, 120);
      if (fat) gramsMap.set(fat.id, 20);
      if (fiber) gramsMap.set(fiber.id, 80);
      for (const a of chosen) if (!gramsMap.has(a.id)) gramsMap.set(a.id, 80);
      const ids = [...gramsMap.keys()];
      const alimRows = await prisma.alimento.findMany({ where: { id: { in: ids } } });
      const map = new Map(alimRows.map((a) => [a.id, a]));
      let kcal = 0, p = 0, g = 0, c = 0;
      for (const id of ids) {
        const a = map.get(id);
        const factor = (gramsMap.get(id) || 0) / 100;
        if (a) {
          kcal += (a.calorias || 0) * factor;
          p += (a.proteinas || 0) * factor;
          g += (a.grasas || 0) * factor;
          c += (a.carbohidratos || 0) * factor;
        }
      }
      const byId = new Map(allowed.map((a) => [a.id, a.nombre]));
      // Forzar nombre batido si aplica preferencia
      let fbName = mealType ? `${mealType} básico` : 'Comida básica';
      if (preference === 'postre_batido') {
        const byId = new Map(allowed.map((a) => [a.id, a.nombre]));
        const names = ids.map((id) => byId.get(id)).filter(Boolean);
        const main = names.slice(0, 2);
        const extra = names[2];
        fbName = `Batido de ${main.join(' y ')}${extra ? ` con ${extra}` : ''}`;
      }
      const outItem = {
        id: 0,
        nombre: fbName,
        porciones: 1,
        matchCount: ids.length,
        macros: {
          kcal: Math.round(kcal),
          proteinas: Number(p.toFixed(1)),
          grasas: Number(g.toFixed(1)),
          carbohidratos: Number(c.toFixed(1)),
        },
        alimentos: ids.map((id) => ({ id, nombre: byId.get(id) || '', gramos: gramsMap.get(id) || 0 })),
        tipo: mealType || 'Almuerzo',
      };
      const reason = hasApiKey ? "No hubo coincidencias exactas; se generó sugerencia básica." : (globalFallbackUsed ? "Sin alimentos del usuario; usando base global." : "Falta GOOGLE_GENERATIVE_AI_API_KEY. Generando sugerencia básica.");
      return NextResponse.json({ items: [outItem], mealType, reason });
    }

    return NextResponse.json({ items: out, mealType, ...(globalFallbackUsed ? { reason: "Usando base global por falta de alimentos del usuario" } : {}) });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo sugerir con IA" }, { status: 500 });
  }
}
