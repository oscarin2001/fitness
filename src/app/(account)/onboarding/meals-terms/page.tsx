"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function OnboardingMealsTermsPage() {
  const router = useRouter();
  const [meals, setMeals] = useState({ desayuno: true, almuerzo: true, snack: true, cena: true });

  function toggle(key: keyof typeof meals) {
    setMeals((m) => ({ ...m, [key]: !m[key] }));
  }

  async function finish(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    try {
      // Guardar comidas habilitadas
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferencias_alimentos: {
            enabledMeals: meals,
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

      // Ahora ir a la selección de alimentos
      router.push("/onboarding/foods");
    } catch {
      toast.error("No se pudo finalizar el onboarding");
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="-mb-2">
          <Button type="button" variant="ghost" onClick={() => router.push("/onboarding/speed")}>Volver</Button>
        </div>
        <h1 className="text-2xl font-semibold text-center">Registros de Comidas</h1>
        <div className="rounded-md border p-4 space-y-3">
          <div className="text-sm text-muted-foreground">Elige comidas que planeas registrar regularmente (puedes cambiarlo luego):</div>
          <label className="flex items-center gap-3">
            <Checkbox checked={meals.desayuno} onCheckedChange={() => toggle("desayuno")} /> Desayuno
          </label>
          <label className="flex items-center gap-3">
            <Checkbox checked={meals.almuerzo} onCheckedChange={() => toggle("almuerzo")} /> Almuerzo
          </label>
          <label className="flex items-center gap-3">
            <Checkbox checked={meals.snack} onCheckedChange={() => toggle("snack")} /> Snack
          </label>
          <label className="flex items-center gap-3">
            <Checkbox checked={meals.cena} onCheckedChange={() => toggle("cena")} /> Cena
          </label>
        </div>
        <Button type="button" className="w-full" onClick={finish}>Continuar</Button>
      </div>
    </div>
  );
}
