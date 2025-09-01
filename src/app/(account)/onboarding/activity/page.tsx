"use client";

import { useRouter } from "next/navigation";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

const levels = [
  { key: "Sedentario", desc: "Poco o nada de ejercicio" },
  { key: "Ligero", desc: "1 a 3 veces por semana" },
  { key: "Moderado", desc: "3 a 5 veces por semana" },
  { key: "Activo", desc: "6 a 7 veces por semana" },
  { key: "Extremo", desc: "Todos los días y trabajo físico" },
] as const;

export default function OnboardingActivityPage() {
  const router = useRouter();
  const [value, setValue] = useState<string>("");

  async function onNext(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    if (!value) {
      toast.error("Selecciona un nivel de actividad");
      return;
    }
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nivel_actividad: value, onboarding_step: "activity" }),
      });
      if (res.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!res.ok) throw new Error();
      router.push("/onboarding/country");
    } catch {
      toast.error("No se pudo guardar");
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold text-center">Tu nivel de actividad</h1>
        <RadioGroup value={value} onValueChange={setValue} className="grid gap-3">
          {levels.map((l) => (
            <div key={l.key} className="flex items-center gap-3 rounded-md border p-3">
              <RadioGroupItem value={l.key} id={l.key} />
              <div>
                <Label htmlFor={l.key}>{l.key}</Label>
                <div className="text-xs text-muted-foreground">{l.desc}</div>
              </div>
            </div>
          ))}
        </RadioGroup>
        <Button type="button" className="w-full" onClick={onNext}>Continuar</Button>
      </div>
    </div>
  );
}
