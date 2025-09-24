"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";
import { Moon, Sun, Globe, Ruler, UtensilsCrossed, Shield, LogOut, Trash2, ChevronRight, Repeat, FileDown } from "lucide-react";

export default function AccountSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [theme, setTheme] = useState<string>(() =>
    typeof window === "undefined" ? "system" : (localStorage.getItem("theme") || "system")
  );
  const [lang, setLang] = useState<string>(() =>
    typeof window === "undefined" ? "es" : (localStorage.getItem("lang") || "es")
  );
  const [units, setUnits] = useState<string>(() =>
    typeof window === "undefined" ? "metric" : (localStorage.getItem("units") || "metric")
  );
  const [regenPwdOpen, setRegenPwdOpen] = useState(false);
  const [advicePreview, setAdvicePreview] = useState<string>("");

  // Cargar preferencias desde el backend al montar
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const res = await fetch("/api/account/preferences", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (abort) return;
        const p = j?.prefs || {};
        if (p.theme) {
          setTheme(p.theme);
          localStorage.setItem("theme", p.theme);
          applyTheme(p.theme, false);
        }
        if (p.lang) {
          setLang(p.lang);
          localStorage.setItem("lang", p.lang);
        }
        if (p.units) {
          setUnits(p.units);
          localStorage.setItem("units", p.units);
        }
      } catch {}
    })();
    return () => { abort = true; };
  }, []);

  // Cargar consejo almacenado en el perfil (user.plan_ia) para mostrar una previa
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const r = await fetch("/api/account/profile", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (abort) return;
        const u = j?.user || {};
        const text: string = u?.plan_ia || u?.planIa || u?.planIA || u?.advice || "";
        if (text) {
          // quitar líneas JSON_* de la vista, dejando texto limpio
          const clean = text
            .split("\n")
            .filter((ln: string) => !/^\s*JSON_(SUMMARY|MEALS|HYDRATION)\s*:/i.test(ln))
            .join("\n")
            .trim();
          setAdvicePreview(clean);
        } else {
          setAdvicePreview("");
        }
      } catch {
        if (!abort) setAdvicePreview("");
      }
    })();
    return () => { abort = true; };
  }, []);

  async function logout() {
    setLoading("logout");
    setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST", cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error("No se pudo cerrar sesión");
      setMsg("Sesión cerrada");
      toast.success("Sesión cerrada");
      router.replace("/auth/login");
    } catch (e: any) {
      setErr(e?.message || "No se pudo cerrar sesión");
      toast.error(e?.message || "No se pudo cerrar sesión");
    } finally {
      setLoading(null);
    }
  }

  async function regeneratePlan(currentPassword: string) {
    setLoading("regen");
    setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/account/meal-plan/auto-generate", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: currentPassword })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "No se pudo generar el plan");
      }
      setMsg("Plan generado correctamente");
      toast.success("Plan generado correctamente");
      router.push("/dashboard/plan");
    } catch (e: any) {
      setErr(e?.message || "No se pudo generar el plan");
      toast.error(e?.message || "No se pudo generar el plan");
    } finally {
      setLoading(null);
    }
  }

  async function retryOnboardingSave() {
    setLoading("retry");
    setErr(null); setMsg(null);
    try {
      // 1) Obtener nuevamente consejo de IA con meals/hydration (con fallback del servidor)
      const adviceRes = await fetch("/api/account/advice", { method: "POST", cache: "no-store", credentials: "include" });
      const adviceJson = await adviceRes.json();
      if (!adviceRes.ok) {
        if (adviceRes.status === 401) throw new Error("No autorizado. Inicia sesión.");
        if (adviceRes.status === 400 && adviceJson?.step) throw new Error(adviceJson?.error || "Faltan datos para generar el plan");
        throw new Error(adviceJson?.error || "Error al generar consejo");
      }

      const items = Array.isArray(adviceJson?.meals?.items) ? adviceJson.meals.items : [];
      const litros = Number(adviceJson?.hydration?.litros);
      if (!items.length && !(litros > 0)) {
        throw new Error("La IA no devolvió recomendaciones válidas");
      }

      // 2) Guardar comidas iniciales si existen
      if (items.length) {
        const savePlan = await fetch("/api/account/onboarding/initial-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
          credentials: "include",
          cache: "no-store",
        });
        if (!savePlan.ok) {
          const t = await savePlan.text().catch(() => "");
          throw new Error(t || "No se pudo guardar el plan inicial");
        }
      }

      // 3) Guardar objetivo de hidratación si vino
      if (litros > 0) {
        const saveHyd = await fetch("/api/account/hydration/goal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ litros }),
          credentials: "include",
          cache: "no-store",
        });
        if (!saveHyd.ok) {
          const t = await saveHyd.text().catch(() => "");
          throw new Error(t || "No se pudo guardar la hidratación");
        }
      }

      // 4) Aplicar objetivos (kcal/macros/agua) al perfil para que el dashboard los lea
      try {
        const applyBody: any = {};
        if (adviceJson?.summary && typeof adviceJson.summary === "object") applyBody.summary = adviceJson.summary;
        if (litros > 0) applyBody.agua_litros_obj = litros;
        if (Object.keys(applyBody).length) {
          const applyRes = await fetch("/api/account/plan/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(applyBody),
            credentials: "include",
            cache: "no-store",
          });
          if (!applyRes.ok) {
            const t = await applyRes.text().catch(() => "");
            throw new Error(t || "No se pudieron aplicar objetivos del plan");
          }
        }
      } catch (e: any) {
        throw new Error(e?.message || "Error aplicando objetivos del plan");
      }

      setMsg("Plan guardado/actualizado correctamente");
      toast.success("Plan guardado/actualizado correctamente");
      router.push("/dashboard/plan");
    } catch (e: any) {
      setErr(e?.message || "No se pudo reintentar el guardado del plan");
      toast.error(e?.message || "No se pudo reintentar el guardado del plan");
    } finally {
      setLoading(null);
    }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    try {
      setLoading("change");
      setErr(null); setMsg(null);
      const res = await fetch("/api/account/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "No se pudo cambiar la contraseña");
      toast.success("Contraseña actualizada");
      setMsg("Contraseña actualizada correctamente");
      setChangePwdOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo cambiar la contraseña");
      setErr(e?.message || "No se pudo cambiar la contraseña");
    } finally {
      setLoading(null);
    }
  }

  async function deleteAccount(currentPassword: string) {
    setLoading("delete");
    setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: currentPassword }),
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "No se pudo eliminar la cuenta");
      }
      toast.success("Cuenta eliminada");
      setDeleteOpen(false);
      router.replace("/auth/register");
    } catch (e: any) {
      toast.error(e?.message || "No se pudo eliminar la cuenta");
      setErr(e?.message || "No se pudo eliminar la cuenta");
    } finally {
      setLoading(null);
    }
  }

  async function applyTheme(next: string, persist: boolean = true) {
    setTheme(next);
    localStorage.setItem("theme", next);
    const root = document.documentElement;
    if (next === "dark") root.classList.add("dark");
    else if (next === "light") root.classList.remove("dark");
    else {
      // system: respetar media query
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.matches) root.classList.add("dark"); else root.classList.remove("dark");
    }
    if (persist) {
      try {
        await fetch("/api/account/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: next, lang, units }),
        });
      } catch {}
    }
  }

  async function applyLang(next: string) {
    setLang(next);
    localStorage.setItem("lang", next);
    toast.success(`Idioma: ${next === "es" ? "Español" : "English"}`);
    try {
      await fetch("/api/account/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, lang: next, units }),
      });
    } catch {}
  }

  async function applyUnits(next: string) {
    setUnits(next);
    localStorage.setItem("units", next);
    toast.success(`Unidades: ${next === "metric" ? "Métrico" : "Imperial"}`);
    try {
      await fetch("/api/account/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, lang, units: next }),
      });
    } catch {}
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Configuraciones</h1>

      {msg && <div className="text-sm text-green-600">{msg}</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* Atajos de perfil */}
      <div className="space-y-2">
        <div className="text-xs uppercase text-muted-foreground">Gestión de perfil</div>
        <div className="rounded-md border divide-y">
          <a href="/account/profile/personal" className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60">
            <span>Datos personales</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
          <a href="/account/profile/objectives" className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60">
            <span>Objetivos y metas</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
          <a href="/account/profile/food" className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60">
            <span>Alimentos preferidos</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
          <a href="/account/profile/hydration" className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60">
            <span>Hidratación</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
          <a href="/account/profile/meals" className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60">
            <span>Comidas y porciones</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
          <a href="/account/profile/progress" className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60">
            <span>Progreso</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>

      {/* Último consejo */}
      <div className="space-y-2">
        <div className="text-xs uppercase text-muted-foreground">Último consejo</div>
        <div className="rounded-md border p-3 space-y-3">
          <div className="text-sm whitespace-pre-wrap min-h-[80px]">
            {advicePreview ? advicePreview : <span className="text-muted-foreground">No hay consejo guardado aún.</span>}
          </div>
          <div className="flex gap-2">
            <a href="/account/regenerate" className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
              <FileDown className="h-4 w-4" /> Exportar PDF
            </a>
          </div>
        </div>
      </div>
      </div>

      {/* Preferencias de la app */}
      <div className="space-y-2">
        <div className="text-xs uppercase text-muted-foreground">Preferencias</div>
        <div className="rounded-md border divide-y">
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-3"><Sun className="h-4 w-4" /><span>Tema</span></div>
            <div className="flex items-center gap-2 text-sm">
              <select
                className="border rounded px-2 py-1 text-sm"
                value={theme}
                onChange={(e) => applyTheme(e.target.value)}
              >
                <option value="system">Sistema</option>
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
              </select>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-3"><Globe className="h-4 w-4" /><span>Idioma</span></div>
            <div className="flex items-center gap-2 text-sm">
              <select
                className="border rounded px-2 py-1 text-sm"
                value={lang}
                onChange={(e) => applyLang(e.target.value)}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-3"><Ruler className="h-4 w-4" /><span>Unidades</span></div>
            <div className="flex items-center gap-2 text-sm">
              <select
                className="border rounded px-2 py-1 text-sm"
                value={units}
                onChange={(e) => applyUnits(e.target.value)}
              >
                <option value="metric">Métrico (kg, cm)</option>
                <option value="imperial">Imperial (lb, in)</option>
              </select>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* Plan de comidas */}
      <div className="space-y-2">
        <div className="text-xs uppercase text-muted-foreground">Plan de comidas</div>
        <div className="rounded-md border divide-y">
          <button
            onClick={() => setRegenPwdOpen(true)}
            disabled={loading === "regen"}
            className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60"
          >
            <span className="inline-flex items-center gap-3"><UtensilsCrossed className="h-4 w-4" /> {loading === "regen" ? "Generando…" : "Regenerar plan (IA)"}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <a href="/account/regenerate" className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60">
            <span className="inline-flex items-center gap-3"><Repeat className="h-4 w-4" /> Ver proceso y PDF</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
          <button
            onClick={retryOnboardingSave}
            disabled={loading === "retry"}
            className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60"
          >
            <span className="inline-flex items-center gap-3"><Repeat className="h-4 w-4" /> {loading === "retry" ? "Guardando…" : "Reintentar guardado de onboarding"}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Seguridad */}
      <div className="space-y-2">
        <div className="text-xs uppercase text-muted-foreground">Seguridad</div>
        <div className="rounded-md border divide-y">
          <button
            onClick={() => setChangePwdOpen(true)}
            disabled={loading === "change"}
            className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60"
          >
            <span className="inline-flex items-center gap-3"><Shield className="h-4 w-4" /> {loading === "change" ? "Procesando…" : "Cambiar contraseña"}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Sesión */}
      <div className="space-y-2">
        <div className="text-xs uppercase text-muted-foreground">Sesión</div>
        <div className="rounded-md border divide-y">
          <button
            onClick={logout}
            disabled={loading === "logout"}
            className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/60 text-red-600"
          >
            <span className="inline-flex items-center gap-3"><LogOut className="h-4 w-4" /> {loading === "logout" ? "Cerrando…" : "Cerrar sesión"}</span>
            <ChevronRight className="h-4 w-4 text-red-500" />
          </button>
        </div>
      </div>

      {/* Eliminar cuenta */}
      <div className="space-y-2">
        <div className="text-xs uppercase text-muted-foreground">Peligro</div>
        <div className="rounded-md border border-red-300 divide-y bg-red-50">
          <button
            onClick={() => setDeleteOpen(true)}
            disabled={loading === "delete"}
            className="w-full flex items-center justify-between px-3 py-3 hover:bg-red-100 text-red-700"
          >
            <span className="inline-flex items-center gap-3"><Trash2 className="h-4 w-4" /> {loading === "delete" ? "Eliminando…" : "Eliminar cuenta"}</span>
            <ChevronRight className="h-4 w-4 text-red-600" />
          </button>
        </div>
      </div>

      <PasswordConfirmDialog
        open={changePwdOpen}
        onOpenChange={setChangePwdOpen}
        mode="change"
        onConfirmed={async ({ currentPassword, newPassword }) => {
          await changePassword(currentPassword, newPassword || "");
        }}
      />

      <PasswordConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        mode="confirm"
        onConfirmed={async ({ currentPassword }) => {
          await deleteAccount(currentPassword);
        }}
      />

      <PasswordConfirmDialog
        open={regenPwdOpen}
        onOpenChange={setRegenPwdOpen}
        mode="confirm"
        onConfirmed={async ({ currentPassword }) => {
          await regeneratePlan(currentPassword);
          setRegenPwdOpen(false);
        }}
      />
    </div>
  );
}