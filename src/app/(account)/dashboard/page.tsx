"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplet, Plus, Flame, Egg, Wheat } from "lucide-react";
import { toast } from "sonner";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
 

type Summary = {
  objetivos: { kcal: number | null; proteinas: number | null; grasas: number | null; carbohidratos: number | null; agua_litros: number | null };
  consumidos: { calorias: number; proteinas: number; grasas: number; carbohidratos: number };
  kcal_restantes: number | null;
  macros_restantes: { proteinas: number | null; grasas: number | null; carbohidratos: number | null };
  hidratacion: { hoy_litros: number; objetivo_litros: number | null; completado: boolean };
};

const COLORS = ["#4F46E5", "#16A34A", "#F59E0B"]; // Prote, Grasas, Carbs

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Summary | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [adherenceMode, setAdherenceMode] = useState<"weeks" | "months">("weeks");
  const [adherenceSeries, setAdherenceSeries] = useState<Array<{ period: string; pct: number }>>([]);
  const [last7Avg, setLast7Avg] = useState<number | null>(null);
  const [prev7Avg, setPrev7Avg] = useState<number | null>(null);
  const [pieOverride, setPieOverride] = useState<"consumidos" | "objetivos" | null>(null);

  async function load() {
    try {
      const [res, prof] = await Promise.all([
        fetch("/api/account/dashboard/summary", { cache: "no-store" }),
        fetch("/api/account/profile", { cache: "no-store" }),
      ]);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
      if (prof.ok) {
        const pj = await prof.json();
        setProfile(pj?.user || null);
      }
    } catch (e) {
      toast.error("No se pudo cargar el resumen");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Refrescar resumen cuando la pestaña vuelve a foco o cuando otra vista emite un evento de actualización de comida
  useEffect(() => {
    const onFocus = () => load();
    const onMealUpdated = () => load();
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
      window.addEventListener("meal:updated", onMealUpdated as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("meal:updated", onMealUpdated as EventListener);
      }
    };
  }, []);

  // Cargar historial para adherencia agregada (semanas/meses)
  useEffect(() => {
    (async () => {
      try {
        const days = adherenceMode === "weeks" ? 56 : 180; // ~8 semanas o ~6 meses
        const res = await fetch(`/api/account/meal-plan/history?days=${days}`, { cache: "no-store" });
        const j = await res.json();
        const items: Array<{ date: string; adherence: number }> = Array.isArray(j?.items) ? j.items : [];

        // Calcular promedios últimos 7 días y los 7 anteriores
        const daily = items
          .map((it) => ({ date: new Date(it.date), pct: Math.max(0, Math.min(1, Number(it.adherence) || 0)) }))
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        if (daily.length >= 7) {
          const last7 = daily.slice(-7);
          const prev7 = daily.slice(-14, -7);
          const avg = (arr: typeof daily) => (arr.length ? arr.reduce((s, d) => s + d.pct, 0) / arr.length : null);
          setLast7Avg(avg(last7));
          setPrev7Avg(avg(prev7));
        } else {
          setLast7Avg(null);
          setPrev7Avg(null);
        }

        // Agrupar por semana (YYYY-WW) o por mes (YYYY-MM)
        const fmt = (d: Date) => {
          if (adherenceMode === "months") {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          }
          // Semanas: ISO week approximation
          const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          const dayNum = tmp.getUTCDay() || 7; // 1..7
          tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
          const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
          return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
        };

        const map = new Map<string, { sum: number; count: number }>();
        for (const it of items) {
          const d = new Date(it.date);
          const key = fmt(d);
          const cur = map.get(key) || { sum: 0, count: 0 };
          map.set(key, { sum: cur.sum + (Number(it.adherence) || 0), count: cur.count + 1 });
        }
        const series = Array.from(map.entries())
          .map(([k, v]) => {
            const raw = v.count ? v.sum / v.count : 0;
            const pct = Math.max(0, Math.min(1, raw)); // clamp 0..1
            return { period: k, pct };
          })
          .sort((a, b) => a.period.localeCompare(b.period));
        setAdherenceSeries(series);
      } catch {
        setAdherenceSeries([]);
      }
    })();
  }, [adherenceMode]);

  const toNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const pieState = useMemo(() => {
    if (!data) return { data: [] as any[], mode: "consumidos" as "consumidos" | "objetivos" };
    const consumidos = [
      { name: "Proteínas", value: Math.max(0, Math.round(toNum(data.consumidos.proteinas))) },
      { name: "Grasas", value: Math.max(0, Math.round(toNum(data.consumidos.grasas))) },
      { name: "Carbohidratos", value: Math.max(0, Math.round(toNum(data.consumidos.carbohidratos))) },
    ];
    const totalConsumidos = consumidos.reduce((a, b) => a + (b.value || 0), 0);

    const objetivos = [
      { name: "Proteínas", value: Math.max(0, Math.round(toNum(data.objetivos.proteinas))) },
      { name: "Grasas", value: Math.max(0, Math.round(toNum(data.objetivos.grasas))) },
      { name: "Carbohidratos", value: Math.max(0, Math.round(toNum(data.objetivos.carbohidratos))) },
    ];
    const totalObjetivos = objetivos.reduce((a, b) => a + (b.value || 0), 0);

    if (totalConsumidos === 0 && totalObjetivos > 0) {
      return { data: objetivos, mode: "objetivos" as const };
    }
    return { data: consumidos, mode: "consumidos" as const };
  }, [data]);

  const noMacroData = useMemo(() => pieState.data.reduce((a, b) => a + (b.value || 0), 0) === 0, [pieState]);

  async function addWater(liters: number) {
    try {
      // Límite exacto al objetivo diario
      const objective = data?.hidratacion.objetivo_litros ?? 2; // fallback 2L si no hay objetivo
      const maxCap = Math.max(objective, 2);
      const current = data?.hidratacion.hoy_litros ?? 0;
      if (current >= maxCap) {
        toast.success("¡Felicidades! Ya alcanzaste tu consumo máximo de agua por hoy.");
        return;
      }
      // Ajustar para no exceder el máximo
      const allowedDelta = Math.min(liters, Math.max(0, maxCap - current));

      const res = await fetch("/api/account/hydration/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deltaLitros: allowedDelta }),
      });
      if (!res.ok) throw new Error();
      const upd = await res.json();
      setData((prev) => prev ? { ...prev, hidratacion: { ...prev.hidratacion, ...upd } } as Summary : prev);
      const nextVal = (data?.hidratacion.hoy_litros ?? 0) + allowedDelta;
      if (nextVal >= maxCap - 1e-6) {
        toast.success("¡Felicidades! Ya alcanzaste tu consumo máximo de agua por hoy.");
      } else {
        toast.success("Hidratación actualizada");
      }
    } catch {
      toast.error("No se pudo registrar el agua");
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Tu día</h1>
          <p className="text-muted-foreground mt-1">Calorías, macros y agua de hoy</p>
        </div>
      </div>

      {/* Estado corporal y objetivo */}
      {!loading && profile && (
        <Card>
          <CardHeader>
            <CardTitle>Estado y objetivo</CardTitle>
            <CardDescription>Resumen basado en tus datos actuales</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const hM = Number(profile.altura_cm || 0) / 100;
              const w = Number(profile.peso_kg || 0);
              const bmi = hM > 0 ? w / (hM * hM) : null;
              function bmiCat(b: number | null): string {
                if (b == null) return "Sin datos";
                if (b < 18.5) return "Bajo peso";
                if (b < 25) return "Peso saludable";
                if (b < 30) return "Sobrepeso";
                if (b < 35) return "Obesidad grado I";
                if (b < 40) return "Obesidad grado II";
                return "Obesidad mórbida (grado III)";
              }

              const objetivo = profile.objetivo as string | null;
              const pesoObj = profile.peso_objetivo_kg as number | null;
              let objetivoTxt = "Sin objetivo definido";
              if (objetivo) {
                if (objetivo === "Bajar_grasa" && pesoObj && w) {
                  const delta = (w - pesoObj).toFixed(1);
                  objetivoTxt = Number(delta) > 0 ? `Bajar ${delta} kg` : `Mantener`; 
                } else if (objetivo === "Ganar_musculo" && pesoObj && w) {
                  const delta = (pesoObj - w).toFixed(1);
                  objetivoTxt = Number(delta) > 0 ? `Aumentar ${delta} kg` : `Mantener`;
                } else if (objetivo === "Mantenimiento") {
                  objetivoTxt = "Mantener peso y composición actual";
                }
              }

              const extra = bmi != null && bmi < 18.5
                ? "Estás por debajo del peso saludable."
                : bmi != null && bmi >= 30
                ? "Presentas obesidad. Sigue el plan y registra progreso semanal."
                : undefined;

              return (
                <div className="grid gap-2 text-sm md:grid-cols-3">
                  <div>
                    <div className="text-muted-foreground">IMC</div>
                    <div className="font-medium">{bmi != null ? bmi.toFixed(1) : "—"} ({bmiCat(bmi)})</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Objetivo</div>
                    <div className="font-medium">{objetivoTxt}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Velocidad</div>
                    <div className="font-medium">{profile.velocidad_cambio ?? "—"}</div>
                  </div>
                  {extra && (
                    <div className="md:col-span-3 text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">{extra}</div>
                  )}
                </div>
              );
            })()}
            <div className="mt-3 text-xs text-muted-foreground">Consejo: registra tu progreso corporal semanalmente en la sección de progreso para monitorear avances.</div>
          </CardContent>
        </Card>
      )}

      <div className="text-xs uppercase text-muted-foreground">Resumen de hoy</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Flame className="h-5 w-5" /> Calorías</CardTitle>
            <CardDescription>Objetivo vs consumido</CardDescription>
          </CardHeader>
          <CardContent>
            {loading || !data ? (
              <div className="text-sm text-muted-foreground">Cargando…</div>
            ) : (
              <div className="space-y-3">
                <div className="text-3xl font-semibold">{Math.round(data.consumidos.calorias)} kcal</div>
                <div className="text-sm">Objetivo: {data.objetivos.kcal != null ? Math.round(data.objetivos.kcal) : "—"} kcal</div>
                <div className="text-sm">Restante: {data.kcal_restantes != null ? Math.round(data.kcal_restantes) : "—"} kcal</div>
                {/* Barra de progreso kcal */}
                {data.objetivos.kcal != null && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    {(() => {
                      const obj = Math.max(1, Number(data.objetivos.kcal) || 1);
                      const pct = Math.min(100, Math.max(0, (data.consumidos.calorias / obj) * 100));
                      return <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />;
                    })()}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>
                Distribución de macros ({(pieOverride ?? pieState.mode) === "consumidos" ? "consumidos" : "objetivos"})
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant={(pieOverride ?? pieState.mode) === "consumidos" ? "default" : "outline"} onClick={() => setPieOverride("consumidos")}>Consumidos</Button>
                <Button size="sm" variant={(pieOverride ?? pieState.mode) === "objetivos" ? "default" : "outline"} onClick={() => setPieOverride("objetivos")}>Objetivos</Button>
              </div>
            </div>
            <CardDescription>Proteínas, grasas y carbohidratos</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {loading || !data ? (
              <div className="text-sm text-muted-foreground">Cargando…</div>
            ) : (
              noMacroData ? (
                <div className="h-full w-full grid place-items-center text-sm text-muted-foreground">
                  Aún no registraste macros hoy.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip formatter={(v: any) => `${v} g`} />
                    <Legend />
                    <Pie
                      data={((pieOverride ?? pieState.mode) === "consumidos" ? [
                        { name: "Proteínas", value: Math.max(0, Math.round(toNum(data.consumidos.proteinas))) },
                        { name: "Grasas", value: Math.max(0, Math.round(toNum(data.consumidos.grasas))) },
                        { name: "Carbohidratos", value: Math.max(0, Math.round(toNum(data.consumidos.carbohidratos))) },
                      ] : [
                        { name: "Proteínas", value: Math.max(0, Math.round(toNum(data.objetivos.proteinas))) },
                        { name: "Grasas", value: Math.max(0, Math.round(toNum(data.objetivos.grasas))) },
                        { name: "Carbohidratos", value: Math.max(0, Math.round(toNum(data.objetivos.carbohidratos))) },
                      ]) as { name: string; value: number }[]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={4}
                      label={false}
                      labelLine={false}
                    >
                      {(pieState.data as { name: string; value: number }[]).map((entry: { name: string; value: number }, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )
            )}
          </CardContent>
          {!loading && data && (
            <CardFooter className="grid grid-cols-1 gap-2 pt-0 md:grid-cols-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="mt-1 inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[0] }} />
                <div>
                  <div className="font-medium">Proteínas</div>
                  <div className="text-muted-foreground">Obj: {data.objetivos.proteinas ?? "—"} g • Rest: {data.macros_restantes.proteinas ?? "—"} g</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[1] }} />
                <div>
                  <div className="font-medium">Grasas</div>
                  <div className="text-muted-foreground">Obj: {data.objetivos.grasas ?? "—"} g • Rest: {data.macros_restantes.grasas ?? "—"} g</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[2] }} />
                <div>
                  <div className="font-medium">Carbohidratos</div>
                  <div className="text-muted-foreground">Obj: {data.objetivos.carbohidratos ?? "—"} g • Rest: {data.macros_restantes.carbohidratos ?? "—"} g</div>
                </div>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Droplet className="h-5 w-5" /> Hidratación</CardTitle>
            <CardDescription>Progreso de hoy</CardDescription>
          </CardHeader>
          <CardContent>
            {loading || !data ? (
              <div className="text-sm text-muted-foreground">Cargando…</div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-3xl font-semibold">{data.hidratacion.hoy_litros.toFixed(2)} L</div>
                  <div className="text-sm">Objetivo: {data.hidratacion.objetivo_litros != null ? `${data.hidratacion.objetivo_litros} L` : "—"}</div>
                  {data.hidratacion.objetivo_litros != null && (
                    <div className="text-xs text-muted-foreground">
                      {Math.max(0, (data.hidratacion.objetivo_litros - data.hidratacion.hoy_litros)).toFixed(2)} L restantes
                    </div>
                  )}
                  {/* Barra de progreso */}
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    {(() => {
                      const obj = data.hidratacion.objetivo_litros ?? 0;
                      const pct = obj > 0 ? Math.min(100, Math.max(0, (data.hidratacion.hoy_litros / obj) * 100)) : 0;
                      return <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />;
                    })()}
                  </div>
                </div>
                {(() => {
                  const objective = data.hidratacion.objetivo_litros ?? 2;
                  const maxCap = Math.max(objective, 2);
                  const current = data.hidratacion.hoy_litros;
                  const reached = current >= maxCap - 1e-6;
                  const disable250 = reached || current + 0.25 > maxCap;
                  const disable500 = reached || current + 0.5 > maxCap;
                  return (
                    <div className="flex flex-col gap-2">
                      {reached && (
                        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                          ¡Felicidades! Has alcanzado tu objetivo diario de agua.
                        </div>
                      )}
                      <Button variant="outline" disabled={disable250} onClick={() => addWater(0.25)}>
                        <Plus className="h-4 w-4 mr-1" /> +250 ml
                      </Button>
                      <Button disabled={disable500} onClick={() => addWater(0.5)}>
                        <Plus className="h-4 w-4 mr-1" /> +500 ml
                      </Button>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen del plan</CardTitle>
            <CardDescription>Objetivos generados por IA</CardDescription>
          </CardHeader>
          <CardContent>
            {loading || !data ? (
              <div className="text-sm text-muted-foreground">Cargando…</div>
            ) : (
              <ul className="text-sm space-y-3">
                <li className="flex items-start gap-2">
                  <Flame className="mt-0.5 h-4 w-4 text-indigo-600" />
                  <div>
                    <div className="font-medium">Kcal objetivo</div>
                    <div className="text-muted-foreground">{data.objetivos.kcal ?? "—"} kcal</div>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[0] }} />
                  <div>
                    <div className="flex items-center gap-1 font-medium"><Egg className="h-4 w-4" /> Proteínas</div>
                    <div className="text-muted-foreground">{data.objetivos.proteinas ?? "—"} g</div>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[1] }} />
                  <div>
                    <div className="font-medium">Grasas</div>
                    <div className="text-muted-foreground">{data.objetivos.grasas ?? "—"} g</div>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[2] }} />
                  <div>
                    <div className="flex items-center gap-1 font-medium"><Wheat className="h-4 w-4" /> Carbohidratos</div>
                    <div className="text-muted-foreground">{data.objetivos.carbohidratos ?? "—"} g</div>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <Droplet className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <div>
                    <div className="font-medium">Agua</div>
                    <div className="text-muted-foreground">{data.objetivos.agua_litros ?? "—"} L</div>
                  </div>
                </li>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Adherencia agregada: comparación semanas/meses */}
      <div className="text-xs uppercase text-muted-foreground">Actividad reciente</div>
      <Card>
        <CardHeader>
          <CardTitle>Comidas cumplidas</CardTitle>
          <CardDescription>
            {adherenceMode === "weeks" ? "Semanas recientes" : "Meses recientes"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-sm text-muted-foreground">
              {adherenceMode === "weeks" ? "Esta semana vs. semana pasada" : "Este mes vs. mes pasado"}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={adherenceMode === "weeks" ? "default" : "outline"} onClick={() => setAdherenceMode("weeks")}>Semanas</Button>
              <Button size="sm" variant={adherenceMode === "months" ? "default" : "outline"} onClick={() => setAdherenceMode("months")}>Meses</Button>
            </div>
          </div>
          {/* Tendencia */}
          {adherenceSeries.length > 0 && (
            <div className="h-48 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={adherenceSeries} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="period"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tickFormatter={(v) => {
                      const s = String(v);
                      if (adherenceMode === "months") {
                        const [y, m] = s.split("-");
                        return `${m}/${y.slice(2)}`; // MM/YY
                      }
                      const parts = s.split("-W");
                      return parts.length === 2 ? `Sem ${parts[1]}` : s; // Semana NN
                    }}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                    width={40}
                  />
                  <Tooltip
                    formatter={(v: any) => [`${Math.round((Number(v) || 0) * 100)}%`, "Comidas cumplidas"]}
                    labelFormatter={(l) => {
                      const s = String(l);
                      if (adherenceMode === "months") {
                        const [y, m] = s.split("-");
                        return `Mes: ${m}/${y}`;
                      }
                      const parts = s.split("-W");
                      return parts.length === 2 ? `Semana: ${parts[1]}` : `Semana: ${s}`;
                    }}
                  />
                  <Line type="monotone" dataKey="pct" stroke="#4F46E5" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Textos claros bajo el gráfico */}
          {(() => {
            if (!adherenceSeries.length) {
              return <div className="text-sm text-muted-foreground">Sin datos suficientes.</div>;
            }
            const last = adherenceSeries[adherenceSeries.length - 1]?.pct ?? 0;
            const prev = adherenceSeries[adherenceSeries.length - 2]?.pct ?? 0;
            const delta = last - prev;
            const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
            return (
              <>
                {/* Texto explicativo simple */}
                <p className="text-sm mb-3">
                  {adherenceMode === "weeks"
                    ? <>Esta semana llevas <strong>{fmtPct(last)}</strong> de comidas cumplidas. La semana pasada fue <strong>{fmtPct(prev)}</strong>.</>
                    : <>Este mes llevas <strong>{fmtPct(last)}</strong> de comidas cumplidas. El mes pasado fue <strong>{fmtPct(prev)}</strong>.</>}
                </p>
                {last7Avg != null && (
                  <p className="text-sm mb-3">
                    En los últimos 7 días llevas <strong>{fmtPct(last7Avg)}</strong>. Los 7 días anteriores fue <strong>{fmtPct(prev7Avg || 0)}</strong>.
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="rounded border p-3">
                    <div className="text-muted-foreground">{adherenceMode === "weeks" ? "Esta semana" : "Este mes"}</div>
                    <div className="text-2xl font-semibold">{fmtPct(last)}</div>
                  </div>
                  <div className="rounded border p-3">
                    <div className="text-muted-foreground">{adherenceMode === "weeks" ? "Semana pasada" : "Mes pasado"}</div>
                    <div className="text-2xl font-semibold">{fmtPct(prev)}</div>
                  </div>
                  <div className="rounded border p-3">
                    <div className={"text-muted-foreground"}>Diferencia</div>
                    <div className={`text-2xl font-semibold ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {delta >= 0 ? "↑" : "↓"} {fmtPct(Math.abs(delta))}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
