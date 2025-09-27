import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { jwtVerify } from "jose";
// 'cookie' ya no es necesario tras simplificación

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

  // Excluir flujo OAuth de NextAuth completamente
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;

  // 1. Intentar obtener token NextAuth estándar
  let tokenPayload: any = null;
  if (secret) {
    try {
      tokenPayload = await getToken({ req, secret });
    } catch {
      tokenPayload = null;
    }
  }

  // 2. Fallback legacy (JWT propio) -> decodificar y crear payload mínimo para flujo de onboarding
  if (!tokenPayload) {
    try {
      const legacyCookieName = process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token';
      const raw = req.cookies.get(legacyCookieName)?.value;
      if (raw && secret) {
        const { payload } = await jwtVerify(raw, new TextEncoder().encode(secret));
        // Construir un payload compatible con el que espera la lógica actual
        tokenPayload = {
          ...payload,
          privilege: payload.privilege || 'Invitado',
        } as any;
      }
    } catch {
      tokenPayload = null;
    }
  }

  const isLoggedIn = !!tokenPayload;

  // Override de estado de onboarding mediante cookie 'onboarded' (puesta al completar)
  const onboardedCookie = req.cookies.get('onboarded')?.value === 'true';
  const firstLoginCookie = req.cookies.get('first_login')?.value === 'true';
  if (tokenPayload) {
    if (onboardedCookie) {
      (tokenPayload as any).onboarding_completed = true;
      (tokenPayload as any).onboardingPending = false;
      (tokenPayload as any).firstLogin = false;
    } else {
      // Si no está marcado como onboarded aún, tratamos primer login como pendiente
      if (firstLoginCookie) {
        (tokenPayload as any).firstLogin = true;
        (tokenPayload as any).onboardingPending = true;
      }
    }
  }

  // Logs de depuración removidos para evitar ruido en la terminal

  // 1. Manejar rutas públicas (no protegidas)
  const isProtectedRoute = routePermissions.some(({ route }) =>
    convertToRegex(route).test(pathname)
  );

  if (!isProtectedRoute) {
    // Redirección moderna basada en flags del JWT (onboardingPending)
    if (pathname.startsWith("/api")) return NextResponse.next();
  const onboardingCompleted = tokenPayload?.onboarding_completed === true;
  const onboardingPending = tokenPayload?.onboardingPending === true || tokenPayload?.firstLogin === true;
    if (isLoggedIn && onboardingPending && !onboardingCompleted && !pathname.startsWith('/onboarding')) {
      return NextResponse.redirect(new URL('/onboarding', req.url));
    }
    if (isLoggedIn && onboardingCompleted && pathname.startsWith('/auth')) {
      // Usuario completo no debería permanecer en páginas de auth
      return NextResponse.redirect(new URL('/dashboard', req.url));
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

  // 2.5 Onboarding unified logic using JWT flags (NextAuth + legacy)
  const onboardingCompleted = tokenPayload?.onboarding_completed === true;
  const onboardingPending = tokenPayload?.onboardingPending === true || tokenPayload?.firstLogin === true;

  if (onboardingPending && !onboardingCompleted && !pathname.startsWith('/onboarding') && !pathname.startsWith('/api')) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }
  if (!onboardingPending && onboardingCompleted && pathname.startsWith('/onboarding')) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // 3. Verificar permisos de ruta
  for (const { route, roles } of routePermissions) {
    const routeRegex = convertToRegex(route);
    if (
      routeRegex.test(pathname) &&
  !roles.includes((tokenPayload as any)?.privilege as string)
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
