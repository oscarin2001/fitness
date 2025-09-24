"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { usePasswordGate } from "@/components/usePasswordGate";

type Usuario = {
  id: number;
  nombre: string | null;
  apellido: string | null;
  email?: string | null;
  sexo: string | null;
  altura_cm: number | null;
  peso_kg: number | null;
  fecha_nacimiento: string | null;
  nivel_actividad: string | null;
  pais: string | null;
  objetivo: string | null;
  peso_objetivo_kg: number | null;
};

export default function ProfilePersonalPage() {
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
        const res = await fetch("/api/account/profile", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (abort) return;
        setUser(j.user ?? null);
        setForm(j.user ?? {});
      } catch {}
    })();
    return () => { abort = true; };
  }, []);

  function set<K extends keyof Usuario>(key: K, value: Usuario[K]) {
    setForm((f) => ({ ...f, [key]: value as any }));
  }

  async function save(password?: string) {
    setMsg(null); setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, password }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "No se pudo guardar");
      }
      setMsg("Cambios guardados");
    } catch (e: any) {
      setErr(e?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Datos personales</h1>
        <p className="text-sm text-muted-foreground">Actualiza tus datos básicos y métricas.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información básica</CardTitle>
          <CardDescription>Estos datos ayudan a personalizar tus objetivos.</CardDescription>
        </CardHeader>
        <CardContent>
          {msg && <div className="text-sm text-green-600">{msg}</div>}
          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Nombre</span>
              <input className="border rounded px-3 py-2" value={form.nombre ?? ""} onChange={(e) => set("nombre", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Apellido</span>
              <input className="border rounded px-3 py-2" value={form.apellido ?? ""} onChange={(e) => set("apellido", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Email</span>
              <input type="email" className="border rounded px-3 py-2" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">País</span>
              <input className="border rounded px-3 py-2" value={form.pais ?? ""} onChange={(e) => set("pais", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Sexo</span>
              <select className="border rounded px-3 py-2" value={form.sexo ?? ""} onChange={(e) => set("sexo", e.target.value)}>
                <option value="">Seleccionar</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
                <option value="Otro">Otro</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Altura (cm)</span>
              <input type="number" className="border rounded px-3 py-2" value={form.altura_cm ?? ""} onChange={(e) => set("altura_cm", Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Peso (kg)</span>
              <input type="number" className="border rounded px-3 py-2" value={form.peso_kg ?? ""} onChange={(e) => set("peso_kg", Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Fecha de nacimiento</span>
              <input type="date" className="border rounded px-3 py-2" value={form.fecha_nacimiento ? String(form.fecha_nacimiento).substring(0,10) : ""} onChange={(e) => set("fecha_nacimiento", e.target.value as any)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Nivel de actividad</span>
              <select className="border rounded px-3 py-2" value={form.nivel_actividad ?? ""} onChange={(e) => set("nivel_actividad", e.target.value)}>
                <option value="">Seleccionar</option>
                <option value="Sedentario">Sedentario</option>
                <option value="Ligera">Ligera</option>
                <option value="Moderada">Moderada</option>
                <option value="Intensa">Intensa</option>
              </select>
            </label>
          </div>

          <div className="mt-4">
            <button onClick={() => ensureConfirmed(save)} disabled={saving} className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm">
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            {pwdDialog}
          </div>
        </CardContent>
      </Card>
      <div className="pt-2">
        <a href="/account/settings" className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm">Volver a Configuraciones</a>
      </div>
    </div>
  );
}
