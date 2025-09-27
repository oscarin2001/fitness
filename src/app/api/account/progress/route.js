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
    if (!token || !process.env.AUTH_SECRET) return null;
    const payload = jwt.verify(token, process.env.AUTH_SECRET);
    return payload?.userId || payload?.sub || null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const userIdRaw = await getUserIdFromRequest(request);
    const userId = Number(userIdRaw);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(90, Math.max(1, Number(searchParams.get("limit") || 12)));

    const items = await prisma.progresoCorporal.findMany({
      where: { usuarioId: Number(userId) },
      orderBy: { fecha: "desc" },
      take: limit,
    });

    return NextResponse.json({ items }, { status: 200 });
  } catch (e) {
    console.error("/api/account/progress GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const userIdRaw = await getUserIdFromRequest(request);
    const userId = Number(userIdRaw);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const payload = {
      peso_kg: body.peso_kg != null ? Number(body.peso_kg) : undefined,
      grasa_percent: body.grasa_percent != null ? Number(body.grasa_percent) : undefined,
      musculo_percent: body.musculo_percent != null ? Number(body.musculo_percent) : undefined,
      agua_percent: body.agua_percent != null ? Number(body.agua_percent) : undefined,
      imc: body.imc != null ? Number(body.imc) : undefined,
      cintura_cm: body.cintura_cm != null ? Number(body.cintura_cm) : undefined,
      cadera_cm: body.cadera_cm != null ? Number(body.cadera_cm) : undefined,
      cuello_cm: body.cuello_cm != null ? Number(body.cuello_cm) : undefined,
      pecho_cm: body.pecho_cm != null ? Number(body.pecho_cm) : undefined,
      brazo_cm: body.brazo_cm != null ? Number(body.brazo_cm) : undefined,
      muslo_cm: body.muslo_cm != null ? Number(body.muslo_cm) : undefined,
      gluteo_cm: body.gluteo_cm != null ? Number(body.gluteo_cm) : undefined,
      foto_url: body.foto_url != null ? String(body.foto_url) : undefined,
      notas: body.notas != null ? String(body.notas) : undefined,
      fuente: body.fuente != null ? String(body.fuente) : undefined,
    };

    // Validaciones básicas
    if (payload.peso_kg != null && (payload.peso_kg <= 0 || payload.peso_kg > 400)) {
      return NextResponse.json({ error: "Peso inválido" }, { status: 400 });
    }

    // Fecha: si viene en body.fecha (YYYY-MM-DD), usar esa; si no, hoy.
    const dateStr = typeof body.fecha === "string" ? body.fecha : null;
    const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    const dayStart = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const dayEnd = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);

    // Upsert del día
    const existing = await prisma.progresoCorporal.findFirst({
      where: { usuarioId: Number(userId), fecha: { gte: dayStart, lt: dayEnd } },
    });

    let result;
    if (existing) {
      result = await prisma.progresoCorporal.update({
        where: { id: existing.id },
        data: { ...payload },
      });
    } else {
      result = await prisma.progresoCorporal.create({
        data: {
          usuarioId: Number(userId),
          fecha: dayStart,
          ...payload,
        },
      });
    }

    // Actualizar el peso del usuario si vino en el payload
    if (payload.peso_kg != null) {
      try {
        await prisma.usuario.update({ where: { id: Number(userId) }, data: { peso_kg: payload.peso_kg } });
      } catch {}
    }

    return NextResponse.json({ ok: true, item: result }, { status: 200 });
  } catch (e) {
    console.error("/api/account/progress POST error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
