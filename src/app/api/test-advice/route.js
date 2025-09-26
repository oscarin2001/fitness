import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";

export async function GET(request) {
  try {
    const cookieName = process.env.NODE_ENV === "production"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    const token = request.cookies.get(cookieName)?.value;
    const secret = process.env.AUTH_SECRET;

    if (!token || !secret) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const decoded = jwt.verify(token, secret);
    const userId = parseInt(decoded.sub, 10);

    const user = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    // Generar respuesta de fallback directamente
    const fallbackSummary = {
      tmb: 0,
      tdee: 0,
      kcal_objetivo: 2000,
      deficit_superavit_kcal: 0,
      ritmo_peso_kg_sem: 0,
      proteinas_g: user.proteinas_g_obj || 120,
      grasas_g: 60,
      carbohidratos_g: 200
    };

    const fallbackMeals = {
      items: [
        {
          tipo: "Desayuno",
          nombre: "Desayuno equilibrado",
          ingredientes: [
            { nombre: "Avena", gramos: 50 },
            { nombre: "Plátano", gramos: 120 },
            { nombre: "Leche", gramos: 200 },
            { nombre: "Nueces", gramos: 20 }
          ]
        },
        {
          tipo: "Almuerzo",
          nombre: "Ensalada de pollo",
          ingredientes: [
            { nombre: "Pechuga de pollo", gramos: 150 },
            { nombre: "Lechuga", gramos: 100 },
            { nombre: "Tomate", gramos: 80 },
            { nombre: "Aceite de oliva", gramos: 15 },
            { nombre: "Quinoa", gramos: 60 }
          ]
        },
        {
          tipo: "Cena",
          nombre: "Salmón con vegetales",
          ingredientes: [
            { nombre: "Salmón", gramos: 120 },
            { nombre: "Brócoli", gramos: 150 },
            { nombre: "Zanahoria", gramos: 100 },
            { nombre: "Aceite de oliva", gramos: 10 }
          ]
        }
      ]
    };

    const fallbackAdvice = `# Consejo Personalizado - FitBalance

## ¡Bienvenido a tu plan nutricional!

Basado en tu información, hemos creado un plan personalizado para ayudarte a alcanzar tus objetivos.

## Análisis de tu perfil
- **Objetivo**: ${user.objetivo || 'Mejorar salud'}
- **Nivel de actividad**: ${user.nivel_actividad || 'Moderado'}
- **Objetivo de proteína**: ${user.proteinas_g_obj || 120}g diarios

## Recomendaciones nutricionales
- **Calorías objetivo**: 2000 kcal/día
- **Proteínas**: ${user.proteinas_g_obj || 120}g (30% de calorías)
- **Grasas**: 60g (30% de calorías)
- **Carbohidratos**: 200g (40% de calorías)

## Plan semanal sugerido
Hemos creado comidas variadas y equilibradas para mantener tu motivación alta.

**Nota**: Si ves este mensaje, significa que hay un problema temporal con la IA. El sistema funciona correctamente con el fallback.

JSON_SUMMARY: ${JSON.stringify(fallbackSummary)}
JSON_MEALS: ${JSON.stringify(fallbackMeals)}
JSON_HYDRATION: {"litros": 2}
JSON_BEVERAGES: {"items": []}`;

    return NextResponse.json({
      advice: fallbackAdvice,
      summary: fallbackSummary,
      meals: fallbackMeals,
      hydration: { litros: 2 },
      beverages: { items: [] },
      model: 'fallback-test',
      took_ms: 50,
      message: "Sistema funcionando correctamente con fallback"
    });

  } catch (error) {
    console.error("/api/test-advice error", error);
    return NextResponse.json({
      error: "Error del servidor",
      details: error.message
    }, { status: 500 });
  }
}
