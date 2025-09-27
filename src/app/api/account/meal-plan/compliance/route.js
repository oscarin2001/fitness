import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { getToken } from "next-auth/jwt";
import jwt from "jsonwebtoken"; // legacy

async function resolveUserId(req) {
  try {
    const token = await getToken({ req });
    if (token) {
      if (token.userId != null) {
        const n = Number(token.userId);
        if (Number.isFinite(n)) return n;
      }
      const raw = token.id || token.sub;
      if (raw && String(raw).length > 15 && token.email) {
        try {
          const auth = await prisma.auth.findUnique({ where: { email: String(token.email).toLowerCase() }, select: { usuarioId: true } });
          if (auth?.usuarioId) return auth.usuarioId;
        } catch {}
      } else if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
      }
    }
  } catch {}
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
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  } catch {}
  return null;
}

export async function GET(request) {
  try {
  const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date"); // YYYY-MM-DD
    // Parse robusto: aceptar YYYY-MM-DD y construir fecha local
    function parseLocalDate(s) {
      if (!s || s === 'YYYY-MM-DD') return new Date();
      // Intento 1: constructor nativo
      const d1 = new Date(s);
      if (!isNaN(d1.getTime())) return d1;
      // Intento 2: split
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
      if (m) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10) - 1;
        const da = parseInt(m[3], 10);
        const d = new Date(y, mo, da, 0, 0, 0, 0);
        if (!isNaN(d.getTime())) return d;
      }
      return new Date();
    }
    const date = parseLocalDate(dateStr);
    const start = new Date(date); start.setHours(0,0,0,0);
    const end = new Date(date); end.setHours(23,59,59,999);

    try {
      const rows = await prisma.cumplimientoComida.findMany({
        where: { usuarioId: userId, fecha: { gte: start, lte: end } },
        orderBy: { comida_tipo: "asc" },
      });
      return NextResponse.json({ items: rows });
    } catch (dbErr) {
      // Soft-fail: si hay un problema con Prisma o la tabla, no rompas el dashboard
      try { console.error("[compliance][GET] prisma error", dbErr); } catch {}
      return NextResponse.json({ items: [], warning: "compliance_db_unavailable" });
    }
  } catch (e) {
    try { console.error("[compliance][GET] error", e); } catch {}
    // Soft-fail general
    return NextResponse.json({ items: [], warning: "compliance_error" });
  }
}

export async function POST(request) {
  try {
  const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const tipo = body?.tipo; // ComidaTipo
    const cumplido = !!body?.cumplido;
    const dateStr = body?.date; // YYYY-MM-DD opcional, default hoy
    const horaStr = body?.hora; // HH:MM opcional
    const date = dateStr ? new Date(dateStr) : new Date();
    const start = new Date(date); start.setHours(0,0,0,0);

    if (!tipo) return NextResponse.json({ error: "tipo requerido" }, { status: 400 });

    // Construir hora_real si viene HH:MM
    let hora_real = null;
    if (typeof horaStr === "string" && /^\d{2}:\d{2}$/.test(horaStr)) {
      const [h, m] = horaStr.split(":" ).map((v) => parseInt(v, 10));
      const dt = new Date(start);
      dt.setHours(h, m, 0, 0);
      hora_real = dt;
    }

    // Validación: si se marca cumplido, la hora es obligatoria
    if (cumplido && hora_real == null) {
      return NextResponse.json({ error: "Hora (HH:MM) requerida cuando se marca como cumplido" }, { status: 400 });
    }

    // Upsert por clave única compuesta (usuarioId, fecha, comida_tipo)
    // Nota: solo incluimos hora_real si no es null para evitar errores
    // cuando la migración aún no ha sido aplicada y el cliente Prisma no conoce el campo
    let up;
    try {
      const updateData = { cumplido, ...(hora_real != null ? { hora_real } : {}) };
      const createData = { usuarioId: userId, fecha: start, comida_tipo: tipo, cumplido, ...(hora_real != null ? { hora_real } : {}) };
      up = await prisma.cumplimientoComida.upsert({
        where: {
          usuarioId_fecha_comida_tipo: { usuarioId: userId, fecha: start, comida_tipo: tipo },
        },
        update: updateData,
        create: createData,
      });
    } catch (err) {
      // Fallback: buscar primero y actualizar/crear manualmente
      const existing = await prisma.cumplimientoComida.findFirst({
        where: { usuarioId: userId, fecha: start, comida_tipo: tipo },
        orderBy: { id: "desc" },
      });
      const updateData = { cumplido, ...(hora_real != null ? { hora_real } : {}) };
      const createData = { usuarioId: userId, fecha: start, comida_tipo: tipo, cumplido, ...(hora_real != null ? { hora_real } : {}) };
      if (existing) {
        up = await prisma.cumplimientoComida.update({ where: { id: existing.id }, data: updateData });
      } else {
        up = await prisma.cumplimientoComida.create({ data: createData });
      }
    }

    return NextResponse.json({ item: up });
  } catch (e) {
    console.error("/api/account/meal-plan/compliance error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
