"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

// Rangos sugeridos en g/kg según objetivo
const RANGE_BY_GOAL: Record<string, [number, number]> = {
  Bajar_grasa: [1.2, 1.6],
  Mantenimiento: [1.6, 1.8],
  Ganar_musculo: [1.8, 2.0],
};

export default function ProteinTargetPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [peso, setPeso] = useState<number | null>(null);
  const [objetivo, setObjetivo] = useState<string | null>(null);
  const [customMin, setCustomMin] = useState<string>("");
  const [customMax, setCustomMax] = useState<string>("");
  const [useCustom, setUseCustom] = useState<boolean>(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account/profile", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        const u = j?.user || {};
        setPeso(typeof u.peso_kg === "number" ? u.peso_kg : null);
        setObjetivo(u.objetivo || null);
        const pa = u.preferencias_alimentos || {};
        const pr = pa.proteinRangeKg as any;
        if (pr && typeof pr === "object") {
          if (typeof pr.min === "number") setCustomMin(String(pr.min));
          if (typeof pr.max === "number") setCustomMax(String(pr.max));
          setUseCustom(true);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const defaultRange = useMemo(() => {
    if (!objetivo) return [1.6, 1.8] as [number, number];
    return RANGE_BY_GOAL[objetivo] || [1.6, 1.8];
  }, [objetivo]);

  const [minKg, maxKg] = useMemo(() => {
    if (useCustom) {
      const mi = parseFloat(customMin);
      const ma = parseFloat(customMax);
      // clamp a [0.8, 2.5] y mantener coherencia min <= max
      if (Number.isFinite(mi) && Number.isFinite(ma)) {
        const clamp = (v: number) => Math.max(0.8, Math.min(2.5, v));
        const a = clamp(mi);
        const b = clamp(ma);
        if (b >= a) {
          return [a, b] as [number, number];
        }
        // si el usuario invierte, corregimos forzando b>=a
        return [a, a] as [number, number];
      }
    }
    return defaultRange;
  }, [useCustom, customMin, customMax, defaultRange]);

  const proteinTarget = useMemo(() => {
    if (!peso) return null;
    const mid = (minKg + maxKg) / 2;
    return Math.round(mid * peso);
  }, [peso, minKg, maxKg]);

  useEffect(() => {
    if (!useCustom) { setRangeError(null); return; }
    const mi = parseFloat(customMin);
    const ma = parseFloat(customMax);
    if (!Number.isFinite(mi) || !Number.isFinite(ma)) { setRangeError("Ingresa números válidos (g/kg)"); return; }
    if (mi < 0.8 || ma > 2.5) { setRangeError("El rango permitido es de 0.8 a 2.5 g/kg"); return; }
    if (ma < mi) { setRangeError("El máximo debe ser mayor o igual que el mínimo"); return; }
    setRangeError(null);
  }, [useCustom, customMin, customMax]);

  async function saveAndContinue() {
    try {
      setSaving(true);
      const payload: any = {
        onboarding_step: "protein-target",
      };
      // Guardar proteinas_g_obj (g/día) y rango elegido en preferencias
      if (proteinTarget) {
        // cap razonable para consumo diario total [50, 250] g/día
        const capped = Math.max(50, Math.min(250, proteinTarget));
        payload.proteinas_g_obj = capped;
        if (capped !== proteinTarget) {
          try { toast.message("Se ajustó el objetivo diario de proteína a un rango seguro (50–250 g/día)"); } catch {}
        }
      }
      payload.preferencias_alimentos = {
        proteinRangeKg: { min: Number(minKg.toFixed(2)), max: Number(maxKg.toFixed(2)) },
      };
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      router.push("/onboarding/meals-terms");
    } catch {
      toast.error("No se pudo guardar tu objetivo de proteína");
    } finally {
      setSaving(false);
    }
  }

  return (
    <OnboardingLayout>
      <OnboardingHeader title="Proteína diaria" subtitle="Puedes continuar directo o activar la casilla para ajustar manualmente el rango (g/kg)." />

      <OnboardingCard>
        {loading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="text-muted-foreground">
              {(() => {
                const objetivoLabel = objetivo === "Bajar_grasa" ? "Bajar peso" : objetivo === "Ganar_musculo" ? "Subir masa muscular" : objetivo === "Mantenimiento" ? "Mantener peso" : "—";
                return <>Tu objetivo es <b>{objetivoLabel}</b> y tu peso registrado es <b>{peso ?? "—"} kg</b>.</>;
              })()}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={useCustom}
                  onCheckedChange={(v) => {
                    const next = Boolean(v);
                    setUseCustom(next);
                    if (next) {
                      toast.message("Ahora podrás registrar tu propio rango de proteína (g/kg).");
                    }
                  }}
                />
                <span className="text-sm">Ajustar rango manual (g/kg)</span>
              </label>
              {!useCustom && (
                <div className="text-xs text-muted-foreground">
                  Si no lo marcas usaremos una sugerencia automática según tu objetivo.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                <input className="h-9 rounded-md border px-2" type="number" min={0.8} max={2.5} step={0.1} placeholder={`${defaultRange[0]}`} value={customMin} onChange={(e) => setCustomMin(e.target.value)} disabled={!useCustom} />
                <input className="h-9 rounded-md border px-2" type="number" min={0.8} max={2.5} step={0.1} placeholder={`${defaultRange[1]}`} value={customMax} onChange={(e) => setCustomMax(e.target.value)} disabled={!useCustom} />
              </div>
              <div className="text-xs text-muted-foreground">
                Recomendaciones generales: Bajar peso 1.2–1.6 g/kg · Mantener 1.6–1.8 g/kg · Subir músculo 1.8–2.0 g/kg.
              </div>
              {rangeError && <div className="text-xs text-red-600">{rangeError}</div>}
            </div>
            <div>
              <div className="font-medium">Objetivo diario sugerido</div>
              <div className="text-sm">{proteinTarget ? `${proteinTarget} g de proteína/día` : "—"}</div>
            </div>
          </div>
        )}
      </OnboardingCard>

      <OnboardingActions
        back={{ onClick: () => router.back(), label: "Atrás" }}
        next={{ onClick: saveAndContinue, label: saving ? "Guardando…" : "Continuar", disabled: saving || loading || (!!rangeError && useCustom) }}
      />
    </OnboardingLayout>
  );
}
