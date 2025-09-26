"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CalendarDays, Check, MoreHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
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
  const [showMacros, setShowMacros] = useState(true); // mostrar macros por defecto
  const [expandedMeals, setExpandedMeals] = useState<Set<string>>(() => new Set());
  const [showWeekly, setShowWeekly] = useState(false);
  const [openMealMenu, setOpenMealMenu] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr); // ISO YYYY-MM-DD
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [displayMonth, setDisplayMonth] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const monthPickerRef = useRef<HTMLDivElement | null>(null);

  // Utilidades de fechas

  // Helper fechas
  function isoDate(d: Date) {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
  }

  // Marcar todo el día como cumplido o deshacer (solo hoy o pasado)
  async function toggleAllForDay() {
    if (!items || !items.length) return;
    if (selectedDate > todayStr) { toast.info("No puedes marcar cumplimiento en un día futuro"); return; }
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
  function addDays(base: Date, n: number) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }
  function daysInMonth(year: number, month0: number) { return new Date(year, month0 + 1, 0).getDate(); }
  const selectedDateObj = useMemo(() => { const [y,m,d] = selectedDate.split('-').map(Number); return new Date(y, m-1, d); }, [selectedDate]);
  // Sincronizar mes mostrado cuando cambia fecha seleccionada
  useEffect(() => {
    setDisplayMonth(new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), 1));
  }, [selectedDateObj]);
  const monthYearKey = `${selectedDateObj.getFullYear()}-${selectedDateObj.getMonth()}`;
  // Ventana de 6 días con el seleccionado (o hoy al inicio) centrado en índice 2, limitada al mes.
  const visibleDates = useMemo(() => {
    const y = selectedDateObj.getFullYear();
    const m = selectedDateObj.getMonth();
    const dim = daysInMonth(y, m);
    let startDay = selectedDateObj.getDate() - 2; // queremos seleccionado en posición 2 (tercera celda)
    if (startDay < 1) startDay = 1;
    if (startDay + 5 > dim) startDay = Math.max(1, dim - 5); // mantener 6 celdas
    const arr: { iso: string; date: Date; abbr: string; num: number; isToday: boolean }[] = [];
    for (let i=0;i<6;i++) {
      const dayNum = startDay + i;
      if (dayNum > dim) break;
      const d = new Date(y, m, dayNum);
      const iso = isoDate(d);
      let abbr = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(d).replace('.', '');
      if (abbr.length) abbr = abbr.charAt(0).toUpperCase() + abbr.slice(1);
      arr.push({ iso, date: d, abbr, num: dayNum, isToday: iso === todayStr });
    }
    return arr;
  }, [selectedDateObj, todayStr, monthYearKey]);
  const canSlideLeft = useMemo(() => visibleDates.length ? visibleDates[0].num > 1 : false, [visibleDates]);
  const canSlideRight = useMemo(() => {
    if (!visibleDates.length) return false;
    const last = visibleDates[visibleDates.length-1];
    const dim = daysInMonth(selectedDateObj.getFullYear(), selectedDateObj.getMonth());
    return last.num < dim;
  }, [visibleDates, selectedDateObj]);
  function slide(delta: number) {
    if (delta < 0 && !canSlideLeft) return;
    if (delta > 0 && !canSlideRight) return;
    // mover la fecha seleccionada manteniendo dentro del mes
    const current = selectedDateObj.getDate();
    const target = current + delta;
    const dim = daysInMonth(selectedDateObj.getFullYear(), selectedDateObj.getMonth());
    if (target < 1 || target > dim) return;
    const newDate = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), target);
    setSelectedDate(isoDate(newDate));
  }
  function onSelectFromCalendar(d?: Date) {
    if (!d) return;
    setSelectedDate(isoDate(d));
    setShowMonthPicker(false);
  }
  const isFutureSelected = useMemo(() => selectedDate > todayStr, [selectedDate, todayStr]);
  const isPastSelected = useMemo(() => selectedDate < todayStr, [selectedDate, todayStr]);
  // Regla: permitir marcar cumplimiento solo si pasado o hoy (no futuro)
  const allowCompliance = !isFutureSelected;

  // Cerrar calendario al click fuera
  useEffect(() => {
    if (!showMonthPicker) return;
    function onDoc(e: MouseEvent) {
      if (!monthPickerRef.current) return;
      if (monthPickerRef.current.contains(e.target as Node)) return;
      setShowMonthPicker(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showMonthPicker]);

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
          fetch(`/api/account/meal-plan?date=${selectedDate}`),
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

  // Construir plan semanal ordenado Lunes->Domingo (sin rotación artificial) usando planAIWeekly si existe.
  useEffect(() => {
    if (Array.isArray(planAIWeekly) && planAIWeekly.length) {
      // Asegurar orden predecible
      const order = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
      const sorted = [...planAIWeekly].sort((a,b)=> order.indexOf(a.day) - order.indexOf(b.day));
      setWeeklyPlan(sorted);
      return;
    }
    if (!items || !items.length) { setWeeklyPlan(null); return; }
    // Construcción simple: usar los tipos actuales para todos los días activos (si se quiere algo más complejo se reintroduce IA)
    const orderDays = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
    const dietDaysCount = (profile && typeof profile.dias_dieta === 'number' && profile.dias_dieta >=1 && profile.dias_dieta <=7) ? profile.dias_dieta : 7;
    const activeDays = orderDays.slice(0, dietDaysCount);
    const byTipo: Record<string, MealItem> = {};
    items.forEach(it => { if (!byTipo[it.tipo]) byTipo[it.tipo] = it; });
    const tipos = Object.keys(byTipo);
    const dailyProtein = objetivos?.proteinas || null;
    const share = tipos.length ? 1 / tipos.length : 0;
    const weekly: WeeklyDay[] = activeDays.map(day => ({
      day,
      active: true,
      meals: tipos.map(t => ({
        tipo: t,
        receta: { nombre: byTipo[t].receta?.nombre },
        targetProteinG: dailyProtein ? Math.round(dailyProtein * share) : null,
        itemsText: (byTipo[t].receta?.alimentos || []).map(a => `${a.nombre} (${a.gramos} g)`)
      }))
    }));
    setWeeklyPlan(weekly);
  }, [items, objetivos, profile, planAIWeekly]);

  // Cerrar menú 3 puntos al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Si hay un menú abierto y el click no está dentro de un contenedor con data-meal-menu
      if (!openMealMenu) return;
      const target = e.target as HTMLElement;
      if (!target.closest('[data-meal-menu]')) {
        setOpenMealMenu(null);
      }
    }
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [openMealMenu]);

  // Cerrar menú al abrir modal semanal
  useEffect(() => { if (showWeekly && openMealMenu) setOpenMealMenu(null); }, [showWeekly, openMealMenu]);

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
  const res = await fetch(`/api/account/meal-plan?date=${selectedDate}`, { cache: "no-store" });
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

  // Normaliza el tipo para cumplimiento (Prisma enum: Desayuno | Almuerzo | Cena | Snack)
  function canonicalTipo(raw: string): string {
    if (!raw) return raw;
    const t = raw.toLowerCase();
    if (t.startsWith("snack")) return "Snack";
    if (t === "desayuno") return "Desayuno";
    if (t === "almuerzo") return "Almuerzo";
    if (t === "cena") return "Cena";
    return raw; // fallback sin tocar capitalización original
  }

  // Devuelve hora efectiva (prioriza fila -> variante -> genérico)
  function mealHour(tipo: string): string {
    const base = presetHourForRow(tipo, 0) || presetHourFor(tipo) || "";
    if (base && /^\d{2}:\d{2}$/.test(base)) return base;
    return "—";
  }

  // Buscar MealItem completo para un tipo (usa versión canónica para snacks)
  function mealItemFor(tipo: string): MealItem | undefined {
    const canon = canonicalTipo(tipo);
    // intenta coincidencia directa primero
    let found = items.find(i => i.tipo === tipo) || items.find(i => canonicalTipo(i.tipo) === canon);
    return found;
  }

  // Formatear porciones prácticas: 1 porción = 100 g (heurística)
  function formatPortion(grams: number): string {
    if (!grams || grams <= 0) return '';
    const portionSize = 100; // TODO: Ajustar si se agrega metadato de porción real
    const portions = grams / portionSize;
    let rounded = Math.round(portions * 4) / 4; // a cuartos
    if (rounded < 0.25) rounded = 0.25;
    const label = rounded === 1 ? 'porción' : 'porciones';
    return `${grams} g (≈ ${rounded % 1 === 0 ? rounded.toFixed(0) : rounded} ${label})`;
  }

  function toggleMealExpanded(tipo: string) {
    const canon = canonicalTipo(tipo);
    setExpandedMeals(prev => {
      const next = new Set(prev);
      if (next.has(canon)) next.delete(canon); else next.add(canon);
      return next;
    });
  }

  // Comidas del día actuales (directo de items para no repetir plan idéntico en todos los días cuando weeklyPlan rota artificialmente)
  const selectedWeekdayMeals = useMemo(() => {
    if (!items || !items.length) return [] as any[];
    const byTipo: Record<string, MealItem> = {};
    items.forEach(it => { if (!byTipo[it.tipo]) byTipo[it.tipo] = it; });
    const ordered = ORDER_BASE.filter(k => byTipo[k]);
    Object.keys(byTipo).forEach(k => { if (!ORDER_BASE.includes(k)) ordered.push(k); });
    return ordered.map(k => ({ tipo: k, receta: { nombre: byTipo[k].receta?.nombre }, _item: byTipo[k] }));
  }, [items]);

  // Cumplimiento global del día
  const dayCompliance = useMemo(() => {
    if (!selectedWeekdayMeals.length) return false;
    return selectedWeekdayMeals.every((m: any) => compliance[canonicalTipo(m.tipo)]);
  }, [selectedWeekdayMeals, compliance]);

  async function toggleDayCompliance() {
    if (!allowCompliance) { toast.info("No puedes marcar cumplimiento en un día futuro"); return; }
    if (!selectedWeekdayMeals.length) return;
    const all = dayCompliance;
    setSaving("__day_toggle");
    try {
      for (const m of selectedWeekdayMeals) {
        const canonical = canonicalTipo(m.tipo);
        const current = !!compliance[canonical];
        const target = !all;
        if (current === target) continue;
        const k = hourKey(m.tipo, 0);
        const effectiveHour = rowHours[k] ?? presetHourForRow(m.tipo, 0) ?? "12:00";
        await fetch("/api/account/meal-plan/compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: canonical, cumplido: target, date: selectedDate, hora: effectiveHour })
        });
      }
      const compRes = await fetch(`/api/account/meal-plan/compliance?date=${selectedDate}`);
      const compJson = await compRes.json().catch(() => ({}));
      const map: Record<string, boolean> = {};
      (compJson.items || []).forEach((r: any) => { map[r.comida_tipo] = !!r.cumplido; });
      setCompliance(map);
    } catch {
      toast.error("No se pudo actualizar el cumplimiento del día");
    } finally {
      setSaving(null);
    }
  }

  // Hidratación (lectura histórica si no es hoy)
  const hydrationGoal = objetivos?.agua_litros ?? null;
  const [hydrationOverride, setHydrationOverride] = useState<{ litros: number; completado: boolean } | null>(null);
  useEffect(() => {
    if (selectedDate === todayStr) { setHydrationOverride(null); return; }
    (async () => {
      try {
        const res = await fetch(`/api/account/hydration/history?days=30`);
        const j = await res.json().catch(()=>null);
        if (j && Array.isArray(j.items)) {
          const row = j.items.find((r: any) => r.fecha === selectedDate);
          if (row) setHydrationOverride({ litros: row.litros, completado: !!row.completado }); else setHydrationOverride({ litros: 0, completado: false });
        }
      } catch {}
    })();
  }, [selectedDate, todayStr]);

  const effectiveHydrationLitros = selectedDate === todayStr ? (hidratacion?.hoy_litros ?? 0) : (hydrationOverride?.litros ?? 0);
  const effectiveHydrationCompleted = selectedDate === todayStr ? !!hidratacion?.completado : !!hydrationOverride?.completado;

  async function adjustHydration(delta: number) {
    if (!allowCompliance) return;
    if (selectedDate !== todayStr) { toast.info("Edición de agua solo soportada hoy por ahora"); return; }
    try {
      const res = await fetch("/api/account/hydration/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deltaLitros: delta })
      });
      if (!res.ok) return;
      const j = await res.json();
      setHidratacion(j);
    } catch {}
  }

  const hydrationPct = hydrationGoal ? Math.min(100, Math.round((effectiveHydrationLitros / hydrationGoal) * 100)) : null;

  // Totales del día (macros)
  const dailyTotals = useMemo(() => {
    const t = { proteinas: 0, carbohidratos: 0, grasas: 0, kcal: 0 };
    selectedWeekdayMeals.forEach((m: any) => {
      const full = mealItemFor(m.tipo);
      if (full?.receta?.macros) {
        const factor = (full.porciones && full.receta.porciones) ? (full.porciones / full.receta.porciones) : 1;
        t.proteinas += (full.receta.macros.proteinas || 0) * factor;
        t.carbohidratos += (full.receta.macros.carbohidratos || 0) * factor;
        t.grasas += (full.receta.macros.grasas || 0) * factor;
        t.kcal += (full.receta.macros.kcal || 0) * factor;
      }
    });
    const round = (n: number) => Math.round(n * 10) / 10;
    return { proteinas: round(t.proteinas), carbohidratos: round(t.carbohidratos), grasas: round(t.grasas), kcal: Math.round(t.kcal) };
  }, [selectedWeekdayMeals, items]);

  // Fecha formateada para encabezados (ej: 'Martes 24 Sep')
  const formattedDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
        .format(selectedDateObj)
        .replace(/\.$/, '')
        .replace(/^./, c => c.toUpperCase());
    } catch { return selectedDate; }
  }, [selectedDateObj, selectedDate]);

  async function toggle(tipo: MealItem["tipo"], idx: number) {
    if (!allowCompliance) { toast.info("No puedes marcar cumplimiento en un día futuro"); return; }
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
      const canonical = canonicalTipo(tipo);
      const newVal = !compliance[canonical];
      const res = await fetch("/api/account/meal-plan/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: canonical, cumplido: newVal, date: selectedDate, hora: effectiveHour }),
      });
      if (!res.ok) throw new Error();
      setCompliance((prev) => ({ ...prev, [canonical]: newVal }));
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
      let enabledMeals: any = undefined;
      try {
        const prefRes = await fetch("/api/account/profile", { cache: "no-store" });
        if (prefRes.ok) {
          const pj = await prefRes.json().catch(() => ({}));
          let prefs = pj?.user?.preferencias_alimentos;
          if (prefs && typeof prefs === "string") { try { prefs = JSON.parse(prefs); } catch { prefs = null; } }
          if (prefs && typeof prefs === "object" && Array.isArray(prefs.enabledMeals)) enabledMeals = prefs.enabledMeals;
        }
      } catch {}
      const res = await fetch("/api/account/meal-plan/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, enabledMeals })
      });
      if (!res.ok) throw new Error("No se pudo generar el plan");
      await refreshPlan();
      toast.success("Plan generado");
    } catch (e: any) {
      setError(e?.message || "No se pudo generar el plan");
    } finally {
      setAutoGenLoading(false);
    }
  }

  // (Se removieron helpers de hidratación corruptos aquí; ver definiciones consolidadas arriba)

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado dinámico de fecha seleccionada */}
      <div className="text-sm font-medium" data-testid="selected-date-heading">{formattedDate}</div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Plan de comidas</h1>
          <p className="text-muted-foreground mt-1">Generado por IA • Marca cumplimiento diario</p>
        </div>
        <div className="flex items-center gap-2">
          {weeklyPlan && weeklyPlan.length > 0 && (
            <button
              type="button"
              onClick={() => setShowWeekly(true)}
              className="h-8 px-3 rounded-md border text-xs hover:bg-muted inline-flex items-center gap-1"
            >
              <CalendarDays className="size-4" /> Ver plan semanal
            </button>
          )}
        </div>
      </div>


      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Carrusel mensual de 6 días */}
      <div className="relative -mx-2 px-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => slide(-1)}
            disabled={!canSlideLeft}
            className="size-8 inline-flex items-center justify-center rounded-md border text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted"
            aria-label="Día anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="flex gap-2 overflow-hidden">
            {visibleDates.map((d) => {
              const isSelected = d.iso === selectedDate;
              return (
                <button
                  key={d.iso}
                  onClick={() => setSelectedDate(d.iso)}
                  className={[
                    'w-12 h-16 flex flex-col items-center justify-center rounded-md border transition-colors relative text-xs select-none',
                    isSelected ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-muted/40 text-foreground border-muted hover:bg-muted',
                    !isSelected && d.isToday ? 'ring-2 ring-primary/60 ring-offset-1' : '',
                  ].join(' ')}
                  aria-pressed={isSelected}
                  aria-label={`Ver plan del ${d.abbr} ${d.num}`}
                >
                  <span className="font-medium">{d.abbr}</span>
                  <span className="text-lg leading-none">{d.num}</span>
                  {d.isToday && !isSelected && (
                    <span className="absolute top-1 right-1 inline-block w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => slide(1)}
            disabled={!canSlideRight}
            className="size-8 inline-flex items-center justify-center rounded-md border text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted"
            aria-label="Día siguiente"
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMonthPicker(v => !v)}
              className="h-8 px-3 inline-flex items-center gap-1 rounded-md border text-xs hover:bg-muted"
            >
              <CalendarDays className="size-4" />
              Mes
              {showMonthPicker ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {showMonthPicker && (
              <div ref={monthPickerRef} className="absolute z-20 mt-2 bg-popover border rounded-md shadow p-2">
                <Calendar
                  mode="single"
                  selected={selectedDateObj}
                  onSelect={onSelectFromCalendar}
                  month={displayMonth}
                  onMonthChange={(m) => setDisplayMonth(m)}
                />
              </div>
            )}
          </div>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {isPastSelected && 'Día pasado • Puedes revisar y marcar cumplimiento'}
          {selectedDate === todayStr && 'Hoy • Marca cumplimiento al completar tus comidas'}
          {isFutureSelected && 'Día futuro • Aún no puedes marcar cumplimiento'}
        </div>
      </div>

      

      {/* Plan Diario */}
      <Card>
        <CardHeader>
          <CardTitle>Plan diario</CardTitle>
          <CardDescription>
            <span className="font-medium">{formattedDate}</span>
            <span className="ml-2 text-muted-foreground">• Comidas y estado</span>
          </CardDescription>
          {selectedWeekdayMeals.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium">Totales día:</span>
                <span>Proteína {dailyTotals.proteinas} g</span>
                <span>Carbohidratos {dailyTotals.carbohidratos} g</span>
                <span>Grasas {dailyTotals.grasas} g</span>
                <span className="opacity-70">Calorías {dailyTotals.kcal}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMacros(v => !v)}
                className="px-2 py-1 border rounded-md hover:bg-muted transition"
              >{showMacros ? 'Ocultar macros' : 'Mostrar macros'}</button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="text-sm text-muted-foreground">Cargando…</div>
          ) : selectedWeekdayMeals.length === 0 ? (
            <div className="text-sm text-muted-foreground">No hay comidas asignadas para este día.</div>
          ) : (
            <div className="space-y-4">
              <ul className="space-y-3">
                {selectedWeekdayMeals.map((m: any, i: number) => {
                  const done = !!compliance[canonicalTipo(m.tipo)];
                  const full = mealItemFor(m.tipo);
                  const canon = canonicalTipo(m.tipo);
                  const expanded = expandedMeals.has(canon);
                  const h = mealHour(m.tipo);
                  return (
                    <li key={i} className="border rounded-md p-3 flex flex-col gap-2 bg-background">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col flex-1 gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded border">{h}</span>
                            <span className="font-medium text-sm">{full?.receta?.nombre || m.receta?.nombre || m.tipo}</span>
                            {showMacros && full?.receta?.macros && (
                              <span className="text-[11px] text-muted-foreground flex gap-3 flex-wrap">
                                <span>Proteína {full.receta.macros.proteinas} g</span>
                                <span>Carbohidratos {full.receta.macros.carbohidratos} g</span>
                                <span>Grasas {full.receta.macros.grasas} g</span>
                                <span className="opacity-70">Calorías {full.receta.macros.kcal}</span>
                              </span>
                            )}
                          </div>
                          {expanded && full?.receta?.alimentos && full.receta.alimentos.length > 0 && (
                            <div className="mt-1 border rounded-md bg-muted/30 p-2">
                              <ul className="text-[11px] space-y-1">
                                {full.receta.alimentos.map((a: {id:number; nombre:string; gramos:number}) => (
                                  <li key={a.id} className="flex justify-between gap-4">
                                    <span className="truncate">{a.nombre}</span>
                                    <span className="tabular-nums text-muted-foreground">{formatPortion(a.gramos)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleMealExpanded(m.tipo)}
                            className="self-start text-[11px] mt-1 underline text-muted-foreground hover:text-foreground"
                          >{expanded ? 'Ocultar detalles' : 'Ver detalles'}</button>
                        </div>
                        <div className="flex flex-col items-end gap-2" data-meal-menu>
                          <div className="relative" data-meal-menu>
                            <button
                              type="button"
                              onClick={() => setOpenMealMenu(openMealMenu === canon ? null : canon)}
                              className="size-7 inline-flex items-center justify-center rounded-md border hover:bg-muted"
                              aria-haspopup="true"
                              aria-expanded={openMealMenu === canon}
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                            {openMealMenu === canon && (
                              <div className="absolute z-30 right-0 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md text-[12px]" data-meal-menu>
                                <button
                                  type="button"
                                  onClick={() => { window.open('/account/profile/meals', '_blank'); setOpenMealMenu(null); }}
                                  className="w-full text-left px-2 py-1 rounded hover:bg-muted"
                                >Modificar horario</button>
                                {weeklyPlan && weeklyPlan.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => { setShowWeekly(true); setOpenMealMenu(null); }}
                                    className="w-full text-left px-2 py-1 rounded hover:bg-muted"
                                  >Ver plan semanal</button>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggle(m.tipo as any, 0)}
                            disabled={!allowCompliance || saving === m.tipo}
                            className={`size-6 inline-flex items-center justify-center rounded border text-xs transition ${done ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-muted border-muted-foreground/20'} disabled:opacity-40`}
                            aria-pressed={done}
                            aria-label={done ? 'Desmarcar comida' : 'Marcar comida cumplida'}
                          >
                            {done ? <Check className="size-4" /> : ''}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Cumplimiento global */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleDayCompliance}
                  disabled={!allowCompliance || saving === '__day_toggle'}
                  className={`h-8 px-3 inline-flex items-center gap-2 rounded-md text-sm border transition ${dayCompliance ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted hover:bg-muted/70 border-muted-foreground/20'} disabled:opacity-40`}
                >
                  <span>{dayCompliance ? 'Dieta cumplida' : 'Marcar día completo'}</span>
                </button>
                {!allowCompliance && <span className="text-xs text-muted-foreground">Día futuro</span>}
              </div>

              {/* Hidratación */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium flex items-center gap-2">Agua</span>
                  <span className="text-muted-foreground">
                    {effectiveHydrationLitros.toFixed(2)}{hydrationGoal ? ` / ${hydrationGoal} L` : ' L'}
                  </span>
                </div>
                {hydrationPct != null && (
                  <div className="h-2 w-full rounded bg-muted overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${hydrationPct}%` }} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustHydration(-0.25)}
                    disabled={!allowCompliance || selectedDate !== todayStr}
                    className="h-8 w-8 rounded-md border text-sm disabled:opacity-30"
                  >-</button>
                  <button
                    type="button"
                    onClick={() => adjustHydration(+0.25)}
                    disabled={!allowCompliance || selectedDate !== todayStr}
                    className="h-8 w-8 rounded-md border text-sm disabled:opacity-30"
                  >+</button>
                  {hydrationGoal != null && !effectiveHydrationCompleted && (
                    <button
                      type="button"
                      onClick={() => {
                        const remaining = hydrationGoal - effectiveHydrationLitros;
                        if (remaining > 0.01) adjustHydration(remaining);
                      }}
                      disabled={!allowCompliance || selectedDate !== todayStr}
                      className="h-8 px-3 rounded-md border text-xs disabled:opacity-30"
                    >Completar</button>
                  )}
                  {effectiveHydrationCompleted && <span className="text-xs text-emerald-600">Meta alcanzada</span>}
                  {!allowCompliance && <span className="text-xs text-muted-foreground">Solo lectura</span>}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showWeekly} onOpenChange={(o)=> setShowWeekly(o)}>
        {showWeekly && weeklyPlan && (
          <DialogContent className="max-w-3xl w-full" showCloseButton>
            <DialogHeader>
              <DialogTitle>Plan semanal</DialogTitle>
              <DialogDescription>Vista general de tus comidas para la semana.</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto rounded-md border p-2 bg-muted/30">
              <WeeklyPlanByDay weekly={weeklyPlan} schedule={hours} />
            </div>
            <DialogFooter className="mt-4 flex justify-between w-full">
              <div className="text-xs text-muted-foreground">Los horarios se editan desde perfil.</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.open('/account/profile/meals','_blank')}
                  className="h-8 px-3 rounded-md border text-xs hover:bg-muted"
                >Editar horarios</button>
                <button
                  type="button"
                  onClick={() => setShowWeekly(false)}
                  className="h-8 px-3 rounded-md border text-xs hover:bg-muted"
                >Cerrar</button>
              </div>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Toaster para notificaciones (hidratación, etc.) */}
      <Toaster richColors />
    </div>
  );
}

