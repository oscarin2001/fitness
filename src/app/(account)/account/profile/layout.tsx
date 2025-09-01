"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";
import { Card, CardContent } from "@/components/ui/card";

const NAV = [
  { href: "/account/profile", label: "Resumen" },
  { href: "/account/profile/personal", label: "Datos personales" },
  { href: "/account/profile/food", label: "Preferencias alimentarias" },
  { href: "/account/profile/meals", label: "Comidas seleccionadas" },
  { href: "/account/profile/hydration", label: "Hidratación" },
  { href: "/account/progress", label: "Progreso corporal" },
  { href: "/account/profile/objectives", label: "Objetivos" },
];

export default function ProfileLayout({ children }: PropsWithChildren) {
  const pathname = usePathname();
  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
      <Card className="md:col-span-1">
        <CardContent className="p-0">
          <nav className="flex md:flex-col overflow-auto">
            {NAV.map((i) => {
              const active = pathname === i.href;
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`px-4 py-3 text-sm border-b md:border-b-0 md:border-b-transparent md:border-r ${active ? "bg-muted font-medium" : "hover:bg-muted/50"}`}
                >
                  {i.label}
                </Link>
              );
            })}
            <div className="px-4 py-3 text-xs text-muted-foreground border-t md:border-t-0 md:mt-auto">
              <Link href="/account/settings" className="underline">Ajustes de la cuenta</Link>
            </div>
          </nav>
        </CardContent>
      </Card>
      <div className="md:col-span-3">
        {children}
      </div>
    </div>
  );
}
