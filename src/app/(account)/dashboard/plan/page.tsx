"use client";

import { useEffect, useMemo, useState } from "react";
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

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
        const [planRes, compRes, sumRes] = await Promise.all([
          fetch("/api/account/meal-plan"),
          fetch(`/api/account/meal-plan/compliance?date=${todayStr}`),
          fetch("/api/account/dashboard/summary", { cache: "no-store" }),
        ]);
        const planJson = await planRes.json();
        const compJson = await compRes.json();
        const sumJson = await sumRes.json().catch(() => ({}));
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
                // base types
                if (!out["Desayuno"]) {
                  const h = get("Desayuno"); if (h) out["Desayuno"] = h;
                }
                if (!out["Almuerzo"]) {
                  const h = get("Almuerzo"); if (h) out["Almuerzo"] = h;
                }
                if (!out["Cena"]) {
                  const h = get("Cena"); if (h) out["Cena"] = h;
                }
                // snack: elegir Snack o la más temprana de variantes
                if (!out["Snack"]) {
                  const candidates: string[] = [];
                  const push = (k: string) => { const v = get(k); if (v) candidates.push(v); };
                  push("Snack");
                  push("Snack_manana"); push("Snack_mañana"); push("Snack mañana");
                  push("Snack_tarde"); push("Snack tarde");
                  if (candidates.length) {
                    candidates.sort();
                    out["Snack"] = candidates[0];
                  }
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
  }, [todayStr]);

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
        body: JSON.stringify({ tipo, cumplido: newVal, date: todayStr, hora: effectiveHour }),
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Plan de comidas</h1>
          <p className="text-muted-foreground mt-1">Generado por IA • Marca cumplimiento diario</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/insights">
            <Button variant="outline" size="sm">Ver Insights</Button>
          </Link>
        </div>
      </div>


      {error && <div className="text-sm text-red-600">{error}</div>}

      {(() => {
        // Mostrar aviso si falta hora en alguna comida
        if (!items || !items.length) return null;
        const tipos = Array.from(new Set(items.map((i) => i.tipo)));
        const orderedTipos = [
          ...tipos.filter((t) => ORDER_BASE.map((s) => s.toLowerCase()).includes(t.toLowerCase()))
            .sort((a, b) => ORDER_BASE.findIndex((x) => x.toLowerCase() === a.toLowerCase()) - ORDER_BASE.findIndex((x) => x.toLowerCase() === b.toLowerCase())),
          ...tipos.filter((t) => !ORDER_BASE.map((s) => s.toLowerCase()).includes(t.toLowerCase())),
        ];
        const rows: Array<{ tipo: string; idx: number }> = [];
        for (const tipo of orderedTipos) {
          const group = items.filter((i) => i.tipo === tipo);
          group.forEach((_it, idx) => rows.push({ tipo, idx }));
        }
        const missing = rows.some(({ tipo, idx }) => {
          const k = `${tipo}:${idx}`;
          const effectiveHour = rowHours[k] ?? presetHourFor(tipo) ?? "";
          return !isValidHour(effectiveHour);
        });
        return missing ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
            Completa la hora en cada comida para poder marcar cumplimiento.
          </div>
        ) : null;
      })()}

      <div className="text-xs uppercase text-muted-foreground">Checklist del día e hidratación</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Columna izquierda: checklist del día */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Hoy</CardTitle>
              <CardDescription>{todayStr}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">Cargando…</div>
              ) : items.length === 0 ? (
                <div className="text-sm text-muted-foreground">Aún no tienes un plan. Usa la checklist para guardar recetas por comida.</div>
              ) : (
                <div className="space-y-4">
                  {(() => {
            // Construir orden dinámico: primero por prioridad conocida, luego el resto
            const tipos = Array.from(new Set(items.map((i) => i.tipo)));
            const orderedTipos = [
              ...tipos.filter((t) => ORDER_BASE.map((s) => s.toLowerCase()).includes(t.toLowerCase()))
                .sort((a, b) => ORDER_BASE.findIndex((x) => x.toLowerCase() === a.toLowerCase()) - ORDER_BASE.findIndex((x) => x.toLowerCase() === b.toLowerCase())),
              ...tipos.filter((t) => !ORDER_BASE.map((s) => s.toLowerCase()).includes(t.toLowerCase())),
            ];
            const rows: Array<{ tipo: string; item: MealItem; idx: number }> = [];
            for (const tipo of orderedTipos) {
              const group = items.filter((i) => i.tipo === tipo);
              group.forEach((it, idx) => rows.push({ tipo, item: it, idx }));
            }
            return rows.map(({ tipo, item, idx }) => {
              const k = hourKey(tipo, idx);
              const effectiveHour = rowHours[k] ?? presetHourForRow(tipo, idx) ?? "";
              return (
                <div key={`${tipo}-${idx}`} className="rounded-lg border p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:gap-4 items-start">
                          <div className="min-w-0">
                            {(() => {
                              const countSame = rows.filter(r => r.tipo === tipo).length;
                              const baseLabel = /snack/i.test(tipo)
                                ? (/mañana|manana/i.test(tipo) ? "Snack (mañana)" : (/tarde/i.test(tipo) ? "Snack (tarde)" : "Snack"))
                                : tipo;
                              const finalLabel = `${baseLabel}${(!/snack/i.test(tipo) && countSame > 1) ? ` #${idx+1}` : ""}`;
                              return (
                                <div className="font-medium truncate">{finalLabel}: {item.receta.nombre}</div>
                              );
                            })()}
                            <div className="text-xs text-muted-foreground">{item.receta.macros.kcal} kcal • P {item.receta.macros.proteinas}g • G {item.receta.macros.grasas}g • C {item.receta.macros.carbohidratos}g</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1">
                                {item.receta.alimentos.map((a) => (
                                  <span key={a.id} className="inline-block rounded bg-muted px-2 py-0.5">
                                    {a.nombre} {a.gramos}g
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center sm:items-start gap-2 sm:gap-2 shrink-0 sm:justify-end">
                            <div className="flex w-full sm:w-auto items-center gap-2">
                              <input
                                type="time"
                                className="h-9 rounded-md border px-2 text-sm min-w-[5.5rem] flex-none"
                                value={effectiveHour}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setRowHours((prev) => ({ ...prev, [k]: v }));
                                  // Si es válida la hora, persistir por tipo (API actual)
                                  if (/^\d{2}:\d{2}$/.test(v)) {
                                    const variantTipo = variantTipoForSave(tipo, idx);
                                    setHours((prev) => ({ ...prev, [variantTipo]: v }));
                                    saveHour(variantTipo, v);
                                  }
                                }}
                                aria-label={`Hora real de ${tipo}${rows.filter(r=>r.tipo===tipo).length>1 ? ` #${idx+1}`: ""}`}
                              />
                              <Button
                                size="sm"
                                variant={compliance[tipo] ? "default" : "outline"}
                                onClick={() => toggle(tipo, idx)}
                                disabled={saving === tipo || !isValidHour(effectiveHour)}
                                title={!isValidHour(effectiveHour) ? "Ingresa una hora (HH:MM)" : undefined}
                                className="min-w-[9rem] sm:min-w-[9rem]"
                              >
                                {saving === tipo ? "Guardando…" : compliance[tipo] ? `Cumplido${isValidHour(effectiveHour) ? "" : " (hora)"}` : (isValidHour(effectiveHour) ? "Marcar cumplido" : "Ingresar hora")}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
              );
            });
          })()}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: Ingestas de hoy + Hidratación */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ingestas de hoy</CardTitle>
              <CardDescription>Estado por comida</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">Cargando…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-3">Comida</th>
                      <th className="py-2 pr-3">Receta</th>
                      <th className="py-2 pr-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const tipos = Array.from(new Set(items.map((i) => i.tipo)));
                      const orderedTipos = [
                        ...tipos.filter((t) => ORDER_BASE.map((s) => s.toLowerCase()).includes(t.toLowerCase()))
                          .sort((a, b) => ORDER_BASE.findIndex((x) => x.toLowerCase() === a.toLowerCase()) - ORDER_BASE.findIndex((x) => x.toLowerCase() === b.toLowerCase())),
                        ...tipos.filter((t) => !ORDER_BASE.map((s) => s.toLowerCase()).includes(t.toLowerCase())),
                      ];
                      return orderedTipos.map((t: string) => {
                        const it = items.find((i) => i.tipo === t);
                        return (
                          <tr key={t} className="border-t">
                            <td className="py-2 pr-3">{t}</td>
                            <td className="py-2 pr-3">{it ? it.receta.nombre : "—"}</td>
                            <td className="py-2 pr-3">{compliance[t] ? "Cumplido" : "Pendiente"}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hidratación hoy</CardTitle>
              <CardDescription>Registra agua además de las comidas</CardDescription>
            </CardHeader>
            <CardContent>
              {!hidratacion ? (
                <div className="text-sm text-muted-foreground">Sin datos de hidratación.
                  <div className="mt-2 flex gap-2">
                    <Button variant="outline" onClick={() => setWaterGoal(2)}>Fijar objetivo 2 L</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div><span className="text-muted-foreground">Hoy:</span> {hidratacion.hoy_litros?.toFixed(2)} L</div>
                    {hidratacion.completado && (
                      <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 px-2 py-0.5 text-xs font-medium">
                        Objetivo alcanzado
                      </span>
                    )}
                  </div>
                  <div><span className="text-muted-foreground">Objetivo:</span> {hidratacion.objetivo_litros ?? "—"} L</div>
                  {/* Barra de progreso */}
                  {hidratacion.objetivo_litros ? (
                    (() => {
                      const pct = Math.min(100, Math.max(0, (hidratacion.hoy_litros / (hidratacion.objetivo_litros || 1)) * 100));
                      return (
                        <div className="w-full">
                          <div className="h-2 w-full rounded bg-muted overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{pct.toFixed(0)}%</div>
                        </div>
                      );
                    })()
                  ) : null}
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" onClick={() => addWater(0.25)}>+250 ml</Button>
                    <Button onClick={() => addWater(0.5)}>+500 ml</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Llamado a explorar Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Más métricas e historial</CardTitle>
          <CardDescription>Explora tus tendencias de adherencia e hidratación</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/insights">
            <Button>Ir a Insights</Button>
          </Link>
        </CardContent>
      </Card>

      {/* Toaster para notificaciones (hidratación, etc.) */}
      <Toaster richColors />
    </div>
  );
}

