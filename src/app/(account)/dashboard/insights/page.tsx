"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AdherenceArea from "@/components/charts/AdherenceArea";
import AdherenceTable from "@/components/charts/AdherenceTable";
import HydrationChart from "@/components/charts/HydrationChart";
import ComplianceHistory from "@/components/ComplianceHistory";
import Link from "next/link";

export default function InsightsPage() {
  const [days, setDays] = useState<number>(14);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Insights</h1>
          <p className="text-muted-foreground mt-1">Historial y métricas</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Rango:</span>
          <Button variant={days === 7 ? "default" : "outline"} size="sm" onClick={() => setDays(7)}>7 días</Button>
          <Button variant={days === 14 ? "default" : "outline"} size="sm" onClick={() => setDays(14)}>14 días</Button>
          <Button variant={days === 30 ? "default" : "outline"} size="sm" onClick={() => setDays(30)}>30 días</Button>
          <Button asChild variant="outline" size="sm" className="ml-2">
            <Link href="/dashboard">Volver al dashboard</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AdherenceArea days={days} />
        <AdherenceTable days={days} />
        <HydrationChart days={days} />
        <ComplianceHistory />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximos insights</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Tendencias por macro, calorías, rachas de hidratación y adherencia por semana.
        </CardContent>
      </Card>
    </div>
  );
}
