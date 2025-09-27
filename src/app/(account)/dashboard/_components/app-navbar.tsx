"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { CheckCircle2, CircleDashed, Gauge, Home, UtensilsCrossed, LogOut, User, Menu, Activity, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Summary = {
  objetivos: { kcal: number | null; proteinas: number | null; grasas: number | null; carbohidratos: number | null; agua_litros: number | null };
};

export default function AppNavbar() {
  const [hasPlan, setHasPlan] = useState(false);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarText, setAvatarText] = useState<string>("N");
  const [logoutOpen, setLogoutOpen] = useState(false);

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

  // Cargar iniciales de nombre/apellido/email para el avatar
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const r = await fetch("/api/account/profile", { cache: "no-store", credentials: "include" });
        if (!r.ok) return;
        const j = await r.json();
        if (abort) return;
        const nombre: string = j?.user?.nombre || "";
        const apellido: string = j?.user?.apellido || "";
        const email: string = j?.user?.email || "";
        const n = nombre.trim();
        const a = apellido.trim();
        let initials = "N";
        if (n || a) {
          const first = n ? n.split(/\s+/)[0] : "";
          const lastToken = a ? a.split(/\s+/).slice(-1)[0] : (n ? n.split(/\s+/).slice(-1)[0] : "");
          initials = ((first[0] || "") + (lastToken[0] || "")).toUpperCase() || "N";
        } else if (email) {
          initials = email[0].toUpperCase();
        }
        setAvatarText(initials);
      } catch {}
    })();
    return () => { abort = true; };
  }, []);

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
                  <Activity className="h-4 w-4" />
                  <span className="inline-flex items-center gap-1">Progreso <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700 border border-amber-200">Beta</span></span>
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <a
                href="/dashboard/checklist"
                className="px-3 py-2 flex items-center gap-2 cursor-pointer"
                onClick={(e) => { e.preventDefault(); toast.info("La sección Checklist está en mantenimiento (beta)"); }}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span className="inline-flex items-center gap-1">Checklist <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700 border border-amber-200">Beta</span></span>
              </a>
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
                  {avatarText}
                </div>
              </summary>
              <div className="absolute right-0 mt-2 w-52 rounded-md border bg-popover p-1 shadow-md">
                <button
                  onClick={() => router.push("/account/profile/personal")}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded hover:bg-accent"
                >
                  <User className="h-4 w-4" /> Perfil
                </button>
                <button
                  onClick={() => router.push("/account/settings")}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded hover:bg-accent"
                >
                  <Settings className="h-4 w-4" /> Configuraciones
                </button>
                <button
                  onClick={() => setLogoutOpen(true)}
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
              <Link className="px-3 py-2 rounded hover:bg-accent" href="/dashboard/progress" onClick={() => setMobileOpen(false)}><span className="inline-flex items-center gap-2"><Activity className="h-4 w-4" /> Progreso <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700 border border-amber-200">Beta</span></span></Link>
              <a className="px-3 py-2 rounded hover:bg-accent cursor-pointer" href="/dashboard/checklist" onClick={(e) => { e.preventDefault(); setMobileOpen(false); toast.info("La sección Checklist está en mantenimiento (beta)"); }}><span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Checklist <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700 border border-amber-200">Beta</span></span></a>
            </nav>
          </div>
        )}

      {/* Modal de cierre de sesión */}
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="p-4 max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">¿Cerrar sesión?</DialogTitle>
            <DialogDescription className="text-xs">Se cerrará tu sesión actual. Podrás iniciar sesión nuevamente cuando quieras.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button size="sm" variant="outline" onClick={() => setLogoutOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                try {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                } catch {}
                setLogoutOpen(false);
                router.push("/auth/login");
              }}
            >
              Cerrar sesión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </div>
  );
}
