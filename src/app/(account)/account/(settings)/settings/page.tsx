"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";

export default function AccountSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);

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

  async function regeneratePlan() {
    setLoading("regen");
    setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/account/meal-plan/auto-generate", { method: "POST", cache: "no-store", credentials: "include" });
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

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Configuración de cuenta</h1>

      {msg && <div className="text-sm text-green-600">{msg}</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="rounded border p-4 space-y-3">
        <div className="font-medium">Plan de comidas</div>
        <p className="text-sm text-muted-foreground">
          - Regenerar plan: crea un plan nuevo automáticamente con IA.
          <br />
          - Reintentar guardado de onboarding: vuelve a generar las comidas y las guarda como recetas y plan inicial.
        </p>
        <div className="flex gap-2">
          <button
            onClick={regeneratePlan}
            disabled={loading === "regen"}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
          >
            {loading === "regen" ? "Generando…" : "Regenerar plan (IA)"}
          </button>
          <a
            href="/account/regenerate"
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
          >
            Ver proceso y PDF
          </a>
          <button
            onClick={retryOnboardingSave}
            disabled={loading === "retry"}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
          >
            {loading === "retry" ? "Guardando…" : "Reintentar"}
          </button>
        </div>
      </div>

      <div className="rounded border p-4 space-y-3">
        <div className="font-medium">Sesión</div>
        <div className="flex gap-2">
          <button
            onClick={logout}
            disabled={loading === "logout"}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
          >
            {loading === "logout" ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      </div>

      <div className="rounded border p-4 space-y-3">
        <div className="font-medium">Seguridad</div>
        <p className="text-sm text-muted-foreground">Cambia tu contraseña de acceso.</p>
        <div>
          <button
            onClick={() => setChangePwdOpen(true)}
            disabled={loading === "change"}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
          >
            {loading === "change" ? "Procesando…" : "Cambiar contraseña"}
          </button>
        </div>
      </div>

      <div className="rounded border border-red-300 p-4 space-y-3 bg-red-50">
        <div className="font-medium text-red-800">Eliminar cuenta</div>
        <p className="text-sm text-red-700">Esta acción eliminará permanentemente tu cuenta y datos asociados. No se puede deshacer.</p>
        <div>
          <button
            onClick={() => setDeleteOpen(true)}
            disabled={loading === "delete"}
            className="inline-flex items-center rounded-md border border-red-600 text-red-700 px-3 py-1.5 text-sm hover:bg-red-600 hover:text-white"
          >
            {loading === "delete" ? "Eliminando…" : "Eliminar cuenta"}
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
    </div>
  );
}