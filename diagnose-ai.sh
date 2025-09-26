#!/bin/bash

echo "=== DIAGNÓSTICO DEL SISTEMA DE IA ==="
echo ""

# Verificar variables de entorno
echo "1. Verificando variables de entorno..."
echo "GOOGLE_GENERATIVE_AI_API_KEY: ${GOOGLE_GENERATIVE_AI_API_KEY:+CONFIGURADA}"
echo "GEMINI_MODEL: ${GEMINI_MODEL:-'models/gemini-2.5-flash'}"
echo "NODE_ENV: ${NODE_ENV:-'development'}"
echo ""

# Probar endpoint de test-gemini
echo "2. Probando conexión con Google Gemini..."
echo "Llamando a: http://localhost:3000/api/test-gemini"
echo ""

curl -s "http://localhost:3000/api/test-gemini" | jq . 2>/dev/null || curl -s "http://localhost:3000/api/test-gemini"
echo ""
echo ""

# Probar endpoint de test-advice
echo "3. Probando endpoint de fallback..."
echo "Llamando a: http://localhost:3000/api/test-advice"
echo ""

curl -s "http://localhost:3000/api/test-advice" | jq . 2>/dev/null || curl -s "http://localhost:3000/api/test-advice"
echo ""
echo ""

echo "=== FIN DEL DIAGNÓSTICO ==="
