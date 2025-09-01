import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET() {
  try {
    const alimentos = await prisma.alimento.findMany({
      select: { id: true, nombre: true, categoria: true },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    });
    return NextResponse.json({ items: alimentos });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo cargar ingredientes" }, { status: 500 });
  }
}
