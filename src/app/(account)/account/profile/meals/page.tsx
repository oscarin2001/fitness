"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { usePasswordGate } from "@/components/usePasswordGate";

type MealTipo = "Desayuno" | "Almuerzo" | "Cena" | "Snack";
const ORDER: MealTipo[] = ["Desayuno", "Almuerzo", "Cena", "Snack"];

export default function ProfileMealsPage() {
  const [hours, setHours] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<boolean>(false);
  const { ensureConfirmed, dialog: pwdDialog } = usePasswordGate();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account/meal-plan/schedule", { cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          if (j?.schedule && typeof j.schedule === "object") setHours(j.schedule);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function save(tipo: MealTipo, hora: string) {
    try {
      const res = await fetch("/api/account/meal-plan/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, hora }),
      });
      if (!res.ok) throw new Error();
    } catch {
      throw new Error("save_failed");
    }
  }

  async function saveAll() {
    setSaving(true);
    try {
      for (const tipo of ORDER) {
        const hora = hours[tipo];
        if (hora && /^\d{2}:\d{2}$/.test(hora)) {
          await save(tipo, hora);
        }
      }
      toast.success("Horarios guardados");
    } catch {
      toast.error("No se pudieron guardar los horarios");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Plan de comidas</h1>
        <p className="text-sm text-muted-foreground">Definido automáticamente por la IA • Configura tus horarios</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Horarios diarios</CardTitle>
          <CardDescription>Ajusta el horario de cada comida según tu rutina.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5 text-sm">
            <p className="text-muted-foreground">
              Tu planificación diaria de comidas es generada por nuestro modelo de IA. Puedes ajustar aquí los <strong>horarios</strong> a tu preferencia; estos permanecerán fijos hasta que los cambies.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ORDER.map((tipo) => (
                <div key={tipo} className="space-y-1">
                  <Label htmlFor={`h-${tipo}`}>{tipo}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`h-${tipo}`}
                      type="time"
                      value={hours[tipo] || ""}
                      onChange={(e) => setHours((prev) => ({ ...prev, [tipo]: e.target.value }))}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading || !/^\d{2}:\d{2}$/.test(hours[tipo] || "")}
                      onClick={() => ensureConfirmed(async () => {
                        try {
                          await save(tipo, hours[tipo]!);
                          toast.success(`${tipo}: guardado`);
                        } catch {
                          toast.error(`${tipo}: error al guardar`);
                        }
                      })}
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={() => ensureConfirmed(saveAll)} disabled={saving || loading}>{saving ? "Guardando…" : "Guardar todos"}</Button>
              <span className="text-xs text-muted-foreground">Puedes ver el plan en <Link href="/dashboard/plan" className="underline">Plan</Link> o registrar comidas en el <Link href="/dashboard" className="underline">Dashboard</Link>.</span>
            </div>
          </div>
          <Toaster richColors />
          {pwdDialog}
        </CardContent>
      </Card>
    </div>
  );
}
