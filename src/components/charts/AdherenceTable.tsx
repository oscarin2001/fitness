"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Point = { date: string; adherence: number };

export default function AdherenceTable({ days = 14 }: { days?: number }) {
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/account/meal-plan/history?days=${days}`, { cache: "no-store" });
        const j = await res.json();
        setData(j.items || []);
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de adherencia</CardTitle>
        <CardDescription>Detalle diario de los últimos {days} días</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin registros</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Adherencia</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.date} className="border-t">
                    <td className="py-2 pr-3">{formatDate(d.date)}</td>
                    <td className="py-2 pr-3">{d.adherence}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(s: string) {
  try {
    // s = YYYY-MM-DD
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString();
  } catch {
    return s;
  }
}
