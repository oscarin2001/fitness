"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import ReactCountryFlag from "react-country-flag";
import { useState } from "react";
import { toast } from "sonner";

const countries = [
  { code: "AR", name: "Argentina" },
  { code: "BO", name: "Bolivia", flag: "🇧🇴" },
  { code: "BR", name: "Brasil", flag: "🇧🇷" },
  { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "CR", name: "Costa Rica", flag: "🇨🇷" },
  { code: "CU", name: "Cuba", flag: "🇨🇺" },
  { code: "DO", name: "República Dominicana", flag: "🇩🇴" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨" },
  { code: "ES", name: "España", flag: "🇪🇸" },
  { code: "GT", name: "Guatemala", flag: "🇬🇹" },
  { code: "HN", name: "Honduras", flag: "🇭🇳" },
  { code: "MX", name: "México", flag: "🇲🇽" },
  { code: "NI", name: "Nicaragua", flag: "🇳🇮" },
  { code: "PA", name: "Panamá", flag: "🇵🇦" },
  { code: "PE", name: "Perú", flag: "🇵🇪" },
  { code: "PY", name: "Paraguay", flag: "🇵🇾" },
  { code: "SV", name: "El Salvador", flag: "🇸🇻" },
  { code: "UY", name: "Uruguay", flag: "🇺🇾" },
  { code: "VE", name: "Venezuela", flag: "🇻🇪" },
] as const;

export default function OnboardingCountryPage() {
  const router = useRouter();
  const [value, setValue] = useState<string>("");

  async function onFinish(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    if (!value) {
      toast.error("Selecciona tu país");
      return;
    }
    try {
      const res1 = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pais: value, onboarding_step: "country" }),
      });
      if (res1.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!res1.ok) throw new Error();

      router.push("/onboarding/objective");
    } catch {
      toast.error("No se pudo finalizar el onboarding");
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="-mb-2">
          <Button variant="ghost" onClick={() => router.back()}>Volver</Button>
        </div>
        <h1 className="text-2xl font-semibold text-center">¿De qué país eres?</h1>
        <div className="grid gap-2 max-h-[50vh] overflow-auto rounded-md border p-2">
          {countries.map((c) => (
            <button
              key={c.code}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted ${
                value === c.name ? "border-primary" : "border-transparent"
              }`}
              type="button"
              onClick={() => setValue(c.name)}
            >
              <span className="text-xl mr-3">
                <ReactCountryFlag svg countryCode={c.code} style={{ width: "1.5rem", height: "1.5rem" }} />
              </span>
              <span className="flex-1">{c.name}</span>
              {value === c.name && <span className="text-primary text-sm">Seleccionado</span>}
            </button>
          ))}
        </div>
        <Button type="button" className="w-full" onClick={onFinish}>Continuar</Button>
      </div>
    </div>
  );
}
