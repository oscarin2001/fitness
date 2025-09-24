"use client";

import { useRouter } from "next/navigation";
import { Slider } from "@/components/ui/slider";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";

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
      // Personalizar rangos según el objetivo
      let maxAllowed = pesoActual; // Valor predeterminado
      let minAllowed = pesoActual; // Valor predeterminado

      if (objetivo === "Bajar_grasa") {
        maxAllowed = pesoActual; // No más que el peso actual
        minAllowed = pesoActual * 0.8; // Máximo 20% menos
      } else if (objetivo === "Ganar_musculo") {
        maxAllowed = pesoActual * 1.3; // Máximo 30% más
        minAllowed = pesoActual; // No menos que el peso actual
      } else if (objetivo === "Mantenimiento") {
        maxAllowed = pesoActual + 2; // ±2 kg
        minAllowed = pesoActual - 2;
      }

      if (target > maxAllowed || target < minAllowed) {
        toast.error(`El peso objetivo debe estar entre ${minAllowed.toFixed(1)} kg y ${maxAllowed.toFixed(1)} kg para el objetivo seleccionado.`);
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
    <OnboardingLayout>
      <OnboardingHeader title="Peso meta" />
      {/* Contexto rápido de la fase sin repetir la palabra "objetivo" varias veces.
          Mapping valores -> etiquetas legibles:
          Bajar_grasa -> Bajar peso
          Ganar_musculo -> Subir masa muscular
          Mantenimiento -> Mantenimiento */}
      {objetivo && (() => {
        const fase = objetivo === "Bajar_grasa" ? "Bajar peso" : objetivo === "Ganar_musculo" ? "Subir masa muscular" : "Mantenimiento";
        return (
          <div className="mb-4 flex justify-center">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              Fase: {fase}
            </span>
          </div>
        );
      })()}
      <OnboardingCard>
        {pesoActual != null && (
          <div className="text-center text-lg font-medium mb-4">Tu peso actual: {pesoActual} kg</div>
        )}
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span>40</span>
            <span className="font-medium">{target} kg</span>
            <span>200</span>
          </div>
          <Slider min={40} max={200} step={1} value={[target]} onValueChange={(v) => setTarget(v[0])} />
        </div>
      </OnboardingCard>
      <OnboardingActions back={{ onClick: () => router.push("/onboarding/objective") }} next={{ onClick: onNext }} />
    </OnboardingLayout>
  );
}
