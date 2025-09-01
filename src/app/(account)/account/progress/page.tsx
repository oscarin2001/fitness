"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ProfileLayout from "../profile/layout";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";
import { usePasswordGate } from "@/components/usePasswordGate";
import { Calendar } from "@/components/ui/calendar";

// Utilidades de estimación (IA/heurísticas basadas en literatura):
// - Si hay medidas (cintura/cadera/cuello), usar método US Navy.
// - Si no hay medidas, usar Deurenberg (IMC + edad + sexo) como aproximación.
// - Estimar % masa muscular a partir de IMC, sexo y nivel de actividad como orientación.

type Progress = {
  id: number;
  fecha: string;
  peso_kg?: number | null;
  grasa_percent?: number | null;
  musculo_percent?: number | null;
  agua_percent?: number | null;
  imc?: number | null;
  cintura_cm?: number | null;
  cadera_cm?: number | null;
  cuello_cm?: number | null;
};

export default function ProgressPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Progress[]>([]);
  const [profile, setProfile] = useState<any | null>(null);

  const [form, setForm] = useState<Partial<Progress>>({});
  const [saving, setSaving] = useState(false);
  // Configuración de frecuencia de medición
  const [measWeeks, setMeasWeeks] = useState<number | null>(null);
  const [savingWeeks, setSavingWeeks] = useState(false);
  // Calendario sugerido
  const [nextMeasure, setNextMeasure] = useState<string | null>(null);
  const [upcomingMeasures, setUpcomingMeasures] = useState<string[]>([]);
  // Reset de configuración
  const [resetting, setResetting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const { ensureConfirmed, dialog: pwdDialog } = usePasswordGate();

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [prof, res, weeksRes] = await Promise.all([
          fetch("/api/account/profile", { cache: "no-store" }),
          fetch("/api/account/progress?limit=12", { cache: "no-store" }),
          fetch("/api/account/profile/measurement-interval", { cache: "no-store" }),
        ]);
        let loadedUser: any | null = null;
        if (prof.ok) {
          const pj = await prof.json();
          loadedUser = pj?.user || null;
          setProfile(loadedUser);
        }
        if (res.ok) {
          const j = await res.json();
          setItems(j.items || []);
          // pre-rellenar peso si existe en profile
          setForm((f) => ({ ...f, peso_kg: pjNum(loadedUser?.peso_kg) }));
        }
        if (weeksRes.ok) {
          const wj = await weeksRes.json();
          const w = Number(wj?.weeks);
          setMeasWeeks([2,3,4].includes(w) ? w : null);
        }
      } catch {
        toast.error("No se pudo cargar el progreso");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalcular calendario al cambiar items (última medición) o la frecuencia
  useEffect(() => {
    if (!measWeeks) { setNextMeasure(null); setUpcomingMeasures([]); return; }
    // Anchor: fecha del último registro si existe; si no, hoy
    const anchorStr = items?.[0]?.fecha ? String(items[0].fecha) : new Date().toISOString();
    const anchor = new Date(anchorStr);
    // Normalizar a medianoche local para evitar desfases visuales
    const base = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const weeks = Number(measWeeks);
    const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    // Próxima medición = anchor + weeks*7 días si anchor es pasado o hoy; si anchor es futuro, mantener anchor como siguiente
    const today = new Date();
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let first = base <= todayMid ? addDays(base, weeks * 7) : base;
    // Generar las próximas 6 fechas de medición
    const ups: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = addDays(first, i * weeks * 7);
      ups.push(d.toISOString().slice(0,10));
    }
    setNextMeasure(ups[0] || null);
    setUpcomingMeasures(ups);
  }, [items, measWeeks]);

  // Fechas para pintar en el calendario
  const measuredDates = useMemo(() => {
    return (items || []).map((it) => {
      const d = new Date(it.fecha);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    });
  }, [items]);
  const scheduledDates = useMemo(() => {
    return (upcomingMeasures || []).map((s) => {
      const d = new Date(s + "T00:00:00");
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    });
  }, [upcomingMeasures]);

  

  async function saveWeeks() {
    try {
      setSavingWeeks(true);
      const w = Number(measWeeks);
      if (![2,3,4].includes(w)) {
        toast.error("Selecciona 2, 3 o 4 semanas");
        return;
      }
      const res = await fetch("/api/account/profile/measurement-interval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeks: w }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Error al guardar");
      toast.success("Frecuencia actualizada");
      // Al guardar, recalcular calendario (useEffect lo hará por measWeeks)
    } catch (e: any) {
      toast.error(e?.message || "No se pudo actualizar la frecuencia");
    } finally {
      setSavingWeeks(false);
    }
  }

  async function resetWithPassword(pwd: string) {
    try {
      setResetting(true);
      const res = await fetch("/api/account/profile/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "No se pudo restablecer");
      toast.success("Configuración restablecida");
      setMeasWeeks(null);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo restablecer");
    } finally {
      setResetting(false);
    }
  }

  function set<K extends keyof Progress>(k: K, v: Progress[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const hM = useMemo(() => (profile?.altura_cm ? Number(profile.altura_cm) / 100 : null), [profile]);
  const age = useMemo(() => {
    if (!profile?.fecha_nacimiento) return null;
    const d = new Date(profile.fecha_nacimiento);
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
    return years;
  }, [profile]);
  const sexo = profile?.sexo || "N/A";
  const nivel = profile?.nivel_actividad || "Sedentario";

  const imc = useMemo(() => {
    if (!hM || !form.peso_kg) return null;
    const bmi = Number(form.peso_kg) / (hM * hM);
    return isFinite(bmi) ? bmi : null;
  }, [form.peso_kg, hM]);

  // Estimación % grasa
  const estGrasa = useMemo(() => {
    const cintura = pjNum(form.cintura_cm);
    const cadera = pjNum(form.cadera_cm);
    const cuello = pjNum(form.cuello_cm);
    if (cintura && cuello && sexo && (sexo === "Masculino" || sexo === "Hombre" || sexo === "M")) {
      // US Navy hombres
      // %grasa = 86.010 * log10(cintura - cuello) - 70.041 * log10(altura) + 36.76
      if (!hM) return null;
      const alturaCm = hM * 100;
      if (cintura > cuello && alturaCm > 0) {
        const val = 86.01 * log10(cintura - cuello) - 70.041 * log10(alturaCm) + 36.76;
        return clamp(val, 3, 60);
      }
    }
    if (cintura && cadera && cuello && sexo && (sexo === "Femenino" || sexo === "Mujer" || sexo === "F")) {
      // US Navy mujeres
      // %grasa = 163.205 * log10(cintura + cadera - cuello) - 97.684 * log10(altura) - 78.387
      if (!hM) return null;
      const alturaCm = hM * 100;
      if (cintura + cadera - cuello > 0 && alturaCm > 0) {
        const val = 163.205 * log10(cintura + cadera - cuello) - 97.684 * log10(alturaCm) - 78.387;
        return clamp(val, 5, 65);
      }
    }
    // Deurenberg (sin medidas): %grasa = 1.2*IMC + 0.23*edad - 10.8*sexo - 5.4, sexo=1 hombre, 0 mujer
    if (imc != null && age != null) {
      const male = isMale(sexo) ? 1 : 0;
      const val = 1.2 * imc + 0.23 * age - 10.8 * male - 5.4;
      return clamp(val, 3, 65);
    }
    return null;
  }, [form.cadera_cm, form.cintura_cm, form.cuello_cm, sexo, hM, imc, age]);

  // Estimación % músculo (orientativa): ajusta según sexo y nivel de actividad.
  const estMusculo = useMemo(() => {
    if (estGrasa == null) return null;
    // Base muscular de referencia (porcentaje de masa libre de grasa que es músculo esquelético)
    // Ajuste por sexo y actividad: Novato Sedentario ~35% (h), 30% (m). Atleta alto ~45-50% (h), 40-45% (m).
    const male = isMale(sexo);
    const base = male ? 35 : 30;
    const actAdj = activityAdj(nivel); // 0 a +10
    const musc = base + actAdj - adjByAge(age);
    // Límite a porcentaje plausible del peso total, no depende de grasa directamente, pero mantenemos coherencia:
    return clamp(musc, 20, 55);
  }, [estGrasa, sexo, nivel, age]);

  const aiSummary = useMemo(() => {
    const g = estGrasa != null ? `${estGrasa.toFixed(1)}%` : "—";
    const m = estMusculo != null ? `${estMusculo.toFixed(1)}%` : "—";
    return `Estimación IA • Grasa: ${g} • Músculo: ${m}`;
  }, [estGrasa, estMusculo]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/account/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peso_kg: form.peso_kg,
          grasa_percent: form.grasa_percent ?? estGrasa,
          musculo_percent: form.musculo_percent ?? estMusculo,
          agua_percent: form.agua_percent,
          imc: imc ?? undefined,
          cintura_cm: form.cintura_cm,
          cadera_cm: form.cadera_cm,
          cuello_cm: form.cuello_cm,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      toast.success("Progreso guardado");
      // Refresh list
      const list = await fetch("/api/account/progress?limit=12", { cache: "no-store" });
      if (list.ok) {
        const jj = await list.json();
        setItems(jj.items || []);
      }
      // items cambia -> calendario se recalcula por useEffect
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProfileLayout>
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Progreso corporal</h1>
        <p className="text-sm text-muted-foreground">Registra semanalmente tu peso y medidas. La IA estima composición corporal de forma orientativa.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuración de medición</CardTitle>
          <CardDescription>Define cada cuántas semanas harás tu control</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Frecuencia (semanas)</span>
              <select className="border rounded px-3 py-2" value={measWeeks ?? ''} onChange={(e) => setMeasWeeks(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Selecciona…</option>
                <option value={2}>Cada 2 semanas</option>
                <option value={3}>Cada 3 semanas</option>
                <option value={4}>Cada 4 semanas</option>
              </select>
            </label>
            <div>
              <Button onClick={() => ensureConfirmed(saveWeeks)} disabled={savingWeeks}>{savingWeeks ? 'Guardando…' : 'Guardar frecuencia'}</Button>
            </div>
          </div>
          <div className="mt-6 border-t pt-4">
            <div className="text-sm font-medium mb-2">Restablecer configuración</div>
            <div>
              <Button variant="destructive" onClick={() => setResetOpen(true)} disabled={resetting}>{resetting ? 'Restableciendo…' : 'Restablecer configuración'}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <PasswordConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        mode="confirm"
        onConfirmed={async ({ currentPassword }) => {
          await resetWithPassword(currentPassword);
        }}
      />

      {pwdDialog}

      <Card>
        <CardHeader>
          <CardTitle>Calendario de mediciones</CardTitle>
          <CardDescription>
            {measWeeks ? `Cada ${measWeeks} semanas` : "Configura la frecuencia para ver sugerencias"}
          </CardDescription>
        </CardHeader>
        <CardContent>
        {measWeeks ? (
          <div>
            <div className="text-sm mb-3">
              <span className="text-muted-foreground">Próxima medición sugerida:</span>{" "}
              <span className="font-medium">{nextMeasure ? new Date(nextMeasure + "T00:00:00").toLocaleDateString() : "—"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {upcomingMeasures.map((d, i) => (
                <div key={d}
                  className="px-3 py-2 rounded border text-xs flex items-center gap-2"
                  title={`Sugerida #${i+1}`}
                >
                  <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                  {new Date(d + "T00:00:00").toLocaleDateString()}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Calendar
                numberOfMonths={1}
                modifiers={{ measured: measuredDates, scheduled: scheduledDates }}
                modifiersClassNames={{
                  measured: "bg-emerald-500 text-white hover:bg-emerald-600",
                  scheduled: "bg-amber-500 text-white hover:bg-amber-600",
                }}
              />
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Medición realizada</span>
                <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> Medición sugerida</span>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Las fechas se calculan desde tu último registro. Si no tienes registros, se calculan desde hoy.</div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Selecciona y guarda una frecuencia arriba para ver el calendario sugerido.</div>
        )}
      </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registro</CardTitle>
          <CardDescription>
            {aiSummary}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Peso (kg)</span>
              <input type="number" step="0.1" className="border rounded px-3 py-2" value={form.peso_kg ?? ""} onChange={(e) => set("peso_kg", toNum(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Cintura (cm)</span>
              <input type="number" step="0.1" className="border rounded px-3 py-2" value={form.cintura_cm ?? ""} onChange={(e) => set("cintura_cm", toNum(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Cadera (cm)</span>
              <input type="number" step="0.1" className="border rounded px-3 py-2" value={form.cadera_cm ?? ""} onChange={(e) => set("cadera_cm", toNum(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Cuello (cm)</span>
              <input type="number" step="0.1" className="border rounded px-3 py-2" value={form.cuello_cm ?? ""} onChange={(e) => set("cuello_cm", toNum(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">% Grasa (opcional)</span>
              <input type="number" step="0.1" className="border rounded px-3 py-2" value={form.grasa_percent ?? ""} placeholder={estGrasa != null ? estGrasa.toFixed(1) : undefined} onChange={(e) => set("grasa_percent", toNum(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">% Músculo (opcional)</span>
              <input type="number" step="0.1" className="border rounded px-3 py-2" value={form.musculo_percent ?? ""} placeholder={estMusculo != null ? estMusculo.toFixed(1) : undefined} onChange={(e) => set("musculo_percent", toNum(e.target.value))} />
            </label>
          </div>

          <div className="mt-4">
            <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </div>

          {imc != null && (
            <div className="mt-3 text-xs text-muted-foreground">IMC estimado: {imc.toFixed(1)}</div>
          )}

          <div className="mt-4 text-xs text-muted-foreground">
            Nota: los porcentajes estimados son orientativos y pueden variar. Para mayor precisión, utiliza mediciones por bioimpedancia o pliegues cutáneos con un profesional.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial reciente</CardTitle>
          <CardDescription>Últimos registros (hasta 12)</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">Aún no tienes registros.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Peso (kg)</th>
                    <th className="py-2 pr-3">% Grasa</th>
                    <th className="py-2 pr-3">% Músculo</th>
                    <th className="py-2 pr-3">Cintura</th>
                    <th className="py-2 pr-3">Cadera</th>
                    <th className="py-2 pr-3">Cuello</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="py-2 pr-3">{new Date(it.fecha).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">{it.peso_kg ?? "—"}</td>
                      <td className="py-2 pr-3">{it.grasa_percent != null ? `${it.grasa_percent.toFixed?.(1) ?? it.grasa_percent}` : "—"}</td>
                      <td className="py-2 pr-3">{it.musculo_percent != null ? `${it.musculo_percent.toFixed?.(1) ?? it.musculo_percent}` : "—"}</td>
                      <td className="py-2 pr-3">{it.cintura_cm ?? "—"}</td>
                      <td className="py-2 pr-3">{it.cadera_cm ?? "—"}</td>
                      <td className="py-2 pr-3">{it.cuello_cm ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </ProfileLayout>
  );
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pjNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function isMale(sexo: string | null | undefined) {
  const s = (sexo || "").toLowerCase();
  return s.includes("masculino") || s === "m" || s.includes("hombre");
}
function log10(v: number) { return Math.log(v) / Math.log(10); }
function activityAdj(nivel: string | null | undefined) {
  switch (nivel) {
    case "Extremo": return 10;
    case "Activo": return 7;
    case "Moderado": return 5;
    case "Ligero": return 2;
    case "Sedentario":
    default: return 0;
  }
}
function adjByAge(age: number | null) {
  if (age == null) return 0;
  if (age < 30) return 0;
  if (age < 40) return 1;
  if (age < 50) return 2;
  if (age < 60) return 3;
  return 4;
}
