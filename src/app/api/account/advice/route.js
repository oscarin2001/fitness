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
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Validar campos requeridos para generar consejo
    const required = {
      sexo: !!user.sexo,
      fecha_nacimiento: !!user.fecha_nacimiento,
      altura_cm: user.altura_cm != null,
      peso_kg: user.peso_kg != null,
      objetivo: !!user.objetivo,
      nivel_actividad: !!user.nivel_actividad,
      velocidad_cambio: !!user.velocidad_cambio,
      pais: !!user.pais,
      peso_objetivo_kg: user.peso_objetivo_kg != null,
    };
    const missingFields = Object.entries(required)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    if (missingFields.length) {
      // Sugerir paso al que debe volver
      const fieldToStep = {
        sexo: "sex",
        altura_cm: "metrics",
        peso_kg: "metrics",
        fecha_nacimiento: "birthdate",
        nivel_actividad: "activity",
        pais: "country",
        objetivo: "objective",
        peso_objetivo_kg: "target-weight",
        velocidad_cambio: "speed",
      };
      const step = fieldToStep[missingFields[0]] || "sex";
      return NextResponse.json({ error: "Faltan datos para la IA", missingFields, step }, { status: 400 });
    }

    // Forzar modelo largo por defecto para evitar truncamiento
    const GEMINI_MODEL = process.env.GEMINI_LONG_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-pro";

    const age = user.fecha_nacimiento
      ? Math.max(0, Math.floor((Date.now() - new Date(user.fecha_nacimiento).getTime()) / (365.25 * 24 * 3600 * 1000)))
      : "";

    // Preferencias de alimentos (JSON con claves posibles: carbs, proteins, fiber, fats, snacks, avoids, likes)
    let prefsRaw = user.preferencias_alimentos ?? null;
    let prefs = null;
    try {
      prefs = typeof prefsRaw === "string" ? JSON.parse(prefsRaw) : prefsRaw;
    } catch {
      prefs = null;
    }

  const formatList = (arr) => Array.isArray(arr) && arr.length ? arr.join(", ") : "—";
    const prefsText = prefs
      ? `\nPreferencias declaradas:\n- Carbohidratos preferidos: ${formatList(prefs.carbs)}\n- Proteínas preferidas: ${formatList(prefs.proteins)}\n- Fuentes de fibra: ${formatList(prefs.fiber)}\n- Grasas saludables: ${formatList(prefs.fats)}\n- Snacks habituales: ${formatList(prefs.snacks)}\n- Alimentos a evitar: ${formatList(prefs.avoids)}\n- Alimentos favoritos: ${formatList(prefs.likes)}`
      : "";

    // Preferencias de comidas habilitadas: construir lista exacta a respetar
    const em = (prefs && typeof prefs === 'object' && prefs.enabledMeals && typeof prefs.enabledMeals === 'object')
      ? prefs.enabledMeals
      : null;
    const wantTypesOrder = [];
    if (em) {
      if (em.desayuno) wantTypesOrder.push("Desayuno");
      if (em.almuerzo) wantTypesOrder.push("Almuerzo");
      if (em.cena) wantTypesOrder.push("Cena");
      const snackCount = (em["snack_mañana"] || em.snack_manana ? 1 : 0) + (em.snack_tarde ? 1 : 0);
      for (let i = 0; i < snackCount; i++) wantTypesOrder.push("Snack");
    }
    const wantTypesText = wantTypesOrder.length ? `\n\nEl usuario seleccionó EXACTAMENTE ${wantTypesOrder.length} comidas diarias con estos tipos (usa el tipo 'Snack' para snacks): ${wantTypesOrder.join(", ")}.\nEl bloque JSON_MEALS debe contener exactamente ${wantTypesOrder.length} items con esos tipos y ninguno adicional.` : "";

    // Objetivo de proteína diario preferido (si existe): priorizar este valor
    let preferredProteinDaily = null;
    try {
      const w = typeof user.peso_kg === 'number' && user.peso_kg > 0 ? user.peso_kg : null;
      if (typeof user.proteinas_g_obj === 'number' && user.proteinas_g_obj > 0) {
        preferredProteinDaily = Math.round(user.proteinas_g_obj);
      } else if (prefs && prefs.proteinRangeKg && typeof prefs.proteinRangeKg === 'object' && w) {
        const { min, max } = prefs.proteinRangeKg;
        if (typeof min === 'number' && typeof max === 'number' && max > 0) {
          const mid = (min + max) / 2;
          preferredProteinDaily = Math.round(mid * w);
        }
      }
    } catch {}

  const prompt = `Eres un nutricionista y entrenador.
Datos del usuario:
- Sexo: ${user.sexo ?? ""}
- Edad: ${age}
- Altura: ${user.altura_cm ?? ""} cm
- Peso actual: ${user.peso_kg ?? ""} kg
- Peso objetivo: ${user.peso_objetivo_kg ?? ""} kg
- Objetivo: ${user.objetivo ?? ""}
- Nivel de actividad: ${user.nivel_actividad ?? ""}
- Velocidad de cambio: ${user.velocidad_cambio ?? ""}
- País: ${user.pais ?? ""}${prefsText}
${preferredProteinDaily ? `\n- Objetivo de proteína diario (fijado o sugerido por el usuario): ${preferredProteinDaily} g/día` : ""}

Tareas:
1) Mensaje de bienvenida corto.
2) Análisis detallado de la información.
3) Estimar TMB (Mifflin-St Jeor) y TDEE.
4) Recomendación de ingesta calórica para su objetivo y velocidad.
5) Proyección semanal de cambio de peso.
6) Recomendaciones prácticas (2-3 bullets) y distribución de macros aproximada.
7) Personaliza ejemplos de comidas y snacks respetando las preferencias y evitando lo indicado.
Formato: usa subtítulos claros y bullets.

Guía de cálculo (aplíquela paso a paso y muestre números intermedios):
- Fórmula TMB (Mifflin-St Jeor):
  - Hombre: 10*peso(kg) + 6.25*altura(cm) - 5*edad(años) + 5
  - Mujer: 10*peso(kg) + 6.25*altura(cm) - 5*edad(años) - 161
- TDEE = TMB * factor_actividad, donde:
  - Sedentario: 1.20
  - Ligero: 1.375
  - Moderado: 1.55
  - Activo: 1.725
  - Extremo: 1.90
- Ajuste calórico según objetivo y velocidad:
  - Objetivo Bajar_grasa: aplicar déficit.
  - Objetivo Ganar_musculo: aplicar superávit.
  - Objetivo Mantenimiento: kcal ≈ TDEE.
  - Velocidad Lento: ±250 kcal/día; Moderado: ±400–500 kcal/día; Rápido: ±600–750 kcal/día.
  - Señalar límites saludables y evitar recomendaciones por debajo de 1200–1500 kcal/día salvo excepciones clínicas.
- Reparto de macronutrientes (ajustar según objetivo):
  - Proteína: 1.6–2.2 g/kg (Bajar_grasa) | 1.8–2.4 g/kg (Ganar_musculo) | 1.4–2.0 g/kg (Mantenimiento).
  - Grasas: 20–30% de las kcal totales.
  - Carbohidratos: el resto de kcal tras proteína y grasas (mayor en actividad alta/ganancia, moderado en mantenimiento, moderado-bajo en déficit alto).
- Proyección de peso: usar ~7700 kcal ≈ 1 kg para estimar ritmo semanal según el déficit/superávit.

Reglas adicionales importantes:
- Si se proporcionó un Objetivo de proteína diario, respétalo: en JSON_SUMMARY.proteinas_g debes colocar EXACTAMENTE ese valor y ajustar comentarios en el texto acorde.
- Asegúrate de que los ejemplos de comidas sean coherentes con el objetivo de proteína diario global y los tipos de comidas seleccionados.

Reglas para variedad organizada de comidas (no caótica):
- Genera hasta 4 variantes distintas por cada tipo de comida seleccionado (A, B, C, D), donde:
  - A se usará para Lunes y Jueves,
  - B para Martes y Viernes,
  - C para Miércoles y Sábado,
  - D para Domingo (si hay suficientes opciones).
- Cada variante debe evitar repetir exactamente los mismos ingredientes principales. Varía al menos una fuente de proteína, una de carbohidrato o una grasa saludable entre variantes.
- Respeta las preferencias del usuario (likes) y las exclusiones (avoids). Si hay pocas opciones válidas, genera las variantes que se pueda (mínimo 2 si es posible) e indícalo en los ingredientes.
- Usa tipos normalizados: Desayuno | Almuerzo | Cena | Snack.

Salida estructurada requerida (tres bloques al final, cada uno en su propia línea):
- JSON_SUMMARY: { "tmb": number, "tdee": number, "kcal_objetivo": number, "deficit_superavit_kcal": number, "ritmo_peso_kg_sem": number, "proteinas_g": number, "grasas_g": number, "carbohidratos_g": number }
- JSON_MEALS: { "items": [ { "tipo": "Desayuno|Almuerzo|Cena|Snack", "nombre": string, "porciones": number, "ingredientes": [ { "nombre": string, "gramos": number } ] } ] }
- JSON_HYDRATION: { "litros": number }
- OPCIONAL JSON_MEALS_VARIANTS: { "variants": { "Desayuno": [ { "nombre": string, "porciones": number, "ingredientes": [ { "nombre": string, "gramos": number } ] } ], "Almuerzo": [...], "Cena": [...], "Snack": [...] } }
No agregues texto después de estos bloques. Asegúrate de que cada bloque sea JSON válido.
${wantTypesText}`;

    // Use AI SDK to generate text (the provider reads GOOGLE_GENERATIVE_AI_API_KEY from env)
    const { text: content } = await generateText({
      model: google(GEMINI_MODEL),
      prompt: `Eres un experto en nutrición y entrenamiento, preciso y claro.\n\n${prompt}`,
      temperature: 0.7,
      maxTokens: 8192,
    });

  // Intentar extraer JSON_SUMMARY, JSON_MEALS y JSON_HYDRATION del contenido de manera robusta
    let summary = null;
    let meals = null;
    let hydration = null;
    let mealsVariants = null;

    function extractJsonBlock(label, text) {
      if (!text) return null;
      // 1) Buscar bloque etiquetado: JSON_LABEL: { ... }
      const labelIdx = text.indexOf(label + ":");
      if (labelIdx >= 0) {
        const after = text.slice(labelIdx + label.length + 1);
        // saltar espacios y posibles fences
        const startFence = after.match(/\s*```json\s*/i);
        let rest = after;
        if (startFence) rest = after.slice(startFence[0].length);
        // encontrar primer '{' y escanear llaves balanceadas
        const braceStart = rest.indexOf("{");
        if (braceStart >= 0) {
          let i = braceStart, depth = 0;
          for (; i < rest.length; i++) {
            const ch = rest[i];
            if (ch === '{') depth++;
            else if (ch === '}') {
              depth--;
              if (depth === 0) {
                const jsonStr = rest.slice(braceStart, i + 1);
                try { return JSON.parse(jsonStr); } catch {}
                break;
              }
            }
          }
        }
      }
      // 2) Buscar code fence independiente con estructura plausible
      const fenceMatches = text.match(/```json\s*([\s\S]*?)```/gi) || [];
      for (const m of fenceMatches) {
        const inner = m.replace(/```json/i, '').replace(/```$/, '');
        try {
          const obj = JSON.parse(inner.trim());
          return obj;
        } catch {}
      }
      // 3) Regex simple como último intento (ojo: es agresivo)
      const simple = text.match(/\{[\s\S]*\}/);
      if (simple) {
        try { return JSON.parse(simple[0]); } catch {}
      }
      return null;
    }

    try {
      const sObj = extractJsonBlock('JSON_SUMMARY', content);
      if (sObj && typeof sObj === 'object') summary = sObj;
      const mObj = extractJsonBlock('JSON_MEALS', content);
      if (mObj && typeof mObj === 'object') meals = mObj;
      const hObj = extractJsonBlock('JSON_HYDRATION', content);
      if (hObj && typeof hObj === 'object') hydration = hObj;
      const vObj = extractJsonBlock('JSON_MEALS_VARIANTS', content);
      if (vObj && typeof vObj === 'object' && vObj.variants && typeof vObj.variants === 'object') {
        mealsVariants = vObj.variants;
      }
    } catch {}

    // Forzar el objetivo diario de proteína si el usuario lo definió/sugirió
    if (summary && preferredProteinDaily && typeof preferredProteinDaily === 'number') {
      try {
        summary.proteinas_g = preferredProteinDaily;
      } catch {}
    }

    // Helper: normaliza un string al tipo estándar o null
    function normalizeTipoComida(raw) {
      if (!raw) return null;
      const s = String(raw).toLowerCase();
      if (/desayuno|breakfast|mañana|morning/.test(s)) return "Desayuno";
      if (/almuerzo|comida|lunch|mediod[ií]a|medio dia/.test(s)) return "Almuerzo";
      if (/cena|dinner|noche|night/.test(s)) return "Cena";
      if (/snack|merienda|colaci[oó]n|tentempi[eé]|snacks?/.test(s)) return "Snack";
      return null;
    }

    // Helper: generar items básicos por tipo a partir de alimentos guardados
    async function generateBasicItemsByTypes(userId, types) {
      const saved = await prisma.usuarioAlimento.findMany({
        where: { usuarioId: userId },
        include: { alimento: true },
      });
      const list = saved.map((x) => x.alimento).filter(Boolean);
      const by = (pred) => list.find((a) => pred((a.categoria || '').toLowerCase(), (a.nombre || '').toLowerCase()));
      const pickProt = () => by((c, n) => c.includes('prote') || /huevo|pollo|carne|pavo|atun|queso|yogur|lomo/.test(n));
      const pickCarb = () => by((c, n) => c.includes('carbo') || /arroz|papa|patata|pan|pasta|avena|quinoa|cereal/.test(n));
      const pickFat  = () => by((c, n) => c.includes('grasa') || /aceite|nuez|mani|maní|almendra|aguacate|avellana|semilla|mantequilla/.test(n));
      const pickFiber= () => by((c, n) => c.includes('fibra') || /brocoli|brócoli|lechuga|espinaca|zanahoria|berenjena|tomate|verdura|ensalada/.test(n));
      const pickFruit= () => by((c, n) => /banana|platan|plátano|fresa|frutilla|manzana|pera|uva|naranja|fruta/.test(n));
      const mk = (tipo, nombre, arr) => ({ tipo, nombre, porciones: 1, ingredientes: arr.filter((x) => x.gramos > 0) });
      const p1 = pickProt();
      const c1 = pickCarb();
      const f1 = pickFat();
      const v1 = pickFiber();
      const fr = pickFruit();
      const makeFor = (t) => {
        if (t === 'Desayuno') return mk('Desayuno', 'Desayuno básico', [ p1 && { nombre: p1.nombre, gramos: 120 }, fr && { nombre: fr.nombre, gramos: 100 }, f1 && { nombre: f1.nombre, gramos: 10 } ].filter(Boolean));
        if (t === 'Almuerzo') return mk('Almuerzo', 'Almuerzo básico', [ p1 && { nombre: p1.nombre, gramos: 120 }, c1 && { nombre: c1.nombre, gramos: 120 }, v1 && { nombre: v1.nombre, gramos: 100 }, f1 && { nombre: f1.nombre, gramos: 10 } ].filter(Boolean));
        if (t === 'Cena') return mk('Cena', 'Cena básica', [ p1 && { nombre: p1.nombre, gramos: 100 }, c1 && { nombre: c1.nombre, gramos: 100 }, v1 && { nombre: v1.nombre, gramos: 120 }, f1 && { nombre: f1.nombre, gramos: 10 } ].filter(Boolean));
        return mk('Snack', 'Snack básico', [ fr && { nombre: fr.nombre, gramos: 120 }, f1 && { nombre: f1.nombre, gramos: 15 } ].filter(Boolean));
      };
      return types.map((t) => makeFor(t)).filter((m) => m.ingredientes.length);
    }

    // Fallback inicial si IA no trajo comidas
    if (!meals || !Array.isArray(meals.items) || meals.items.length === 0) {
      const baseTypes = wantTypesOrder.length ? wantTypesOrder : ["Desayuno", "Almuerzo", "Cena", "Snack"];
      const items = await generateBasicItemsByTypes(userId, baseTypes);
      meals = { items };
    }

    // Enforce: si hay enabledMeals definidos, ajustar a EXACTAMENTE esos tipos/cantidad
    if (wantTypesOrder.length && meals && Array.isArray(meals.items)) {
      // bucket por tipo normalizado
      const buckets = { Desayuno: [], Almuerzo: [], Cena: [], Snack: [] };
      for (const it of meals.items) {
        const t = normalizeTipoComida(it?.tipo);
        if (t && buckets[t]) buckets[t].push(it);
      }
      const resultItems = [];
      for (const t of wantTypesOrder) {
        if (buckets[t] && buckets[t].length) {
          resultItems.push(buckets[t].shift());
        } else {
          // generar básico para el tipo faltante
          const gen = await generateBasicItemsByTypes(userId, [t]);
          if (gen.length) resultItems.push(gen[0]);
        }
      }
      meals = { items: resultItems };
    }

    if (!hydration || !(hydration.litros > 0)) {
      const litros = summary?.kcal_objetivo ? Math.max(1.5, Math.min(4, Math.round((summary.kcal_objetivo / 1000) * 10) / 10)) : 2.0;
      hydration = { litros };
    }

    // Adjuntar variantes si existen
    if (meals && mealsVariants) {
      try { meals.variants = mealsVariants; } catch {}
    }

    return NextResponse.json({ advice: content, summary, meals, hydration }, { status: 200 });
  } catch (e) {
    console.error("/api/account/advice error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}