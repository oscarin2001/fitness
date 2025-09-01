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
    if (!token) return null;
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

    const user = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { measurement_interval_weeks: true },
    });
    return NextResponse.json({ weeks: user?.measurement_interval_weeks ?? null }, { status: 200 });
  } catch (e) {
    console.error("/api/account/profile/measurement-interval GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const userIdRaw = await getUserIdFromRequest(request);
    const userId = Number(userIdRaw);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const weeks = Number(body?.weeks);
    if (![2,3,4].includes(weeks)) {
      return NextResponse.json({ error: "Valor inválido (2,3,4)" }, { status: 400 });
    }

    await prisma.usuario.update({
      where: { id: userId },
      data: { measurement_interval_weeks: weeks },
    });
    return NextResponse.json({ ok: true, weeks }, { status: 200 });
  } catch (e) {
    console.error("/api/account/profile/measurement-interval POST error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
