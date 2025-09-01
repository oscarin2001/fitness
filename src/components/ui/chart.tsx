"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<string, { label: string; color: string }>;

export function ChartContainer({
  children,
  config,
  className,
}: React.PropsWithChildren<{ config: ChartConfig; className?: string }>) {
  // Expone variables CSS de color según las claves del config
  const style = React.useMemo(() => {
    const s: React.CSSProperties = {};
    Object.entries(config).forEach(([key, cfg]) => {
      (s as any)[`--color-${key}`] = cfg.color;
    });
    return s;
  }, [config]);

  return (
    <div className={cn("w-full", className)} style={style as React.CSSProperties}>
      {children}
    </div>
  );
}

export function ChartTooltip(props: any) {
  // Simple passthrough para mantener API similar a ejemplos
  return <>{props.children}</>;
}

export function ChartTooltipContent({ indicator = "line" }: { indicator?: "line" | "dot" }) {
  return function Content({ active, payload, label }: any) {
    if (!active || !payload || (payload as any[]).length === 0) return null;
    return (
      <div className="rounded border bg-background px-3 py-2 text-xs shadow">
        {label ? <div className="mb-1 font-medium">{String(label)}</div> : null}
        <div className="grid gap-1">
          {(payload as any[]).map((p: any, idx: number) => {
            const color = p.stroke || p.fill || "var(--foreground)";
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-muted-foreground">{p.name}</span>
                <span className="font-medium">{p.value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
}
