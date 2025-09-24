"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import { ThemedCheckbox as Checkbox } from "@/components/onboarding/ThemedCheckbox";

const daysOfWeek = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export default function DietDaysRestrictedPage() {
  const router = useRouter();
  const [selectedDays, setSelectedDays] = useState<string[]>(daysOfWeek);

  const toggleDay = (day: string) => {
    if (selectedDays.length === 1 && selectedDays.includes(day)) {
      alert("Debes seleccionar al menos un día.");
      return;
    }
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async () => {
    if (selectedDays.length === 0) {
      alert("Por favor selecciona al menos un día.");
      return;
    }

    try {
      const res = await fetch("/api/account/diet-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: selectedDays }),
      });

      if (!res.ok) throw new Error("Error al guardar los días de dieta.");

      router.push("/onboarding/review");
    } catch (error) {
      alert("Hubo un error al guardar los días de dieta.");
    }
  };

  return (
    <OnboardingLayout>
      <OnboardingHeader title="Selecciona tus días de dieta" />
      <div className="text-center text-sm text-muted-foreground">
        Se recomienda seguir la dieta los 7 días de la semana para obtener mejores resultados.
      </div>
      <OnboardingCard>
        <div className="grid grid-cols-2 gap-4">
          {daysOfWeek.map((day) => (
            <label key={day} className="flex items-center gap-2">
              <Checkbox
                checked={selectedDays.includes(day)}
                onCheckedChange={() => toggleDay(day)}
              />
              {day}
            </label>
          ))}
        </div>
      </OnboardingCard>
      <OnboardingActions
        back={{ onClick: () => router.back() }}
        next={{ onClick: handleSubmit, label: "Guardar y continuar", disabled: selectedDays.length === 0 }}
      />
    </OnboardingLayout>
  );
}