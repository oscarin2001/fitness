"use client";

import { useRouter } from "next/navigation";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";

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
      // Continuar con el flujo nutricional correcto
      // 1) meal-days -> 2) protein-target -> 3) meals-terms
      router.push("/onboarding/meal-days");
    } catch {
      toast.error("No se pudo guardar");
    }
  }

  return (
    <OnboardingLayout>
      <OnboardingHeader title="¿Con qué rapidez deseas cambiar?" />
      <OnboardingCard>
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
      </OnboardingCard>
      <OnboardingActions back={{ onClick: () => router.push("/onboarding/target-weight") }} next={{ onClick: onNext }} />
    </OnboardingLayout>
  );
}

