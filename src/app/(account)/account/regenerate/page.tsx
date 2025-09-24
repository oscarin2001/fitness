"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

function tryParseAdviceJson(text: string): { summary?: any; meals?: any; hydration?: any } | null {
  try {
    const lines = (text || "").split(/\n+/);
    const out: any = {};
    for (const ln of lines) {
      const m = ln.match(/^\s*JSON_(SUMMARY|MEALS|HYDRATION)\s*:\s*(.*)$/i);
      if (m) {
        const key = m[1].toUpperCase();
        const jsonPart = m[2];
        try {
          const parsed = JSON.parse(jsonPart);
          if (key === "SUMMARY") out.summary = parsed;
          if (key === "MEALS") out.meals = parsed;
          if (key === "HYDRATION") out.hydration = parsed;
        } catch {}
      }
    }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

export default function ExportPlanPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [advice, setAdvice] = useState<string>("");
  const [summary, setSummary] = useState<any | null>(null);
  const [mealsCount, setMealsCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Intentar leer el último consejo guardado desde el perfil y/o summary del dashboard
        const [p, s] = await Promise.all([
          fetch("/api/account/profile", { method: "GET", cache: "no-store" }),
          fetch("/api/account/dashboard/summary", { method: "GET", cache: "no-store" }),
        ]);
        let text = "";
        let sum: any = null;
        try {
          const pj = await p.json();
          // El backend guarda el consejo en el atributo plan_ia (o variantes)
          const u = pj?.user || {};
          text = u?.plan_ia || u?.planIa || u?.planIA || u?.advice || "";
        } catch {}
        try {
          const sj = await s.json();
          sum = sj?.objetivos ? sj : (sj?.summary || null);
        } catch {}

        // Si no hay summary pero el consejo contiene JSON_SUMMARY o similares, intentar parsearlo
        if (!sum && text) {
          const parsed = tryParseAdviceJson(text);
          if (parsed?.summary) sum = { summary: parsed.summary };
          if (parsed?.meals) setMealsCount(Array.isArray(parsed.meals?.items) ? parsed.meals.items.length : null);
        }

        // Fallback: si no hay consejo guardado, solicitar uno en vivo (no se guarda en DB)
        if (!text) {
          const advRes = await fetch("/api/account/advice", { method: "POST", cache: "no-store", credentials: "include" });
          const advJson = await advRes.json().catch(() => ({}));
          if (advRes.ok) {
            text = advJson?.advice || "";
            if (!sum) sum = advJson?.summary ? { summary: advJson.summary } : null;
            if (Array.isArray(advJson?.meals?.items)) setMealsCount(advJson.meals.items.length);
          }
        }
        if (!cancelled) {
          setAdvice(text);
          setSummary(sum);
        }
      } catch {
        if (!cancelled) toast.error("No se pudo cargar el contenido");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      const sum = summary?.summary || summary?.objetivos || null;
      if (sum) {
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Resumen", margin, cursorY);
        cursorY += 18;
        doc.setFont("helvetica", "normal");
        const rows: Array<[string, string]> = [
          ["TMB", sum.tmb != null ? `${Math.round(sum.tmb)} kcal` : "—"],
          ["TDEE", sum.tdee != null ? `${Math.round(sum.tdee)} kcal` : "—"],
          ["Kcal objetivo", sum.kcal_objetivo != null ? `${Math.round(sum.kcal_objetivo)} kcal` : "—"],
          ["Déficit/Superávit", sum.deficit_superavit_kcal != null ? `${Math.round(sum.deficit_superavit_kcal)} kcal/día` : "—"],
          ["Ritmo estimado", sum.ritmo_peso_kg_sem != null ? `${Number(sum.ritmo_peso_kg_sem).toFixed(2)} kg/sem` : "—"],
          ["Proteínas", sum.proteinas_g != null ? `${Math.round(sum.proteinas_g)} g` : "—"],
          ["Grasas", sum.grasas_g != null ? `${Math.round(sum.grasas_g)} g` : "—"],
          ["Carbohidratos", sum.carbohidratos_g != null ? `${Math.round(sum.carbohidratos_g)} g` : "—"],
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

      // Contenido del consejo (texto)
      doc.setTextColor(0);
      doc.setFontSize(12);
      const content = (advice || "No hay contenido disponible.").replace(/\r\n/g, "\n");
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
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Exportar plan</h1>
      <p className="text-sm text-muted-foreground">Descarga un PDF con tu último consejo y resumen de objetivos.</p>

      <div className="rounded border p-4 space-y-3">
        <div className="font-medium">Consejo</div>
        <div className="whitespace-pre-wrap text-sm min-h-[120px]">
          {loading ? "Cargando…" : (advice || "No hay contenido disponible.")}
        </div>
      </div>

      <div className="rounded border p-4 space-y-3">
        <div className="font-medium">Resumen</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
          <div><span className="text-foreground">Kcal:</span> {summary?.summary?.kcal_objetivo ?? summary?.objetivos?.kcal ?? "-"}</div>
          <div><span className="text-foreground">Proteínas:</span> {summary?.summary?.proteinas_g ?? summary?.objetivos?.proteinas ?? "-"}</div>
          <div><span className="text-foreground">Grasas:</span> {summary?.summary?.grasas_g ?? summary?.objetivos?.grasas ?? "-"}</div>
          <div><span className="text-foreground">Carbohidratos:</span> {summary?.summary?.carbohidratos_g ?? summary?.objetivos?.carbohidratos ?? "-"}</div>
          <div><span className="text-foreground">Agua:</span> {summary?.summary?.agua_litros_obj ?? summary?.objetivos?.agua_litros ?? "-"}</div>
          {typeof mealsCount === "number" && <div><span className="text-foreground">Comidas sugeridas:</span> {mealsCount}</div>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={downloadPdf} disabled={loading} className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">
          Descargar PDF
        </button>
        <button onClick={() => router.push("/dashboard/plan")} className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm">Ver plan</button>
      </div>
    </div>
  );
}
