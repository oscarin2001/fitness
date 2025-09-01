"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { usePasswordGate } from "@/components/usePasswordGate";

type Objetivos = {
  kcal?: number | null;
  proteinas?: number | null;
  grasas?: number | null;
  carbohidratos?: number | null;
  agua_litros?: number | null;
};

type Usuario = {
  objetivo: string | null;
  peso_objetivo_kg: number | null;
  velocidad_cambio: string | null;
  peso_kg: number | null;
};

export default function ProfileObjectivesPage() {
  const [summary, setSummary] = useState<{ objetivos?: Objetivos } | null>(null);
  const [user, setUser] = useState<Usuario | null>(null);
  const [form, setForm] = useState<Partial<Usuario>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { ensureConfirmed, dialog: pwdDialog } = usePasswordGate();

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const [s, p] = await Promise.all([
          fetch("/api/account/dashboard/summary", { cache: "no-store" }),
          fetch("/api/account/profile", { cache: "no-store" }),
        ]);
        if (abort) return;
        if (s.ok) setSummary(await s.json());
        if (p.ok) {
          const pj = await p.json();
          const u = pj?.user || {};
          const cur: Usuario = {
            objetivo: u.objetivo ?? null,
            peso_objetivo_kg: u.peso_objetivo_kg ?? null,
            velocidad_cambio: u.velocidad_cambio ?? null,
            peso_kg: u.peso_kg ?? null,
          };
          setUser(cur);
          setForm(cur);
        }
      } catch {}
    })();
    return () => { abort = true; };
  }, []);

  function set<K extends keyof Usuario>(key: K, value: Usuario[K]) {
    setForm((f) => ({ ...f, [key]: value as any }));
  }

  async function save() {
    setSaving(true); setMsg(null); setErr(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objetivo: form.objetivo,
          peso_objetivo_kg: form.peso_objetivo_kg,
          velocidad_cambio: form.velocidad_cambio,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "No se pudo guardar objetivos");
      }
      setMsg("Objetivos guardados");
    } catch (e: any) {
      setErr(e?.message || "No se pudo guardar objetivos");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Objetivos</CardTitle>
        <CardDescription>Configura tu objetivo general y peso objetivo. Las metas de macros y agua se calculan y muestran como referencia.</CardDescription>
      </CardHeader>
      <CardContent>
        {msg && <div className="text-sm text-green-600">{msg}</div>}
        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Objetivo</span>
            <select className="border rounded px-3 py-2" value={form.objetivo ?? ""} onChange={(e) => set("objetivo", e.target.value as any)}>
              <option value="">Seleccionar</option>
              <option value="Bajar_grasa">Bajar grasa</option>
              <option value="Ganar_musculo">Ganar músculo</option>
              <option value="Mantenimiento">Mantenimiento</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Peso objetivo (kg)</span>
            <input type="number" className="border rounded px-3 py-2" value={form.peso_objetivo_kg ?? ""} onChange={(e) => set("peso_objetivo_kg", Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm">Velocidad de cambio</span>
            <select className="border rounded px-3 py-2" value={form.velocidad_cambio ?? ""} onChange={(e) => set("velocidad_cambio", e.target.value as any)}>
              <option value="">Seleccionar</option>
              <option value="Rapido">Rápido</option>
              <option value="Moderado">Moderado</option>
              <option value="Lento">Lento</option>
            </select>
          </label>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div className="rounded border p-3"><div className="text-muted-foreground">Kcal</div><div className="text-lg font-medium">{summary?.objetivos?.kcal ?? "-"}</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Proteínas</div><div className="text-lg font-medium">{summary?.objetivos?.proteinas ?? "-"} g</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Grasas</div><div className="text-lg font-medium">{summary?.objetivos?.grasas ?? "-"} g</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Carbohidratos</div><div className="text-lg font-medium">{summary?.objetivos?.carbohidratos ?? "-"} g</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Agua</div><div className="text-lg font-medium">{summary?.objetivos?.agua_litros ?? "-"} L</div></div>
        </div>

        <div className="mt-4">
          <button onClick={() => ensureConfirmed(save)} disabled={saving} className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm">
            {saving ? "Guardando…" : "Guardar"}
          </button>
          {pwdDialog}
        </div>
      </CardContent>
    </Card>
  );
}
