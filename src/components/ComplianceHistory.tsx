"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function ComplianceHistory() {
  const [items, setItems] = useState<Array<{ id: number; comida_tipo: string; cumplido: boolean; hora_real?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/account/meal-plan/compliance?date=${todayStr}`, { cache: "no-store" });
        const j = await res.json();
        setItems(j.items || []);
      } catch {
        setError("No se pudo cargar el historial");
      } finally {
        setLoading(false);
      }
    })();
  }, [todayStr]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adherencia de hoy</CardTitle>
        <CardDescription>Estado por fecha y hora real</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin registros</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3">Comida</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Hora</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const dt = r.hora_real ? new Date(r.hora_real) : null;
                const hh = dt ? String(dt.getHours()).padStart(2, "0") : "—";
                const mm = dt ? String(dt.getMinutes()).padStart(2, "0") : "";
                return (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 pr-3">{r.comida_tipo}</td>
                    <td className="py-2 pr-3">{r.cumplido ? "Cumplido" : "Pendiente"}</td>
                    <td className="py-2 pr-3">{dt ? `${hh}:${mm}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
