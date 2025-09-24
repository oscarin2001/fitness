import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";

const routePermissions = [
  { route: "/dashboard/settings/*", roles: ["Superadministrador"] },
  { route: "/dashboard/*", roles: ["Administrador", "Superadministrador","Invitado","Lecturador"] },
  { route: "/dashboard", roles: ["Administrador","Superadministrador","Invitado","Lecturador"] },
  { route: "/account/*", roles: ["Administrador","Superadministrador","Invitado","Lecturador"] },
  { route: "/account", roles: ["Administrador","Superadministrador","Invitado","Lecturador"] },
  // Onboarding debe requerir sesión
  { route: "/onboarding/*", roles: ["Administrador","Superadministrador","Invitado","Lecturador"] },
  { route: "/onboarding", roles: ["Administrador","Superadministrador","Invitado","Lecturador"] },
  { route: "/api/settings/*", roles: ["Superadministrador"] },
  { route: "/api/dashboard/*", roles: ["Administrador", "Superadministrador","Invitado","Lecturador"] },
  { route: "/api/account/*", roles: ["Administrador", "Superadministrador","Invitado","Lecturador"] },
  { route: "/api/account/advice", roles: ["Administrador", "Superadministrador","Invitado","Lecturador"] },
];

const convertToRegex = (route: string) =>
  new RegExp("^" + route.replace(/:[a-zA-Z0-9]+/g, "([^/]+)") + "(?:/.*)?$");

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secret = process.env.AUTH_SECRET;

  // Determinar el nombre de la cookie según el entorno
  const cookieName = process.env.NODE_ENV === 'production' 
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'

  // Obtener y verificar el token de sesión desde la cookie
  const tokenCookie = req.cookies.get(cookieName)?.value;
  let tokenPayload: any = null;
  if (tokenCookie && secret) {
    try {
      const encoder = new TextEncoder();
      const { payload } = await jwtVerify(tokenCookie, encoder.encode(secret));
      tokenPayload = payload;
    } catch (e) {
      tokenPayload = null;
    }
  }
  const isLoggedIn = !!tokenPayload;

  // Logs de depuración removidos para evitar ruido en la terminal

  // 1. Manejar rutas públicas (no protegidas)
  const isProtectedRoute = routePermissions.some(({ route }) =>
    convertToRegex(route).test(pathname)
  );

  if (!isProtectedRoute) {
    // Si está logueado y es primer login, redirigir a onboarding desde rutas públicas
    const onboarded = req.cookies.get("onboarded")?.value === "true";
    let firstLoginCookie = req.cookies.get("first_login")?.value === "true";
    if (onboarded) firstLoginCookie = false; // estado definitivo
    // Evitar redirecciones para rutas de API (permitir llamadas API durante onboarding)
    if (pathname.startsWith("/api")) {
      return NextResponse.next();
    }
    if (isLoggedIn && firstLoginCookie && !pathname.startsWith("/onboarding")) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
    return NextResponse.next();
  }

  // 2. Usuario no autenticado
  if (!isLoggedIn) {
    if (pathname.startsWith("/api")) {
      return new NextResponse(
        JSON.stringify({ error: "Acceso no autorizado" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  // 2.5. Onboarding: si es primer login, forzar a /onboarding, y si no lo es, bloquear /onboarding
  const onboarded2 = req.cookies.get("onboarded")?.value === "true";
  let firstLoginCookie = req.cookies.get("first_login")?.value === "true";
  if (onboarded2) firstLoginCookie = false; // estado definitivo
  // Allow API calls during onboarding; only redirect non-API pages
  if (firstLoginCookie && !pathname.startsWith("/onboarding") && !pathname.startsWith("/api")) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }
  if (!firstLoginCookie && pathname.startsWith("/onboarding")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // 3. Verificar permisos de ruta
  for (const { route, roles } of routePermissions) {
    const routeRegex = convertToRegex(route);
    if (
      routeRegex.test(pathname) &&
      !roles.includes((tokenPayload as any).privilege as string)
    ) {
      if (pathname.startsWith("/api")) {
        return new NextResponse(
          JSON.stringify({ error: "No tienes permisos" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
