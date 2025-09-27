import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";
import { getToken } from "next-auth/jwt";

function getCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

async function getUserIdFromRequest(request) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (secret) {
    try {
      const nt = await getToken({ req: request, secret });
      if (nt?.email) {
        const auth = await prisma.auth.findUnique({ where: { email: nt.email.toLowerCase() } });
        if (auth?.usuarioId) return auth.usuarioId;
      }
    } catch {}
  }
  try {
    const cookieName = getCookieName();
    const token = request.cookies.get(cookieName)?.value;
    const legacySecret = process.env.AUTH_SECRET;
    if (!token || !legacySecret) return null;
    const decoded = jwt.verify(token, legacySecret);
    return parseInt(decoded.sub, 10);
  } catch {
    return null;
  }
}

function isHHMM(v) {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
}

function isSnackVariant(t) {
  const s = String(t || "").toLowerCase();
  return /snack/.test(s) && (/manana|mañana|tarde/.test(s) || s !== "snack");
}

function baseSnackTipo() {
  return "Snack";
}

// GET: devuelve horarios actuales por comida desde overrides.hora
export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [plans, user] = await Promise.all([
      prisma.planComida.findMany({
      where: { usuarioId: userId },
      select: { comida_tipo: true, overrides: true },
      orderBy: { comida_tipo: "asc" },
    }),
      prisma.usuario.findUnique({ where: { id: userId }, select: { preferencias_alimentos: true } }),
    ]);
    const schedule = {};
    for (const p of plans) {
      const hora = p?.overrides?.hora;
      if (isHHMM(hora)) schedule[p.comida_tipo] = hora;
    }
    // Merge fallbacks from preferencias_alimentos.mealHours
    try {
      let prefs = user?.preferencias_alimentos || null;
      if (prefs && typeof prefs === "string") {
        try { prefs = JSON.parse(prefs); } catch { prefs = null; }
      }
      const mh = prefs && typeof prefs === "object" ? prefs.mealHours : null;
      if (mh && typeof mh === "object") {
        try { console.log("[schedule][GET] mealHours desde prefs:", mh); } catch {}
        const getAny = (...keys) => {
          for (const k of keys) {
            if (k in mh && isHHMM(mh[k])) return mh[k];
            const lower = String(k).toLowerCase();
            const cand = Object.keys(mh).find((kk) => String(kk).toLowerCase() === lower);
            if (cand && isHHMM(mh[cand])) return mh[cand];
          }
          return null;
        };
        // Tipos base
        const types = ["Desayuno", "Almuerzo", "Cena"]; 
        for (const t of types) {
          if (!schedule[t]) {
            const h = getAny(t);
            if (h) schedule[t] = h;
          }
        }
        // Snack: elegir mejor candidato entre variantes o Snack genérico
        if (!schedule["Snack"]) {
          const candidates = [];
          const pushIf = (k) => { const v = getAny(k); if (v) candidates.push(v); };
          pushIf("Snack");
          pushIf("Snack_manana"); pushIf("Snack_mañana"); pushIf("Snack mañana");
          pushIf("Snack_tarde"); pushIf("Snack tarde");
          if (candidates.length) {
            // elegir la más temprana lexicográficamente (HH:MM)
            candidates.sort();
            schedule["Snack"] = candidates[0];
          }
        }
        // Copiar todas las claves válidas de mealHours si aún no están en schedule
        try {
          for (const [k, v] of Object.entries(mh)) {
            if (!isHHMM(v)) continue;
            if (!(k in schedule)) {
              schedule[k] = v;
            }
          }
        } catch {}
      }
      // Fallback adicional: si sigue vacío y hay enabledMeals, usar horas sugeridas
      if (Object.keys(schedule).length === 0) {
        const enabled = prefs && typeof prefs === 'object' ? prefs.enabledMeals : null;
        if (enabled && typeof enabled === 'object') {
          const SUGG = {
            Desayuno: "08:00",
            Snack_manana: "10:30",
            Almuerzo: "13:30",
            Snack_tarde: "16:30",
            Cena: "20:00",
          };
          const map = {
            desayuno: "Desayuno",
            snack_manana: "Snack_manana",
            almuerzo: "Almuerzo",
            snack_tarde: "Snack_tarde",
            cena: "Cena",
          };
          for (const [k, v] of Object.entries(enabled)) {
            if (!v) continue;
            const key = map[k] || k;
            const hh = SUGG[key];
            if (isHHMM(hh)) schedule[key] = hh;
          }
        }
      }
    } catch {}
    try { console.log("[schedule][GET] schedule final:", schedule); } catch {}
    return NextResponse.json({ schedule });
  } catch (e) {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// POST: body { tipo: "Desayuno"|"Almuerzo"|"Cena"|"Snack", hora: "HH:MM" }
// Actualiza overrides.hora del registro PlanComida del tipo indicado
export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const inputTipo = body?.tipo;
    const hora = body?.hora;
    if (!inputTipo || !hora || !isHHMM(hora)) {
      return NextResponse.json({ error: "tipo y hora (HH:MM) son requeridos" }, { status: 400 });
    }

    // Intentar actualizar PlanComida para el tipo proporcionado; si no existe, probar con tipo base Snack
    const tries = [String(inputTipo), isSnackVariant(inputTipo) ? baseSnackTipo() : null].filter(Boolean);
    let updated = false;
    for (const tipo of tries) {
      try {
        const current = await prisma.planComida.findUnique({
          where: { usuarioId_comida_tipo: { usuarioId: userId, comida_tipo: tipo } },
          select: { overrides: true },
        });
        if (!current) continue;
        const overrides = (current.overrides && typeof current.overrides === "object") ? current.overrides : {};
        overrides.hora = hora;
        await prisma.planComida.update({
          where: { usuarioId_comida_tipo: { usuarioId: userId, comida_tipo: tipo } },
          data: { overrides },
        });
        updated = true;
        break;
      } catch (e) {
        // si falla, intentaremos persistir en preferencias
      }
    }

    if (updated) return NextResponse.json({ ok: true });

    // Guardar en preferencias si no se pudo actualizar/crear PlanComida
    try {
      const user = await prisma.usuario.findUnique({ where: { id: userId }, select: { preferencias_alimentos: true } });
      const prefs = (user?.preferencias_alimentos && typeof user.preferencias_alimentos === "object") ? user.preferencias_alimentos : {};
      const mh = (prefs.mealHours && typeof prefs.mealHours === "object") ? prefs.mealHours : {};
      mh[String(inputTipo)] = hora;
      prefs.mealHours = mh;
      await prisma.usuario.update({ where: { id: userId }, data: { preferencias_alimentos: prefs } });
      return NextResponse.json({ ok: true, pending: true });
    } catch (e) {
      // Último recurso: error de servidor
      return NextResponse.json({ error: "No se pudo persistir el horario" }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
