"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function OnboardingAdvicePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState<string>("");
  const [summary, setSummary] = useState<any | null>(null);
  const [mealItems, setMealItems] = useState<any[] | null>(null);
  const [hydrationLiters, setHydrationLiters] = useState<number | null>(null);
  const [savingMeals, setSavingMeals] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/advice", { method: "POST" });
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            if (!cancelled) router.replace("/auth/login");
            return;
          }
          if (res.status === 400 && json?.step) {
            toast.error(json?.error || "Faltan datos. Serás redirigido.");
            if (!cancelled) router.replace(`/onboarding/${json.step}`);
            return;
          }
          throw new Error(json?.error || "AI error");
        }
        if (!cancelled) {
          setText(json.advice);
          setSummary(json.summary ?? null);
          const items = json.meals?.items;
          setMealItems(Array.isArray(items) && items.length ? items : null);
          const litros = json.hydration?.litros;
          setHydrationLiters(typeof litros === "number" && litros > 0 ? litros : null);
        }
      } catch (e) {
        if (!cancelled) setText("No se pudo generar el consejo en este momento.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveMeals() {
    if (!Array.isArray(mealItems) || mealItems.length === 0) {
      toast.message("No hay comidas para guardar");
      return;
    }
    setSavingMeals(true);
    try {
      const res = await fetch("/api/account/onboarding/initial-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: mealItems }),
        credentials: "include",
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error || "No se pudo guardar el plan inicial");
        return;
      }
      const count = Array.isArray(j?.items) ? j.items.length : 0;
      toast.success(`Plan guardado (${count} comidas)`);
    } catch (e) {
      toast.error("Error guardando el plan inicial");
    } finally {
      setSavingMeals(false);
    }
  }

  async function next() {
    try {
      // 1) Guardar comidas iniciales si existen
      if (Array.isArray(mealItems) && mealItems.length) {
        try {
          const res = await fetch("/api/account/onboarding/initial-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: mealItems }),
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) {
            const t = await res.text();
            console.warn("No se pudo guardar el plan inicial", t);
            toast.error("No se pudo guardar el plan inicial");
          }
        } catch (e) {
          console.warn("Error guardando plan inicial", e);
          toast.error("Error guardando el plan inicial");
        }
      }

      // 2) Guardar objetivo de hidratación si vino en la respuesta
      if (typeof hydrationLiters === "number" && hydrationLiters > 0) {
        try {
          const res = await fetch("/api/account/hydration/goal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ litros: hydrationLiters }),
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) console.warn("No se pudo guardar hidratación", await res.text());
        } catch (e) {
          console.warn("Error guardando hidratación", e);
        }
      }

      // 3) Aplicar objetivos de plan (kcal y macros) y guardar el consejo para el usuario
      try {
        const applyBody: any = {};
        if (summary && typeof summary === "object") applyBody.summary = summary;
        if (typeof hydrationLiters === "number" && hydrationLiters > 0) applyBody.agua_litros_obj = hydrationLiters;
        if (text) applyBody.advice = text;
        if (Object.keys(applyBody).length) {
          const applyRes = await fetch("/api/account/plan/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(applyBody),
            credentials: "include",
            cache: "no-store",
          });
          if (!applyRes.ok) console.warn("No se pudieron aplicar objetivos del plan", await applyRes.text());
        }
      } catch (e) {
        console.warn("Error aplicando objetivos del plan", e);
      }

      const done = await fetch("/api/auth/onboarding/complete", { method: "POST", cache: "no-store", credentials: "include" });
      if (done.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!done.ok) throw new Error();
      toast.success("¡Listo!", { description: "Onboarding completado" });
      // Hard navigation para asegurar que el middleware lea las cookies nuevas
      try {
        document.cookie = `first_login=false; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
        document.cookie = `onboarded=true; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      } catch {}
      // Ir directo a ver el plan
      window.location.replace("/dashboard/plan");
    } catch {
      toast.error("No se pudo finalizar el onboarding");
    }
  }

  async function skip() {
    try {
      const done = await fetch("/api/auth/onboarding/complete", { method: "POST", cache: "no-store", credentials: "include" });
      if (done.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!done.ok) throw new Error();
      try {
        document.cookie = `first_login=false; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
        document.cookie = `onboarded=true; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      } catch {}
      window.location.replace("/dashboard");
    } catch {
      toast.error("No se pudo finalizar el onboarding");
    }
  }

  async function downloadPdf() {
    try {
      // Cargar jsPDF UMD si no está cargado
      const ensureJsPdf = () => new Promise<void>((resolve, reject) => {
        const w = window as any;
        if (w.jspdf?.jsPDF) return resolve();
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("No se pudo cargar jsPDF"));
        document.head.appendChild(script);
      });
      await ensureJsPdf();
      const jsPDF = (window as any).jspdf?.jsPDF;
      if (!jsPDF) throw new Error("jsPDF no disponible");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const usableWidth = pageWidth - margin * 2;

      // Título
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Consejo personalizado - FitBalance", margin, margin);

      // Fecha
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(new Date().toLocaleString(), margin, margin + 16);

      // Resumen estructurado (si existe)
      let cursorY = margin + 40;
      if (summary) {
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Resumen", margin, cursorY);
        cursorY += 18;
        doc.setFont("helvetica", "normal");
        const rows: Array<[string, string]> = [
          ["TMB", summary.tmb != null ? `${Math.round(summary.tmb)} kcal` : "—"],
          ["TDEE", summary.tdee != null ? `${Math.round(summary.tdee)} kcal` : "—"],
          ["Kcal objetivo", summary.kcal_objetivo != null ? `${Math.round(summary.kcal_objetivo)} kcal` : "—"],
          ["Déficit/Superávit", summary.deficit_superavit_kcal != null ? `${Math.round(summary.deficit_superavit_kcal)} kcal/día` : "—"],
          ["Ritmo estimado", summary.ritmo_peso_kg_sem != null ? `${summary.ritmo_peso_kg_sem.toFixed(2)} kg/sem` : "—"],
          ["Proteínas", summary.proteinas_g != null ? `${Math.round(summary.proteinas_g)} g` : "—"],
          ["Grasas", summary.grasas_g != null ? `${Math.round(summary.grasas_g)} g` : "—"],
          ["Carbohidratos", summary.carbohidratos_g != null ? `${Math.round(summary.carbohidratos_g)} g` : "—"],
        ];
        const leftColWidth = 140;
        const lineHeight = 16;
        rows.forEach(([k, v]) => {
          if (cursorY > pageHeight - margin) {
            doc.addPage();
            cursorY = margin;
          }
          doc.text(k + ":", margin, cursorY);
          doc.text(v, margin + leftColWidth, cursorY);
          cursorY += lineHeight;
        });
        // separador
        cursorY += 8;
        doc.setDrawColor(200);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);
        cursorY += 16;
      }

      // Contenido
      doc.setTextColor(0);
      doc.setFontSize(12);
      const content = (text || "No hay contenido disponible.").replace(/\r\n/g, "\n");
      const lines = doc.splitTextToSize(content, usableWidth);
      const lineHeight = 16;
      lines.forEach((line: string) => {
        if (cursorY > pageHeight - margin) {
          doc.addPage();
          cursorY = margin;
        }
        doc.text(line, margin, cursorY);
        cursorY += lineHeight;
      });

      doc.save("Consejo-FitBalance.pdf");
    } catch (e) {
      toast.error("No se pudo generar el PDF");
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="-mb-2">
          <Button variant="ghost" onClick={() => router.push("/onboarding/review")}>Volver</Button>
        </div>
        <h1 className="text-2xl font-semibold text-center">Consejo personalizado</h1>
        <div className="rounded-md border p-4 min-h-[200px] whitespace-pre-wrap">
          {loading ? "Generando recomendaciones con IA..." : text}
        </div>
        {/* Preview del plan (checklist) */}
        {Array.isArray(mealItems) && mealItems.length > 0 && (
          <div className="rounded-md border p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-medium">Preview del plan</h2>
              <Button size="sm" variant="secondary" onClick={saveMeals} disabled={savingMeals || loading}>
                {savingMeals ? "Guardando…" : "Guardar comidas"}
              </Button>
            </div>
            <div className="space-y-3 text-sm">
              {(["Desayuno","Almuerzo","Cena","Snack"] as const).map((tipo) => (
                <div key={tipo}>
                  {mealItems.some((m: any) => (m.tipo || m.meal || m.comida || m.tiempo || m.categoria)?.toString?.().toLowerCase?.() === tipo.toLowerCase()) && (
                    <div>
                      <div className="font-medium mb-1">{tipo}</div>
                      <div className="grid grid-cols-1 gap-2">
                        {mealItems.filter((m: any) => (m.tipo || m.meal || m.comida || m.tiempo || m.categoria)?.toString?.().toLowerCase?.() === tipo.toLowerCase()).map((m: any, idx: number) => (
                          <div key={idx} className="rounded border p-2">
                            <div className="text-muted-foreground">{m.nombre || `${tipo} sugerido`}</div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {(m.ingredientes || m.alimentos || []).map((ing: any, i: number) => {
                                const nm = typeof ing === 'string' ? ing : (ing.nombre || ing.name || "");
                                const gr = typeof ing === 'string' ? null : (ing.gramos ?? ing.grams ?? null);
                                return (
                                  <span key={i} className="inline-block rounded bg-muted px-2 py-0.5">
                                    {nm}{gr ? ` ${gr}g` : ""}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" variant="secondary" onClick={downloadPdf} disabled={loading}>Descargar PDF</Button>
          <Button type="button" variant="outline" onClick={skip} disabled={loading}>Omitir</Button>
          <Button type="button" onClick={next} disabled={loading}>Continuar</Button>
        </div>
      </div>
    </div>
  );
}

