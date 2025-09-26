import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import crypto from "crypto";

// ---- Constantes y estado en memoria ----
// Unificamos uso del modelo: si existe GEMINI_MODEL (como en tu .env gemini-2.5-flash) lo usamos para ambos
// Se pueden definir GEMINI_MODEL_LONG y GEMINI_MODEL_FALLBACK si quieres diferenciarlos.
function normalizeModelName(name, fallback) {
  if (!name) return fallback;
  // Si el valor ya contiene 'models/' lo dejamos; si no, lo usamos tal cual (el provider suele aceptar ambos formatos).
  return name.trim();
}
const GEMINI_ENV_MODEL = process.env.GEMINI_MODEL;
const GEMINI_MODEL_LONG = normalizeModelName(
  process.env.GEMINI_MODEL_LONG || GEMINI_ENV_MODEL,
  "models/gemini-2.5-flash"
);
const GEMINI_MODEL_FALLBACK = normalizeModelName(
  process.env.GEMINI_MODEL_FALLBACK || GEMINI_ENV_MODEL,
  GEMINI_MODEL_LONG || "models/gemini-2.5-flash"
);
const activeGenerations = new Map(); // userId -> Promise
// Timeouts configurables (ms)
const ADVICE_FLASH_TIMEOUT_MS = parseInt(process.env.ADVICE_FLASH_TIMEOUT_MS || '18000', 10); // 18s
const ADVICE_LONG_TIMEOUT_MS  = parseInt(process.env.ADVICE_LONG_TIMEOUT_MS  || '35000', 10); // 35s
const ADVICE_FALLBACK_TIMEOUT_MS = parseInt(process.env.ADVICE_FALLBACK_TIMEOUT_MS || '15000', 10); // fallback corto
const FAST_MODE = process.env.ADVICE_STRICT_FAST === '1'; // Si está activo evitamos modelo largo
const PREFETCH_MAX_MS = parseInt(process.env.ADVICE_PREFETCH_MAX_MS || '45000', 10); // watchdog máximo prefetch

