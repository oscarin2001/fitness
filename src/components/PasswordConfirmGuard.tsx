"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Guarda el timestamp del último desbloqueo por 10 minutos
const KEY = "pwdConfirmedAt";
const WINDOW_MS = 10 * 60 * 1000; // 10 min

function isUnlockedNow(): boolean {
  try {
    const v = sessionStorage.getItem(KEY);
    if (!v) return false;
    const ts = Number(v);
    return Number.isFinite(ts) && Date.now() - ts < WINDOW_MS;
  } catch {
    return false;
  }
}

export default function PasswordConfirmGuard({
  children,
  title = "Confirmación requerida",
  description = "Para realizar cambios en esta sección, confirma tu contraseña.",
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUnlocked(isUnlockedNow());
  }, []);

  async function confirm() {
    try {
      setLoading(true);
      setError(null);
      if (!password) {
        setError("Ingresa tu contraseña");
        return;
      }
      const res = await fetch("/api/account/auth/confirm-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "No se pudo confirmar");
      try {
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {}
      setUnlocked(true);
      setPassword("");
    } catch (e: any) {
      setError(e?.message || "Error al confirmar");
    } finally {
      setLoading(false);
    }
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="rounded border p-4 bg-muted/30">
      <div className="text-sm font-medium mb-1">{title}</div>
      <div className="text-xs text-muted-foreground mb-3">{description}</div>
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
        <label className="flex flex-col gap-1 w-full sm:w-auto">
          <span className="text-xs">Contraseña</span>
          <input
            type="password"
            className="border rounded px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña"
          />
        </label>
        <Button onClick={confirm} disabled={loading}>{loading ? "Verificando…" : "Confirmar"}</Button>
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      <div className="mt-2 text-[11px] text-muted-foreground">Este desbloqueo se mantendrá por 10 minutos en este dispositivo.</div>
    </div>
  );
}
