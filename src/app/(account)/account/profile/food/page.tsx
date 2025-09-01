"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ProfileFoodPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferencias alimentarias</CardTitle>
        <CardDescription>Dieta, alergias e intolerancias, alimentos preferidos y a evitar.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* TODO: CRUD de UsuarioAlimento y selección de dieta/alergias */}
        <div className="text-sm text-muted-foreground">Configuración pendiente. Aquí podrás definir tu dieta (veg, keto, etc.), alergias e intolerancias, y tus alimentos favoritos o a evitar.</div>
      </CardContent>
    </Card>
  );
}
