import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { resolveUserId } from "@/lib/auth/resolveUserId";

export async function GET(request) {
  try {
  const userIdRaw = await resolveUserId(request);
    const userId = Number(userIdRaw);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const user = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        sexo: true,
        altura_cm: true,
        peso_kg: true,
        objetivo: true,
        velocidad_cambio: true,
        measurement_interval_weeks: true,
      },
    });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    return NextResponse.json({ profile: user }, { status: 200 });
  } catch (e) {
    console.error("/api/account/profile/basic GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
