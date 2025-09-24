"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import { ThemedCheckbox as Checkbox } from "@/components/onboarding/ThemedCheckbox";

const DEFAULTS = {
  carbs: [
    "Arroz",
    "Papa",
    "Batata",
    "Yuca",
    "Plátano",
    "Maíz",
    "Avena",
    "Quinoa",
    "Pasta integral",
    "Pan integral",
    "Couscous",
    "Cebada",
    "Bulgur",
    "Ñame",
    "Trigo sarraceno",
    "Garbanzos",
    "Lentejas",
    "Porotos",
    "Arepa",
    "Tortilla de maíz",
  ],
  proteins: [
    "Huevo",
    "Claras de huevo",
    "Pechuga de pollo",
    "Pierna de pollo",
    "Pavo",
    "Carne de res magra",
    "Lomo de cerdo magro",
    "Atún",
    "Salmón",
    "Sardinas",
    "Pescado blanco",
    "Mariscos",
    "Tofu",
    "Tempeh",
    "Seitan",
    "Yogur griego",
    "Queso cottage",
    "Proteína de suero",
    "Lentejas",
    "Garbanzos",
  ],
  fiber: [
    "Lechuga",
    "Espinaca",
    "Kale",
    "Acelga",
    "Brócoli",
    "Coliflor",
    "Zanahoria",
    "Pepino",
    "Tomate",
    "Pimentón",
    "Berenjena",
    "Calabacín",
    "Remolacha",
    "Repollo",
    "Apio",
    "Rúcula",
    "Cebolla",
    "Champiñones",
    "Alcachofa",
    "Espárragos",
  ],
  fats: [
    "Almendras",
    "Nueces",
    "Avellanas",
    "Anacardos",
    "Pistachos",
    "Nuez de Brasil",
    "Maní",
    "Semillas de chía",
    "Semillas de linaza",
    "Semillas de girasol",
    "Semillas de calabaza",
    "Mantequilla de maní",
    "Mantequilla de almendra",
    "Tahini",
    "Aceitunas",
    "Aceite de oliva",
    "Aguacate",
    "Coco",
    "Ghee",
    "Mantequilla (moderación)",
  ],
  snacks: [
    "Chocolate sin azúcar",
    "Té verde",
    "Banano",
    "Manzana",
    "Uvas",
    "Fresas",
    "Mandarina",
    "Yogur griego",
    "Queso cottage",
    "Barrita proteica",
    "Frutos secos mixtos",
    "Palomitas de maíz",
    "Zanahoria baby",
    "Hummus con palitos",
    "Galletas de arroz",
    "Tortitas de maíz",
    "Batido de proteína",
    "Edamame",
    "Pepinillos",
    "Gelatina light",
  ],
};

type Prefs = {
  carbs: string[];
  proteins: string[];
  fiber: string[];
  fats: string[];
  snacks: string[];
};

