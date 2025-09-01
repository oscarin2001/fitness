"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Item = { fecha: string; litros: number; objetivo: number | null; completado: boolean };

export default function HydrationChart({ days = 14 }: { days?: number }) {
  const [data, setData] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch(`/api/account/hydration/history?days=${days}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("fetch error");
        const j = await r.json();
        if (mounted) setData(j.items || []);
      })
      .catch(() => setError("No se pudo cargar hidratación"))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [days]);

  const objetivo = data.length ? data[data.length - 1].objetivo : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hidratación (últimos {days} días)</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        {loading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 12, bottom: 20, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="fecha"
                  type="category"
                  allowDuplicatedCategory={false}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  interval="preserveStartEnd"
                  tickFormatter={(v) => String(v).slice(5)}
                />
                <YAxis unit="L" tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip formatter={(v: any, n) => (n === "litros" ? `${v} L` : v)} labelFormatter={(l) => `Fecha: ${l}`} />
                {objetivo != null && (
                  <ReferenceLine y={objetivo} stroke="#8884d8" strokeDasharray="4 4" label={{ value: `Objetivo ${objetivo}L`, position: "insideTopRight", fill: "#666", fontSize: 12 }} />
                )}
                <Bar dataKey="litros">
                  {data.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.completado ? "#22c55e" : "#f97316"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
