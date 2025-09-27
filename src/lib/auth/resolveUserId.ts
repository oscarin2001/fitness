import { getToken } from "next-auth/jwt";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";

interface MinimalToken {
  userId?: unknown;
  id?: unknown;
  sub?: unknown;
  email?: string;
  [key: string]: unknown;
}

/**
 * Unified resolution of the internal Usuario.id for both NextAuth (Google) users
 * and legacy cookie-based sessions.
 *
 * Order of attempts:
 * 1. NextAuth JWT: prefer token.userId (injected during signIn callback)
 * 2. If only external provider id (sub/id) and it's a large number/string: look up via email in Auth table.
 * 3. If small numeric id: parse directly.
 * 4. Fallback: email lookup again (covers cases where userId wasn't injected yet).
 * 5. Legacy cookie JWT (authjs.session-token / __Secure-authjs.session-token) using AUTH_SECRET.
 * 6. Large external id in legacy token -> email lookup.
 *
 * Returns null if no valid internal id can be resolved.
 */
export async function resolveUserId(
  req: NextRequest | { cookies?: any },
  opts?: { debug?: boolean }
): Promise<number | null> {
  const debug = Boolean(opts?.debug);
  const log = (...args: unknown[]) => { if (debug) console.log("[resolveUserId]", ...args); };

  // 1-4: NextAuth token path
  try {
  // getToken expects a NextRequest or NextApiRequest; if a plain object was passed we skip
  const token = (('headers' in (req as any)) ? await getToken({ req: req as any }) : null) as MinimalToken | null;
    if (token) {
      log("token keys", Object.keys(token));
      if (token.userId != null) {
        const n = Number(token.userId);
        if (Number.isFinite(n)) { log("using token.userId", n); return n; }
      }
      const raw = token.id || token.sub;
      if (raw) {
        const isLarge = String(raw).length > 15;
        if (isLarge) {
          if (token.email) {
            try {
              const auth = await prisma.auth.findUnique({ where: { email: String(token.email).toLowerCase() }, select: { usuarioId: true } });
              if (auth?.usuarioId) { log("resolved via email (large external id)", auth.usuarioId); return auth.usuarioId; }
            } catch (e) { log("email lookup (large id) error", e); }
          }
          // do not coerce large external provider id to number
        } else {
          const n = Number(raw); if (Number.isFinite(n)) { log("parsed raw token id", n); return n; }
        }
      }
      if (token.email) {
        try {
          const auth = await prisma.auth.findUnique({ where: { email: String(token.email).toLowerCase() }, select: { usuarioId: true } });
          if (auth?.usuarioId) { log("resolved via fallback email lookup", auth.usuarioId); return auth.usuarioId; }
        } catch (e) { log("fallback email lookup error", e); }
      }
    } else {
      log("no next-auth token");
    }
  } catch (e) { log("next-auth token error", e); }

  // 5-6: Legacy cookie path
  try {
    const cookieName = process.env.NODE_ENV === 'production' ? '__Secure-authjs.session-token' : 'authjs.session-token';
    // Some route handlers give a NextRequest, others may pass request-like with cookies map
    const legacyCookie = (req as any)?.cookies?.get?.(cookieName)?.value;
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET; // fallback to NEXTAUTH_SECRET if AUTH_SECRET not set
    if (!legacyCookie || !secret) { log("missing legacy token or secret"); return null; }
    const decoded = jwt.verify(legacyCookie, secret) as Record<string, unknown> | undefined;
    const val = (decoded as any)?.userId ?? (decoded as any)?.sub;
    if (val) {
      const isLarge = String(val).length > 15;
      if (isLarge) {
        const email = (decoded as any)?.email;
        if (email) {
          try {
            const auth = await prisma.auth.findUnique({ where: { email: String(email).toLowerCase() }, select: { usuarioId: true } });
            if (auth?.usuarioId) { log("legacy large external id -> email lookup", auth.usuarioId); return auth.usuarioId; }
          } catch (e) { log("legacy email lookup error", e); }
        }
      } else {
        const n = Number(val); if (Number.isFinite(n)) { log("legacy parsed id", n); return n; }
      }
    }
  } catch (e) { log("legacy token error", e); }

  log("failed to resolve user id");
  return null;
}
