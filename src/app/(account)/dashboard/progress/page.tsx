"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
// Se elimina el modal y gráficas de tendencias; se usa toggle inline
import { Sparkles, ChevronDown } from "lucide-react";
import { Calendar } from "@/components/ui/calendar"; // (si luego se vuelve a usar calendario visual)

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

  // Eliminadas series y métricas de tendencias para vista simplificada

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

  const [showNavyDetails, setShowNavyDetails] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <Toaster />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">Progreso corporal</h1>
          <p className="text-muted-foreground mt-1 text-sm">Registra tu peso, %grasa, %músculo y medidas.</p>
        </div>
    {/* Modal eliminado: ahora se muestra inline */}
        
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Método US Navy con toggle inline */}
        <Card className="md:col-span-1">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Método US Navy</CardTitle>
              <CardDescription>Cómo calculamos tu composición</CardDescription>
            </div>
            <Button
              size="sm"
              variant={showNavyDetails ? "secondary" : "outline"}
              onClick={() => setShowNavyDetails((v) => !v)}
              aria-expanded={showNavyDetails}
              className="flex items-center gap-1"
            >
              {showNavyDetails ? "Ocultar" : "Detalles"}
              <ChevronDown className={`h-4 w-4 transition-transform ${showNavyDetails ? 'rotate-180' : ''}`} />
            </Button>
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
            {showNavyDetails && (
              <div className="mt-2 border-t pt-3 space-y-2 animate-in fade-in-0">
                <p className="text-xs leading-relaxed">
                  La fórmula US Navy estima el % de grasa a partir de perímetros. Es sensible a la técnica: usa siempre la misma cinta y tensión ligera.
                  Repite 2–3 mediciones y promedia para reducir ruido. No sustituye métodos clínicos, pero es muy útil para seguir tendencias.
                </p>
                <ul className="text-xs list-disc pl-5 space-y-1">
                  <li>No te obsesiones con un único día: observa semanas.</li>
                  <li>Si cambias horario o hidratación, la variación aumenta.</li>
                  <li>Combina con fotos y rendimiento para una visión completa.</li>
                </ul>
              </div>
            )}
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
                      <Button size="sm" type="button" variant="secondary" onClick={estimateBodyFat}>Calcular (método US Navy)</Button>
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

          {/* Se eliminó la tarjeta 'Progreso según objetivo' para simplificar la vista en PWA */}
            </div>

        <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Se eliminó 'Peso del período' para una interfaz más compacta */}

          {/* Se eliminó 'Calendario de controles' temporalmente */}

          {/* Se eliminó 'Resumen semanal' para simplificar */}

          {/* Tarjeta informativa: Próximamente */}
          <Card className="relative overflow-hidden border-none shadow-lg bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-600 text-white sm:col-span-2">
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.4),transparent_60%),radial-gradient(circle_at_70%_70%,rgba(255,255,255,0.25),transparent_60%)] pointer-events-none" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Sparkles className="h-5 w-5" />
                Muy pronto
              </CardTitle>
              <CardDescription className="text-violet-100">Subir fotos y registrar peso semanal</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-violet-50">
              Estamos construyendo una experiencia enfocada en la constancia: sube tus fotos de progreso, registra tu peso semanal y obtén comparativas inteligentes. 
              <span className="font-medium">Esta sección evolucionará</span> para darte feedback visual y métricas de composición corporal simplificadas.
            </CardContent>
          </Card>

          {/* Se eliminó la tarjeta 'Últimas mediciones' */}

        </div>
      </div>
    </div>
  );
}
