"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  objetivo: string | null; // Bajar_grasa | Ganar_musculo | Mantenimiento
  peso_objetivo_kg: number | null;
  velocidad_cambio: string | null;
};

type Summary = {
  objetivos: {
    kcal: number | null;
    proteinas: number | null;
    grasas: number | null;
    carbohidratos: number | null;
    agua_litros: number | null;
  };
};

type IngredientItem = {
  alimentoId: number;
  nombre: string;
  categoria: string | null;
  prioridad: number | null;
};

export default function ProfilePage() {
  const [user, setUser] = useState<Usuario | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [measureWeeks, setMeasureWeeks] = useState<number>(2);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const [p, s, ing] = await Promise.all([
          fetch("/api/account/profile", { cache: "no-store" }),
          fetch("/api/account/dashboard/summary", { cache: "no-store" }),
          fetch("/api/account/user-ingredients", { cache: "no-store" }),
        ]);
        if (abort) return;
        if (p.ok) {
          const pj = await p.json();
          setUser(pj.user ?? null);
        }
        if (s.ok) {
          const sj = await s.json();
          setSummary(sj);
        }
        if (ing.ok) {
          const ij = await ing.json();
          setIngredients(Array.isArray(ij.items) ? ij.items : []);
        }
      } catch {}
    })();
    // cargar preferencia de intervalo (API)
    (async () => {
      try {
        const r = await fetch("/api/account/profile/measurement-interval", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          const v = Number(j?.weeks);
          if (v && [2,3,4].includes(v)) setMeasureWeeks(v);
        }
      } catch {}
    })();
    return () => { abort = true; };
  }, []);

  const objetivos = useMemo(() => summary?.objetivos, [summary]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Perfil</h1>
        <p className="text-sm text-muted-foreground">Resumen de tu cuenta. Edita cada sección desde su enlace.</p>
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}

      {/* Datos personales (solo lectura) */}
      <section className="rounded border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Datos personales</h2>
          <Link href="/account/profile/personal" className="text-sm underline">Editar</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded border p-3"><div className="text-muted-foreground">Nombre</div><div className="font-medium">{user?.nombre ?? "-"}</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Apellido</div><div className="font-medium">{user?.apellido ?? "-"}</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Email</div><div className="font-medium">{user?.email ?? "-"}</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Sexo</div><div className="font-medium">{user?.sexo ?? "-"}</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">País</div><div className="font-medium">{user?.pais ?? "-"}</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Altura</div><div className="font-medium">{user?.altura_cm ?? "-"} cm</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Peso</div><div className="font-medium">{user?.peso_kg ?? "-"} kg</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Nacimiento</div><div className="font-medium">{user?.fecha_nacimiento ? user.fecha_nacimiento.substring(0,10) : "-"}</div></div>
          <div className="rounded border p-3"><div className="text-muted-foreground">Actividad</div><div className="font-medium">{user?.nivel_actividad ?? "-"}</div></div>
        </div>
      </section>

      {/* Frecuencia de mediciones (configuración local) */}
      <section className="rounded border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Frecuencia de mediciones</h2>
        </div>
        <p className="text-sm text-muted-foreground">Define cada cuántas semanas registrarás tus medidas corporales. El formulario de progreso exige al menos este intervalo.</p>
        <div className="flex items-center gap-3">
          <label className="text-sm">Cada</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={measureWeeks}
            onChange={async (e) => {
              const v = Number(e.target.value);
              if (![2,3,4].includes(v)) return;
              setSaving(true);
              try {
                const res = await fetch("/api/account/profile/measurement-interval", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ weeks: v }),
                });
                if (res.ok) setMeasureWeeks(v);
              } finally {
                setSaving(false);
              }
            }}
          >
            <option value={2}>2 semanas</option>
            <option value={3}>3 semanas</option>
            <option value={4}>4 semanas</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-xs font-medium border border-amber-200">Actual: cada {measureWeeks} semanas</span>
          {saving && <span className="text-xs text-muted-foreground">Guardando…</span>}
        </div>
      </section>

      {/* Objetivos (solo lectura) */}
      <section className="rounded border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Objetivos</h2>
          <Link href="/account/profile/objectives" className="text-sm underline">Editar</Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Kcal</div>
            <div className="text-lg font-medium">{objetivos?.kcal ?? "-"}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Proteínas</div>
            <div className="text-lg font-medium">{objetivos?.proteinas ?? "-"} g</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Grasas</div>
            <div className="text-lg font-medium">{objetivos?.grasas ?? "-"} g</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Carbohidratos</div>
            <div className="text-lg font-medium">{objetivos?.carbohidratos ?? "-"} g</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-muted-foreground">Agua</div>
            <div className="text-lg font-medium">{objetivos?.agua_litros ?? "-"} L</div>
          </div>
        </div>
      </section>

      {/* Alimentos del usuario */}
      <section className="rounded border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Alimentos preferidos</h2>
          <Link href="/account/profile/food" className="text-sm underline">Editar</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {ingredients.map((it) => (
            <div key={it.alimentoId} className="border rounded px-3 py-2 text-sm flex items-center justify-between">
              <span>{it.nombre}</span>
              {it.prioridad != null && <span className="text-muted-foreground">#{it.prioridad}</span>}
            </div>
          ))}
          {ingredients.length === 0 && <div className="text-sm text-muted-foreground">Aún no hay alimentos seleccionados.</div>}
        </div>
      </section>

      {/* Acciones removidas para un overview más limpio. Navega por el sidebar para editar. */}
    </div>
  );
}
