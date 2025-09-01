"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import PasswordConfirmDialog from "@/components/PasswordConfirmDialog";

const KEY = "pwdConfirmedAt";
const WINDOW_MS = 10 * 60 * 1000;

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

export function usePasswordGate() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const pendingAction = useRef<null | ((password?: string) => void | Promise<void>)>(null);

  const ensureConfirmed = useCallback((action: (password?: string) => void | Promise<void>) => {
    if (isUnlockedNow()) {
      void action();
      return;
    }
    pendingAction.current = action;
    setOpen(true);
  }, []);

  const onConfirmed = useCallback(async ({ currentPassword }: { currentPassword: string }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/auth/confirm-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: currentPassword }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "No se pudo confirmar");
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch {}
      const act = pendingAction.current;
      pendingAction.current = null;
      if (act) await act(currentPassword);
    } finally {
      setLoading(false);
    }
  }, []);

  const dialog = useMemo(() => (
    <PasswordConfirmDialog
      open={open}
      onOpenChange={(v) => { setOpen(v); if (!v) pendingAction.current = null; }}
      mode="confirm"
      onConfirmed={onConfirmed as any}
    />
  ), [open, onConfirmed]);

  return { ensureConfirmed, dialog, confirming: open, loading } as const;
}
