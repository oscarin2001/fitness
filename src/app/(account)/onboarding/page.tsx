"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle, Sparkles, ChartLine } from "lucide-react";

const slides = [
  {
    icon: Sparkles,
    title: "👉 ¿Sabías que nuestra app se adapta a tu rutina de ejercicios?",
    description:
      "Integramos tu nutrición con tu nivel de actividad física para que cada comida te ayude a rendir mejor.",
  },
  {
    icon: CheckCircle,
    title: "👉 Completa tus datos y deja que la IA te guíe.",
    description:
      "Llena tus formularios con hábitos y objetivos, y recibe un plan alimenticio personalizado casi al instante.",
  },
  {
    icon: ChartLine,
    title: "👉 Mide tu progreso y alcanza tus metas.",
    description:
      "Sigue la evolución de tu peso, masa muscular y energía con reportes y gráficos fáciles de entender.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/onboarding/status");
        if (res.status === 401) {
          if (!cancelled) router.replace("/auth/login");
          return;
        }
        if (!res.ok) return;
        const { step } = await res.json();
        if (!cancelled && step && step !== "sex") {
          router.replace(`/onboarding/${step}`);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [router]);

  function goNext() {
    router.push("/onboarding/sex");
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-semibold text-center mb-6">Bienvenido a FitBalance</h1>
        <div className="relative">
          <Carousel className="w-full">
            <CarouselPrevious />
            <CarouselContent>
              {slides.map(({ icon: Icon, title, description }, i) => (
                <CarouselItem key={i}>
                  <div className="rounded-xl border p-6 md:p-10 bg-white/60 dark:bg-neutral-900/60">
                    <div className="flex flex-col items-center text-center gap-4">
                      <div className="rounded-full bg-primary/10 p-4 text-primary">
                        <Icon size={36} />
                      </div>
                      <h2 className="text-xl font-medium leading-snug">{title}</h2>
                      <p className="text-muted-foreground max-w-prose">{description}</p>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselNext />
          </Carousel>
        </div>
        <div className="mt-8 grid gap-3">
          <Button className="w-full" onClick={goNext}>
            Comenzar
          </Button>
        </div>
      </div>
    </div>
  );
}
