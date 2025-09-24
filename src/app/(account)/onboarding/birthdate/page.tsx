"use client";

import { useRouter } from "next/navigation";
import { Calendar } from "@/components/ui/calendar";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { es } from "date-fns/locale"; // Importa la localización en español
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import { ChevronUp, ChevronDown } from "lucide-react";

export default function OnboardingBirthdatePage() {
  const router = useRouter();
  const [date, setDate] = useState<Date | undefined>();
  const [monthView, setMonthView] = useState<Date>(new Date(2000, 0, 1)); // mes mostrado en el calendario
  const currentYear = new Date().getFullYear();
  const MIN_YEAR = 1950;
  const [yearText, setYearText] = useState(String(monthView.getFullYear()));

  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const holdFnRef = useRef<(() => void) | null>(null);

  function startHold(fn: () => void) {
    // Only schedule repeated executions; the initial increment is handled by onClick / touchStart
    if (holdIntervalRef.current) stopHold();
    holdFnRef.current = fn;
    holdStartRef.current = Date.now();
    holdIntervalRef.current = setTimeout(stepHold, 420); // first repeat after 420ms
  }
  function stepHold() {
    holdFnRef.current?.();
    if (!holdStartRef.current) return;
    const elapsed = Date.now() - holdStartRef.current;
    let delay = 250;
    if (elapsed > 1500) delay = 40; else if (elapsed > 800) delay = 100;
    holdIntervalRef.current = setTimeout(stepHold, delay);
  }
  function stopHold() {
    if (holdIntervalRef.current) clearTimeout(holdIntervalRef.current);
    holdIntervalRef.current = null;
    holdStartRef.current = null;
    holdFnRef.current = null;
  }

  function updateMonthYear({ m, y }: { m?: number; y?: number }) {
    setMonthView((prev) => {
      const month = typeof m === 'number' ? m : prev.getMonth();
      const year = typeof y === 'number' ? y : prev.getFullYear();
      const clampedYear = Math.min(Math.max(year, MIN_YEAR), currentYear);
      return new Date(clampedYear, month, 1);
    });
    // sync texto
    if (typeof y === 'number') {
      const clampedYear = Math.min(Math.max(y, MIN_YEAR), currentYear);
      setYearText(String(clampedYear));
    }
    // Mantener día seleccionado si existe
    setDate((prev) => {
      if (!prev) return prev;
      const month = typeof m === 'number' ? m : monthView.getMonth();
      const year = typeof y === 'number' ? y : monthView.getFullYear();
      const clampedYear = Math.min(Math.max(year, MIN_YEAR), currentYear);
      const lastDay = new Date(clampedYear, month + 1, 0).getDate();
      const day = Math.min(prev.getDate(), lastDay);
      return new Date(clampedYear, month, day);
    });
  }

  function incYear(delta: number) {
    const target = parseInt(yearText || String(monthView.getFullYear()), 10) + delta;
    if (!isNaN(target)) updateMonthYear({ y: target });
  }
  function incMonth(delta: number) {
    let m = monthView.getMonth() + delta;
    let y = monthView.getFullYear();
    while (m < 0) { m += 12; y--; }
    while (m > 11) { m -= 12; y++; }
    updateMonthYear({ m, y });
  }

  const fullMonths = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const disableMonthUp = monthView.getFullYear() === currentYear && monthView.getMonth() === 11;
  const disableMonthDown = monthView.getFullYear() === MIN_YEAR && monthView.getMonth() === 0;

  async function onNext(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    if (!date) {
      toast.error("Selecciona tu fecha de nacimiento");
      return;
    }
    // Validaciones cliente: no futuro y >= 16 años
    const now = new Date();
    if (date > now) {
      toast.error("La fecha no puede ser futura");
      return;
    }
    const age = Math.floor((now.getTime() - date.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age < 16) {
      toast.error("Debes tener al menos 16 años");
      return;
    }
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha_nacimiento: date.toISOString(), onboarding_step: "birthdate" }),
      });
      if (!res.ok) throw new Error();
      router.push("/onboarding/activity");
    } catch {
      toast.error("No se pudo guardar");
    }
  }

  return (
    <OnboardingLayout>
        <OnboardingHeader title="Fecha de nacimiento" subtitle="Tu edad nos ayuda a personalizar tu plan y recomendaciones. Selecciona tu fecha de nacimiento." />
        <OnboardingCard>
          <div className="flex flex-col items-center w-full">
            <div className="flex w-full max-w-xs gap-2 mb-1">
              {/* Month arrow control */}
              <div className="flex-1 select-none text-sm">
                <div className="border rounded px-2 py-2 flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{fullMonths[monthView.getMonth()]}</span>
                  <div className="flex flex-col -my-1">
                    <button
                      type="button"
                      aria-label="Mes siguiente"
                      className="p-0.5 hover:text-primary disabled:opacity-30"
                      onClick={() => !disableMonthUp && incMonth(1)}
                      onMouseDown={() => !disableMonthUp && startHold(() => incMonth(1))}
                      onMouseUp={stopHold}
                      onMouseLeave={stopHold}
                      onTouchStart={() => !disableMonthUp && startHold(() => incMonth(1))}
                      onTouchEnd={stopHold}
                      onTouchCancel={stopHold}
                      disabled={disableMonthUp}
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Mes anterior"
                      className="p-0.5 hover:text-primary disabled:opacity-30"
                      onClick={() => !disableMonthDown && incMonth(-1)}
                      onMouseDown={() => !disableMonthDown && startHold(() => incMonth(-1))}
                      onMouseUp={stopHold}
                      onMouseLeave={stopHold}
                      onTouchStart={() => !disableMonthDown && startHold(() => incMonth(-1))}
                      onTouchEnd={stopHold}
                      onTouchCancel={stopHold}
                      disabled={disableMonthDown}
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
              {/* Year selector */}
              <div className="w-24 text-sm">
                <div className="border rounded px-2 py-2 flex items-center justify-between gap-2">
                  <input
                    aria-label="Año"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    className="w-14 bg-transparent focus:outline-none text-center font-medium"
                    value={yearText}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0,4);
                      setYearText(digits);
                      if (digits.length === 4) {
                        const yNum = parseInt(digits,10);
                        if (!isNaN(yNum)) updateMonthYear({ y: yNum });
                      }
                    }}
                    onBlur={() => {
                      if (yearText.length === 4) {
                        let yNum = parseInt(yearText,10);
                        if (isNaN(yNum)) { setYearText(String(monthView.getFullYear())); return; }
                        if (yNum < MIN_YEAR) yNum = MIN_YEAR;
                        if (yNum > currentYear) yNum = currentYear;
                        updateMonthYear({ y: yNum });
                        setYearText(String(yNum));
                      } else {
                        setYearText(String(monthView.getFullYear()));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <div className="flex flex-col -my-1 select-none">
                    <button
                      type="button"
                      aria-label="Aumentar año"
                      className="p-0.5 hover:text-primary disabled:opacity-30"
                      onClick={() => parseInt(yearText || String(monthView.getFullYear()),10) < currentYear && incYear(1)}
                      onMouseDown={() => { const y=parseInt(yearText||String(monthView.getFullYear()),10); if (y < currentYear) startHold(() => incYear(1)); }}
                      onMouseUp={stopHold}
                      onMouseLeave={stopHold}
                      onTouchStart={() => { const y=parseInt(yearText||String(monthView.getFullYear()),10); if (y < currentYear) { incYear(1); startHold(() => incYear(1)); } }}
                      onTouchEnd={stopHold}
                      onTouchCancel={stopHold}
                      disabled={parseInt(yearText||String(monthView.getFullYear()),10) >= currentYear}
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Disminuir año"
                      className="p-0.5 hover:text-primary disabled:opacity-30"
                      onClick={() => parseInt(yearText||String(monthView.getFullYear()),10) > MIN_YEAR && incYear(-1)}
                      onMouseDown={() => { const y=parseInt(yearText||String(monthView.getFullYear()),10); if (y > MIN_YEAR) startHold(() => incYear(-1)); }}
                      onMouseUp={stopHold}
                      onMouseLeave={stopHold}
                      onTouchStart={() => { const y=parseInt(yearText||String(monthView.getFullYear()),10); if (y > MIN_YEAR) { incYear(-1); startHold(() => incYear(-1)); } }}
                      onTouchEnd={stopHold}
                      onTouchCancel={stopHold}
                      disabled={parseInt(yearText||String(monthView.getFullYear()),10) <= MIN_YEAR}
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">Puedes escribir el año directamente o usar las flechas.</p>
            <div className="w-full flex justify-center">
              <div className="w-full max-w-sm min-h-[350px] flex items-start justify-center">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(newDate) => { setDate(newDate); if (newDate) { setMonthView(new Date(newDate.getFullYear(), newDate.getMonth(), 1)); setYearText(String(newDate.getFullYear())); } }}
                  captionLayout="label"
                  month={monthView}
                  onMonthChange={(m) => setMonthView(m)}
                  fromYear={MIN_YEAR}
                  toYear={currentYear}
                  locale={es}
                />
              </div>
            </div>
          </div>
          {date && (
            <div className="text-center text-lg font-medium mt-4">
              Fecha seleccionada: {date.toLocaleDateString("es-ES", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          )}
        </OnboardingCard>
        <OnboardingActions back={{ onClick: () => router.push("/onboarding/metrics") }} next={{ onClick: onNext }} />
    </OnboardingLayout>
  );
}
