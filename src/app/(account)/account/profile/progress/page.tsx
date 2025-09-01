"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

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

export default function ProgressProfilePage() {
  const [form, setForm] = useState<ProgressForm>(() => ({
    fecha: new Date().toISOString().slice(0, 10),
  }));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastItems, setLastItems] = useState<any[]>([]);
  const [summaryWeek, setSummaryWeek] = useState<any>(null);
  const [summaryMonth, setSummaryMonth] = useState<any>(null);

  function onChange(name: keyof ProgressForm, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function loadData() {
    try {
      setLoading(true);
      const [itemsRes, weekRes, monthRes] = await Promise.all([
        fetch(`/api/account/progress?limit=7`),
        fetch(`/api/account/progress/summary?window=week&ending=${form.fecha}`),
        fetch(`/api/account/progress/summary?window=month&ending=${form.fecha}`),
      ]);
      const itemsJson = await itemsRes.json();
      const weekJson = await weekRes.json();
      const monthJson = await monthRes.json();
      setLastItems(itemsJson.items || []);
      setSummaryWeek(weekJson);
      setSummaryMonth(monthJson);
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
  }, []);

  const weekCards = useMemo(() => [
    { title: "Peso prom. (sem)", value: summaryWeek?.weight?.avg ?? "-" },
    { title: "Pend. kg/sem", value: summaryWeek?.weight?.slope_kg_per_week ?? "-" },
    { title: "%Grasa prom.", value: summaryWeek?.bodyfat?.avg_percent ?? "-" },
    { title: "Δ %Grasa/sem", value: summaryWeek?.bodyfat?.slope_percent_points_per_week ?? "-" },
    { title: "%Músculo prom.", value: summaryWeek?.muscle?.avg_percent ?? "-" },
    { title: "Δ %Músculo/sem", value: summaryWeek?.muscle?.slope_percent_points_per_week ?? "-" },
  ], [summaryWeek]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/account/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
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
    } catch (e) {
      toast.error("No se pudo ajustar el plan");
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <Toaster />
      <h1 className="text-2xl font-bold">Progreso corporal</h1>
      <p className="text-sm text-muted-foreground">Registra tu peso, porcentaje de grasa y masa muscular, y tus medidas corporales. Recomendado: ingresar datos 3-7 veces por semana.</p>

      <Card>
        <CardHeader>
          <CardTitle>Registrar medición</CardTitle>
          <CardDescription>Selecciona la fecha y completa los campos que tengas disponibles.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 md:grid-cols-3 gap-4" onSubmit={onSubmit}>
            <div>
              <Label htmlFor="fecha">Fecha</Label>
              <Input id="fecha" type="date" value={form.fecha} onChange={(e) => onChange("fecha", e.target.value)} />
            </div>

            <div>
              <Label htmlFor="peso">Peso (kg)</Label>
              <Input id="peso" type="number" step="0.1" value={form.peso_kg || ""} onChange={(e) => onChange("peso_kg", e.target.value)} />
            </div>

            <div>
              <Label htmlFor="grasa">% Grasa</Label>
              <Input id="grasa" type="number" step="0.1" value={form.grasa_percent || ""} onChange={(e) => onChange("grasa_percent", e.target.value)} />
            </div>

            <div>
              <Label htmlFor="musculo">% Masa Muscular</Label>
              <Input id="musculo" type="number" step="0.1" value={form.musculo_percent || ""} onChange={(e) => onChange("musculo_percent", e.target.value)} />
            </div>

            <div>
              <Label htmlFor="agua">% Agua</Label>
              <Input id="agua" type="number" step="0.1" value={form.agua_percent || ""} onChange={(e) => onChange("agua_percent", e.target.value)} />
            </div>

            <div>
              <Label htmlFor="imc">IMC</Label>
              <Input id="imc" type="number" step="0.1" value={form.imc || ""} onChange={(e) => onChange("imc", e.target.value)} />
            </div>

            <div>
              <Label>Cintura (cm)</Label>
              <Input type="number" step="0.1" value={form.cintura_cm || ""} onChange={(e) => onChange("cintura_cm", e.target.value)} />
            </div>

            <div>
              <Label>Cadera (cm)</Label>
              <Input type="number" step="0.1" value={form.cadera_cm || ""} onChange={(e) => onChange("cadera_cm", e.target.value)} />
            </div>

            <div>
              <Label>Cuello (cm)</Label>
              <Input type="number" step="0.1" value={form.cuello_cm || ""} onChange={(e) => onChange("cuello_cm", e.target.value)} />
            </div>

            <div>
              <Label>Pecho (cm)</Label>
              <Input type="number" step="0.1" value={form.pecho_cm || ""} onChange={(e) => onChange("pecho_cm", e.target.value)} />
            </div>

            <div>
              <Label>Brazo (cm)</Label>
              <Input type="number" step="0.1" value={form.brazo_cm || ""} onChange={(e) => onChange("brazo_cm", e.target.value)} />
            </div>

            <div>
              <Label>Muslo (cm)</Label>
              <Input type="number" step="0.1" value={form.muslo_cm || ""} onChange={(e) => onChange("muslo_cm", e.target.value)} />
            </div>

            <div>
              <Label>Glúteo (cm)</Label>
              <Input type="number" step="0.1" value={form.gluteo_cm || ""} onChange={(e) => onChange("gluteo_cm", e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <Label>Foto (URL)</Label>
              <Input type="url" placeholder="https://..." value={form.foto_url || ""} onChange={(e) => onChange("foto_url", e.target.value)} />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Últimas mediciones</CardTitle>
            <CardDescription>Los últimos registros guardados.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Peso</th>
                    <th className="p-2">%Grasa</th>
                    <th className="p-2">%Músculo</th>
                    <th className="p-2">Cintura</th>
                    <th className="p-2">Pecho</th>
                  </tr>
                </thead>
                <tbody>
                  {lastItems.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">{new Date(it.fecha).toISOString().slice(0,10)}</td>
                      <td className="p-2">{it.peso_kg ?? "-"}</td>
                      <td className="p-2">{it.grasa_percent ?? "-"}</td>
                      <td className="p-2">{it.musculo_percent ?? "-"}</td>
                      <td className="p-2">{it.cintura_cm ?? "-"}</td>
                      <td className="p-2">{it.pecho_cm ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