export default function OnboardingFoodsPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [enabledMeals, setEnabledMeals] = useState<{ desayuno: boolean; almuerzo: boolean; cena: boolean; snack: boolean } | null>(null);
  // Selecciones del usuario: iniciar vacías (no preseleccionadas)
  const [prefs, setPrefs] = useState<Prefs>({
    carbs: [],
    proteins: [],
    fiber: [],
    fats: [],
    snacks: [],
  });
  // Paso del wizard: 0=carbs,1=proteins,2=fiber,3=fats+snacks,4=summary
  const steps: Array<"carbs" | "proteins" | "fiber" | "fats_snacks" | "summary"> = [
    "carbs",
    "proteins",
    "fiber",
    "fats_snacks",
    "summary",
  ];
  const [stepIndex, setStepIndex] = useState(0);

  // Prefill from server (preferencias_alimentos)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account/profile", { method: "GET" });
        if (res.status === 401) {
          router.replace("/auth/login");
          return;
        }
        if (!res.ok) return; // silent fail
        const data = await res.json();
        const pa = data?.user?.preferencias_alimentos as any;
        if (pa) {
          // Precargar selecciones previas (si existen), NO preseleccionar por defecto
          setPrefs({
            carbs: Array.isArray(pa.carbs) ? pa.carbs : [],
            proteins: Array.isArray(pa.proteins) ? pa.proteins : [],
            fiber: Array.isArray(pa.fiber) ? pa.fiber : [],
            fats: Array.isArray(pa.fats) ? pa.fats : [],
            snacks: Array.isArray(pa.snacks) ? pa.snacks : [],
          });
          if (pa.enabledMeals) setEnabledMeals(pa.enabledMeals);
        }
      } catch {}
    })();
  }, [router]);

  function toggle(kind: keyof Prefs, item: string) {
    setPrefs((p) => {
      const has = p[kind].includes(item);
      return {
        ...p,
        [kind]: has ? p[kind].filter((x) => x !== item) : [...p[kind], item],
      } as Prefs;
    });
  }

  function minRequirementOk(current: typeof steps[number]) {
    if (current === "carbs") return prefs.carbs.length >= 3;
    if (current === "proteins") return prefs.proteins.length >= 1;
    if (current === "fiber") return prefs.fiber.length >= 3;
    if (current === "fats_snacks") return prefs.fats.length + prefs.snacks.length >= 1;
    return true;
  }

  async function finishAndSave() {
    try {
      setSaving(true);
      // 1) Leer preferencias actuales para no sobrescribir mealHours / enabledMeals previamente guardados
      let existingPA: any = null;
      try {
        const curRes = await fetch("/api/account/profile", { method: "GET", cache: "no-store" });
        if (curRes.ok) {
          const cur = await curRes.json().catch(() => ({}));
          existingPA = (cur?.user?.preferencias_alimentos && typeof cur.user.preferencias_alimentos === 'object')
            ? cur.user.preferencias_alimentos
            : null;
        }
      } catch {}

      // 2) Fusionar: preservar mealHours y enabledMeals existentes si no los estamos cambiando aquí
      const mergedPA = {
        ...(existingPA || {}),
        ...prefs,
        ...(enabledMeals ? { enabledMeals } : { enabledMeals: (existingPA?.enabledMeals ?? undefined) }),
      } as any;

      const payload = {
        preferencias_alimentos: mergedPA,
        onboarding_step: "foods",
      } as any;
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!res.ok) throw new Error();
      // Persistir selección en UsuarioAlimento usando nombres y categorías
      const items: Array<{ nombre: string; categoria?: string; prioridad?: number }> = [];
      for (const n of prefs.carbs) items.push({ nombre: n, categoria: "carbohidrato" });
      for (const n of prefs.proteins) items.push({ nombre: n, categoria: "proteina" });
      for (const n of prefs.fiber) items.push({ nombre: n, categoria: "fibra" });
      for (const n of prefs.fats) items.push({ nombre: n, categoria: "grasa" });
      for (const n of prefs.snacks) items.push({ nombre: n, categoria: "snack" });
      await fetch("/api/account/user-ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      router.push("/onboarding/review");
    } catch (err) {
      toast.error("No se pudieron guardar tus preferencias");
    } finally {
      setSaving(false);
    }
  }

  function goNext(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    const current = steps[stepIndex];
    if (!minRequirementOk(current)) {
      const msg =
        current === "carbs"
          ? "Elige al menos 3 carbohidratos"
          : current === "proteins"
          ? "Elige al menos 1 proteína"
          : current === "fiber"
          ? "Elige al menos 3 fuentes de fibra"
          : "Elige al menos 1 opción entre grasas/snacks";
      toast.error(msg);
      return;
    }
    if (current === "summary") {
      // Guardar
      void finishAndSave();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goBack(e?: React.MouseEvent<HTMLButtonElement>) {
    if (e) e.preventDefault();
    if (stepIndex === 0) {
      router.push("/onboarding/meals-terms");
      return;
    }
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function Group({ title, kind, items }: { title: string; kind: keyof Prefs; items: string[] }) {
    return (
      <OnboardingCard>
        <div className="font-medium">{title}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((item) => (
            <label key={item} className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={prefs[kind].includes(item)}
                onCheckedChange={() => toggle(kind, item)}
              />
              {item}
            </label>
          ))}
        </div>
      </OnboardingCard>
    );
  }

  const current = steps[stepIndex];
  const stepTitleMap: Record<typeof steps[number], string> = {
    carbs: "Paso 1: Elige 3 carbohidratos (mínimo)",
    proteins: "Paso 2: Elige al menos 1 proteína",
    fiber: "Paso 3: Elige 3 fibras (mínimo)",
    fats_snacks: "Paso 4: Elige 1 o más grasas/snacks",
    summary: "Resumen de tu selección",
  };

  return (
    <OnboardingLayout>
      <OnboardingHeader title={stepTitleMap[current]} subtitle="Esto nos ayudará a sugerirte comidas y planes acordes a tus preferencias." />
      {current === "carbs" && (
        <Group title="Carbohidratos" kind="carbs" items={DEFAULTS.carbs} />
      )}
      {current === "proteins" && (
        <Group title="Proteínas" kind="proteins" items={DEFAULTS.proteins} />
      )}
      {current === "fiber" && (
        <Group title="Fibra" kind="fiber" items={DEFAULTS.fiber} />
      )}
      {current === "fats_snacks" && (
        <div className="space-y-4">
          <Group title="Grasas" kind="fats" items={DEFAULTS.fats} />
          <Group title="Snacks" kind="snacks" items={DEFAULTS.snacks} />
        </div>
      )}
      {current === "summary" && (
        <div className="space-y-4">
          <OnboardingCard>
            <div className="font-medium mb-2">Carbohidratos ({prefs.carbs.length})</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">{prefs.carbs.join(", ") || "Sin selección"}</div>
          </OnboardingCard>
          <OnboardingCard>
            <div className="font-medium mb-2">Proteínas ({prefs.proteins.length})</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">{prefs.proteins.join(", ") || "Sin selección"}</div>
          </OnboardingCard>
          <OnboardingCard>
            <div className="font-medium mb-2">Fibra ({prefs.fiber.length})</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">{prefs.fiber.join(", ") || "Sin selección"}</div>
          </OnboardingCard>
          <OnboardingCard>
            <div className="font-medium mb-2">Grasas/Snacks ({prefs.fats.length + prefs.snacks.length})</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              {[...prefs.fats, ...prefs.snacks].join(", ") || "Sin selección"}
            </div>
          </OnboardingCard>
        </div>
      )}
      <OnboardingActions
        back={{ onClick: goBack, label: "Atrás" }}
        next={{ onClick: goNext, label: current === "summary" ? (saving ? "Guardando..." : "Finalizar") : "Siguiente", disabled: saving }}
      />
      <div className="mt-1 mb-4 text-center text-xs text-muted-foreground">{stepIndex + 1} / {steps.length}</div>
    </OnboardingLayout>
  );
}
