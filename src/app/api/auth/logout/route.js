import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ message: "Logout exitoso" }, { status: 200 });

  const cookieName = process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  // Borrar token de sesión
  res.cookies.set(cookieName, "", { httpOnly: true, path: "/", maxAge: 0 });

  // Borrar banderas de onboarding si existieran
  res.cookies.set("first_login", "", { path: "/", maxAge: 0 });
  res.cookies.set("onboarded", "", { path: "/", maxAge: 0 });

  return res;
}
