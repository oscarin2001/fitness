import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";
import { getToken } from "next-auth/jwt";

function getCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

async function resolveUserId(req) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (secret) {
    try {
      const nt = await getToken({ req, secret });
      if (nt?.email) {
        const auth = await prisma.auth.findUnique({ where: { email: nt.email.toLowerCase() } });
        if (auth?.usuarioId) return auth.usuarioId;
      }
    } catch {}
  }
  try {
    const primary = getCookieName();
    const sessionToken = req.cookies?.get(primary)?.value || req.cookies?.get("authjs.session-token")?.value;
    if (!sessionToken) return null;
    if (!process.env.AUTH_SECRET) return null;
    const decoded = jwt.verify(sessionToken, process.env.AUTH_SECRET);
    const userId = parseInt(decoded.sub, 10);
    return Number.isInteger(userId) ? userId : null;
  } catch {
    return null;
  }
}

export async function POST(req) {
  try {
    const { days } = await req.json();

    if (!days || !Array.isArray(days) || days.length === 0) {
      return new Response(
        JSON.stringify({ error: "Debe seleccionar al menos un día." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }


    const userId = await resolveUserId(req);
    if (!userId) {
      console.error("Usuario no autenticado (sin token válido).");
      return new Response(
        JSON.stringify({ error: "Usuario no autenticado." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      // Normalizar días (evitar duplicados y validar nombres básicos)
      const allowed = new Set([
        "Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"
      ]);
      const clean = Array.from(new Set(days.filter(d => typeof d === 'string').map(d => d.trim()))).filter(d => allowed.has(d));
      if (clean.length === 0) {
        return new Response(
          JSON.stringify({ error: "Lista de días inválida." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      await prisma.usuario.update({
        where: { id: userId },
        data: { dias_dieta: clean, onboarding_step: "meal-days" },
      });
      // console.log("Días de dieta actualizados para el usuario:", userId);
    } catch (dbError) {
      console.error(
        "Error al actualizar los días de dieta en la base de datos:",
        dbError
      );
      return new Response(
        JSON.stringify({ error: "Error interno del servidor." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ message: "Días de dieta actualizados correctamente." }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error inesperado en el servidor:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET() {
  return new Response(
    JSON.stringify({ error: "Método no permitido." }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
}