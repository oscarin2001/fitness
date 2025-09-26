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
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const summary = body?.summary || null;
    const advice = body?.advice || null;
    const beverages = Array.isArray(body?.beverages) ? body.beverages : null; // [{nombre, ml, momento}]
    const weekly = Array.isArray(body?.weekly) ? body.weekly : null; // vista semanal final [{ day, active, meals: [...] }]
    const aguaLitros = body?.agua_litros_obj;

    const data = {};
    if (summary && typeof summary === "object") {
      const kcal = Number(summary.kcal_objetivo);
      const prot = Number(summary.proteinas_g);
      let grasas = Number(summary.grasas_g);
      let carbos = Number(summary.carbohidratos_g);
      if (Number.isFinite(kcal) && kcal > 0) {
        if (!Number.isFinite(grasas) || grasas <= 0) {
          grasas = Math.max(0, Math.round((kcal * 0.25) / 9));
        }
        if (!Number.isFinite(carbos) || carbos <= 0) {
          if (Number.isFinite(prot) && prot > 0) {
            carbos = Math.max(0, Math.round((kcal - (prot * 4) - (grasas * 9)) / 4));
          }
        }
      }
      if (Number.isFinite(kcal)) data.kcal_objetivo = kcal;
      if (Number.isFinite(prot)) data.proteinas_g_obj = prot;
      if (Number.isFinite(grasas)) data.grasas_g_obj = grasas;
      if (Number.isFinite(carbos)) data.carbohidratos_g_obj = carbos;
    }
    if (typeof aguaLitros === "number") data.agua_litros_obj = aguaLitros;

    if (advice || summary || beverages || weekly) {
      data.plan_ai = { advice: advice || null, summary: summary || null };
      if (beverages) data.plan_ai.beverages = { items: beverages };
      if (weekly) data.plan_ai.weekly = weekly;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Sin datos para aplicar" }, { status: 400 });
    }

    await prisma.usuario.update({ where: { id: userId }, data });
    return NextResponse.json({ status: "ok" });
  } catch (e) {
    console.error("/api/account/plan/apply error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
