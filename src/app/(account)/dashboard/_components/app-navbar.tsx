"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { CheckCircle2, CircleDashed, Gauge, Home, UtensilsCrossed, LogOut, User, RotateCcw, Menu, Activity } from "lucide-react";
import { useRouter } from "next/navigation";

type Summary = {
  objetivos: { kcal: number | null; proteinas: number | null; grasas: number | null; carbohidratos: number | null; agua_litros: number | null };
};

export default function AppNavbar() {
  const [hasPlan, setHasPlan] = useState(false);
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const res = await fetch("/api/account/dashboard/summary", { cache: "no-store" });
        if (!res.ok) return;
        const json: Summary = await res.json();
        if (abort) return;
        const anyObjective = [json.objetivos.kcal, json.objetivos.proteinas, json.objetivos.grasas, json.objetivos.carbohidratos]
          .some(v => typeof v === "number" && !Number.isNaN(v));
        setHasPlan(anyObjective);
      } catch {}
    })();
    return () => { abort = true; };
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function retryOnboardingSave() {
    setActionLoading("retry");
    try {
      const adviceRes = await fetch("/api/account/advice", { method: "POST", cache: "no-store", credentials: "include" });
      const adviceJson = await adviceRes.json();
      if (!adviceRes.ok) {
        throw new Error(adviceJson?.error || "Error al generar consejo");
      }

      const items = Array.isArray(adviceJson?.meals?.items) ? adviceJson.meals.items : [];
      const litros = Number(adviceJson?.hydration?.litros);

      if (items.length) {
        const savePlan = await fetch("/api/account/onboarding/initial-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
          credentials: "include",
          cache: "no-store",
        });
        if (!savePlan.ok) throw new Error("No se pudo guardar el plan inicial");
      }

      if (litros > 0) {
        const saveHyd = await fetch("/api/account/hydration/goal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ litros }),
          credentials: "include",
          cache: "no-store",
        });
        if (!saveHyd.ok) throw new Error("No se pudo guardar la hidratación");
      }

      router.push("/dashboard/plan");
    } catch (e) {
      // opcional: mostrar toast si hay sistema de toasts
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4 relative w-full">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-lg shrink-0">
          <Gauge className="h-5 w-5" />
          <span>FitBalance</span>
        </Link>

        {/* Botón móvil */}
        <button
          className="md:hidden ml-1 inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm"
          aria-label="Abrir menú"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Navigation desktop */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink asChild className="px-3 py-2 flex items-center gap-2">
                <Link href="/dashboard">
                  <Home className="h-4 w-4" /> Dashboard
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild className="px-3 py-2 flex items-center gap-2">
                <Link href="/dashboard/plan">
                  <UtensilsCrossed className="h-4 w-4" /> Plan
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild className="px-3 py-2 flex items-center gap-2">
                <Link href="/dashboard/progress">
                  <Activity className="h-4 w-4" /> Progreso
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild className="px-3 py-2 flex items-center gap-2">
                <Link href="/dashboard/insights">
                  <Gauge className="h-4 w-4" /> Insights
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild className="px-3 py-2 flex items-center gap-2">
                <Link href="/dashboard/checklist">
                  <CheckCircle2 className="h-4 w-4" /> Checklist
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Progress (oculto en móvil) */}
        <div className="hidden md:flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            {hasPlan ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleDashed className="h-4 w-4" />}
            <span>Plan</span>
          </div>
        </div>

        {/* Right actions - user menu */}
        <div className="relative shrink-0">
          {mounted && (
            <details className="group">
              <summary className="list-none cursor-pointer">
                <div className="ml-3 size-8 rounded-full bg-foreground/90 text-background grid place-items-center text-xs">
                  N
                </div>
              </summary>
              <div className="absolute right-0 mt-2 w-48 rounded-md border bg-popover p-1 shadow-md">
                <button
                  onClick={() => router.push("/account")}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded hover:bg-accent"
                >
                  <User className="h-4 w-4" /> Perfil
                </button>
                <button
                  onClick={retryOnboardingSave}
                  disabled={actionLoading === "retry"}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded hover:bg-accent"
                >
                  <RotateCcw className="h-4 w-4" /> {actionLoading === "retry" ? "Reintentando…" : "Reintentar"}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                    } catch {}
                    router.push("/auth/login");
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded hover:bg-accent text-red-600"
                >
                  <LogOut className="h-4 w-4" /> Cerrar sesión
                </button>
              </div>
            </details>
          )}
        </div>

        {/* Mobile panel */}
        {mobileOpen && (
          <div className="absolute left-0 right-0 top-full mt-2 rounded-md border bg-popover p-2 shadow-md md:hidden">
            <nav className="flex flex-col">
              <Link className="px-3 py-2 rounded hover:bg-accent" href="/dashboard" onClick={() => setMobileOpen(false)}><span className="inline-flex items-center gap-2"><Home className="h-4 w-4" /> Dashboard</span></Link>
              <Link className="px-3 py-2 rounded hover:bg-accent" href="/dashboard/plan" onClick={() => setMobileOpen(false)}><span className="inline-flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> Plan</span></Link>
              <Link className="px-3 py-2 rounded hover:bg-accent" href="/dashboard/progress" onClick={() => setMobileOpen(false)}><span className="inline-flex items-center gap-2"><Activity className="h-4 w-4" /> Progreso</span></Link>
              <Link className="px-3 py-2 rounded hover:bg-accent" href="/dashboard/insights" onClick={() => setMobileOpen(false)}><span className="inline-flex items-center gap-2"><Gauge className="h-4 w-4" /> Insights</span></Link>
              <Link className="px-3 py-2 rounded hover:bg-accent" href="/dashboard/checklist" onClick={() => setMobileOpen(false)}><span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Checklist</span></Link>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
