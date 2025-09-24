"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "next/navigation";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";

const daysOfWeek = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export default function MealDaysPage() {
  const router = useRouter();
  const [selectedDays, setSelectedDays] = useState<string[]>(daysOfWeek);
  const minRequired = 5;
  const count = useMemo(() => selectedDays.length, [selectedDays]);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async () => {
    if (selectedDays.length < minRequired) {
      alert(`Selecciona al menos ${minRequired} días para mantener coherencia. Los demás se considerarán libres.`);
      return;
    }

    try {
      const res = await fetch("/api/account/meal-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: selectedDays }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Error al guardar los días de comidas.");

      router.push("/onboarding/protein-target");
    } catch (error) {
      alert("Hubo un error al guardar los días de comidas.");
    }
  };

  return (
    <OnboardingLayout>
      <OnboardingHeader
        title="Selecciona tus días de comidas"
        subtitle={`Selecciona al menos ${minRequired} días. Los días no seleccionados quedarán libres.`}
      />
      <OnboardingCard>
        <div className="mb-2 text-sm text-muted-foreground">Días seleccionados: {count} / 7</div>
        <div className="grid grid-cols-1 gap-4">
          {daysOfWeek.map((day) => (
            <label key={day} className="flex items-center gap-3">
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
        back={{ onClick: () => router.push("/onboarding/speed") }}
        next={{ onClick: handleSubmit, label: "Continuar" }}
      />
    </OnboardingLayout>
  );
}