"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface OnboardingLayoutProps {
  className?: string;
  children: React.ReactNode;
}

export function OnboardingLayout({ className, children }: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card text-card-foreground rounded-xl border shadow-sm p-6">
          <div className={cn("space-y-6", className)}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingLayout;
