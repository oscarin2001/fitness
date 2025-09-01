"use client";

import { useRouter } from "next/navigation";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export default function OnboardingMetricsPage() {
  const router = useRouter();
  const [height, setHeight] = useState<number>(170);
  const [weight, setWeight] = useState<number>(70);

  async function onNext(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ altura_cm: height, peso_kg: weight, onboarding_step: "metrics" }),
      });
      if (res.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!res.ok) throw new Error();
      router.push("/onboarding/birthdate");
    } catch {
      toast.error("No se pudo guardar");
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-center">Tu estatura</h1>
          <p className="text-center text-sm text-muted-foreground">Selecciona tu altura en centímetros</p>
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span>100</span>
              <span className="font-medium">{height} cm</span>
              <span>220</span>
            </div>
            <Slider min={100} max={220} step={1} value={[height]} onValueChange={(v) => setHeight(v[0])} />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-center">Tu peso</h2>
          <p className="text-center text-sm text-muted-foreground">Selecciona tu peso en kilogramos</p>
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span>30</span>
              <span className="font-medium">{weight} kg</span>
              <span>200</span>
            </div>
            <Slider min={30} max={200} step={1} value={[weight]} onValueChange={(v) => setWeight(v[0])} />
          </div>
        </div>
        <Button type="button" className="w-full" onClick={onNext}>Continuar</Button>
      </div>
    </div>
  );
}
