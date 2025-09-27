"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Helpers para normalizar el summary (convierte strings como "2637 kcal/día" a número)
function num(n: any): number | null {
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  if (typeof n === 'string') {
    const m = n.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    if (m) {
      const v = Number(m[0]);
      return Number.isFinite(v) ? v : null;
    }
  }
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function normalizeSummary(raw: any | null) {
  if (!raw || typeof raw !== 'object') return null as any;
  const s: any = { ...raw };
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = (s as any)[k];
      const n = num(v);
      if (n != null) return n;
    }
    return null;
  };
  const out: any = {};
  out.tmb = pick('tmb','TMB','TMB_kcal','tmb_kcal');
  out.tdee = pick('tdee','TDEE','tdee_kcal','TDEE_kcal');
  out.kcal_objetivo = pick('kcal_objetivo','kcal','calorias','calorias_objetivo');
  out.deficit_superavit_kcal = pick('deficit_superavit_kcal','deficit_kcal','superavit_kcal','deficit');
  out.ritmo_peso_kg_sem = pick('ritmo_peso_kg_sem','ritmo_kg_sem','rate_kg_week');
  out.proteinas_g = pick('proteinas_g','proteina_g','proteinas','protein_g');
  out.grasas_g = pick('grasas_g','grasas','fat_g','grasas_diarias_g');
  out.carbohidratos_g = pick('carbohidratos_g','carbohidratos','carbs_g','carbohidratos_diarios_g');
  return out;
}

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
      // Normalizar para asegurar números (evita "—" por NaN)
      const s = normalizeSummary(sum) || sum;
      if (s) {
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Resumen", margin, cursorY);
        cursorY += 18;
        doc.setFont("helvetica", "normal");
        const rows: Array<[string, string]> = [
          ["TMB", s.tmb != null ? `${Math.round(s.tmb)} kcal` : "—"],
          ["TDEE", s.tdee != null ? `${Math.round(s.tdee)} kcal` : "—"],
          ["Kcal objetivo", s.kcal_objetivo != null ? `${Math.round(s.kcal_objetivo)} kcal` : "—"],
          ["Déficit/Superávit", s.deficit_superavit_kcal != null ? `${Math.round(s.deficit_superavit_kcal)} kcal/día` : "—"],
          ["Ritmo estimado", s.ritmo_peso_kg_sem != null ? `${Number(s.ritmo_peso_kg_sem).toFixed(2)} kg/sem` : "—"],
          ["Proteínas", s.proteinas_g != null ? `${Math.round(s.proteinas_g)} g` : "—"],
          ["Grasas", s.grasas_g != null ? `${Math.round(s.grasas_g)} g` : "—"],
          ["Carbohidratos", s.carbohidratos_g != null ? `${Math.round(s.carbohidratos_g)} g` : "—"],
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
