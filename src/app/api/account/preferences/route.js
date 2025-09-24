import { NextResponse } from "next/server";

// Simple preferences handling using cookies to persist user settings per-browser.
// Data shape: { theme: 'system'|'light'|'dark', lang: 'es'|'en', units: 'metric'|'imperial' }
// Cookie name: user_prefs
const COOKIE_NAME = "user_prefs";

export async function GET(req) {
  try {
    const cookie = req.cookies.get(COOKIE_NAME)?.value || "";
    let prefs = {};
    try {
      if (cookie) prefs = JSON.parse(decodeURIComponent(cookie));
    } catch {}
    return NextResponse.json({ ok: true, prefs: normalize(prefs) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Error leyendo preferencias" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const incoming = {
      theme: coerceTheme(body?.theme),
      lang: coerceLang(body?.lang),
      units: coerceUnits(body?.units),
    };
    const value = encodeURIComponent(JSON.stringify(incoming));
    const res = NextResponse.json({ ok: true, prefs: incoming });
    // Persist 1 year
    res.cookies.set(COOKIE_NAME, value, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Error guardando preferencias" }, { status: 500 });
  }
}

function normalize(prefs) {
  return {
    theme: coerceTheme(prefs?.theme) || "system",
    lang: coerceLang(prefs?.lang) || "es",
    units: coerceUnits(prefs?.units) || "metric",
  };
}

function coerceTheme(v) {
  return ["system", "light", "dark"].includes(v) ? v : undefined;
}
function coerceLang(v) {
  return ["es", "en"].includes(v) ? v : undefined;
}
function coerceUnits(v) {
  return ["metric", "imperial"].includes(v) ? v : undefined;
}
