import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getToken } from "next-auth/jwt";
import jwt from "jsonwebtoken"; // legacy fallback

async function resolveUserId(req) {
  // 1) NextAuth token with internal userId or email
  try {
    const token = await getToken({ req });
    if (token) {
      if (token.userId != null) {
        const n = Number(token.userId); if (Number.isFinite(n)) return n;
      }
      const raw = token.id || token.sub;
      if (raw && String(raw).length > 15 && token.email) {
        // large external id -> lookup by email
        try {
          const auth = await prisma.auth.findUnique({ where: { email: String(token.email).toLowerCase() }, select: { usuarioId: true } });
            if (auth?.usuarioId) return auth.usuarioId;
        } catch {}
      } else if (raw) {
        const n = Number(raw); if (Number.isFinite(n)) return n;
      }
      // As last resort: email lookup even if id not huge
      if (token.email) {
        try {
          const auth = await prisma.auth.findUnique({ where: { email: String(token.email).toLowerCase() }, select: { usuarioId: true } });
          if (auth?.usuarioId) return auth.usuarioId;
        } catch {}
      }
    }
  } catch {}
  // 2) Legacy cookie fallback
  try {
    const cookieName = process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';
    const raw = req.cookies.get(cookieName)?.value;
    const secret = process.env.AUTH_SECRET;
    if (!raw || !secret) return null;
    const decoded = jwt.verify(raw, secret);
    let val = decoded?.userId ?? decoded?.sub;
    if (val && String(val).length > 15 && decoded?.email) {
      try {
        const auth = await prisma.auth.findUnique({ where: { email: String(decoded.email).toLowerCase() }, select: { usuarioId: true } });
        if (auth?.usuarioId) return auth.usuarioId;
      } catch {}
    }
    const n = Number(val); if (Number.isFinite(n)) return n;
  } catch {}
  return null;
}

export async function GET(request) {
  try {
  const userId = await resolveUserId(request);
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
