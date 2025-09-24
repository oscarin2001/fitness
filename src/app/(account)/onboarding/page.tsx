"use client";

import { useRouter } from "next/navigation";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { toast } from "sonner";
import { CheckCircle, Sparkles, ChartLine } from "lucide-react";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";

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

  function goNext() {
    router.push("/onboarding/sex");
  }

  return (
    <OnboardingLayout>
      <OnboardingHeader title="Bienvenido a FitBalance" />
      <OnboardingCard>
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
      </OnboardingCard>
      <OnboardingActions back={null} next={{ onClick: goNext, label: "Comenzar" }} />
    </OnboardingLayout>
  );
}
