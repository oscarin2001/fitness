"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type PasswordDialogMode = "confirm" | "change";

export default function PasswordConfirmDialog({
  open,
  onOpenChange,
  mode = "confirm",
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode?: PasswordDialogMode;
  onConfirmed: (payload: { currentPassword: string; newPassword?: string }) => Promise<void> | void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setNewPassword2("");
    setError(null);
  }

  async function handleConfirm() {
    try {
      setLoading(true);
      setError(null);
      if (!currentPassword) {
        setError("Ingresa tu contraseña actual");
        return;
      }
      if (mode === "change") {
        if (!newPassword || !newPassword2) {
          setError("Ingresa y confirma la nueva contraseña");
          return;
        }
        if (newPassword !== newPassword2) {
          setError("Las contraseñas no coinciden");
          return;
        }
        if (newPassword.length < 8) {
          setError("La nueva contraseña debe tener al menos 8 caracteres");
          return;
        }
      }
      await onConfirmed({ currentPassword, newPassword: mode === "change" ? newPassword : undefined });
      onOpenChange(false);
      reset();
    } catch (e: any) {
      setError(e?.message || "No se pudo confirmar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "change" ? "Cambiar contraseña" : "Confirmar acción"}</DialogTitle>
          <DialogDescription>
            {mode === "change"
              ? "Introduce tu contraseña actual y la nueva contraseña para completar el cambio."
              : "Para continuar, confirma tu contraseña."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs">Contraseña actual</span>
            <input type="password" className="border rounded px-3 py-2" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>

          {mode === "change" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs">Nueva contraseña</span>
                <input type="password" className="border rounded px-3 py-2" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs">Confirmar nueva contraseña</span>
                <input type="password" className="border rounded px-3 py-2" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} />
              </label>
            </>
          )}

          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => { onOpenChange(false); reset(); }} disabled={loading}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={loading}>{loading ? "Procesando…" : (mode === "change" ? "Cambiar" : "Confirmar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
