import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import prisma from "@/lib/db/prisma";

// Helper: crea usuario + auth si no existe (para Google OAuth)
async function ensureUser(email: string, name?: string) {
  const lower = email.toLowerCase();
  const existingAuth = await prisma.auth.findUnique({ where: { email: lower }, include: { usuario: true } });
  if (existingAuth) {
    return { usuario: existingAuth.usuario, created: false };
  }
  const parts = (name || lower).split(" ");
  const nombre = parts[0] || "Usuario";
  const apellido = parts.slice(1).join(" ") || "Google";
  const usuario = await prisma.usuario.create({
    data: {
      nombre,
      apellido,
      fecha_nacimiento: new Date(0),
      sexo: "N/A",
      onboarding_completed: false,
    },
  });
  await prisma.auth.create({
    data: {
      usuarioId: usuario.id,
      email: lower,
      password_hash: "oauth:google", // marcador; no usable para login de password
      verificado: true,
    },
  });
  return { usuario, created: true };
}

const authOptions: any = {
  // Usar NEXTAUTH_SECRET prioritario; fallback a AUTH_SECRET
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
    error: "/auth/login", // reutilizamos la misma pantalla
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }: any) {
      try {
        console.log('[NEXTAUTH][signIn] provider=', account?.provider);
        if (account?.provider !== 'google') return true;
        const email = (profile as any)?.email;
        const emailVerified = (profile as any)?.email_verified; // puede venir undefined
        // Sólo bloquear si explícitamente viene false, no si es undefined
        if (emailVerified === false || !email) {
          console.warn('[NEXTAUTH][signIn][google] blocked: emailVerified=', emailVerified, 'email=', email);
          return false;
        }
        const { created, usuario } = await ensureUser(email, (profile as any)?.name);
        (account as any).__justCreated = created;
        (account as any).__usuarioId = usuario.id; // Propagar ID interno para jwt()
        console.log('[NEXTAUTH][signIn][google] proceed user created?', created);
        return true;
      } catch (e) {
        console.error('[OAUTH_USER_PROVISION_ERROR]', e);
        return false;
      }
    },
    async jwt({ token, account, profile, trigger, session }: any) {
      if (account?.provider === 'google') {
        token.provider = account.provider;
        if (account.access_token) token.accessToken = account.access_token;
        if (profile?.email) token.email = (profile as any).email;
        if ((account as any).__justCreated) token.firstLogin = true;
        // Añadir privilegio por defecto si no existe
        if (!token.privilege) token.privilege = 'Invitado';
        if ((account as any).__justCreated) {
          token.onboarding_completed = false;
          token.onboardingPending = true;
        }
        if ((account as any).__usuarioId != null) {
          token.userId = (account as any).__usuarioId; // Guardar ID interno
        }
      }
      // Si no viene de account nuevo pero no tiene privilegio, asignar
      if (!token.privilege) token.privilege = 'Invitado';

      // Trigger manual de actualización desde el cliente (useSession().update)
      if (trigger === 'update' && session) {
        if (session.onboarding_completed === true) {
          token.onboarding_completed = true;
          token.onboardingPending = false;
          token.firstLogin = false;
        }
      }

      // Completar userId y estado de onboarding desde BD si falta (una sola vez por ciclo de vida del JWT)
      if (token.email && !token._onboardingChecked) {
        try {
          const auth = await prisma.auth.findUnique({
            where: { email: (token.email as string).toLowerCase() },
            include: { usuario: true }
          });
          if (auth?.usuario) {
            if (token.userId == null) token.userId = auth.usuario.id;
            token.onboarding_completed = !!auth.usuario.onboarding_completed;
            if (!auth.usuario.onboarding_completed) {
              token.onboardingPending = true;
            } else {
              token.onboardingPending = false;
              token.firstLogin = false;
            }
          }
        } catch (e) {
          console.error('[JWT_ONBOARDING_SYNC_ERROR]', e);
        }
        token._onboardingChecked = true;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token) {
        (session as any).provider = token.provider;
        (session as any).accessToken = token.accessToken;
        (session as any).firstLogin = token.firstLogin || false;
        (session as any).privilege = token.privilege || 'Invitado';
        (session as any).onboarding_completed = token.onboarding_completed ?? null;
        (session as any).onboardingPending = token.onboardingPending || false;
        (session as any).userId = token.userId || null;
      }
      return session;
    },
    async redirect({ url, baseUrl }: any) {
      // Ya no forzamos /onboarding aquí; el middleware redirige si realmente falta completar.
      if (url.includes('/api/auth/callback/google')) {
        return baseUrl + '/dashboard';
      }
      if (url.startsWith(baseUrl)) return url;
      return baseUrl + '/dashboard';
    },
  },
};

const authHandler = NextAuth(authOptions);
export { authHandler as GET, authHandler as POST };