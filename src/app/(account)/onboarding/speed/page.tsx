"use client";

import { useRouter } from "next/navigation";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

const speeds = [
  { key: "Rapido", desc: "Mayor déficit / superávit. Cambios más rápidos" },
  { key: "Moderado", desc: "Ritmo equilibrado y sostenible" },
  { key: "Lento", desc: "Progreso gradual y conservador" },
] as const;

export default function OnboardingSpeedPage() {
  const router = useRouter();
  const [value, setValue] = useState<string>("");

  async function onNext(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    if (!value) return toast.error("Selecciona una velocidad");
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ velocidad_cambio: value, onboarding_step: "speed" }),
      });
      if (res.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!res.ok) throw new Error();
      router.push("/onboarding/meals-terms");
    } catch {
      toast.error("No se pudo guardar");
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="-mb-2">
          <Button variant="ghost" onClick={() => router.push("/onboarding/target-weight")}>Volver</Button>
        </div>
        <h1 className="text-2xl font-semibold text-center">¿Con qué rapidez deseas cambiar?</h1>
        <RadioGroup value={value} onValueChange={setValue} className="grid gap-3">
          {speeds.map((s) => (
            <div key={s.key} className="flex items-center gap-3 rounded-md border p-3">
              <RadioGroupItem value={s.key} id={s.key} />
              <div>
                <Label htmlFor={s.key}>{s.key}</Label>
                <div className="text-xs text-muted-foreground">{s.desc}</div>
              </div>
            </div>
          ))}
        </RadioGroup>
        <Button type="button" className="w-full" onClick={onNext}>Continuar</Button>
      </div>
    </div>
  );
}
