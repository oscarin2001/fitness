"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
 

type MealItem = {
  id: number;
  tipo: "Desayuno" | "Almuerzo" | "Cena" | "Snack";
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

const ORDER: MealItem["tipo"][] = ["Desayuno", "Almuerzo", "Cena", "Snack"];

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
  const [hours, setHours] = useState<Record<string, string>>({});
  // Rango de días movido a la vista de Insights
  const [hydrationNotified, setHydrationNotified] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

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

  async function toggle(tipo: MealItem["tipo"]) {
    setSaving(tipo);
    try {
      const newVal = !compliance[tipo];
      const res = await fetch("/api/account/meal-plan/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, cumplido: newVal, date: todayStr, hora: hours[tipo] || undefined }),
      });
      if (!res.ok) throw new Error();
      setCompliance((prev) => ({ ...prev, [tipo]: newVal }));
      // Notificar a otras vistas (p. ej., /dashboard) para refrescar el resumen
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("meal:updated"));
      }
      await saveHour(tipo, hours[tipo] || "");
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
      const res = await fetch("/api/account/meal-plan/auto-generate", { method: "POST" });
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
                  {ORDER.filter((t) => items.some((i) => i.tipo === t)).map((tipo) => {
                    const item = items.find((i) => i.tipo === tipo)!;
                    return (
                      <div key={tipo} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">{tipo}: {item.receta.nombre}</div>
                            <div className="text-xs text-muted-foreground">{item.receta.macros.kcal} kcal • P {item.receta.macros.proteinas}g • G {item.receta.macros.grasas}g • C {item.receta.macros.carbohidratos}g</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.receta.alimentos.map((a) => (
                                <span key={a.id} className="inline-block mr-2 mb-1 rounded bg-muted px-2 py-0.5">
                                  {a.nombre} {a.gramos}g
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              className="h-9 rounded-md border px-2 text-sm"
                              value={hours[tipo] || ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setHours((prev) => ({ ...prev, [tipo]: v }));
                                if (/^\d{2}:\d{2}$/.test(v)) saveHour(tipo, v);
                              }}
                              aria-label={`Hora real de ${tipo}`}
                            />
                            <Button variant={compliance[tipo] ? "default" : "outline"} onClick={() => toggle(tipo)} disabled={saving === tipo}>
                              {saving === tipo ? "Guardando…" : compliance[tipo] ? "Cumplido" : "Marcar cumplido"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                    {ORDER.map((t) => {
                      const it = items.find((i) => i.tipo === t);
                      return (
                        <tr key={t} className="border-t">
                          <td className="py-2 pr-3">{t}</td>
                          <td className="py-2 pr-3">{it ? it.receta.nombre : "—"}</td>
                          <td className="py-2 pr-3">{compliance[t] ? "Cumplido" : "Pendiente"}</td>
                        </tr>
                      );
                    })}
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