function getCookieName() {
  return process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token";
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

function calcAge(date) {
  if (!date) return null;
  try {
    const dob = new Date(date);
    const now = new Date();
    return Math.floor((now.getTime() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
  } catch { return null; }
}

// ---- Handler principal (POST) ----
export async function POST(request) {
  try {
  const url = new URL(request.url);
  const debugMode = url.searchParams.get("debug") === "1";
  // Permite solicitar ver el prompt exacto enviado al modelo sin activar todo el modo debug completo
  const debugPromptOnly = url.searchParams.get("debugPrompt") === "1";
  // Permite invalidar el cache forzado (?invalidate=1)
  const invalidate = url.searchParams.get("invalidate") === "1";
  // Fuerza intentar obtener salida 'completa' (reintento con modelo largo extendido si la primera fue short o fallback)
  const ensureFull = url.searchParams.get("ensureFull") === "1";
  // Devuelve siempre el prompt completo (además de debugPrompt) si se pasa showPrompt=1
  const showPrompt = url.searchParams.get("showPrompt") === "1";
  // Soportar múltiples formas de solicitar modelo largo
  let forceLong = url.searchParams.get("forceLong") === "1" || url.searchParams.get("mode") === "long";
  // Intentar leer body para detectar flags (si viene vacío no falla)
  let bodyData = null;
  try { bodyData = await request.json(); } catch {}
  if (bodyData?.forceLong || bodyData?.long) forceLong = true;
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const user = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const age = calcAge(user.fecha_nacimiento);

    // ---- Preferencias y configuración ----
    let prefsRaw = user.preferencias_alimentos ?? null;
    let prefs = null;
    try { prefs = typeof prefsRaw === "string" ? JSON.parse(prefsRaw) : prefsRaw; } catch { prefs = null; }
    const formatList = (arr) => Array.isArray(arr) && arr.length ? arr.join(", ") : "—";
    const prefsText = prefs
      ? `\nPreferencias declaradas:\n- Carbohidratos preferidos: ${formatList(prefs.carbs)}\n- Proteínas preferidas: ${formatList(prefs.proteins)}\n- Fuentes de fibra: ${formatList(prefs.fiber)}\n- Grasas saludables: ${formatList(prefs.fats)}\n- Snacks habituales: ${formatList(prefs.snacks)}\n- Bebidas / infusiones preferidas: ${formatList(prefs.beverages)}\n- Alimentos a evitar: ${formatList(prefs.avoids)}\n- Alimentos favoritos: ${formatList(prefs.likes)}`
      : "";
    const em = (prefs && typeof prefs === 'object' && prefs.enabledMeals && typeof prefs.enabledMeals === 'object') ? prefs.enabledMeals : null;
    const wantTypesOrder = [];
    if (em) {
      if (em.desayuno) wantTypesOrder.push("Desayuno");
      if (em.almuerzo) wantTypesOrder.push("Almuerzo");
      if (em.cena) wantTypesOrder.push("Cena");
      const snackCount = (em["snack_mañana"] || em.snack_manana ? 1 : 0) + (em.snack_tarde ? 1 : 0);
      for (let i = 0; i < snackCount; i++) wantTypesOrder.push("Snack");
    }
    const wantTypesText = wantTypesOrder.length ? `\n\nEl usuario seleccionó EXACTAMENTE ${wantTypesOrder.length} comidas diarias con estos tipos (usa el tipo 'Snack' para snacks): ${wantTypesOrder.join(", ")}.\nEl bloque JSON_MEALS debe contener exactamente ${wantTypesOrder.length} items con esos tipos y ninguno adicional.` : "";

    let preferredProteinDaily = null;
    try {
      const w = typeof user.peso_kg === 'number' && user.peso_kg > 0 ? user.peso_kg : null;
      if (typeof user.proteinas_g_obj === 'number' && user.proteinas_g_obj > 0) {
        preferredProteinDaily = Math.round(user.proteinas_g_obj);
      } else if (prefs && prefs.proteinRangeKg && typeof prefs.proteinRangeKg === 'object' && w) {
        const { min, max } = prefs.proteinRangeKg;
        if (typeof min === 'number' && typeof max === 'number' && max > 0) {
          const mid = (min + max) / 2; preferredProteinDaily = Math.round(mid * w);
        }
      }
    } catch {}

    function computePlanHash(u, prefsObj, proteinDaily) {
      try {
        const basis = {
          sexo: u.sexo, fecha_nacimiento: u.fecha_nacimiento, altura_cm: u.altura_cm, peso_kg: u.peso_kg,
          objetivo: u.objetivo, nivel_actividad: u.nivel_actividad, velocidad_cambio: u.velocidad_cambio,
          pais: u.pais, peso_objetivo_kg: u.peso_objetivo_kg, proteinas_g_obj: u.proteinas_g_obj,
          preferencias_alimentos: prefsObj, preferredProteinDaily: proteinDaily
        };
        const json = JSON.stringify(basis, Object.keys(basis).sort());
        return crypto.createHash("sha256").update(json).digest("hex");
      } catch { return null; }
    }
    const currentHash = computePlanHash(user, prefs, preferredProteinDaily);
    const isPrefetch = url.searchParams.get("prefetch") === "1";

    // Si se solicita invalidación, limpiar cache antes de revisar
    if (invalidate) {
      try { await prisma.usuario.update({ where: { id: userId }, data: { plan_ai: null } }); } catch {}
    }

    if (!forceLong && !invalidate) {
      try {
        const cached = user?.plan_ai && typeof user.plan_ai === 'object' ? user.plan_ai : null;
        // Heurística para detectar contenido legacy defectuoso (placeholder anterior)
        function isLegacyOrInvalid(advice) {
          if (!advice) return true;
          const legacyPhrases = [
            'Resumen rápido no disponible por timeout',
            'Resumen rápido no disponible',
            'Resumen rápido (fallback crítico)'
          ];
          if (legacyPhrases.some(p => advice.includes(p))) return true;
            // Si no contiene el marcador JSON_SUMMARY probablemente sea incompleto viejo
          if (!advice.includes('JSON_SUMMARY')) return true;
          return false;
        }
        if (cached && cached.hash === currentHash && cached.advice && cached.summary && cached.meals && !isLegacyOrInvalid(cached.advice)) {
          return NextResponse.json({ advice: cached.advice, summary: cached.summary, meals: cached.meals, hydration: cached.hydration, beverages: cached.beverages, cached: true }, { status: 200 });
        }
      } catch {}
    }

  const basePrompt = `Eres un nutricionista y entrenador.
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
4) Recomendación de ingesta calórica.
5) Proyección semanal de cambio de peso.
6) Recomendaciones prácticas (2-3 bullets) y distribución de macros.
7) PLAN SEMANAL COMPLETO: Crea comidas variadas y personalizadas para 7 días, con rotación de ingredientes para evitar monotonía. Cada comida debe tener ingredientes específicos con cantidades en gramos.
Formato: subtítulos claros y bullets.

Guía de cálculo:
- Fórmula TMB (Mifflin-St Jeor) y factores actividad.
- Ajuste calórico según objetivo y velocidad (déficit/superávit razonables).
- Reparto macros: proteína según objetivo, grasas 20-30%, resto carbohidratos.
- Proyección usando ~7700 kcal ≈ 1 kg.

Reglas para el PLAN SEMANAL:
- Crea comidas REALMENTE VARIADAS usando preferencias del usuario y alimentos permitidos
- Cada comida debe tener ingredientes específicos con cantidades exactas en gramos
- Incluye 4-6 comidas por día según las preferencias del usuario
- Varía los ingredientes entre días para evitar repetición
- Usa nombres descriptivos para cada comida (ej: "Ensalada de quinoa con pollo" en lugar de "Almuerzo")
- Incluye medidas caseras aproximadas (ej: "1 pechuga mediana", "1/2 taza de arroz")
- Considera restricciones alimentarias y preferencias declaradas
- Haz que las comidas sean atractivas y apetitosas
- Genera múltiples opciones para cada tipo de comida para permitir rotación
- Incluye variedad de proteínas, carbohidratos y vegetales
- Considera el objetivo calórico y de macronutrientes del usuario

Salida estructurada al final, cada bloque en su línea:
- JSON_SUMMARY {...}
- JSON_MEALS {...} (con comidas variadas y específicas)
- JSON_HYDRATION {...}
- JSON_BEVERAGES {...}
- OPCIONAL JSON_MEALS_VARIANTS {...}
${wantTypesText}`;

  // Booster adicional para forzar riqueza si el usuario pide ensureFull
  const PROMPT_BOOSTER = `\n\nIMPORTANTE (REGLAS ESTRICTAS PARA RESPUESTA COMPLETA):\n- NO omitas NINGÚN bloque JSON solicitado.\n- Antes de los bloques JSON, genera una narrativa estructurada (≈600-1200 palabras) que cubra: bienvenida personalizada, análisis, cálculos paso a paso (TMB, TDEE), razonamiento del ajuste calórico, reparto de macros con justificación y recomendaciones prácticas.\n- Cada comida del PLAN SEMANAL debe ser única (no repitas exactamente la misma combinación más de una vez).\n- Usa ingredientes REALISTAS y variados, cantidades en gramos y, entre paréntesis, una medida casera aproximada cuando aplique.\n- Asegura que los tipos de comida EXACTOS solicitados (${wantTypesOrder.join(', ') || 'Desayuno, Almuerzo, Cena, Snack'}) aparezcan en JSON_MEALS en ese orden, sin extras.\n- Después de la narrativa coloca cada bloque JSON en SU PROPIA LÍNEA, empezando con la etiqueta (ej: JSON_SUMMARY { ... }).\n- Si estás cerca de límite de tokens, PRIORIZA completar todos los bloques JSON completos y válidos.\n- NO inventes calorías imposibles ni macros incoherentes; mantén consistencia (proteína objetivo ${preferredProteinDaily || 'calculada'} g/día).`;

  const effectivePrompt = ensureFull ? (basePrompt + PROMPT_BOOSTER) : basePrompt;

    // ---- Generación IA (prefetch y principal) ----

    // Fallback local enriquecido con cálculos reales si la IA falla
    async function generateFallbackContent() {
      const t0 = Date.now();
      try {
        // Calcular TMB (Mifflin-St Jeor)
        const peso = typeof user.peso_kg === 'number' ? user.peso_kg : null;
        const altura = typeof user.altura_cm === 'number' ? user.altura_cm : null;
        const edad = age || null;
        let tmb = null;
        if (peso && altura && edad != null && user.sexo) {
          if ((user.sexo || '').toLowerCase().startsWith('m')) {
            tmb = 10 * peso + 6.25 * altura - 5 * edad + 5;
          } else {
            tmb = 10 * peso + 6.25 * altura - 5 * edad - 161;
          }
        }
        // Factor actividad heurístico
        const actividad = (user.nivel_actividad || '').toLowerCase();
        const actFactor = actividad.includes('alto') ? 1.55 : actividad.includes('moder') ? 1.45 : actividad.includes('lig') ? 1.35 : 1.25;
        const tdee = tmb ? tmb * actFactor : null;
        // Ajuste según objetivo
        const objetivo = (user.objetivo || '').toLowerCase();
        const vel = (user.velocidad_cambio || '').toLowerCase();
        let delta = 0; // kcal/día
        if (objetivo.includes('bajar') || objetivo.includes('grasa')) {
          delta = -350; if (vel.includes('rap') || vel.includes('alto')) delta = -500; if (vel.includes('suave')) delta = -250;
        } else if (objetivo.includes('ganar') || objetivo.includes('mus')) {
          delta = 250; if (vel.includes('rap') || vel.includes('alto')) delta = 350; if (vel.includes('suave')) delta = 150;
        }
        const kcalObjetivo = tdee ? Math.max(1200, Math.round(tdee + delta)) : null;
        // Proteína
        const prote = preferredProteinDaily || (peso ? Math.round(peso * (objetivo.includes('ganar') ? 1.9 : 1.6)) : 0);
        // Grasas 25% kcal
        const grasas = kcalObjetivo ? Math.round((kcalObjetivo * 0.25) / 9) : 0;
        // Carbos resto
        const carbos = kcalObjetivo ? Math.max(0, Math.round((kcalObjetivo - (prote * 4) - (grasas * 9)) / 4)) : 0;
        // Ritmo estimado (kg/sem) usando 7700 kcal
        const ritmo = delta !== 0 ? +( (delta * 7) / 7700 ).toFixed(2) : 0;

        // Construir comidas básicas usando alimentos guardados si existen
        const mealTypes = wantTypesOrder.length ? wantTypesOrder : ["Desayuno","Almuerzo","Cena","Snack"];
        const basic = await (async () => {
          try { return await generateBasicItemsByTypes(userId, mealTypes); } catch { return []; }
        })();
        const meals = { items: basic.map(m => ({ ...m, nombre: m.nombre || (m.tipo + ' base') })) };
        const hydration = { litros: 2 };
        const beverages = { items: [] };
        const summary = { tmb: tmb ? Math.round(tmb) : 0, tdee: tdee ? Math.round(tdee) : 0, kcal_objetivo: kcalObjetivo || 0, deficit_superavit_kcal: delta, ritmo_peso_kg_sem: ritmo, proteinas_g: prote, grasas_g: grasas, carbohidratos_g: carbos };
        const explanation = `# Consejo generado localmente (fallback)\n\nSe produjo un timeout o error con el proveedor de IA. Generamos un plan base calculado localmente para que no te quedes sin información. Cuando reintentes más tarde, se intentará obtener una versión enriquecida con más variedad y análisis narrativo.\n\n## Resumen calculado\n- TMB (estimado): ${summary.tmb || '—'} kcal\n- TDEE (estimado): ${summary.tdee || '—'} kcal\n- Ajuste objetivo: ${delta} kcal/día\n- Kcal objetivo: ${summary.kcal_objetivo || '—'} kcal\n- Ritmo estimado: ${summary.ritmo_peso_kg_sem || 0} kg/sem\n- Proteínas: ${summary.proteinas_g} g\n- Grasas: ${summary.grasas_g} g\n- Carbohidratos: ${summary.carbohidratos_g} g\n\n## Recomendaciones base\n* Prioriza distribución pareja de proteína en cada comida.\n* Mantén verduras/fibra en 2-3 comidas al día.\n* Hidrátate de forma constante (2 L objetivo base).\n\n## Próximo paso\nPulsa “Regenerar” para intentar una versión completa cuando el servicio esté disponible.\n`;
        const content = `${explanation}\nJSON_SUMMARY: ${JSON.stringify(summary)}\nJSON_MEALS: ${JSON.stringify(meals)}\nJSON_HYDRATION: ${JSON.stringify(hydration)}\nJSON_BEVERAGES: ${JSON.stringify(beverages)}`;
        return { content, usedModel: 'fallback-local', genMs: Date.now() - t0 };
      } catch (e) {
        const content = `Resumen rápido (fallback crítico).\n\nJSON_SUMMARY: {"tmb":0,"tdee":0,"kcal_objetivo":0,"deficit_superavit_kcal":0,"ritmo_peso_kg_sem":0,"proteinas_g":${preferredProteinDaily || 0},"grasas_g":0,"carbohidratos_g":0}\nJSON_MEALS: {"items":[]}\nJSON_HYDRATION: {"litros":2}\nJSON_BEVERAGES: {"items":[]}`;
        return { content, usedModel: 'fallback-local', genMs: Date.now() - t0 };
      }
    }

    async function generateFullAdvice(promptText, opts = { forceLong: false }) {
      const FULL_PROMPT = `Eres un experto en nutrición y entrenamiento, preciso y claro.\n\n${promptText}`;
      async function runModel(modelName, fullPrompt) {
        return generateText({ model: google(modelName), prompt: fullPrompt, temperature: 0.7, maxTokens: 8192 });
      }
      async function withTimeout(promise, ms) {
        let to; const timeout = new Promise((_, rej) => { to = setTimeout(() => rej(new Error("timeout")), ms); });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(to));
      }
      const t0 = Date.now();
  let content = null; let usedModel = null; let phase = 'start'; let genMs = null; // genMs se calcula al final salvo fallback
      try {
        if (opts.forceLong && !FAST_MODE) {
          phase = 'long-primary';
          const res = await withTimeout(runModel(GEMINI_MODEL_LONG, FULL_PROMPT), ADVICE_LONG_TIMEOUT_MS);
          content = res.text; usedModel = GEMINI_MODEL_LONG;
        } else {
          // Flash primero (más rápido)
            phase = 'flash-primary';
            try {
              const resFlash = await withTimeout(runModel(GEMINI_MODEL_FALLBACK, FULL_PROMPT), ADVICE_FLASH_TIMEOUT_MS);
              content = resFlash.text; usedModel = GEMINI_MODEL_FALLBACK;
            } catch (eFlash) {
              if (!FAST_MODE) {
                // Intentar long si no estamos en fast mode
                phase = 'long-after-flash-fail';
                try {
                  const resLong = await withTimeout(runModel(GEMINI_MODEL_LONG, FULL_PROMPT), ADVICE_LONG_TIMEOUT_MS);
                  content = resLong.text; usedModel = GEMINI_MODEL_LONG;
                } catch (eLong) {
                  phase = 'flash-reduced';
                  try {
                    const shortPrompt = FULL_PROMPT + "\n\n(Genera solo bloques JSON concisos.)";
                    const resShort = await withTimeout(runModel(GEMINI_MODEL_FALLBACK, shortPrompt), ADVICE_FALLBACK_TIMEOUT_MS);
                    content = resShort.text; usedModel = GEMINI_MODEL_FALLBACK + "-short";
                  } catch (eShort) {
                    phase = 'local-fallback';
                    const fallbackResult = await generateFallbackContent();
                    content = fallbackResult.content;
                    usedModel = fallbackResult.usedModel;
                    // Usar el valor del fallback
                    genMs = fallbackResult.genMs;
                  }
                }
              } else {
                // Fast mode: ir directo a short y luego local
                phase = 'flash-reduced-fast';
                try {
                  const shortPrompt = FULL_PROMPT + "\n\n(Genera solo bloques JSON concisos.)";
                  const resShort = await withTimeout(runModel(GEMINI_MODEL_FALLBACK, shortPrompt), ADVICE_FALLBACK_TIMEOUT_MS);
                  content = resShort.text; usedModel = GEMINI_MODEL_FALLBACK + "-short";
                } catch (eShortFast) {
                  phase = 'local-fallback-fast';
                  const fallbackResult = await generateFallbackContent();
                  content = fallbackResult.content;
                  usedModel = fallbackResult.usedModel;
                  // Usar el valor del fallback
                  genMs = fallbackResult.genMs;
                }
              }
            }
        }
      } catch (err) {
        phase = 'catch-local-fallback';
        const fallbackResult = await generateFallbackContent();
        content = fallbackResult.content;
        usedModel = fallbackResult.usedModel;
        // Usar el valor del fallback
        genMs = fallbackResult.genMs;
      }
  // Si no se estableció antes (fallback), calcular duración ahora
  genMs = genMs ?? (Date.now() - t0);

  // Reintento extendido si el usuario solicita ensureFull y el resultado parece incompleto (modelo short, fallback o texto muy corto)
  if (ensureFull) {
    const looksShort = !content || content.length < 1200 || /-short$/.test(usedModel || '');
    const isLocalFallback = (usedModel || '').startsWith('fallback');
    if ((looksShort || isLocalFallback) && !FAST_MODE) {
      try {
        const extendedTimeout = ADVICE_LONG_TIMEOUT_MS + 15000; // +15s adicionales
        const startRetry = Date.now();
        const resExtended = await withTimeout(runModel(GEMINI_MODEL_LONG, MAIN_PROMPT), extendedTimeout);
        content = resExtended.text;
        usedModel = GEMINI_MODEL_LONG + '-extended';
        mainPhase = mainPhase + ':extended-long';
        // actualizar duración total sumando el retry
        genMs += (Date.now() - startRetry);
      } catch (eExtended) {
        // si falla, mantenemos el contenido previo
        mainPhase = mainPhase + ':extended-fail';
      }
    }
  }
  console.log(`[advice][generateFullAdvice] phase=${phase} model=${usedModel} genMs=${genMs}`);
  return { content, usedModel: usedModel || 'unknown', genMs };
    }

    function buildLocalSummary() {
      // Intenta construir un summary mínimo utilizando datos del usuario si falta o viene vacío
      try {
        const peso = typeof user.peso_kg === 'number' ? user.peso_kg : null;
        const altura = typeof user.altura_cm === 'number' ? user.altura_cm : null;
        const edad = age || null;
        let tmb = 0;
        if (peso && altura && edad != null && user.sexo) {
          if ((user.sexo || '').toLowerCase().startsWith('m')) {
            tmb = 10 * peso + 6.25 * altura - 5 * edad + 5;
          } else {
            tmb = 10 * peso + 6.25 * altura - 5 * edad - 161;
          }
        }
        const actividad = (user.nivel_actividad || '').toLowerCase();
        const actFactor = actividad.includes('alto') ? 1.55 : actividad.includes('moder') ? 1.45 : actividad.includes('lig') ? 1.35 : 1.25;
        const tdee = tmb ? Math.round(tmb * actFactor) : 0;
        const objetivo = (user.objetivo || '').toLowerCase();
        const vel = (user.velocidad_cambio || '').toLowerCase();
        let delta = 0;
        if (objetivo.includes('bajar') || objetivo.includes('grasa')) {
          delta = -350; if (vel.includes('rap') || vel.includes('alto')) delta = -500; if (vel.includes('suave')) delta = -250;
        } else if (objetivo.includes('ganar') || objetivo.includes('mus')) {
          delta = 250; if (vel.includes('rap') || vel.includes('alto')) delta = 350; if (vel.includes('suave')) delta = 150;
        }
        const kcal_objetivo = tdee ? Math.max(1200, tdee + delta) : 0;
        const proteinas_g = preferredProteinDaily || (peso ? Math.round(peso * (objetivo.includes('ganar') ? 1.9 : 1.6)) : 0);
        const grasas_g = kcal_objetivo ? Math.round((kcal_objetivo * 0.25) / 9) : 0;
        const carbohidratos_g = kcal_objetivo ? Math.max(0, Math.round((kcal_objetivo - (proteinas_g * 4) - (grasas_g * 9)) / 4)) : 0;
        const ritmo_peso_kg_sem = delta !== 0 ? +( (delta * 7) / 7700 ).toFixed(2) : 0;
        return { tmb, tdee, kcal_objetivo, deficit_superavit_kcal: delta, ritmo_peso_kg_sem, proteinas_g, grasas_g, carbohidratos_g };
      } catch { return null; }
    }

    // PREFETCH: lanzar generación en background y devolver rápido 202
    if (isPrefetch && !forceLong) {
      if (!activeGenerations.has(userId)) {
        const startedAt = Date.now();
        let finished = false;
        const genPromise = (async () => {
          try {
            const { content, usedModel, genMs } = await generateFullAdvice(effectivePrompt, { forceLong: false });
            // Parse y cache (reutilizando extract logic del flujo principal -> lo duplicamos mínimo aquí para aislar)
            function extractJsonBlock(label, text) {
              if (!text) return null; const labelIdx = text.indexOf(label + ":"); if (labelIdx >= 0) { const after = text.slice(labelIdx + label.length + 1); const startFence = after.match(/\s*```json\s*/i); let rest = after; if (startFence) rest = after.slice(startFence[0].length); const braceStart = rest.indexOf("{"); if (braceStart >= 0) { let i = braceStart, depth = 0; for (; i < rest.length; i++) { const ch = rest[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { const jsonStr = rest.slice(braceStart, i + 1); try { return JSON.parse(jsonStr); } catch {} break; } } } } } const fenceMatches = text.match(/```json\s*([\s\S]*?)```/gi) || []; for (const m of fenceMatches) { const inner = m.replace(/```json/i,'').replace(/```$/,''); try { return JSON.parse(inner.trim()); } catch {} } const simple = text.match(/\{[\s\S]*\}/); if (simple) { try { return JSON.parse(simple[0]); } catch {} } return null; }
            let summary = extractJsonBlock('JSON_SUMMARY', content) || null;
            let meals = extractJsonBlock('JSON_MEALS', content) || null;
            let hydration = extractJsonBlock('JSON_HYDRATION', content) || null;
            let beveragesPlan = extractJsonBlock('JSON_BEVERAGES', content) || null;
            const vObj = extractJsonBlock('JSON_MEALS_VARIANTS', content) || null; if (meals && vObj && vObj.variants) { try { meals.variants = vObj.variants; } catch {} }
            if (summary && preferredProteinDaily) { try { summary.proteinas_g = preferredProteinDaily; } catch {} }
            try {
              if (currentHash && meals && summary && content) {
                const cacheObj = { advice: content, summary, meals, hydration, beverages: beveragesPlan, hash: currentHash, model: usedModel, generated_ms: genMs, ts: new Date().toISOString() };
                await prisma.usuario.update({ where: { id: userId }, data: { plan_ai: cacheObj } });
              }
            } catch {}
            finished = true;
          } catch (e) {
            console.error("[advice][prefetch] error", e);
          } finally {
            finished = true;
            activeGenerations.delete(userId);
          }
        })();
        activeGenerations.set(userId, genPromise);
        // Watchdog
        setTimeout(() => {
          if (!finished && Date.now() - startedAt >= PREFETCH_MAX_MS) {
            console.warn(`[advice][prefetch][watchdog] excedido ${PREFETCH_MAX_MS}ms -> liberando slot y guardando fallback mínimo`);
            activeGenerations.delete(userId);
            // Generar y cachear fallback mínimo para evitar que el cliente siga polling sin resultado
            (async () => {
              try {
                const fb = await generateFallbackContent();
                const extract = (label, txt) => null; // no necesitamos parsear, sólo cachear texto + summary local
                const localSummary = buildLocalSummary();
                const meals = { items: [] };
                const hydration = { litros: 2 };
                const beveragesPlan = null;
                if (currentHash) {
                  await prisma.usuario.update({ where: { id: userId }, data: { plan_ai: { advice: fb.content, summary: localSummary, meals, hydration, beverages: beveragesPlan, hash: currentHash, model: fb.usedModel, generated_ms: fb.genMs, ts: new Date().toISOString() } } });
                }
              } catch (e) { console.error('[advice][watchdog][fallback-cache] error', e); }
            })();
          }
        }, PREFETCH_MAX_MS + 50);
      }
      return NextResponse.json({ started: true }, { status: 202 });
    }

    // Si hay una generación activa (iniciada vía prefetch) evitar trabajo duplicado y avisar al cliente
    if (activeGenerations.has(userId) && !forceLong) {
      return NextResponse.json({ pending: true }, { status: 202 });
    }

  const prompt = basePrompt; // El contenido completo ya está en basePrompt, evitar duplicar texto crudo aquí
  // --- FIN prompt residual eliminado ---
  // Continuar con generación usando "prompt" (toda la lógica de instrucciones ya está incluida en basePrompt previamente)
  // BLOQUE DUPLICADO DE INSTRUCCIONES ELIMINADO (antes causaba error de parseo)

    // Use AI SDK to generate text (the provider reads GOOGLE_GENERATIVE_AI_API_KEY from env)
    async function runModel(modelName, fullPrompt) {
      console.log(`[advice] Intentando usar modelo: ${modelName}`);
      console.log(`[advice] API Key configurada: ${process.env.GOOGLE_GENERATIVE_AI_API_KEY ? 'SÍ' : 'NO'}`);
      console.log(`[advice] Longitud API Key: ${process.env.GOOGLE_GENERATIVE_AI_API_KEY?.length || 0}`);

      // Verificar si hay API key configurada
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.error("[advice] GOOGLE_GENERATIVE_AI_API_KEY no configurada");
        throw new Error("API key no configurada");
      }

      try {
        const result = await generateText({
          model: google(modelName),
          prompt: fullPrompt,
          temperature: 0.7,
          maxTokens: 8192,
        });
        console.log(`[advice] Modelo ${modelName} respondió correctamente`);
        return result;
      } catch (error) {
        console.error(`[advice] Error con modelo ${modelName}:`, error.message);
        console.error(`[advice] Error completo:`, error);
        throw error;
      }
    }

  // Preparar prompt final para esta solicitud
  const MAIN_PROMPT = `Eres un experto en nutrición y entrenamiento, preciso y claro.\n\n${effectivePrompt}`;

    async function withTimeout(promise, ms) {
      let to;
      const timeout = new Promise((_, rej) => { to = setTimeout(() => rej(new Error("timeout")), ms); });
      return Promise.race([promise, timeout]).finally(() => clearTimeout(to));
    }

  let content = null;
  let usedModel = GEMINI_MODEL_LONG; // será reemplazado por flash si estrategia flash-first
  let genMs = null; // tiempo de generación (se setea al final si no hubo fallback previo)
  let mainPhase = 'init';
    const t0 = Date.now();
    try {
      if (forceLong && !FAST_MODE) {
        const resLongFirst = await withTimeout(runModel(GEMINI_MODEL_LONG, MAIN_PROMPT), ADVICE_LONG_TIMEOUT_MS);
        content = resLongFirst.text; usedModel = GEMINI_MODEL_LONG;
      } else {
        // Flash-first
        try {
          mainPhase = 'flash-primary';
          const resFlash = await withTimeout(runModel(GEMINI_MODEL_FALLBACK, MAIN_PROMPT), ADVICE_FLASH_TIMEOUT_MS);
          content = resFlash.text; usedModel = GEMINI_MODEL_FALLBACK;
        } catch (eFlash) {
          if (!FAST_MODE) {
            // Intentar long
            try {
              mainPhase = 'long-after-flash-fail';
              const resLong = await withTimeout(runModel(GEMINI_MODEL_LONG, MAIN_PROMPT), ADVICE_LONG_TIMEOUT_MS);
              content = resLong.text; usedModel = GEMINI_MODEL_LONG;
            } catch (eLong) {
              // Prompt reducido
              const shortPrompt = MAIN_PROMPT + "\n\n(Genera solo los bloques JSON pedidos y muy conciso.)";
              try {
                mainPhase = 'short-after-long-fail';
                const resShort = await withTimeout(runModel(GEMINI_MODEL_FALLBACK, shortPrompt), ADVICE_FALLBACK_TIMEOUT_MS);
                content = resShort.text; usedModel = GEMINI_MODEL_FALLBACK + "-short";
              } catch (eShort) {
                mainPhase = 'local-fallback';
                const fb = await generateFallbackContent();
                content = fb.content; usedModel = fb.usedModel; genMs = fb.genMs;
              }
            }
          } else {
            // Fast mode, solo short y fallback local
            const shortPrompt = MAIN_PROMPT + "\n\n(Genera solo los bloques JSON pedidos y muy conciso.)";
            try {
              mainPhase = 'short-fast';
              const resShortFast = await withTimeout(runModel(GEMINI_MODEL_FALLBACK, shortPrompt), ADVICE_FALLBACK_TIMEOUT_MS);
              content = resShortFast.text; usedModel = GEMINI_MODEL_FALLBACK + "-short";
            } catch (eShortFast) {
              mainPhase = 'local-fallback-fast';
              const fbFast = await generateFallbackContent();
              content = fbFast.content; usedModel = fbFast.usedModel; genMs = fbFast.genMs;
            }
          }
        }
      }
    } catch (e) {
      // Timeout o error -> intentar fallback más rápido con prompt reducido
      try {
        mainPhase = 'catch-short-attempt';
  const shortPrompt = MAIN_PROMPT + "\n\n(Genera solo los bloques JSON pedidos y un breve análisis; sé conciso.)";
  const res2 = await withTimeout(runModel(GEMINI_MODEL_FALLBACK, shortPrompt), ADVICE_FALLBACK_TIMEOUT_MS);
        content = res2.text;
        usedModel = GEMINI_MODEL_FALLBACK;
      } catch (e2) {
        mainPhase = 'catch-local-fallback';
        // Fallback final: generar estructura mínima sin IA (para debug)
        const fallbackResult = await generateFallbackContent();
        content = fallbackResult.content;
        usedModel = fallbackResult.usedModel;
        // Usar el valor del fallback
        genMs = fallbackResult.genMs;
      }
    }
  genMs = genMs ?? (Date.now() - t0);

  // Intentar extraer JSON_SUMMARY, JSON_MEALS y JSON_HYDRATION del contenido de manera robusta
    let summary = null;
    let meals = null;
  let hydration = null;
  let beveragesPlan = null;
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
  const bObj = extractJsonBlock('JSON_BEVERAGES', content);
  if (bObj && typeof bObj === 'object') beveragesPlan = bObj;
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

    // Si no se pudo extraer summary o viene vacío, construir uno local
    if (!summary || typeof summary !== 'object' || Object.keys(summary).length === 0) {
      const localSummary = buildLocalSummary();
      if (localSummary) summary = localSummary;
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

    // Fallback / generación de plan de bebidas (solo infusiones / bebidas, NUNCA agua) si IA no lo provee o es inválido
    try {
      if (!beveragesPlan || !Array.isArray(beveragesPlan.items) || beveragesPlan.items.length === 0) {
        const bevPrefsRaw = Array.isArray(prefs?.beverages) ? prefs.beverages : [];
        // Excluir agua explícita y duplicados
        const bevPrefs = [...new Set(
          bevPrefsRaw
            .map(v => (v || '').toString().trim())
            .filter(v => v && !/^agua(\b|\s|$)/i.test(v))
        )].slice(0, 8);
        if (bevPrefs.length) {
          // Generar porciones simbólicas (no intentamos cubrir hidratación total). 100–250 ml c/ bebida.
          let items = bevPrefs.map(v => ({ nombre: v, ml:  Math.min(250, Math.max(80, 150)), momento: 'General' }));
          // Limitar a máximo 2 bebidas
          if (items.length > 2) items = items.slice(0,2);
          beveragesPlan = { items };
        } else {
          beveragesPlan = null; // sin bebidas si solo habría agua
        }
      } else {
        // Sanitizar: asegurar números y nombre
        beveragesPlan.items = beveragesPlan.items
          .map((x) => ({ nombre: (x?.nombre || '').toString().trim() || 'Bebida', ml: Math.max(50, Math.min(250, Math.round(Number(x?.ml) || 0))), momento: /desayuno|almuerzo|cena|snack/i.test(x?.momento || '') ? x.momento : 'General' }))
          // Excluir agua del plan de bebidas
          .filter((x) => x.ml && x.nombre && !/^agua(\b|\s|$)/i.test(x.nombre));
        if (!beveragesPlan.items.length) {
          beveragesPlan = null;
        } else {
          // Limitar a máximo 2, priorizando momentos distintos
          const pickTwo = (arr) => {
            const out = [];
            const moments = new Set();
            for (const it of arr) {
              if (!moments.has((it.momento||'').toLowerCase())) {
                out.push(it);
                moments.add((it.momento||'').toLowerCase());
              }
              if (out.length === 2) break;
            }
            if (out.length < 2) {
              for (const it of arr) {
                if (out.length === 2) break;
                if (!out.includes(it)) out.push(it);
              }
            }
            return out;
          };
          beveragesPlan.items = pickTwo(beveragesPlan.items);
        }
      }
    } catch {}

    // Adjuntar variantes si existen
    if (meals && mealsVariants) {
      try { meals.variants = mealsVariants; } catch {}
    }

    // Persistir en cache si generación fue exitosa (no fallback minimal) y hay hash
    try {
      if (currentHash && meals && summary && content) {
        const cacheObj = { advice: content, summary, meals, hydration, beverages: beveragesPlan, hash: currentHash, model: usedModel, generated_ms: genMs, ts: new Date().toISOString() };
        await prisma.usuario.update({ where: { id: userId }, data: { plan_ai: cacheObj } });
      }
    } catch {}

  const isFallback = (usedModel || '').startsWith('fallback');
  const baseResponse = { advice: content, summary, meals, hydration, beverages: beveragesPlan, model: usedModel, took_ms: genMs, fallback: isFallback };
  if (debugMode) {
    baseResponse.debug = { mainPhase, content_chars: content ? content.length : 0, wantTypesOrder, forceLong, FAST_MODE };
    if (debugPromptOnly) {
      baseResponse.debug.prompt = MAIN_PROMPT; // incluir el prompt completo si se pide
    }
  } else if (debugPromptOnly) {
    baseResponse.debug = { prompt: MAIN_PROMPT };
  }
  if (showPrompt && !baseResponse.debug) {
    baseResponse.debug = { prompt: MAIN_PROMPT };
  } else if (showPrompt && baseResponse.debug && !baseResponse.debug.prompt) {
    baseResponse.debug.prompt = MAIN_PROMPT;
  }
  return NextResponse.json(baseResponse, { status: 200 });
  } catch (e) {
    console.error("/api/account/advice error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}