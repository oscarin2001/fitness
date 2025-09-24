"use client";

import { useRouter } from "next/navigation";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";

export default function OnboardingSexPage() {
  const router = useRouter();
  const [value, setValue] = useState<string>("");

  async function onNext(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    if (!value) {
      toast.error("Selecciona una opción");
      return;
    }
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sexo: value, onboarding_step: "sex" }),
      });
      if (res.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!res.ok) throw new Error();
      router.push("/onboarding/metrics");
    } catch {
      toast.error("No se pudo guardar");
    }
  }

  return (
    <OnboardingLayout>
      <OnboardingHeader title="Elige tu género" />
      <p className="text-sm text-gray-600 mb-4 text-center">
        Por favor, selecciona tu género para personalizar tu experiencia.
      </p>
      <OnboardingCard>
        <RadioGroup value={value} onValueChange={setValue} className="grid gap-4">
          <div className="flex items-center space-x-3 rounded-md border p-3">
            <RadioGroupItem value="Masculino" id="masc" />
            <Label htmlFor="masc">Masculino</Label>
          </div>
          <div className="flex items-center space-x-3 rounded-md border p-3">
            <RadioGroupItem value="Femenino" id="fem" />
            <Label htmlFor="fem">Femenino</Label>
          </div>
          <div className="flex items-center space-x-3 rounded-md border p-3">
            <RadioGroupItem value="Otro" id="otro" />
            <Label htmlFor="otro">Otro / Prefiero no decir</Label>
          </div>
        </RadioGroup>
      </OnboardingCard>
      <OnboardingActions next={{ onClick: onNext }} />
    </OnboardingLayout>
  );
}
