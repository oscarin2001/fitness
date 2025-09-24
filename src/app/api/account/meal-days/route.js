import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";

export async function POST(req) {
  try {
    const { days } = await req.json();

    if (!days || !Array.isArray(days) || days.length === 0) {
      return new Response(
        JSON.stringify({ error: "Debe seleccionar al menos un día." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }


    // Usar el método estándar para obtener la cookie
    const sessionToken = req.cookies?.get("authjs.session-token")?.value;

    if (!sessionToken) {
      console.error("Token de sesión no encontrado en las cookies.");
      return new Response(
        JSON.stringify({ error: "Usuario no autenticado." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    let userId;

    try {
      const decoded = jwt.verify(sessionToken, process.env.AUTH_SECRET);
      userId = decoded.sub;
      console.log("Token decodificado correctamente:", decoded);
    } catch (error) {
      console.error("Error al verificar el token:", error);
      return new Response(
        JSON.stringify({ error: "Token inválido o expirado." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      await prisma.usuario.update({
        where: { id: userId },
        data: { dias_dieta: days },
      });
      console.log("Días de dieta actualizados para el usuario:", userId);
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