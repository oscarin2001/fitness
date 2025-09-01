"use client";

import React from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  children?: React.ReactNode; // extra fields like password input
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({ open, title, description, confirmText = "Confirmar", cancelText = "Cancelar", children, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-md border bg-white p-4 shadow-lg">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {children}
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={onCancel} className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm">{cancelText}</button>
            <button onClick={onConfirm} className="inline-flex items-center rounded-md border border-red-600 text-red-700 px-3 py-1.5 text-sm hover:bg-red-600 hover:text-white">{confirmText}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
