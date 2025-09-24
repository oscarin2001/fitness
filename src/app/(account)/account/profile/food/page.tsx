"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ProfileFoodPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Preferencias alimentarias</h1>
        <p className="text-sm text-muted-foreground">Dieta, alergias e intolerancias, alimentos preferidos y a evitar.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Configuración de alimentos</CardTitle>
          <CardDescription>Próximamente podrás personalizar aquí tus preferencias alimentarias.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* TODO: CRUD de UsuarioAlimento y selección de dieta/alergias */}
          <div className="text-sm text-muted-foreground">Configuración pendiente. Aquí podrás definir tu dieta (veg, keto, etc.), alergias e intolerancias, y tus alimentos favoritos o a evitar.</div>
        </CardContent>
      </Card>
    </div>
  );
}
