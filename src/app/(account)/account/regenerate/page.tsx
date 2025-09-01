"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Simple step status type
type Step = "idle" | "running" | "ok" | "error";

export default function RegeneratePlanPage() {
  const router = useRouter();
  const [stepAdvice, setStepAdvice] = useState<Step>("idle");
  const [stepPlan, setStepPlan] = useState<Step>("idle");
  const [stepHydration, setStepHydration] = useState<Step>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<{ items?: any[]; litros?: number } | null>(null);
  const [started, setStarted] = useState(false);
  const printableRef = useRef<HTMLDivElement>(null);

  function pushLog(s: string) {
    setLog((l) => [...l, s]);
  }

  async function run() {
    setStarted(true);
    setLog([]);
    setStepAdvice("running");
    setStepPlan("idle");
    setStepHydration("idle");
    toast.info("Iniciando regeneración del plan…");

    try {
      // 1) Advice
      pushLog("Solicitando consejo de IA…");
      const adviceRes = await fetch("/api/account/advice", { method: "POST", cache: "no-store", credentials: "include" });
      const adviceJson = await adviceRes.json();
      if (!adviceRes.ok) {
        setStepAdvice("error");
        throw new Error(adviceJson?.error || "Error al generar consejo");
      }
      setStepAdvice("ok");

      const items = Array.isArray(adviceJson?.meals?.items) ? adviceJson.meals.items : [];
      const litros = Number(adviceJson?.hydration?.litros);
      setResult({ items, litros: Number.isFinite(litros) && litros > 0 ? litros : undefined });

      // 2) Guardar plan
      if (items.length) {
        setStepPlan("running");
        pushLog("Guardando plan de comidas…");
        const savePlan = await fetch("/api/account/onboarding/initial-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
          credentials: "include",
          cache: "no-store",
        });
        if (!savePlan.ok) {
          setStepPlan("error");
          const t = await savePlan.text().catch(() => "");
          throw new Error(t || "No se pudo guardar el plan inicial");
        }
        setStepPlan("ok");
      } else {
        pushLog("No se recibieron items de comidas. Se omitirá el guardado del plan.");
        setStepPlan("ok");
      }

      // 3) Guardar hidratación
      if (Number.isFinite(litros) && litros > 0) {
        setStepHydration("running");
        pushLog("Guardando objetivo de hidratación…");
        const saveHyd = await fetch("/api/account/hydration/goal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ litros }),
          credentials: "include",
          cache: "no-store",
        });
        if (!saveHyd.ok) {
          setStepHydration("error");
          const t = await saveHyd.text().catch(() => "");
          throw new Error(t || "No se pudo guardar la hidratación");
        }
        setStepHydration("ok");
      } else {
        pushLog("No se recibió objetivo de hidratación. Se omitirá el guardado.");
        setStepHydration("ok");
      }

      // 4) Aplicar objetivos al perfil (kcal, macros y agua) usando el summary del consejo
      try {
        const applyBody: any = {};
        if (adviceJson?.summary && typeof adviceJson.summary === "object") applyBody.summary = adviceJson.summary;
        if (Number.isFinite(litros) && litros > 0) applyBody.agua_litros_obj = litros;
        if (Object.keys(applyBody).length) {
          pushLog("Aplicando objetivos de plan (kcal/macros/agua)…");
          const applyRes = await fetch("/api/account/plan/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(applyBody),
            credentials: "include",
            cache: "no-store",
          });
          if (!applyRes.ok) {
            const t = await applyRes.text().catch(() => "");
            pushLog(t || "No se pudieron aplicar objetivos del plan");
          }
        }
      } catch (e: any) {
        pushLog(e?.message || "Error aplicando objetivos del plan");
      }

      pushLog("Proceso completado. Redirige a tu plan para verlo.");
      toast.success("Regeneración completada");
    } catch (e: any) {
      pushLog(e?.message || "Error durante la regeneración");
      toast.error(e?.message || "Error durante la regeneración");
    }
  }

  useEffect(() => {
    if (!started) {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allOk = useMemo(() => stepAdvice === "ok" && stepPlan === "ok" && stepHydration === "ok", [stepAdvice, stepPlan, stepHydration]);

  function printPDF() {
    if (!printableRef.current) return;
    window.print();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Regenerar plan</h1>
      <p className="text-sm text-muted-foreground">Ejecutaremos los pasos de forma automática y te mostraremos el progreso.</p>

      {/* Steps */}
      <div className="space-y-3">
        <StepItem title="Generar consejo" status={stepAdvice} />
        <StepItem title="Guardar plan de comidas" status={stepPlan} />
        <StepItem title="Guardar hidratación" status={stepHydration} />
      </div>

      {/* Logs */}
      <div className="rounded border p-3 bg-muted/30 text-sm max-h-56 overflow-auto">
        {log.map((l, i) => (
          <div key={i} className="py-0.5">• {l}</div>
        ))}
        {log.length === 0 && <div className="text-muted-foreground">Preparando…</div>}
      </div>

      {/* Preview printable */}
      <div ref={printableRef} className="rounded border p-4">
        <h2 className="font-medium mb-2">Resumen regenerado</h2>
        <div className="text-sm text-muted-foreground mb-2">Este bloque se usará al imprimir/guardar como PDF.</div>
        <div className="space-y-2 text-sm">
          <div>Items de comidas: {result?.items?.length ?? 0}</div>
          {typeof result?.litros === "number" && <div>Objetivo de agua: {result.litros} L</div>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={run} disabled={stepAdvice === "running" || stepPlan === "running" || stepHydration === "running"} className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">Reintentar</button>
        <button onClick={() => router.push("/dashboard/plan")} className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm">Ver plan</button>
        <button onClick={printPDF} disabled={!allOk} className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">
          {allOk ? "Descargar PDF" : "Descargar PDF (cuando termine)"}
        </button>
      </div>
    </div>
  );
}

function StepItem({ title, status }: { title: string; status: Step }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor:
            status === "ok" ? "#10b981" : status === "error" ? "#ef4444" : status === "running" ? "#f59e0b" : "#d1d5db",
        }}
      />
      <div className="text-sm">
        <span className="font-medium">{title}</span>
        <span className="ml-2 text-muted-foreground">
          {status === "ok" ? "completado" : status === "error" ? "error" : status === "running" ? "en progreso" : "pendiente"}
        </span>
      </div>
    </div>
  );
}
