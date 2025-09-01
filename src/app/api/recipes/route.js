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

    const body = await request.json();
    const nombre = String(body?.nombre || "").trim();
    const tipo = body?.tipo || null; // ComidaTipo
    const porciones = Number(body?.porciones) > 0 ? Math.floor(body.porciones) : 1;
    const ingredientes = Array.isArray(body?.ingredientes) ? body.ingredientes : [];

    if (!nombre || !tipo || ingredientes.length === 0) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // validar alimentos existen
    const alimentoIds = ingredientes.map((x) => Number(x.alimentoId)).filter((x) => Number.isInteger(x));
    const alimentos = await prisma.alimento.findMany({ where: { id: { in: alimentoIds } } });
    if (alimentos.length !== alimentoIds.length) {
      return NextResponse.json({ error: "Algunos ingredientes no existen" }, { status: 400 });
    }

    const receta = await prisma.receta.create({
      data: {
        nombre,
        tipo,
        porciones,
      },
    });

    if (ingredientes.length > 0) {
      await prisma.recetaAlimento.createMany({
        data: ingredientes.map((x) => ({
          recetaId: receta.id,
          alimentoId: Number(x.alimentoId),
          gramos: Number(x.gramos) || 0,
        })),
      });
    }

    return NextResponse.json({ id: receta.id });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo crear la receta" }, { status: 500 });
  }
}
