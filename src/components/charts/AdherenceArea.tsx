"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

type Point = { date: string; adherence: number };

const chartConfig: ChartConfig = {
  adherence: {
    label: "Adherencia",
    color: "var(--chart-1)",
  },
};

export default function AdherenceArea({ days = 14 }: { days?: number }) {
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
        <CardTitle>Adherencia</CardTitle>
        <CardDescription>Porcentaje de comidas cumplidas por día (últimos {days} días)</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <ChartContainer config={chartConfig}>
            <div className="w-full h-[240px]">
              <ResponsiveContainer>
                <AreaChart data={data} margin={{ left: 12, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(v) => String(v).slice(5)}
                  />
                  <Tooltip content={ChartTooltipContent({ indicator: "line" }) as any} cursor={false} />
                  <Area
                    dataKey="adherence"
                    name="Adherencia"
                    type="natural"
                    fill="var(--color-adherence)"
                    fillOpacity={0.35}
                    stroke="var(--color-adherence)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
