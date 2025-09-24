"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WeeklyPlanRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/onboarding/review");
  }, [router]);
  return (
    <div className="p-6 text-sm text-muted-foreground">
      Redirigiendo al resumen de onboarding…
    </div>
  );
}
