"use client";

import { useRouter } from "next/navigation";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function OnboardingTargetWeightPage() {
  const router = useRouter();
  const [target, setTarget] = useState<number>(70);
  const [pesoActual, setPesoActual] = useState<number | null>(null);
  const [objetivo, setObjetivo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account/profile");
        if (res.status === 401) {
          router.replace("/auth/login");
          return;
        }
        if (!res.ok) return; // handled later
        const { user } = await res.json();
        setPesoActual(user?.peso_kg ?? null);
        setObjetivo(user?.objetivo ?? null);
        if (user?.peso_objetivo_kg != null) setTarget(Math.round(user.peso_objetivo_kg));
      } catch {}
    })();
  }, []);

  async function onNext(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    // Validaciones cliente si tenemos datos
    if (pesoActual != null && objetivo) {
      if (objetivo === "Ganar_musculo" && !(target > pesoActual)) {
        toast.error("Para ganar músculo, el objetivo debe ser mayor al peso actual");
        return;
      }
      if (objetivo === "Bajar_grasa" && !(target < pesoActual)) {
        toast.error("Para bajar grasa, el objetivo debe ser menor al peso actual");
        return;
      }
      if (objetivo === "Mantenimiento" && Math.abs(target - pesoActual) > 0.5) {
        toast.error("Para mantenimiento, el objetivo debe ser similar al peso actual");
        return;
      }
    }
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peso_objetivo_kg: target, onboarding_step: "target-weight" }),
      });
      if (res.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j?.error) toast.error(j.error); else throw new Error();
        return;
      }
      router.push("/onboarding/speed");
    } catch {
      toast.error("No se pudo guardar");
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="-mb-2">
          <Button variant="ghost" onClick={() => router.push("/onboarding/objective")}>Volver</Button>
        </div>
        <h1 className="text-2xl font-semibold text-center">Elige tu peso objetivo</h1>
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span>40</span>
            <span className="font-medium">{target} kg</span>
            <span>200</span>
          </div>
          <Slider min={40} max={200} step={1} value={[target]} onValueChange={(v) => setTarget(v[0])} />
        </div>
        <Button type="button" className="w-full" onClick={onNext}>Continuar</Button>
      </div>
    </div>
  );
}
