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
    <OnboardingLayout>
      <OnboardingHeader title="¿Cuál es tu objetivo?" subtitle="Elige el objetivo que mejor se adapte a lo que quieres lograr. Esto orienta tu plan personalizado." />
      <OnboardingCard>
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
      </OnboardingCard>
      <OnboardingActions back={{ onClick: () => router.push("/onboarding/country") }} next={{ onClick: onNext }} />
    </OnboardingLayout>
  );
}
