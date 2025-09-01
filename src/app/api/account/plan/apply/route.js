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
    const aguaLitros = body?.agua_litros_obj;

    const data = {};
    if (summary && typeof summary === "object") {
      if (typeof summary.kcal_objetivo === "number") data.kcal_objetivo = summary.kcal_objetivo;
      if (typeof summary.proteinas_g === "number") data.proteinas_g_obj = summary.proteinas_g;
      if (typeof summary.grasas_g === "number") data.grasas_g_obj = summary.grasas_g;
      if (typeof summary.carbohidratos_g === "number") data.carbohidratos_g_obj = summary.carbohidratos_g;
    }
    if (typeof aguaLitros === "number") data.agua_litros_obj = aguaLitros;

    if (advice || summary) {
      data.plan_ai = { advice: advice || null, summary: summary || null };
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
