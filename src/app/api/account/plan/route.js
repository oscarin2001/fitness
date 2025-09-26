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

    const user = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        plan_ai: true,
        agua_litros_obj: true,
      },
    });

  const plan_ai = (user?.plan_ai && typeof user.plan_ai === 'object') ? user.plan_ai : null;
  try { console.log('[plan][GET] weekly keys:', Array.isArray(plan_ai?.weekly) ? plan_ai.weekly.map(d=>d.day) : 'none'); } catch {}
    return NextResponse.json({
      plan_ai: plan_ai || null,
      agua_litros_obj: typeof user?.agua_litros_obj === 'number' ? user.agua_litros_obj : null,
    });
  } catch (e) {
    console.error("/api/account/plan GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
