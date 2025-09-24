"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import { ThemedCheckbox as Checkbox } from "@/components/onboarding/ThemedCheckbox";

export default function OnboardingMealsTermsPage() {
  const router = useRouter();
  const [meals, setMeals] = useState({
    desayuno: true,
    snack_manana: true, // Nuevo snack de media mañana
    almuerzo: true,
    snack_tarde: true, // Nuevo snack de media tarde
    cena: true,
  });
  const [hours, setHours] = useState<Record<string, string>>({
    Desayuno: "08:00",
    Snack_manana: "10:30",
    Almuerzo: "13:30",
    Snack_tarde: "16:30",
    Cena: "20:00",
  });

  // Prefill from server schedule (merges with defaults)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/meal-plan/schedule", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json().catch(() => ({}));
        const sched = j?.schedule && typeof j.schedule === "object" ? j.schedule : {};
        if (!cancelled) {
          setHours((prev) => ({ ...prev, ...sched }));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedCount = useMemo(() => Object.values(meals).filter(Boolean).length, [meals]);

  function toggle(key: keyof typeof meals) {
    setMeals((m) => ({ ...m, [key]: !m[key] }));
  }

  async function finish(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    if (selectedCount < 2) {
      toast.error("Selecciona al menos 2 comidas");
      return;
    }
    try {
      // Build mealHours map only for enabled meals
      const mealHours: Record<string, string> = {};
      const toTipo = (k: keyof typeof meals): string => {
        switch (k) {
          case "desayuno": return "Desayuno";
          case "almuerzo": return "Almuerzo";
          case "cena": return "Cena";
          case "snack_manana": return "Snack_manana";
          case "snack_tarde": return "Snack_tarde";
          default: return String(k);
        }
      };
      (Object.keys(meals) as Array<keyof typeof meals>).forEach((k) => {
        if (meals[k]) {
          const tipo = toTipo(k);
          const h = hours[tipo];
          if (h && /^\d{2}:\d{2}$/.test(h)) mealHours[tipo] = h;
        }
      });

      // Guardar comidas habilitadas y horas preferidas en el perfil
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferencias_alimentos: {
            enabledMeals: meals,
            mealHours,
          },
          onboarding_step: "meals-terms",
        }),
      });
      if (res.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!res.ok) throw new Error();

      // Persistir horarios también vía API de schedule (queda en PlanComida si existe; si no, en preferencias)
      const entries = Object.entries(mealHours);
      for (const [tipo, hora] of entries) {
        try {
          await fetch("/api/account/meal-plan/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tipo, hora }),
          });
        } catch {}
      }

      // Siguiente paso: selección de alimentos
      router.push("/onboarding/foods");
    } catch {
      toast.error("No se pudo finalizar el onboarding");
    }
  }

  return (
    <OnboardingLayout>
      <OnboardingHeader title="Registros de Comidas" />
      <OnboardingCard>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Elige comidas que planeas registrar regularmente y define una hora tentativa para cada una (podrás cambiarlo luego):
          </div>
          {/* Desayuno */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-3">
              <Checkbox checked={meals.desayuno} onCheckedChange={() => toggle("desayuno")} /> Desayuno
            </label>
            {meals.desayuno && (
              <input
                type="time"
                className="h-9 rounded-md border px-2 text-sm w-[140px]"
                value={hours.Desayuno || ""}
                onChange={(e) => setHours((prev) => ({ ...prev, Desayuno: e.target.value }))}
                aria-label="Hora de Desayuno"
              />
            )}
          </div>
          {/* Snack mañana */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-3">
              <Checkbox checked={meals.snack_manana} onCheckedChange={() => toggle("snack_manana")} /> Snack de media mañana
            </label>
            {meals.snack_manana && (
              <input
                type="time"
                className="h-9 rounded-md border px-2 text-sm w-[140px]"
                value={hours.Snack_manana || ""}
                onChange={(e) => setHours((prev) => ({ ...prev, Snack_manana: e.target.value }))}
                aria-label="Hora de snack de media mañana"
              />
            )}
          </div>
          {/* Almuerzo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-3">
              <Checkbox checked={meals.almuerzo} onCheckedChange={() => toggle("almuerzo")} /> Almuerzo
            </label>
            {meals.almuerzo && (
              <input
                type="time"
                className="h-9 rounded-md border px-2 text-sm w-[140px]"
                value={hours.Almuerzo || ""}
                onChange={(e) => setHours((prev) => ({ ...prev, Almuerzo: e.target.value }))}
                aria-label="Hora de Almuerzo"
              />
            )}
          </div>
          {/* Snack tarde */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-3">
              <Checkbox checked={meals.snack_tarde} onCheckedChange={() => toggle("snack_tarde")} /> Snack de media tarde
            </label>
            {meals.snack_tarde && (
              <input
                type="time"
                className="h-9 rounded-md border px-2 text-sm w-[140px]"
                value={hours.Snack_tarde || ""}
                onChange={(e) => setHours((prev) => ({ ...prev, Snack_tarde: e.target.value }))}
                aria-label="Hora de snack de media tarde"
              />
            )}
          </div>
          {/* Cena */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-3">
              <Checkbox checked={meals.cena} onCheckedChange={() => toggle("cena")} /> Cena
            </label>
            {meals.cena && (
              <input
                type="time"
                className="h-9 rounded-md border px-2 text-sm w-[140px]"
                value={hours.Cena || ""}
                onChange={(e) => setHours((prev) => ({ ...prev, Cena: e.target.value }))}
                aria-label="Hora de Cena"
              />
            )}
          </div>
        </div>
      </OnboardingCard>
      <div className="text-center text-sm text-muted-foreground">
        Se sugiere seguir una dieta de 5 comidas al día para una mejor distribución de nutrientes y energía.
      </div>
      <OnboardingActions
        back={{ onClick: () => router.push("/onboarding/speed"), label: "Volver" }}
        next={{ onClick: finish, label: "Continuar", disabled: selectedCount < 2 }}
      />
    </OnboardingLayout>
  );
}
