"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";

export default function ProfileHydrationPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Hidratación</h1>
        <p className="text-sm text-muted-foreground">Objetivo diario de agua establecido por la IA.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Meta diaria</CardTitle>
          <CardDescription>Este objetivo se calcula automáticamente y no requiere ajustes manuales.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              El objetivo de hidratación es calculado por nuestro modelo de IA en función de tus datos y objetivos. Esta meta es fija en esta sección para mantener la coherencia del plan.
            </p>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <strong>Recomendación de seguridad:</strong> no es posible aumentar manualmente el consumo objetivo de agua desde aquí. Consumir agua en exceso puede ser perjudicial para la salud. Sigue la meta indicada por la IA y registra tu consumo desde el Dashboard.
            </div>
            <p>
              Para registrar tu consumo de agua diario, ve al <Link className="underline" href="/dashboard">Dashboard</Link>. Cuando alcances tu objetivo, verás un mensaje de felicitación y no podrás seguir aumentando el contador por seguridad.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
