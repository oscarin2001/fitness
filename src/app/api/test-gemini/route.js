import { NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

export async function GET() {
  try {
    console.log("[test-gemini] Probando conexión con Google Gemini...");

    // Verificar API key
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    console.log(`[test-gemini] API Key configurada: ${apiKey ? 'SÍ' : 'NO'}`);
    console.log(`[test-gemini] Longitud API Key: ${apiKey?.length || 0}`);

    if (!apiKey) {
      return NextResponse.json({
        error: "GOOGLE_GENERATIVE_AI_API_KEY no configurada",
        status: "error"
      }, { status: 500 });
    }

    // Probar con un modelo simple
    const modelName = process.env.GEMINI_MODEL || "models/gemini-2.5-flash";
    console.log(`[test-gemini] Probando modelo: ${modelName}`);

    const testPrompt = "Responde con solo 'OK' si puedes leerme.";

    const result = await generateText({
      model: google(modelName),
      prompt: testPrompt,
      temperature: 0.1,
      maxTokens: 10,
    });

    console.log(`[test-gemini] Respuesta recibida: ${result.text}`);

    return NextResponse.json({
      status: "success",
      model: modelName,
      response: result.text,
      message: "Google Gemini está funcionando correctamente"
    });

  } catch (error) {
    console.error("[test-gemini] Error:", error);

    return NextResponse.json({
      status: "error",
      error: error.message,
      details: error.toString(),
      message: "Error al conectar con Google Gemini"
    }, { status: 500 });
  }
}
