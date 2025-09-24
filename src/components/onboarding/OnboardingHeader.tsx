"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface OnboardingHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}

export function OnboardingHeader({ title, subtitle, className }: OnboardingHeaderProps) {
  return (
    <header className={cn("text-center space-y-1", className)}>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}

export default OnboardingHeader;
