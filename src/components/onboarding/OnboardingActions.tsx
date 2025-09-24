"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface OnboardingActionsProps {
  className?: string;
  back?: { onClick?: () => void; label?: string } | null;
  next?: { onClick?: () => void; label?: string; disabled?: boolean } | null;
  extra?: React.ReactNode;
}

export function OnboardingActions({ className, back = {}, next = {}, extra }: OnboardingActionsProps) {
  return (
    <div
      className={cn(
        // Responsive: columna en móvil, fila en sm+
        "flex flex-col sm:flex-row items-stretch sm:items-center gap-3",
        // Asegura que no se pegue a los bordes y pueda envolver
        "pt-2",
        className
      )}
    >
      {back !== null ? (
        <div className="sm:w-auto">
          <Button type="button" variant="outline" onClick={back.onClick} className="w-full sm:w-auto">
            {back.label ?? "Atrás"}
          </Button>
        </div>
      ) : (
        <div />
      )}
      <div className="sm:ml-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
        {extra ? <div className="w-full sm:w-auto">{extra}</div> : null}
        {next !== null ? (
          <Button type="button" onClick={next.onClick} disabled={next.disabled} className="w-full sm:w-auto">
            {next.label ?? "Continuar"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default OnboardingActions;
