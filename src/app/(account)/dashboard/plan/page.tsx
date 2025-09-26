"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import WeeklyPlanByDay, { WeeklyDay } from "@/components/WeeklyPlanByDay";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
 

type MealItem = {
  id: number;
  tipo: string; // permitir variantes como Snack_manana / Snack_tarde si backend las provee
  porciones: number;
  overrides: Record<string, number> | null;
  receta: {
    id: number;
    nombre: string;
    porciones: number;
    tipo?: string | null;
    alimentos: Array<{ id: number; nombre: string; gramos: number }>;
    macros: { kcal: number; proteinas: number; grasas: number; carbohidratos: number };
  };
};

type ComplianceRow = { id: number; fecha: string; comida_tipo: MealItem["tipo"]; cumplido: boolean };

const ORDER_BASE: string[] = [
  "Desayuno",
  "Snack_mañana",
  "Snack_manana",
  "Snack mañana",
  "Almuerzo",
  "Snack_tarde",
  "Snack tarde",
  "Cena",
  "Snack",
];

export default function PlanPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MealItem[]>([]);
  const [compliance, setCompliance] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiEdit, setAiEdit] = useState<Record<string, { fromId: string; toId: string; loading: boolean }>>({});
  const [autoGenLoading, setAutoGenLoading] = useState(false);
  const [objetivos, setObjetivos] = useState<{ kcal: number | null; proteinas: number | null; grasas: number | null; carbohidratos: number | null; agua_litros: number | null } | null>(null);
  const [hidratacion, setHidratacion] = useState<{ hoy_litros: number; objetivo_litros: number | null; completado: boolean } | null>(null);
  const [hours, setHours] = useState<Record<string, string>>({}); // horario por tipo (persistido en backend)
  const [rowHours, setRowHours] = useState<Record<string, string>>({}); // horario por fila (UI), clave tipo:idx
  // Rango de días movido a la vista de Insights
  const [hydrationNotified, setHydrationNotified] = useState(false);
  const [profile, setProfile] = useState<any | null>(null);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyDay[] | null>(null);
  const [planAIWeekly, setPlanAIWeekly] = useState<WeeklyDay[] | null>(null);
  const [beveragesPlan, setBeveragesPlan] = useState<{ nombre: string; ml: number; momento: string }[] | null>(null);
  const [showMacros, setShowMacros] = useState(false);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Fecha actual legible arriba
  const nowHuman = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(today);
    } catch { return today.toDateString(); }
  }, [today]);

  // Helper fechas
  function isoDate(d: Date) {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
  }

  // Marcar todo el día como cumplido o deshacer
  async function toggleAllForDay() {
    if (!items || !items.length) return;
    // Determinar si todas están cumplidas según estado actual
    const tipos = Array.from(new Set(items.map((i) => i.tipo)));
    const allDone = tipos.every(t => compliance[t]);
    setSaving("__all");
    try {
      for (const tipo of tipos) {
        const current = !!compliance[tipo];
        const target = !allDone; // si todas están done -> desmarcar; si no -> marcar
        if (current === target) continue;
        // Necesitamos una hora válida; si no hay, usar preset o 12:00 como fallback seguro
        const k = hourKey(tipo, 0);
        const effectiveHour = rowHours[k] ?? presetHourForRow(tipo, 0) ?? "12:00";
        await fetch("/api/account/meal-plan/compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo, cumplido: target, date: selectedDate, hora: effectiveHour }),
        });
      }
      // Refrescar estado de cumplimiento
      const compRes = await fetch(`/api/account/meal-plan/compliance?date=${selectedDate}`);
      const compJson = await compRes.json();
      const map: Record<string, boolean> = {};
      (compJson.items || []).forEach((r: ComplianceRow) => { map[r.comida_tipo] = !!r.cumplido; });
      setCompliance(map);
      toast.success(allDone ? "Se desmarcaron todas las comidas" : "¡Día marcado como cumplido!");
    } catch {
      toast.error("No se pudo actualizar el día");
    } finally {
      setSaving(null);
    }
  }
  function addDays(base: Date, n: number) {
    const d = new Date(base); d.setDate(d.getDate() + n); return d;
  }
  // Tira de 7 días centrada en hoy (Lun-Dom de la semana actual)
  const weekDates = useMemo(() => {
    const day = today.getDay(); // 0=Dom..6=Sáb
    const diffToMon = ((day + 6) % 7); // días desde lunes
    const monday = addDays(today, -diffToMon);
    const arr = Array.from({ length: 7 }).map((_, i) => addDays(monday, i));
    return arr.map((d) => {
      const iso = isoDate(d);
      const weekdayShort = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(d).replace('.', '');
      const dayNum = d.getDate();
      return { iso, label: `${weekdayShort} ${dayNum}` };
    });
  }, [today]);

  // Busca una hora preestablecida para un tipo; tolera variaciones de mayúsculas y variantes Snack_* cayendo a Snack
  function presetHourFor(tipo: string): string | null {
    const h = (hours && typeof hours === "object") ? (hours as any)[tipo] : null;
    if (typeof h === "string") return h;
    const lower = String(tipo).toLowerCase();
    if (hours && typeof hours === "object") {
      const matchKey = Object.keys(hours).find((k) => String(k).toLowerCase() === lower);
      if (matchKey && typeof (hours as any)[matchKey] === "string") return (hours as any)[matchKey];
    }
    if (/snack/.test(lower)) {
      const snack = (hours as any)?.["Snack"] || (hours as any)?.["snack"]; // usar Snack genérico si existe
      if (typeof snack === "string") return snack;
      // última opción: buscan alguna clave que empiece por snack_
      if (hours && typeof hours === "object") {
        const anySnackKey = Object.keys(hours).find((k) => /^snack([_\s]|$)/i.test(k));
        if (anySnackKey && typeof (hours as any)[anySnackKey] === "string") return (hours as any)[anySnackKey];
      }
    }
    return null;
  }

  // Preselección por fila: si es Snack, intenta mapear la fila 0 a Snack_manana y la 1 a Snack_tarde
  function presetHourForRow(tipo: string, idx: number): string | null {
    if (/snack/i.test(tipo)) {
      const prefer = idx === 0 ? ["Snack_manana", "Snack_mañana", "Snack mañana"] : ["Snack_tarde", "Snack tarde"];
      for (const key of prefer) {
        const v = (hours as any)?.[key];
        if (typeof v === "string" && /^\d{2}:\d{2}$/.test(v)) return v;
        // buscar por insensible a mayúsculas
        const lower = key.toLowerCase();
        const cand = Object.keys(hours || {}).find((k) => k.toLowerCase() === lower);
        if (cand) {
          const vv = (hours as any)[cand];
          if (typeof vv === "string" && /^\d{2}:\d{2}$/.test(vv)) return vv;
        }
      }
    }
    return presetHourFor(tipo);
  }

  // Determina la clave de horario a guardar por fila (para distinguir Snack mañana/tarde)
  function variantTipoForSave(tipo: string, idx: number): string {
    if (/snack/i.test(tipo)) {
      return idx === 0 ? "Snack_manana" : "Snack_tarde";
    }
    return tipo;
  }

  useEffect(() => {
    (async () => {
      try {
        const [planRes, compRes, sumRes, aiPlanRes] = await Promise.all([
          fetch("/api/account/meal-plan"),
          fetch(`/api/account/meal-plan/compliance?date=${selectedDate}`),
          fetch("/api/account/dashboard/summary", { cache: "no-store" }),
          fetch("/api/account/plan", { cache: "no-store" }),
        ]);
        const planJson = await planRes.json();
        const compJson = await compRes.json();
        const sumJson = await sumRes.json().catch(() => ({}));
        const aiPlanJson = await aiPlanRes.json().catch(() => ({}));
        setItems(planJson.items || []);
        const map: Record<string, boolean> = {};
        (compJson.items || []).forEach((r: ComplianceRow) => {
          map[r.comida_tipo] = !!r.cumplido;
        });
        setCompliance(map);
        if (sumRes.ok) {
          setObjetivos(sumJson?.objetivos || null);
          setHidratacion(sumJson?.hidratacion || null);
        }
        // Leer plan_ai semanal y bebidas si existen
        if (aiPlanRes.ok && aiPlanJson) {
          const w = aiPlanJson?.plan_ai?.weekly;
          if (Array.isArray(w) && w.length) setPlanAIWeekly(w);
          const bev = aiPlanJson?.plan_ai?.beverages?.items;
          if (Array.isArray(bev) && bev.length) setBeveragesPlan(
            bev.map((b: any) => ({
              nombre: (b?.nombre || b?.name || 'Bebida').toString(),
              ml: Math.min(250, Math.max(0, Number(b?.ml) || 0)),
              momento: (b?.momento || 'General').toString()
            }))
          );
        }
        // Cargar horarios persistidos
        try {
          const schedRes = await fetch("/api/account/meal-plan/schedule", { cache: "no-store" });
          if (schedRes.ok) {
            const sj = await schedRes.json();
            if (sj && sj.schedule && typeof sj.schedule === "object") setHours(sj.schedule);
          }
        } catch {}

        // Fallback: completar horas desde preferencias si no están en schedule
        try {
          const profRes = await fetch("/api/account/profile", { cache: "no-store" });
          if (profRes.ok) {
            const pj = await profRes.json().catch(() => ({}));
            setProfile(pj?.user || null);
            let prefs = pj?.user?.preferencias_alimentos ?? null;
            if (prefs && typeof prefs === "string") { try { prefs = JSON.parse(prefs); } catch { prefs = null; } }
            const mh = prefs && typeof prefs === "object" ? prefs.mealHours : null;
            if (mh && typeof mh === "object") {
              setHours((prev) => {
                const out = { ...prev } as Record<string, string>;
                const get = (k: string) => {
                  const direct = mh[k];
                  if (typeof direct === "string") return direct;
                  const lower = String(k).toLowerCase();
                  const cand = Object.keys(mh).find((kk) => String(kk).toLowerCase() === lower);
                  if (cand && typeof mh[cand] === "string") return mh[cand];
                  return undefined;
                };
                if (!out["Desayuno"]) { const h = get("Desayuno"); if (h) out["Desayuno"] = h; }
                if (!out["Almuerzo"]) { const h = get("Almuerzo"); if (h) out["Almuerzo"] = h; }
                if (!out["Cena"]) { const h = get("Cena"); if (h) out["Cena"] = h; }
                if (!out["Snack"]) {
                  const candidates: string[] = [];
                  const push = (k: string) => { const v = get(k); if (v) candidates.push(v); };
                  ["Snack","Snack_manana","Snack_mañana","Snack mañana","Snack_tarde","Snack tarde"].forEach(push);
                  if (candidates.length) { candidates.sort(); out["Snack"] = candidates[0]; }
                }
                return out;
              });
            }
          }
        } catch {}
      } catch {
        setError("No se pudo cargar el plan");
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedDate]);

  // Construir plan semanal (similar a onboarding) a partir de items persistidos
  useEffect(() => {
    // Si existe un plan semanal guardado por la IA, úsalo directamente
    if (Array.isArray(planAIWeekly) && planAIWeekly.length) { setWeeklyPlan(planAIWeekly); return; }
    if (!items || !items.length) { setWeeklyPlan(null); return; }
    // Determinar días activos: usar usuario.dias_dieta si existe (1..7), default 7
    const dietDaysCount = (profile && typeof profile.dias_dieta === 'number' && profile.dias_dieta >=1 && profile.dias_dieta <=7) ? profile.dias_dieta : 7;
    const allDayNames = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"]; 
    const dayNames = allDayNames.slice(0, dietDaysCount);
    const rotationIndex: Record<string, number> = { Lunes:0, Jueves:0, Martes:1, Viernes:1, Miércoles:2, Sábado:2, Domingo:3 };
    const maxRot = Math.min(3, Math.max(...dayNames.map(d => rotationIndex[d] ?? 0)));
    const requiredVariants = maxRot + 1; // 1..4
    // Agrupar por tipo
    const mealsByType: Record<string, MealItem[]> = {};
    items.forEach(it => { if (!mealsByType[it.tipo]) mealsByType[it.tipo] = []; mealsByType[it.tipo].push(it); });
    // Asegurar variantes mínimas clonando receta y renombrando
    Object.keys(mealsByType).forEach(tipo => {
      const list = mealsByType[tipo];
      if (!list.length) { delete mealsByType[tipo]; return; }
      let idx = 0;
      while (list.length < requiredVariants) {
        const base = list[0];
        const clone: MealItem = JSON.parse(JSON.stringify(base));
        clone.receta.nombre = `${base.receta.nombre} (${String.fromCharCode(65 + list.length)})`;
        list.push(clone);
        idx++;
        if (idx > 10) break; // safety
      }
      // Renombrar primera si no tiene sufijo
      if (list[0] && !/\([A-D]\)$/.test(list[0].receta.nombre)) {
        list[0].receta.nombre = `${list[0].receta.nombre} (A)`;
      }
    });
    const typeKeys = Object.keys(mealsByType);
    const dailyProtein = objetivos?.proteinas || null;
    const proteinShare = typeKeys.length ? 1 / typeKeys.length : 0;
    const weekly: WeeklyDay[] = dayNames.map(day => {
      const rot = rotationIndex[day] ?? 0;
      const meals = typeKeys.map(tipo => {
        const variants = mealsByType[tipo];
        const variant = variants[rot % variants.length];
        const ingredientes = variant.receta.alimentos || [];
        const itemsText = ingredientes.map(a => `${a.nombre} (${a.gramos} g)`);
        return {
          tipo,
          receta: { nombre: variant.receta.nombre },
          targetProteinG: dailyProtein ? Math.round(dailyProtein * proteinShare) : null,
          itemsText
        };
      });
      return { day, active: true, meals };
    });
    setWeeklyPlan(weekly);
  }, [items, objetivos, profile, planAIWeekly]);

  // Notificación al alcanzar objetivo de hidratación
  useEffect(() => {
    if (!hidratacion) return;
    const obj = hidratacion.objetivo_litros ?? null;
    const hoy = hidratacion.hoy_litros ?? 0;
    // Resetear bandera si se cambia objetivo o se baja de objetivo (p.ej. cambios de día)
    if (!obj || hoy < obj) {
      if (hydrationNotified) setHydrationNotified(false);
      return;
    }
    if (obj && hoy >= obj && !hydrationNotified) {
      toast.success("¡Objetivo de hidratación alcanzado!", { description: `Has llegado a ${hoy.toFixed(2)} L de ${obj} L` });
      setHydrationNotified(true);
    }
  }, [hidratacion, hydrationNotified]);

  async function refreshPlan() {
    try {
      const res = await fetch("/api/account/meal-plan", { cache: "no-store" });
      const json = await res.json();
      setItems(json.items || []);
    } catch {}
  }

  async function aiReplace(tipo: MealItem["tipo"]) {
    const state = aiEdit[tipo] || { fromId: "", toId: "", loading: false };
    const fromId = Number(state.fromId);
    const toId = Number(state.toId);
    if (!fromId || !toId) {
      setError("Indica IDs válidos para reemplazar");
      return;
    }
    setAiEdit((prev) => ({ ...prev, [tipo]: { ...state, loading: true } }));
    setError(null);
    try {
      const res = await fetch("/api/account/meal-plan/ai-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, replaceFromId: fromId, replaceToId: toId }),
      });
      if (!res.ok) throw new Error();
      await refreshPlan();
    } catch {
      setError("No se pudo editar con IA");
    } finally {
      setAiEdit((prev) => ({ ...prev, [tipo]: { ...state, loading: false } }));
    }
  }

  function isValidHour(h?: string) {
    return !!h && /^\d{2}:\d{2}$/.test(h);
  }

  function hourKey(tipo: string, idx: number) {
    return `${tipo}:${idx}`;
  }

  async function toggle(tipo: MealItem["tipo"], idx: number) {
    // Determinar hora efectiva para esta fila
    const k = hourKey(tipo, idx);
    const effectiveHour = rowHours[k] ?? presetHourForRow(tipo, idx) ?? "";
    if (!isValidHour(effectiveHour)) {
      toast.error(`Ingresa la hora para ${tipo} antes de marcar como cumplido`);
      return;
    }
    const variantTipo = variantTipoForSave(tipo, idx);
    setSaving(tipo);
    try {
      const newVal = !compliance[tipo];
      const res = await fetch("/api/account/meal-plan/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, cumplido: newVal, date: selectedDate, hora: effectiveHour }),
      });
      if (!res.ok) throw new Error();
      setCompliance((prev) => ({ ...prev, [tipo]: newVal }));
      // Notificar a otras vistas (p. ej., /dashboard) para refrescar el resumen
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("meal:updated"));
      }
      await saveHour(variantTipo, effectiveHour);
    } catch {
      setError("No se pudo actualizar el cumplimiento");
    } finally {
      setSaving(null);
    }
  }

  async function saveHour(tipo: MealItem["tipo"], hora: string) {
    try {
      const res = await fetch("/api/account/meal-plan/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, hora }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("No se pudo guardar el horario");
    }
  }

  async function autoGenerate() {
    setAutoGenLoading(true);
    setError(null);
    try {
      // Leer preferencias de comidas habilitadas desde el perfil para guiar a la IA
      let enabledMeals: any = undefined;
      try {
        const prefRes = await fetch("/api/account/profile", { cache: "no-store" });
        if (prefRes.ok) {
          const pj = await prefRes.json().catch(() => ({}));
          enabledMeals = pj?.user?.preferencias_alimentos?.enabledMeals || undefined;
        }
      } catch {}
      const body = enabledMeals ? { enabledMeals } : undefined;
      const res = await fetch("/api/account/meal-plan/auto-generate", {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "No se pudo generar el plan");
      }
      await refreshPlan();
    } catch (e: any) {
      setError(e?.message || "No se pudo generar el plan");
    } finally {
      setAutoGenLoading(false);
    }
  }

  // --- Hidratación: helpers en scope del componente ---
  async function addWater(delta: number) {
    try {
      const res = await fetch("/api/account/hydration/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deltaLitros: delta }),
      });
      if (!res.ok) return;
      const j = await res.json();
      setHidratacion(j);
    } catch {}
  }

  async function setWaterGoal(litros: number) {
    try {
      const res = await fetch("/api/account/hydration/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ litros }),
      });
      if (!res.ok) return;
      // refrescar estado pidiendo el log para hoy (devolverá objetivo también)
      const res2 = await fetch("/api/account/hydration/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deltaLitros: 0 }),
      });
      const j = await res2.json().catch(() => null);
      if (j) setHidratacion(j);
    } catch {}
  }

  const formattedDate = useMemo(() => {
    const selected = new Date(selectedDate);
    const todayIso = isoDate(today);
    const isToday = selectedDate === todayIso;
    let dayName = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(selected); // normalmente en minúsculas
    const formatted = new Intl.DateTimeFormat('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }).format(selected);
    if (isToday) {
      // Requisito: "Hoy es viernes, 26 de septiembre de 2025" (dayName en minúsculas)
      return `Hoy es ${dayName}, ${formatted}`;
    }
    // Requisito en otra fecha: "Jueves, 25 de septiembre de 2025" (primera letra mayúscula)
    if (dayName.length) dayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${dayName}, ${formatted}`;
  }, [selectedDate, today]);

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado dinámico de fecha seleccionada */}
      <div className="text-sm font-medium" data-testid="selected-date-heading">{formattedDate}</div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Plan de comidas</h1>
          <p className="text-muted-foreground mt-1">Generado por IA • Marca cumplimiento diario</p>
        </div>
        <div className="flex items-center gap-2"></div>
      </div>


      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Selector de semana (día arriba abreviado, número abajo) */}
      <div className="-mx-2 px-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
          {weekDates.map(d => {
            const isSelected = d.iso === selectedDate;
            const isToday = d.iso === todayStr;
            const [rawAbbr, rawNum] = d.label.split(" ");
            // Normalizar abreviatura: capitalizar primera letra, mantener tilde si existe
            let abbr = rawAbbr ? rawAbbr.replace('.', '') : '';
            if (abbr.length) abbr = abbr.charAt(0).toUpperCase() + abbr.slice(1);
            const dayNum = rawNum || '';
            return (
              <button
                key={d.iso}
                onClick={() => setSelectedDate(d.iso)}
                className={[
                  'shrink-0 w-12 h-14 flex flex-col items-center justify-center rounded-md border transition-colors text-xs',
                  isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 text-foreground border-muted',
                  !isSelected && isToday ? 'ring-2 ring-primary/60 ring-offset-1' : '',
                ].join(' ')}
                aria-pressed={isSelected}
                aria-label={`Ver plan del ${d.label}`}
              >
                <span className="block leading-none text-[11px] font-medium">{abbr}</span>
                <span className="block leading-tight text-sm font-semibold">{dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      

      {/* Vista semanal similar a onboarding */}
      <Card>
        <CardHeader>
          <CardTitle>Vista semanal (rotación)</CardTitle>
          <CardDescription>Distribución de tus comidas por días</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Cargando…</div>
          ) : !weeklyPlan ? (
            <div className="text-sm text-muted-foreground">No hay datos suficientes para generar la vista semanal.</div>
          ) : (
            <WeeklyPlanByDay weekly={weeklyPlan} schedule={hours} />
          )}
        </CardContent>
      </Card>

      {/* Toaster para notificaciones (hidratación, etc.) */}
      <Toaster richColors />
    </div>
  );
}

