import { NextResponse } from "next/server";

// Limpia una lista de cookies (si existen) poniéndolas expiradas inmediatamente.
function clear(res, name) {
  res.cookies.set(name, "", { path: "/", httpOnly: true, maxAge: 0 });
}

export async function POST() {
  const res = NextResponse.json({ message: "Logout exitoso" }, { status: 200 });

  // Legacy custom cookie
  const legacy = process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  // NextAuth default JWT session cookie names (normal / secure)
  const nextAuthCookies = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
  ];

  clear(res, legacy);
  for (const c of nextAuthCookies) clear(res, c);

  // Banderas auxiliares usadas en middleware/onboarding
  clear(res, "first_login");
  clear(res, "onboarded");

  // Evitar cachear respuesta en navegadores intermedios
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

  return res;
}
