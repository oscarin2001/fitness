"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";

function labelForTipo(t: string) {
  const s = String(t);
  if (/^Snack_manana$/.test(s)) return "Snack mañana";
  if (/^Snack_tarde$/.test(s)) return "Snack tarde";
  return s;
}

export type WeeklyDay = {
  day: string;
  active?: boolean;
  objectiveLabel?: string | null;
  meals?: Array<{
    tipo: string;
    receta?: { nombre?: string | null } | null;
    targetProteinG?: number | null;
    itemsText?: string[] | null;
  }>;
};

type BeverageItem = { nombre: string; ml: number; momento?: string | null };

export default function WeeklyPlanByDay({ weekly, className, schedule, beverages }: { weekly: WeeklyDay[]; className?: string; schedule?: Record<string, string> | null; beverages?: BeverageItem[] | null }) {
  const days = useMemo(() => (Array.isArray(weekly) ? weekly : []), [weekly]);
  const [sel, setSel] = useState(() => Math.max(0, days.findIndex((d) => d?.active)));
  const [showPortions] = useState(false); // eliminado features de botones

  // Restaurar selección del día desde localStorage
  useEffect(() => {
    try {
      const v = localStorage.getItem("weekly_sel_day");
      if (v != null) {
        const i = Math.max(0, Math.min(days.length - 1, parseInt(v, 10)));
        if (!Number.isNaN(i)) setSel(i);
      }
    } catch {}
  }, [days.length]);

  // Se elimina persistencia de porciones y botones de copia

  if (!days.length) return <div className="text-sm text-muted-foreground">No hay plan semanal para mostrar.</div>;

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2 mb-3">
        {days.map((d, i) => (
          <button
            key={d.day + i}
            type="button"
            onClick={() => {
              setSel(i);
              try { localStorage.setItem("weekly_sel_day", String(i)); } catch {}
            }}
            className={`px-3 py-1 rounded-md text-sm border transition ${i === sel ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent border-muted'} `}
          >
            {d.day}
          </button>
        ))}
      </div>
      <Card className="mt-3 p-3">
        {(() => {
          const d = days[sel];
          if (!d) return <div className="text-sm text-muted-foreground">Sin datos</div>;
          const isFree = !d.active || !Array.isArray(d.meals) || d.meals.length === 0;
          return (
            <div>
              <div className="font-medium mb-2">
                {d.day}
                {/* label de objetivo oculto aquí para evitar redundancia */}
                {isFree ? <span className="text-muted-foreground font-normal"> — libre</span> : null}
              </div>
              {/* Botones de copia eliminados */}
              {isFree ? (
                <div className="text-sm text-muted-foreground">Día libre (sin plan de comidas)</div>
              ) : (
                <div className="space-y-4 text-sm">
                  {d.meals!.map((m, i) => {
                    const key = String(m.tipo);
                    const t = schedule && typeof schedule === 'object' ? (schedule[key] || (key === 'Snack_manana' ? schedule['Snack'] : (key === 'Snack_tarde' ? schedule['Snack'] : schedule[key]))) : null;
                    // Filtrar bebidas que correspondan a este momento (Desayuno, Almuerzo, Cena, Snack)
                    const normTipo = ((): string => {
                      const s = key.toLowerCase();
                      if (s.startsWith('desayuno')) return 'desayuno';
                      if (/almuerzo|comida|lunch/.test(s)) return 'almuerzo';
                      if (s.startsWith('cena') || /dinner/.test(s)) return 'cena';
                      if (s.startsWith('snack')) return 'snack';
                      return s;
                    })();
                    const bevList = Array.isArray(beverages)
                      ? beverages.filter(b => {
                          const mom = (b.momento || '').toString().toLowerCase();
                          if (!mom) return false;
                          if (mom === 'general') return false; // se mostrará al final
                          // Igualar cualquier snack variant
                          if (mom === 'snack' && normTipo === 'snack') return true;
                          return mom === normTipo;
                        })
                      : [];
                    return (
                      <div key={i} className="grid grid-cols-[9rem_1fr] gap-2 items-start">
                        <div className="text-muted-foreground leading-snug pr-2">
                          {labelForTipo(m.tipo)}{t ? <span className="ml-1 text-xs">({t})</span> : null}:
                        </div>
                        <div className="min-w-0 leading-snug">
                          <div className="flex flex-wrap items-baseline gap-1">
                            <span
                              className="font-medium inline-block align-baseline break-words whitespace-normal"
                              title={m.receta?.nombre ?? '—'}
                            >
                              {m.receta?.nombre ?? '—'}
                            </span>
                            {m.targetProteinG ? <span className="text-muted-foreground shrink-0">• {m.targetProteinG} g proteína</span> : null}
                          </div>
                          {Array.isArray(m.itemsText) && m.itemsText.length > 0 && (
                            <ul className="mt-1 list-disc pl-5 space-y-0.5 text-muted-foreground">
                              {m.itemsText.map((tItem, j) => (
                                <li key={j}>{tItem}</li>
                              ))}
                            </ul>
                          )}
                          {bevList.length > 0 && (
                            <ul className="mt-1 list-disc pl-5 space-y-0.5 text-muted-foreground">
                              {bevList.map((b, bi) => (
                                <li key={bi}>{b.nombre} ({b.ml} ml)</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {Array.isArray(beverages) && beverages.some(b => (b.momento || '').toLowerCase() === 'general') && (
                    <div className="pt-3 border-t mt-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Bebidas generales</div>
                      <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground text-sm">
                        {beverages.filter(b => (b.momento || '').toLowerCase() === 'general').map((b,i) => (
                          <li key={i}>{b.nombre} ({b.ml} ml)</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </Card>
      {/* Bloque de porciones eliminado */}
    </div>
  );
}

// Función de agregado eliminada junto con botones relacionados
