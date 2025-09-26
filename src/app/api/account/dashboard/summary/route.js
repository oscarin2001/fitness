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

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    // Objetivos del usuario
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        kcal_objetivo: true,
        proteinas_g_obj: true,
        grasas_g_obj: true,
        carbohidratos_g_obj: true,
        agua_litros_obj: true,
        objetivo: true,
        velocidad_cambio: true,
        sexo: true,
        altura_cm: true,
        peso_kg: true,
        fecha_nacimiento: true,
        nivel_actividad: true,
        plan_ai: true,
      },
    });

    // Consumo de hoy
    const comidas = await prisma.comida.findMany({
      where: { usuarioId: userId, fecha: { gte: start, lte: end } },
      select: { calorias: true, proteinas: true, grasas: true, carbohidratos: true },
    });

    const totals = comidas.reduce(
      (acc, c) => ({
        calorias: acc.calorias + (c.calorias || 0),
        proteinas: acc.proteinas + (c.proteinas || 0),
        grasas: acc.grasas + (c.grasas || 0),
        carbohidratos: acc.carbohidratos + (c.carbohidratos || 0),
      }),
      { calorias: 0, proteinas: 0, grasas: 0, carbohidratos: 0 }
    );

    // Hidratación de hoy
    const todayHydration = await prisma.hidratacionDia.findFirst({
      where: { usuarioId: userId, fecha: { gte: start, lte: end } },
      select: { litros: true, completado: true },
    });

    // Normalizador simple de números desde strings ("2637 kcal/día")
    const num = (n) => {
      if (typeof n === 'number' && Number.isFinite(n)) return n;
      if (typeof n === 'string') {
        const m = n.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
        if (m) { const v = Number(m[0]); return Number.isFinite(v) ? v : null; }
      }
      const v = Number(n);
      return Number.isFinite(v) ? v : null;
    };

    let objetivos = {
      kcal: usuario?.kcal_objetivo ?? null,
      proteinas: usuario?.proteinas_g_obj ?? null,
      grasas: usuario?.grasas_g_obj ?? null,
      carbohidratos: usuario?.carbohidratos_g_obj ?? null,
      agua_litros: usuario?.agua_litros_obj ?? null,
    };

    // Si faltan valores, intentar completar desde plan_ai.summary
    try {
      const s = usuario?.plan_ai?.summary || null;
      if (s && (objetivos.kcal == null || objetivos.proteinas == null || objetivos.grasas == null || objetivos.carbohidratos == null)) {
        const tdee = num(s.tdee) ?? num(s.TDEE) ?? num(s.tdee_kcal) ?? num(s.TDEE_kcal) ?? null;
        const kcal_obj = num(s.kcal_objetivo) ?? num(s.kcal) ?? num(s.calorias) ?? num(s.calorias_objetivo) ?? null;
        let def = num(s.deficit_superavit_kcal) ?? num(s.deficit_kcal) ?? num(s.superavit_kcal) ?? num(s.deficit) ?? null;
        const p = num(s.proteinas_g) ?? num(s.proteina_g) ?? num(s.proteinas) ?? num(s.protein_g) ?? null;
        let g = num(s.grasas_g) ?? num(s.grasas) ?? num(s.fat_g) ?? num(s.grasas_diarias_g) ?? null;
        let c = num(s.carbohidratos_g) ?? num(s.carbohidratos) ?? num(s.carbs_g) ?? num(s.carbohidratos_diarios_g) ?? null;

        let kcal = objetivos.kcal ?? kcal_obj ?? null;
        // 1) kcal desde TDEE y déficit/superávit explícito
        if (kcal == null && tdee != null && def != null) kcal = Math.round(tdee - def);
        // 1b) kcal desde macros si están los 3
        if (kcal == null && p != null && g != null && c != null) kcal = Math.max(0, Math.round(p*4 + g*9 + c*4));
        // 1c) kcal inferido desde TDEE y objetivo si falta def
        if (kcal == null && tdee != null) {
          const objetivoTxt = String(usuario?.objetivo || '').toLowerCase();
          const velTxt = String(usuario?.velocidad_cambio || '').toLowerCase();
          let delta = 0;
          if (objetivoTxt.includes('bajar') || objetivoTxt.includes('grasa')) {
            if (velTxt.includes('lento') || velTxt.includes('suave')) delta = -250;
            else if (velTxt.includes('medio') || velTxt.includes('moderad')) delta = -350;
            else if (velTxt.includes('rap') || velTxt.includes('ráp')) delta = -500;
            else delta = -350;
          } else if (objetivoTxt.includes('ganar') || objetivoTxt.includes('mus')) {
            if (velTxt.includes('lento') || velTxt.includes('suave')) delta = 150;
            else if (velTxt.includes('medio') || velTxt.includes('moderad')) delta = 250;
            else if (velTxt.includes('rap') || velTxt.includes('ráp')) delta = 350;
            else delta = 250;
          }
          def = def ?? delta;
          kcal = Math.max(0, Math.round(tdee + delta));
        }

        // 2) Completar grasas 25% y carbos como resto
        if (g == null && kcal != null) g = Math.max(0, Math.round((kcal * 0.25)/9));
        if (c == null && kcal != null && p != null && g != null) c = Math.max(0, Math.round((kcal - (p*4) - (g*9))/4));

        objetivos = {
          kcal: objetivos.kcal ?? kcal ?? null,
          proteinas: objetivos.proteinas ?? (p ?? null),
          grasas: objetivos.grasas ?? (g ?? null),
          carbohidratos: objetivos.carbohidratos ?? (c ?? null),
          agua_litros: objetivos.agua_litros,
        };
      }
    } catch {}

    // Si aún faltan kcal/grasas/carbos, inferir desde perfil del usuario (TMB/TDEE)
    try {
      if (objetivos.kcal == null || objetivos.grasas == null || objetivos.carbohidratos == null) {
        const peso = typeof usuario?.peso_kg === 'number' ? usuario.peso_kg : null;
        const altura = typeof usuario?.altura_cm === 'number' ? usuario.altura_cm : null;
        const fNac = usuario?.fecha_nacimiento ? new Date(usuario.fecha_nacimiento) : null;
        let edad = null;
        if (fNac && !isNaN(fNac.getTime())) {
          const now = new Date();
          edad = Math.floor((now.getTime() - fNac.getTime()) / (365.25 * 24 * 3600 * 1000));
        }
        let tmb = null;
        if (peso && altura && edad != null && usuario?.sexo) {
          if (String(usuario.sexo).toLowerCase().startsWith('m')) {
            tmb = 10 * peso + 6.25 * altura - 5 * edad + 5;
          } else {
            tmb = 10 * peso + 6.25 * altura - 5 * edad - 161;
          }
        }
        const actividad = String(usuario?.nivel_actividad || '').toLowerCase();
        const actFactor = actividad.includes('alto') ? 1.55 : actividad.includes('moder') ? 1.45 : actividad.includes('lig') ? 1.35 : 1.25;
        const tdee = tmb ? tmb * actFactor : null;

        if (tdee != null) {
          const objetivoTxt = String(usuario?.objetivo || '').toLowerCase();
          const velTxt = String(usuario?.velocidad_cambio || '').toLowerCase();
          let delta = 0;
          if (objetivoTxt.includes('bajar') || objetivoTxt.includes('grasa')) {
            if (velTxt.includes('lento') || velTxt.includes('suave')) delta = -250;
            else if (velTxt.includes('medio') || velTxt.includes('moderad')) delta = -350;
            else if (velTxt.includes('rap') || velTxt.includes('ráp')) delta = -500;
            else delta = -350;
          } else if (objetivoTxt.includes('ganar') || objetivoTxt.includes('mus')) {
            if (velTxt.includes('lento') || velTxt.includes('suave')) delta = 150;
            else if (velTxt.includes('medio') || velTxt.includes('moderad')) delta = 250;
            else if (velTxt.includes('rap') || velTxt.includes('ráp')) delta = 350;
            else delta = 250;
          }
          const kcalInf = Math.max(0, Math.round(tdee + delta));
          const kcal = objetivos.kcal ?? kcalInf;
          let g = objetivos.grasas;
          let c = objetivos.carbohidratos;
          if (g == null && kcal != null) g = Math.max(0, Math.round((kcal * 0.25) / 9));
          if (c == null && kcal != null && objetivos.proteinas != null && g != null) {
            c = Math.max(0, Math.round((kcal - (objetivos.proteinas * 4) - (g * 9)) / 4));
          }
          objetivos = {
            ...objetivos,
            kcal: kcal ?? objetivos.kcal ?? null,
            grasas: g ?? null,
            carbohidratos: c ?? null,
          };
        }
      }
    } catch {}

    const restantes = objetivos.kcal != null
      ? Math.max(0, objetivos.kcal - totals.calorias)
      : null;

    const macrosRestantes = {
      proteinas: objetivos.proteinas != null ? Math.max(0, objetivos.proteinas - totals.proteinas) : null,
      grasas: objetivos.grasas != null ? Math.max(0, objetivos.grasas - totals.grasas) : null,
      carbohidratos: objetivos.carbohidratos != null ? Math.max(0, objetivos.carbohidratos - totals.carbohidratos) : null,
    };

    return NextResponse.json({
      objetivos,
      consumidos: totals,
      kcal_restantes: restantes,
      macros_restantes: macrosRestantes,
      hidratacion: {
        hoy_litros: todayHydration?.litros ?? 0,
        objetivo_litros: objetivos.agua_litros ?? null,
        completado: todayHydration?.completado ?? false,
      },
    });
  } catch (e) {
    console.error("/api/account/dashboard/summary error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
