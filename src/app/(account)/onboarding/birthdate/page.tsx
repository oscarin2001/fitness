"use client";

import { useRouter } from "next/navigation";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export default function OnboardingBirthdatePage() {
  const router = useRouter();
  const [date, setDate] = useState<Date | undefined>();

  async function onNext(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    if (!date) {
      toast.error("Selecciona tu fecha de nacimiento");
      return;
    }
    // Validaciones cliente: no futuro y >= 16 años
    const now = new Date();
    if (date > now) {
      toast.error("La fecha no puede ser futura");
      return;
    }
    const age = Math.floor((now.getTime() - date.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age < 16) {
      toast.error("Debes tener al menos 16 años");
      return;
    }
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha_nacimiento: date.toISOString(), onboarding_step: "birthdate" }),
      });
      if (!res.ok) throw new Error();
      router.push("/onboarding/activity");
    } catch {
      toast.error("No se pudo guardar");
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold text-center">Fecha de nacimiento</h1>
        <div className="rounded-md border p-4">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            captionLayout="dropdown"
            fromYear={1950}
            toYear={new Date().getFullYear()}
          />
        </div>
        <Button type="button" className="w-full" onClick={onNext}>Continuar</Button>
      </div>
    </div>
  );
}
