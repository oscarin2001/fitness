"use client";

import { useRouter } from "next/navigation";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

const options = [
  { key: "Bajar", value: "Bajar_grasa", desc: "Reducir porcentaje de grasa corporal" },
  { key: "Subir", value: "Ganar_musculo", desc: "Aumentar masa muscular" },
  { key: "Mantener", value: "Mantenimiento", desc: "Mantener tu peso actual" },
] as const;

export default function OnboardingObjectivePage() {
  const router = useRouter();
  const [value, setValue] = useState<string>("");

  async function onNext(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    if (!value) return toast.error("Selecciona un objetivo");
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objetivo: value, onboarding_step: "objective" }),
      });
      if (res.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!res.ok) throw new Error();
      router.push("/onboarding/target-weight");
    } catch {
      toast.error("No se pudo guardar");
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="-mb-2">
          <Button variant="ghost" onClick={() => router.push("/onboarding/country")}>Volver</Button>
        </div>
        <h1 className="text-2xl font-semibold text-center">¿Cuál es tu objetivo?</h1>
        <RadioGroup value={value} onValueChange={setValue} className="grid gap-3">
          {options.map((o) => (
            <div key={o.key} className="flex items-center gap-3 rounded-md border p-3">
              <RadioGroupItem value={o.value} id={o.key} />
              <div>
                <Label htmlFor={o.key}>{o.key}</Label>
                <div className="text-xs text-muted-foreground">{o.desc}</div>
              </div>
            </div>
          ))}
        </RadioGroup>
        <Button type="button" className="w-full" onClick={onNext}>Continuar</Button>
      </div>
    </div>
  );
}
