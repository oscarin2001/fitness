"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function OnboardingReviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/profile", { method: "GET" });
        if (res.status === 401) {
          if (!cancelled) router.replace("/auth/login");
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Fetch error");
        if (!cancelled) {
          setUser(data?.user || null);
          setAccepted(Boolean(data?.user?.terminos_aceptados));
        }
      } catch (e) {
        if (!cancelled) toast.error("No se pudo cargar tu información");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function continueToAdvice() {
    try {
      setSaving(true);
      if (!accepted) {
        toast.error("Debes aceptar los términos y condiciones");
        setSaving(false);
        return;
      }
      // Marcar aceptación de términos y paso actual como review
      await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_step: "review", terminos_aceptados: true }),
      });
      router.push("/onboarding/advice");
    } catch {
      toast.error("No se pudo continuar");
    } finally {
      setSaving(false);
    }
  }

  const prefs = user?.preferencias_alimentos || {};

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between -mb-2">
          <Button type="button" variant="ghost" onClick={() => router.push("/onboarding/foods")}>Volver</Button>
          <div className="text-sm text-muted-foreground">Revisión</div>
        </div>
        <h1 className="text-2xl font-semibold text-center">Revisa tu información</h1>
        <p className="text-sm text-muted-foreground text-center -mt-2">
          Confirma que todo está correcto antes de generar tu recomendación con IA.
        </p>

        <div className="rounded-md border p-4 space-y-2">
          <div className="font-medium">Datos personales</div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Cargando…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div><span className="text-muted-foreground">Sexo:</span> {user?.sexo ?? "-"}</div>
              <div><span className="text-muted-foreground">Altura:</span> {user?.altura_cm ? `${user.altura_cm} cm` : "-"}</div>
              <div><span className="text-muted-foreground">Peso:</span> {user?.peso_kg ? `${user.peso_kg} kg` : "-"}</div>
              <div><span className="text-muted-foreground">Nacimiento:</span> {user?.fecha_nacimiento ? new Date(user.fecha_nacimiento).toLocaleDateString() : "-"}</div>
              <div><span className="text-muted-foreground">Actividad:</span> {user?.nivel_actividad ?? "-"}</div>
              <div><span className="text-muted-foreground">País:</span> {user?.pais ?? "-"}</div>
            </div>
          )}
        </div>

        <div className="rounded-md border p-4 space-y-2">
          <div className="font-medium">Objetivo</div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Cargando…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div><span className="text-muted-foreground">Objetivo:</span> {user?.objetivo ?? "-"}</div>
              <div><span className="text-muted-foreground">Peso objetivo:</span> {user?.peso_objetivo_kg ? `${user.peso_objetivo_kg} kg` : "-"}</div>
              <div><span className="text-muted-foreground">Velocidad:</span> {user?.velocidad_cambio ?? "-"}</div>
            </div>
          )}
        </div>

        <div className="rounded-md border p-4 space-y-2">
          <div className="font-medium">Comidas habilitadas</div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Cargando…</div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {prefs?.enabledMeals
                ? Object.entries(prefs.enabledMeals)
                    .filter(([_, v]) => Boolean(v))
                    .map(([k]) => k)
                    .join(", ") || "Ninguna"
                : "Ninguna"}
            </div>
          )}
        </div>

        <div className="rounded-md border p-4 space-y-2">
          <div className="font-medium">Preferencias de alimentos</div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Cargando…</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div>
                <div className="font-medium">Carbohidratos ({(prefs?.carbs || []).length})</div>
                <div className="text-muted-foreground">{(prefs?.carbs || []).join(", ") || "-"}</div>
              </div>
              <div>
                <div className="font-medium">Proteínas ({(prefs?.proteins || []).length})</div>
                <div className="text-muted-foreground">{(prefs?.proteins || []).join(", ") || "-"}</div>
              </div>
              <div>
                <div className="font-medium">Fibra ({(prefs?.fiber || []).length})</div>
                <div className="text-muted-foreground">{(prefs?.fiber || []).join(", ") || "-"}</div>
              </div>
              <div>
                <div className="font-medium">Grasas ({(prefs?.fats || []).length})</div>
                <div className="text-muted-foreground">{(prefs?.fats || []).join(", ") || "-"}</div>
              </div>
              <div>
                <div className="font-medium">Snacks ({(prefs?.snacks || []).length})</div>
                <div className="text-muted-foreground">{(prefs?.snacks || []).join(", ") || "-"}</div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-md border p-4 space-y-3">
          <div className="font-medium">Términos y condiciones</div>
          <div className="text-sm text-muted-foreground">
            Debes aceptar los términos y la política de privacidad para continuar. <TermsModal />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>Acepto los términos y condiciones</span>
          </label>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="w-1/2" onClick={() => router.push("/onboarding/foods")}>Atrás</Button>
          <Button type="button" className="w-1/2" onClick={continueToAdvice} disabled={saving || loading}>
            {saving ? "Continuando..." : "Continuar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TermsModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="underline hover:no-underline">Ver términos</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Términos y condiciones</DialogTitle>
          <DialogDescription>
            Última actualización: {new Date().toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm max-h-[50vh] overflow-auto pr-2">
          <p>
            Este es un resumen de términos de ejemplo. Al continuar, confirmas que has leído y aceptas nuestras
            políticas de privacidad y condiciones de uso. La información proporcionada se utilizará para personalizar
            tu experiencia y podrás solicitar su eliminación en cualquier momento.
          </p>
          <p>
            - Uso del servicio: El contenido es informativo y no sustituye consejo médico profesional.
          </p>
          <p>
            - Datos: Tratamos tus datos conforme a la política de privacidad. Puedes ejercer tus derechos de acceso,
            rectificación y supresión.
          </p>
          <p>
            - Seguridad: Aplicamos medidas razonables para proteger tu información.
          </p>
          <p>
            - Contacto: soporte@tudominio.com
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
