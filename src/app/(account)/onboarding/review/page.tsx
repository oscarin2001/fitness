"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import { ThemedCheckbox as Checkbox } from "@/components/onboarding/ThemedCheckbox";

export default function OnboardingReviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [accepted, setAccepted] = useState(false);
  const [schedule, setSchedule] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
  const res = await fetch("/api/account/profile", { method: "GET", cache: "no-store" });
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
        // Fetch horario de comidas (merge plan overrides + prefs fallback)
        try {
          const sRes = await fetch("/api/account/meal-plan/schedule", { cache: "no-store" });
          if (sRes.ok) {
            const sj = await sRes.json().catch(() => ({}));
            const sched = sj?.schedule && typeof sj.schedule === "object" ? sj.schedule : null;
            if (!cancelled) setSchedule(sched);
          }
        } catch {}
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
      // Prefetch de consejo IA en background (sin forzar long/ensureFull). Usará el modelo flash del plan gratuito.
      try { fetch("/api/account/advice", { method: "POST" }); } catch {}
      router.push("/onboarding/advice");
    } catch {
      toast.error("No se pudo continuar");
    } finally {
      setSaving(false);
    }
  }

  // preferencia puede llegar como string u objeto
  const prefs = useMemo(() => {
    const raw = user?.preferencias_alimentos;
    if (!raw) return {} as any;
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return {} as any; }
    }
    return raw;
  }, [user]);
  const enabledMeals = prefs?.enabledMeals || null as any;
  const mealHours = prefs?.mealHours || null as any;

  return (
    <OnboardingLayout>
      <OnboardingHeader title="Revisa tu información" subtitle="Confirma que todo está correcto antes de generar tu recomendación con IA." />

      {/* Resumen de tu selección (centralizado aquí, sin duplicar en otras secciones) */}
      <OnboardingCard>
        <div className="font-medium mb-2">Resumen de tu selección</div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="text-sm text-muted-foreground space-y-1">
            <div>
              <span className="text-foreground">Días de dieta:</span>{" "}
              {Array.isArray(user?.dias_dieta) && user.dias_dieta.length
                ? (user.dias_dieta as string[]).join(", ")
                : "No seleccionado"}
            </div>
            <div>
              <span className="text-foreground">Proteína objetivo:</span>{" "}
              {(() => {
                const val = typeof user?.proteinas_g_obj === "number" && user.proteinas_g_obj > 0
                  ? Math.round(user.proteinas_g_obj)
                  : (() => {
                      try {
                        const pr = (prefs as any)?.proteinRangeKg;
                        const w = user?.peso_kg;
                        if (pr && typeof pr.min === "number" && typeof pr.max === "number" && typeof w === "number" && w > 0) {
                          const mid = (pr.min + pr.max) / 2;
                          return Math.round(mid * w);
                        }
                      } catch {}
                      return null;
                    })();
                return typeof val === "number" ? `${val} g/día` : "—";
              })()}
              {""}
            </div>
            <div>
              <span className="text-foreground">Comidas habilitadas:</span>{" "}
              {enabledMeals
                ? Object.entries(enabledMeals)
                    .filter(([_, v]) => Boolean(v))
                    .map(([k]) => k)
                    .join(", ") || "—"
                : "—"}
            </div>
          </div>
        )}
      </OnboardingCard>

      <OnboardingCard>
        <div className="font-medium">Datos personales</div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><span className="text-muted-foreground">Género:</span> {user?.sexo ?? "-"}</div>
            <div><span className="text-muted-foreground">Altura:</span> {user?.altura_cm ? `${user.altura_cm} cm` : "-"}</div>
            <div><span className="text-muted-foreground">Peso:</span> {user?.peso_kg ? `${user.peso_kg} kg` : "-"}</div>
            <div><span className="text-muted-foreground">Nacimiento:</span> {user?.fecha_nacimiento ? new Date(user.fecha_nacimiento).toLocaleDateString() : "-"}</div>
            <div><span className="text-muted-foreground">Actividad:</span> {user?.nivel_actividad ?? "-"}</div>
            <div><span className="text-muted-foreground">País:</span> {user?.pais ?? "-"}</div>
          </div>
        )}
      </OnboardingCard>

      <OnboardingCard>
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
      </OnboardingCard>

      {false && (
        <OnboardingCard>
          <div className="font-medium">Comidas habilitadas</div>
          {/* Se eliminó este bloque para evitar redundancia con el resumen */}
        </OnboardingCard>
      )}

      {false && (
        <OnboardingCard>
          <div className="font-medium">Días de comidas seleccionados</div>
          {/* Se eliminó este bloque para evitar redundancia con el resumen */}
        </OnboardingCard>
      )}

      <OnboardingCard>
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
            <div>
              <div className="font-medium">Bebidas e infusiones ({(prefs?.beverages || []).length})</div>
              <div className="text-muted-foreground">{(prefs?.beverages || []).join(", ") || "-"}</div>
            </div>
          </div>
        )}
      </OnboardingCard>

      <OnboardingCard>
        <div className="font-medium">Términos y condiciones</div>
        <div className="text-sm text-muted-foreground">
          Debes aceptar los términos y la política de privacidad para continuar. <TermsModal />
        </div>
        <label className="flex items-center gap-3 text-sm mt-2">
          <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(Boolean(v))} />
          <span>Acepto los términos y condiciones</span>
        </label>
      </OnboardingCard>

      <OnboardingActions
        back={{ onClick: () => router.push("/onboarding/foods") }}
        next={{ onClick: continueToAdvice, label: saving ? "Continuando..." : "Continuar", disabled: saving || loading }}
      />
    </OnboardingLayout>
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
