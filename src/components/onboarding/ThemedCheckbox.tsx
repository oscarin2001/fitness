"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface ThemedCheckboxProps
  extends React.ComponentProps<typeof Checkbox> {}

export function ThemedCheckbox({ className, ...props }: ThemedCheckboxProps) {
  // Usa la implementación base, únicamente permite añadir clases si alguna pantalla necesita ajustes menores.
  return <Checkbox className={cn(className)} {...props} />;
}

export default ThemedCheckbox;
