"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from "recharts";
import { TrendingUp } from "lucide-react";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Calendar } from "@/components/ui/calendar";

// Objetivos IA
type Objectives = {
  kcal: number | null;
  proteinas: number | null;
  grasas: number | null;
  carbohidratos: number | null;
  agua_litros: number | null;
};

type ProgressForm = {
  fecha: string; // YYYY-MM-DD
  peso_kg?: string;
  grasa_percent?: string;
  musculo_percent?: string;
  agua_percent?: string;
  imc?: string;
  cintura_cm?: string;
  cadera_cm?: string;
  cuello_cm?: string;
  pecho_cm?: string;
  brazo_cm?: string;
  muslo_cm?: string;
  gluteo_cm?: string;
  foto_url?: string;
  notas?: string;
  fuente?: string;
};

export default function DashboardProgressPage() {
  const [form, setForm] = useState<ProgressForm>(() => ({ fecha: new Date().toISOString().slice(0, 10) }));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastItems, setLastItems] = useState<any[]>([]);
  const [summaryWeek, setSummaryWeek] = useState<any>(null);
  const [summaryMonth, setSummaryMonth] = useState<any>(null);
  const [objectives, setObjectives] = useState<Objectives | null>(null);
  const [measureIntervalWeeks, setMeasureIntervalWeeks] = useState<number>(2);
  const [profile, setProfile] = useState<{ sexo?: string; altura_cm?: number | null; peso_kg?: number | null; objetivo?: string | null; measurement_interval_weeks?: number | null } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [periodWeight, setPeriodWeight] = useState<{ start: number | null; current: number | null; delta: number | null; startDate?: string | null; currentDate?: string | null }>({ start: null, current: null, delta: null, startDate: null, currentDate: null });
  const [nextControl, setNextControl] = useState<{ date: string | null; daysDiff: number | null }>({ date: null, daysDiff: null });
  // Mini calendario
  const today = new Date();
  const [calYear, setCalYear] = useState<number>(today.getFullYear());
  const [calMonth, setCalMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [calData, setCalData] = useState<{ markedDays: string[]; nextControl: string | null; weeks: number }>({ markedDays: [], nextControl: null, weeks: 2 });

  function onChange(name: keyof ProgressForm, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  }

  // Cargar datos de calendario del backend
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/account/progress/calendar?year=${calYear}&month=${calMonth}`, { cache: "no-store" });
        if (!res.ok) throw new Error("calendar");
        const j = await res.json();
        setCalData({ markedDays: Array.isArray(j.markedDays) ? j.markedDays : [], nextControl: j.nextControl ?? null, weeks: j.weeks ?? 2 });
      } catch {
        setCalData({ markedDays: [], nextControl: null, weeks: 2 });
      }
    })();
  }, [calYear, calMonth]);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(calYear, calMonth - 1 + delta, 1));
    setCalYear(d.getUTCFullYear());
    setCalMonth(d.getUTCMonth() + 1);
  }

  function buildCalendarGrid(y: number, m1: number) {
    const start = new Date(Date.UTC(y, m1 - 1, 1));
    const end = new Date(Date.UTC(y, m1, 0)); // last day of month
    const daysInMonth = end.getUTCDate();
    const firstWeekday = start.getUTCDay(); // 0=Sun..6=Sat
    const cells: Array<{ day: number | null; dateStr: string | null }>[] = [];
    let week: Array<{ day: number | null; dateStr: string | null }> = [];
    // lead blanks
    for (let i = 0; i < firstWeekday; i++) week.push({ day: null, dateStr: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = new Date(Date.UTC(y, m1 - 1, d)).toISOString().slice(0,10);
      week.push({ day: d, dateStr });
      if (week.length === 7) { cells.push(week); week = []; }
    }
    // tail blanks
    if (week.length) {
      while (week.length < 7) week.push({ day: null, dateStr: null });
      cells.push(week);
    }
    return cells;
  }

  function deltaClass(delta: number | null): string {
    if (delta == null || !profile) return "";
    const obj = String(profile.objetivo || "");
    const nearZero = Math.abs(delta) < 0.2; // ~200 g margen
    if (nearZero) return "text-amber-600"; // mantenimiento ~ amarillo
    if (obj === "Bajar_grasa") return delta < 0 ? "text-green-600" : "text-red-600";
    if (obj === "Ganar_musculo") return delta > 0 ? "text-green-600" : "text-red-600";
    // Mantenimiento: cerca de 0 es bueno; desvíos grandes en rojo
    if (obj === "Mantenimiento") return Math.abs(delta) <= 0.5 ? "text-green-600" : "text-red-600";
    // Sin objetivo: solo verde si baja algo, rojo si sube
    return delta < 0 ? "text-green-600" : "text-red-600";
  }

  function estimateBodyFat() {
    try {
      const sexo = (profile?.sexo || "").toLowerCase();
      const h_cm = Number(profile?.altura_cm);
      const cuello = Number(form.cuello_cm);
      const cintura = Number(form.cintura_cm);
      const cadera = Number(form.cadera_cm);
      const isFemale = sexo === "femenino" || sexo === "mujer" || sexo === "female";
      const newErrors: Record<string, string> = {};
      if (!h_cm) newErrors["altura_cm"] = "Altura requerida para estimar";
      if (!cuello) newErrors["cuello_cm"] = "Campo requerido";
      if (!cintura) newErrors["cintura_cm"] = "Campo requerido";
      if (isFemale && !cadera) newErrors["cadera_cm"] = "Requerida en mujeres";
      if (Object.keys(newErrors).length) {
        setErrors((prev) => ({ ...prev, ...newErrors }));
        toast.error("Faltan datos para estimar %grasa");
        return;
      }
      const toIn = (cm: number) => cm / 2.54;
      const log10 = (x: number) => Math.log10(x);
      const H = toIn(h_cm);
      const Neck = toIn(cuello);
      const Waist = toIn(cintura);
      const Hip = toIn(cadera || 0);
      let bf: number;
      if (sexo === "femenino" || sexo === "mujer" || sexo === "female") {
        bf = 163.205 * log10(Waist + Hip - Neck) - 97.684 * log10(H) - 78.387;
      } else {
        bf = 86.010 * log10(Waist - Neck) - 70.041 * log10(H) + 36.76;
      }
      const bfClamped = Math.max(3, Math.min(60, Number(bf.toFixed(1))));
      // Derivaciones: FFM, Agua, Músculo (porcentajes)
      const peso = Number((form.peso_kg ?? profile?.peso_kg) || 0);
      let aguaPct: number | undefined;
      let muscPct: number | undefined;
      if (peso > 0) {
        const fatMass = (peso * bfClamped) / 100; // kg
        const ffm = peso - fatMass; // kg
        const waterKg = ffm * 0.73; // kg
        const muscleKg = ffm * 0.52; // kg aprox músculo esquelético
        aguaPct = Number(((waterKg / peso) * 100).toFixed(1));
        muscPct = Number(((muscleKg / peso) * 100).toFixed(1));
      }
      setForm((prev) => ({
        ...prev,
        grasa_percent: String(bfClamped),
        ...(aguaPct !== undefined ? { agua_percent: String(aguaPct) } : {}),
        ...(muscPct !== undefined ? { musculo_percent: String(muscPct) } : {}),
      }));
      toast.success("%Grasa estimado actualizado");
    } catch {
      toast.error("No se pudo estimar %grasa");
    }
  }

  // Campo de foto eliminado temporalmente; si se reactiva, restaurar uploadPhoto()

  async function loadData() {
    try {
      setLoading(true);
      const [itemsRes, weekRes, monthRes, objRes, profRes] = await Promise.all([
        fetch(`/api/account/progress?limit=90`),
        fetch(`/api/account/progress/summary?window=week&ending=${form.fecha}`),
        fetch(`/api/account/progress/summary?window=month&ending=${form.fecha}`),
        fetch(`/api/account/dashboard/summary`, { cache: "no-store" }),
        fetch(`/api/account/profile/basic`, { cache: "no-store" }),
      ]);
      const itemsJson = await itemsRes.json();
      const weekJson = await weekRes.json();
      const monthJson = await monthRes.json();
      const objJson = await objRes.json();
      const profJson = await profRes.json();
      setLastItems(itemsJson.items || []);
      setSummaryWeek(weekJson);
      setSummaryMonth(monthJson);
      setObjectives(objJson?.objetivos ?? null);
      let prof = profJson?.profile ?? null;
      // Fallback: si /basic falla o no trae datos, intenta /api/account/profile
      if (!prof) {
        try {
          const profFullRes = await fetch(`/api/account/profile`, { cache: "no-store" });
          if (profFullRes.ok) {
            const full = await profFullRes.json();
            const u = full?.user;
            if (u) {
              prof = {
                sexo: u.sexo,
                altura_cm: u.altura_cm,
                peso_kg: u.peso_kg,
                objetivo: u.objetivo,
                measurement_interval_weeks: u.measurement_interval_weeks ?? null,
              };
            }
          }
        } catch {}
      }
      setProfile(prof);
      let dbWeeks = Number(prof?.measurement_interval_weeks);
      if (!(dbWeeks && [2,3,4].includes(dbWeeks))) {
        try {
          const mi = await fetch(`/api/account/profile/measurement-interval`, { cache: "no-store" });
          if (mi.ok) {
            const mij = await mi.json();
            const alt = Number(mij?.weeks);
            if (alt && [2,3,4].includes(alt)) dbWeeks = alt;
          }
        } catch {}
      }
      if (dbWeeks && [2,3,4].includes(dbWeeks)) setMeasureIntervalWeeks(dbWeeks);

      // Autorrellenar peso desde último registro o perfil
      const last = Array.isArray(itemsJson.items) && itemsJson.items.length ? itemsJson.items[0] : null;
      const peso = last?.peso_kg ?? profJson?.profile?.peso_kg ?? "";
      setForm((prev) => ({ ...prev, peso_kg: peso ? String(peso) : prev.peso_kg }));
    } catch (e) {
      console.error(e);
      toast.error("No se pudo cargar el progreso");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.fecha]);

  // Peso del período desde backend
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/account/progress/period?ending=${form.fecha}`, { cache: "no-store" });
        if (!res.ok) throw new Error("period");
        const j = await res.json();
        setPeriodWeight({
          start: j.start ?? null,
          current: j.current ?? null,
          delta: j.delta ?? null,
          startDate: j.startDate ?? null,
          currentDate: j.currentDate ?? null,
        });
        // si el backend retorna weeks distintos, reflejar en UI
        if (j.weeks && [2,3,4].includes(Number(j.weeks))) setMeasureIntervalWeeks(Number(j.weeks));
      } catch {
        setPeriodWeight({ start: null, current: null, delta: null, startDate: null, currentDate: null });
      }
    })();
  }, [form.fecha]);

  // Próximo control: derivado de la data del calendario (backend)
  useEffect(() => {
    try {
      if (!calData.nextControl) {
        setNextControl({ date: null, daysDiff: null });
        return;
      }
      const next = new Date(calData.nextControl + "T00:00:00");
      const today = new Date(new Date().toISOString().slice(0,10));
      const days = Math.ceil((next.getTime() - today.getTime()) / (1000*60*60*24));
      setNextControl({ date: calData.nextControl, daysDiff: days });
    } catch {
      setNextControl({ date: null, daysDiff: null });
    }
  }, [calData.nextControl]);

  const weekCards = useMemo(() => [
    { title: "Peso prom. (sem)", value: summaryWeek?.weight?.avg ?? "-" },
    { title: "Pend. kg/sem", value: summaryWeek?.weight?.slope_kg_per_week ?? "-" },
    { title: "%Grasa prom.", value: summaryWeek?.bodyfat?.avg_percent ?? "-" },
    { title: "Δ %Grasa/sem", value: summaryWeek?.bodyfat?.slope_percent_points_per_week ?? "-" },
    { title: "%Músculo prom.", value: summaryWeek?.muscle?.avg_percent ?? "-" },
    { title: "Δ %Músculo/sem", value: summaryWeek?.muscle?.slope_percent_points_per_week ?? "-" },
  ], [summaryWeek]);

  // Series para gráficas (últimos 60-90 días según data disponible)
  const weightSeries = useMemo(() => {
    const arr = Array.isArray(lastItems) ? [...lastItems] : [];
    arr.reverse(); // cronológico ascendente
    return arr.map((it: any) => ({
      d: String(new Date(it.fecha).toISOString().slice(5,10)),
      v: it.peso_kg != null ? Number(it.peso_kg) : null,
    })).filter((x) => x.v != null);
  }, [lastItems]);
  const bfSeries = useMemo(() => {
    const arr = Array.isArray(lastItems) ? [...lastItems] : [];
    arr.reverse();
    return arr.map((it: any) => ({
      d: String(new Date(it.fecha).toISOString().slice(5,10)),
      v: it.grasa_percent != null ? Number(it.grasa_percent) : null,
    })).filter((x) => x.v != null);
  }, [lastItems]);
  const muscleSeries = useMemo(() => {
    const arr = Array.isArray(lastItems) ? [...lastItems] : [];
    arr.reverse();
    return arr.map((it: any) => ({
      d: String(new Date(it.fecha).toISOString().slice(5,10)),
      v: it.musculo_percent != null ? Number(it.musculo_percent) : null,
    })).filter((x) => x.v != null);
  }, [lastItems]);

  // Área de mejora según objetivo: %Músculo si ganar, %Grasa si bajar
  const improvementTarget = useMemo(() => {
    const obj = String(profile?.objetivo || "");
    return obj === "Ganar_musculo" ? "muscle" : "bodyfat";
  }, [profile?.objetivo]);

  const selectedSeries = useMemo(() => {
    return improvementTarget === "muscle" ? muscleSeries : bfSeries;
  }, [improvementTarget, muscleSeries, bfSeries]);

  const chartLabel = improvementTarget === "muscle" ? "% Músculo" : "% Grasa";

  const areaData = useMemo(() => {
    // Usar hasta últimos ~30 puntos
    const tail = selectedSeries.slice(-30);
    return tail.map((p: any) => ({ label: p.d, metric: p.v as number }));
  }, [selectedSeries]);

  const trendInfo = useMemo(() => {
    if (selectedSeries.length < 2) return null as null | { change: number; pct: number | null; improving: boolean };
    const windowPts = selectedSeries.slice(-(measureIntervalWeeks * 7));
    const first = windowPts[0]?.v;
    const last = windowPts[windowPts.length - 1]?.v;
    if (first == null || last == null) return null;
    const change = Number((last - first).toFixed(1));
    const improving = improvementTarget === "muscle" ? change > 0 : change < 0;
    const pct = first ? Number((((last - first) / first) * 100).toFixed(1)) : null;
    return { change, pct, improving };
  }, [selectedSeries, measureIntervalWeeks, improvementTarget]);

  const areaConfig: ChartConfig = {
    metric: {
      label: chartLabel,
      color: "var(--chart-1)",
    },
  };

  const objectivesCards = useMemo(() => [
    { title: "Objetivo kcal", value: objectives?.kcal ?? "-" },
    { title: "Prot (g)", value: objectives?.proteinas ?? "-" },
    { title: "Grasas (g)", value: objectives?.grasas ?? "-" },
    { title: "Carbs (g)", value: objectives?.carbohidratos ?? "-" },
    { title: "Agua (L)", value: objectives?.agua_litros ?? "-" },
  ], [objectives]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Validar intervalo mínimo entre mediciones (2–4 semanas según preferencia)
      if (Array.isArray(lastItems) && lastItems.length) {
        const lastDate = new Date(lastItems[0].fecha);
        const currentDate = new Date(form.fecha);
        const diffDays = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000*60*60*24));
        const minDays = measureIntervalWeeks * 7;
        if (!isNaN(diffDays) && diffDays < minDays) {
          toast.error(`Debes esperar al menos ${measureIntervalWeeks} semanas entre mediciones.`);
          setSaving(false);
          return;
        }
      }
      // Validaciones US Navy solamente
      const errs: Record<string, string> = {};
      if (!form.fecha) errs["fecha"] = "Fecha obligatoria";
      const peso = Number(form.peso_kg ?? profile?.peso_kg ?? NaN);
      if (!peso || isNaN(peso)) errs["peso_kg"] = "Peso obligatorio";
      else if (peso < 20 || peso > 350) errs["peso_kg"] = "Rango 20–350 kg";

      const s = (profile?.sexo || "").toLowerCase();
      const isFemale = s === "femenino" || s === "mujer" || s === "female";
      const numRange = (val: string | undefined, min: number, max: number) => {
        if (val == null || val === "") return "Campo requerido";
        const n = Number(val);
        if (isNaN(n)) return "Valor inválido";
        if (n < min || n > max) return `Rango ${min}–${max}`;
        return null;
      };
      const cinturaMsg = numRange(form.cintura_cm, 40, 200);
      if (cinturaMsg) errs["cintura_cm"] = cinturaMsg;
      const cuelloMsg = numRange(form.cuello_cm, 25, 60);
      if (cuelloMsg) errs["cuello_cm"] = cuelloMsg;
      if (isFemale) {
        const caderaMsg = numRange(form.cadera_cm, 60, 200);
        if (caderaMsg) errs["cadera_cm"] = caderaMsg;
      }
      if (Object.keys(errs).length) {
        setErrors(errs);
        toast.error("Revisa los campos marcados");
        setSaving(false);
        return;
      }
      // Calcular IMC si hay peso y altura en perfil
      let imcVal: number | undefined = undefined;
      const pesoN = Number(form.peso_kg ?? profile?.peso_kg ?? NaN);
      const altura_m = profile?.altura_cm ? Number(profile.altura_cm) / 100 : undefined;
      if (pesoN && altura_m) {
        imcVal = Number((pesoN / (altura_m * altura_m)).toFixed(1));
      }

      const res = await fetch("/api/account/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, imc: imcVal }),
      });
      if (!res.ok) throw new Error("error");
      toast.success("Progreso guardado");
      await loadData();
    } catch (e) {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function applyAdjust() {
    try {
      const res = await fetch("/api/account/progress/adjust-plan", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Error");
      toast.success(`Objetivos ajustados a ${json.next.kcal_objetivo} kcal`);
      await loadData();
    } catch (e) {
      toast.error("No se pudo ajustar el plan");
    }
  }

  return (
    <div className="p-6 space-y-6">
      <Toaster />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">Progreso corporal</h1>
          <p className="text-muted-foreground mt-1 text-sm">Registra tu peso, %grasa, %músculo y medidas.</p>
        </div>
        
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Método US Navy al lado del formulario */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Método US Navy</CardTitle>
            <CardDescription>Cómo calculamos tu composición</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Usamos la fórmula US Navy (cinta métrica). Requiere: hombres (cintura + cuello + altura), mujeres (cintura + cadera + cuello + altura).
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>% grasa corporal estimado por ecuación validada por la Marina de EE.UU.</li>
              <li>Agua y Músculo se derivan de la masa libre de grasa: agua ≈ FFM×0.73, músculo ≈ FFM×0.52.</li>
              <li>Precisión típica: ±3–4 pp en %grasa con medición consistente (hasta ±5–6 si hay variaciones).</li>
              <li>Consejo: mide a la misma hora, tras ir al baño, sin bombeo, y repite en el mismo punto.</li>
            </ul>
          </CardContent>
        </Card>



        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Registrar medición</CardTitle>
              <CardDescription>Selecciona la fecha y completa los campos que tengas disponibles.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid grid-cols-1 md:grid-cols-3 gap-4" onSubmit={onSubmit}>
                <div>
                  <Label htmlFor="fecha">Fecha</Label>
                  <Input id="fecha" type="date" value={form.fecha} onChange={(e) => onChange("fecha", e.target.value)} className={errors.fecha ? "border-red-500 focus-visible:ring-red-500" : undefined} />
                  {errors.fecha && <p className="text-xs text-red-500 mt-1">{errors.fecha}</p>}
                </div>
                <div>
                  <Label>Sexo</Label>
                  <Input value={String(profile?.sexo ?? "-")} disabled readOnly />
                </div>
                <div>
                  <Label>Altura (cm)</Label>
                  <Input value={profile?.altura_cm ?? "-"} disabled readOnly />
                </div>
                <div>
                  <Label>Peso (kg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.peso_kg || ""}
                    onChange={(e) => onChange("peso_kg", e.target.value)}
                    placeholder={profile?.peso_kg ? String(profile.peso_kg) : ""}
                    className={errors.peso_kg ? "border-red-500 focus-visible:ring-red-500" : undefined}
                  />
                  {errors.peso_kg && <p className="text-xs text-red-500 mt-1">{errors.peso_kg}</p>}
                </div>
                    {/* Campos derivados se mueven debajo del botón de cálculo */}
                    {/* IMC oculto: se calcula automáticamente al guardar */}
                    <div>
                      <Label>Cintura (cm)</Label>
                      <Input type="number" step="0.1" value={form.cintura_cm || ""} onChange={(e) => onChange("cintura_cm", e.target.value)} className={errors.cintura_cm ? "border-red-500 focus-visible:ring-red-500" : undefined} />
                      {errors.cintura_cm && <p className="text-xs text-red-500 mt-1">{errors.cintura_cm}</p>}
                    </div>
                    {(() => {
                      const s = (profile?.sexo || "").toLowerCase();
                      const isFemale = s === "femenino" || s === "mujer" || s === "female";
                      if (!isFemale) return null;
                      return (
                        <div>
                          <Label>Cadera (cm)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={form.cadera_cm || ""}
                            onChange={(e) => onChange("cadera_cm", e.target.value)}
                            className={errors.cadera_cm ? "border-red-500 focus-visible:ring-red-500" : undefined}
                          />
                          {errors.cadera_cm && <p className="text-xs text-red-500 mt-1">{errors.cadera_cm}</p>}
                        </div>
                      );
                    })()}
                    <div>
                      <Label>Cuello (cm)</Label>
                      <Input type="number" step="0.1" value={form.cuello_cm || ""} onChange={(e) => onChange("cuello_cm", e.target.value)} className={errors.cuello_cm ? "border-red-500 focus-visible:ring-red-500" : undefined} />
                      {errors.cuello_cm && <p className="text-xs text-red-500 mt-1">{errors.cuello_cm}</p>}
                    </div>
                    {/* Se eliminaron campos no requeridos por US Navy */}
                    {/* Botón Estimar reubicado al final de las mediciones */}
                    <div className="md:col-span-3 flex justify-end">
                      <Button type="button" variant="secondary" onClick={estimateBodyFat}>Calcular composición corporal (método US Navy)</Button>
                    </div>
                    {/* Campos derivados (solo lectura) */}
                    <div>
                      <Label htmlFor="grasa">% Grasa (estimado)</Label>
                      <Input id="grasa" type="number" step="0.1" value={form.grasa_percent || ""} disabled readOnly className={errors.grasa_percent ? "border-red-500 focus-visible:ring-red-500" : undefined} />
                      {errors.grasa_percent && <p className="text-xs text-red-500 mt-1">{errors.grasa_percent}</p>}
                    </div>
                    <div>
                      <Label htmlFor="musculo">% Músculo (estimado)</Label>
                      <Input id="musculo" type="number" step="0.1" value={form.musculo_percent || ""} disabled readOnly className={errors.musculo_percent ? "border-red-500 focus-visible:ring-red-500" : undefined} />
                    </div>
                    <div>
                      <Label htmlFor="agua">% Agua (estimado)</Label>
                      <Input id="agua" type="number" step="0.1" value={form.agua_percent || ""} disabled readOnly className={errors.agua_percent ? "border-red-500 focus-visible:ring-red-500" : undefined} />
                    </div>
                    <div className="md:col-span-3">
                      <Label>Notas</Label>
                      <textarea className="w-full border rounded-md p-2 text-sm" rows={3} value={form.notas || ""} onChange={(e) => onChange("notas", e.target.value)} />
                    </div>
                    <div className="md:col-span-3 flex gap-3">
                      <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
                      <Button type="button" variant="secondary" onClick={applyAdjust}>Ajustar plan según tendencia</Button>
                    </div>

                  </form>
                </CardContent>
              </Card>

          {/* Progreso según objetivo (Area Chart) */}
          <Card>
            <CardHeader>
              <CardTitle>Progreso según objetivo</CardTitle>
              <CardDescription>
                {improvementTarget === "muscle" ? "Tendencia de % músculo" : "Tendencia de % grasa"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {areaData.length ? (
                <ChartContainer config={areaConfig}>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={areaData} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                        <Tooltip cursor={false} content={ChartTooltipContent({ indicator: "line" })} />
                        <Area dataKey="metric" type="natural" fill="var(--color-metric)" fillOpacity={0.4} stroke="var(--color-metric)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ChartContainer>
              ) : (
                <div className="text-xs text-muted-foreground">Sin datos suficientes</div>
              )}
            </CardContent>
            <CardFooter>
              <div className="flex w-full items-start gap-2 text-sm">
                <div className="grid gap-1">
                  {trendInfo ? (
                    <div className="flex items-center gap-2 leading-none font-medium">
                      {trendInfo.improving ? "Mejorando" : "Empeorando"} {trendInfo.pct != null ? `(${trendInfo.pct}% )` : ""}
                      <TrendingUp className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="text-muted-foreground">Sin ventana suficiente para evaluar tendencia</div>
                  )}
                  <div className="text-muted-foreground leading-none">
                    Ventana: {measureIntervalWeeks} semana(s)
                  </div>
                </div>
              </div>
            </CardFooter>
          </Card>
            </div>

        <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="sm:col-span-2">
            <CardHeader>
              <CardTitle>Tendencias (últimos registros)</CardTitle>
              <CardDescription>Visualiza la evolución general</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="h-40">
                  <div className="text-xs text-muted-foreground mb-1">Peso (kg)</div>
                  {weightSeries.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weightSeries} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="d" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={16} />
                        <YAxis width={28} tick={{ fontSize: 10 }} domain={["auto","auto"]} />
                        <Tooltip formatter={(v:any)=>`${v} kg`} labelFormatter={(l)=>`Fecha: ${l}`} />
                        <Line type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-xs text-muted-foreground">Sin datos suficientes</div>
                  )}
                </div>
                <div className="h-40">
                  <div className="text-xs text-muted-foreground mb-1">% Grasa</div>
                  {bfSeries.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={bfSeries} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="d" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={16} />
                        <YAxis width={28} tick={{ fontSize: 10 }} domain={["auto","auto"]} />
                        <Tooltip formatter={(v:any)=>`${v}%`} labelFormatter={(l)=>`Fecha: ${l}`} />
                        <Line type="monotone" dataKey="v" stroke="#f97316" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-xs text-muted-foreground">Sin datos suficientes</div>
                  )}
                </div>
                <div className="h-40">
                  <div className="text-xs text-muted-foreground mb-1">% Músculo</div>
                  {muscleSeries.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={muscleSeries} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="d" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={16} />
                        <YAxis width={28} tick={{ fontSize: 10 }} domain={["auto","auto"]} />
                        <Tooltip formatter={(v:any)=>`${v}%`} labelFormatter={(l)=>`Fecha: ${l}`} />
                        <Line type="monotone" dataKey="v" stroke="#22c55e" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-xs text-muted-foreground">Sin datos suficientes</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Peso del período</CardTitle>
              <CardDescription>
                Ventana: {measureIntervalWeeks} semana(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <div className="p-3 border rounded-md">
                <div className="text-xs text-muted-foreground">Inicial</div>
                <div className="text-lg font-semibold">{periodWeight.start ?? "-"}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{periodWeight.startDate ?? ""}</div>
              </div>
              <div className="p-3 border rounded-md">
                <div className="text-xs text-muted-foreground">Actual</div>
                <div className="text-lg font-semibold">{periodWeight.current ?? "-"}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{periodWeight.currentDate ?? ""}</div>
              </div>
              <div className="p-3 border rounded-md">
                <div className="text-xs text-muted-foreground">Cambio</div>
                <div className={`text-lg font-semibold ${deltaClass(periodWeight.delta)}`}>
                  {periodWeight.delta == null ? "-" : (periodWeight.delta > 0 ? `+${periodWeight.delta}` : `${periodWeight.delta}`)} kg
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Calendario de controles</CardTitle>
              <CardDescription>
                Intervalo: {calData.weeks} semana(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Calendar
                  month={new Date(Date.UTC(calYear, calMonth - 1, 1))}
                  onMonthChange={(d: Date) => { setCalYear(d.getUTCFullYear()); setCalMonth(d.getUTCMonth() + 1); }}
                  markedDays={calData.markedDays}
                  nextControl={calData.nextControl}
                  captionLayout="dropdown"
                  showOutsideDays
                />
                {calData.nextControl && (
                  <div className="text-[11px] text-muted-foreground">Próximo control: <span className="font-medium">{calData.nextControl}</span></div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Resumen semanal */}
          <Card>
            <CardHeader>
              <CardTitle>Resumen semanal</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {weekCards.map((c) => (
                <div key={c.title} className="p-3 border rounded-md">
                  <div className="text-xs text-muted-foreground">{c.title}</div>
                  <div className="text-lg font-semibold">{c.value ?? "-"}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Se eliminó la tarjeta 'Últimas mediciones' */}

        </div>
      </div>
    </div>
  );
}
