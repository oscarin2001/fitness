"use client";

import { useEffect, useState, useCallback, useRef, memo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import { ThemedCheckbox as Checkbox } from "@/components/onboarding/ThemedCheckbox";

type Prefs = {
  carbs: string[];
  proteins: string[];
  fiber: string[];
  fats: string[];
  snacks: string[];
  beverages: string[];
};

// Helper: normalizar texto (hoist para usar en Group)
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();

type GroupProps = {
  title: string;
  kind: keyof Prefs;
  items: string[];
  extra?: string[];
  selected: string[];
  input: string;
  onInputChange: (kind: keyof Prefs, val: string) => void;
  onAdd: (kind: keyof Prefs, value: string) => void; // para añadir desde sugerencias o botón +
  onToggleLocal: (kind: keyof Prefs, value: string) => void; // toggle directo de items locales
};

const Group = memo(function Group({ title, kind, items, extra, selected, input, onInputChange, onAdd, onToggleLocal }: GroupProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const lastQueryRef = useRef<string>("");

  // Debounce global search trigger (delegated upward via onInputChange -> parent side-effects)
  useEffect(() => {
    const h = setTimeout(() => {
      if (lastQueryRef.current === input) return;
      lastQueryRef.current = input;
      // Parent already triggers search when input changes; we keep this only to keep timing similar if needed.
    }, 300);
    return () => clearTimeout(h);
  }, [input]);

  useEffect(() => {
    const qn = norm(input);
    const union = Array.from(new Set([...(items || []), ...((extra || []))]));
    let filtered = union;
    if (qn) filtered = union.filter(item => norm(item).includes(qn));
    filtered.sort((a,b)=>{
      const aLocal = items.some(i=>norm(i)===norm(a));
      const bLocal = items.some(i=>norm(i)===norm(b));
      if (aLocal && !bLocal) return -1;
      if (!aLocal && bLocal) return 1;
      return a.localeCompare(b,'es',{sensitivity:'base'});
    });
    setSuggestions(filtered.slice(0,30));
  }, [input, items, extra]);

  const handleAdd = (value: string) => {
    onAdd(kind, value);
    setShowSuggestions(true);
  };

  return (
    <>
      <OnboardingCard>
        <div className="font-medium flex items-center justify-between"><span>{title}</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-auto pr-1">
          {items.map((item) => (
            <label key={item} className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={selected.includes(item)}
                onCheckedChange={() => onToggleLocal(kind, item)}
              />
              {item}
            </label>
          ))}
        </div>
        <div className="mt-4 relative">
          <div className="relative">
            <input
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                onInputChange(kind, val);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              placeholder={`Buscar o agregar alimento a ${title}…`}
              className="w-full rounded-md border px-3 py-2 text-sm pr-10"
            />
            <button
              onClick={(e) => { e.preventDefault(); if (input.trim()) handleAdd(input); }}
              disabled={!input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Añadir alimento"
            >
              <span className="text-sm">+</span>
            </button>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-72 overflow-auto">
              {suggestions.map((suggestion) => {
                const isForeign = !items.some(i => norm(i) === norm(suggestion));
                return (
                  <div
                    key={suggestion}
                    className={`px-4 py-2 text-sm flex justify-between items-center hover:bg-gray-100 cursor-pointer ${isForeign ? 'opacity-80' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); handleAdd(suggestion); }}
                  >
                    <span>{suggestion}</span>
                    {isForeign && <span className="text-[10px] uppercase bg-gray-200 px-1 py-0.5 rounded">importar</span>}
                  </div>
                );
              })}
              {suggestions.length === 0 && (
                <div className="px-4 py-2 text-xs text-muted-foreground">Sin coincidencias</div>
              )}
            </div>
          )}
        </div>
      </OnboardingCard>
      {selected.length > 0 && (
        <OnboardingCard className="mt-3 bg-muted/20">
          <div className="font-medium mb-2">Tus {title.toLowerCase()} seleccionados</div>
          <div className="flex flex-wrap gap-2">
            {selected.map((item) => (
              <span key={item} className="inline-flex items-center gap-1 bg-background border rounded-full px-3 py-1 text-sm">
                {item}
                <button onClick={() => onToggleLocal(kind, item)} className="text-muted-foreground hover:text-foreground ml-1" title="Quitar">×</button>
              </span>
            ))}
          </div>
        </OnboardingCard>
      )}
    </>
  );
});

function FoodsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<null | {
    country: string;
    categories: {
      Proteinas: string[];
      Carbohidratos: string[];
      Fibras: string[];
      Snacks: string[];
      Grasos: string[];
      BebidasInfusiones: string[];
    };
  }>(null);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);
  const [enabledMeals, setEnabledMeals] = useState<{ desayuno: boolean; almuerzo: boolean; cena: boolean; snack: boolean } | null>(null);
  // Selecciones del usuario: iniciar vacías (no preseleccionadas)
  const [prefs, setPrefs] = useState<Prefs>({
    carbs: [],
    proteins: [],
    fiber: [],
    fats: [],
    snacks: [],
    beverages: [],
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
  const [searchResults, setSearchResults] = useState<Partial<Record<keyof Prefs, string[]>>>({});
  const [inputs, setInputs] = useState<Record<keyof Prefs, string>>({
    carbs:"", proteins:"", fiber:"", fats:"", snacks:"", beverages:""
  });

  // Eliminamos useEffect de restauración tardía para evitar sobrescribir primer carácter.
  const abortRef = useRef<AbortController | null>(null); // (no longer used for cancellation but kept for future)

  // Prefill from server (preferencias_alimentos) y país para catálogo
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
        const pais = data?.user?.pais || null;
        if (pais && typeof pais === 'string') setCountry(pais);
        if (pa) {
          // Precargar selecciones previas (si existen), NO preseleccionar por defecto
          setPrefs({
            carbs: Array.isArray(pa.carbs) ? pa.carbs : [],
            proteins: Array.isArray(pa.proteins) ? pa.proteins : [],
            fiber: Array.isArray(pa.fiber) ? pa.fiber : [],
            fats: Array.isArray(pa.fats) ? pa.fats : [],
            snacks: Array.isArray(pa.snacks) ? pa.snacks : [],
            beverages: Array.isArray(pa.beverages) ? pa.beverages : [],
          });
          if (pa.enabledMeals) setEnabledMeals(pa.enabledMeals);
        }
      } catch {}
    })();
  }, [router]);

  // Leer país desde query param si viene (?country=...)
  useEffect(() => {
    try {
      const qp = searchParams?.get("country");
      if (qp && qp !== country) setCountry(qp);
    } catch {}
  }, [searchParams]);

  // Cargar catálogo regional según país
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingCatalog(true);
        const params = country ? `?country=${encodeURIComponent(country)}` : "";
        const res = await fetch(`/api/account/foods/region-catalog${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const j = await res.json();
        if (!cancelled) setCatalog(j);
      } catch {
        // fallback silencioso
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    })();
    return () => { cancelled = true; };
  }, [country]);

  // Nueva función de búsqueda global: trae alimentos de TODOS los países pero no altera el catálogo local
  const fetchAllGlobal = useCallback(async () => {
    try {
      const res = await fetch(`/api/account/foods/region-catalog?q=__all__`);
      if (!res.ok) return;
      const data = await res.json();
      const cats = data?.categories || {};
      setSearchResults({
        carbs: cats.Carbohidratos || [],
        proteins: cats.Proteinas || [],
        fiber: cats.Fibras || [],
        fats: cats.Grasos || [],
        snacks: cats.Snacks || [],
        beverages: cats.BebidasInfusiones || [],
      });
    } catch {}
  }, []);

  // Cargar catálogo global inicial una sola vez para que haya sugerencias desde el primer caracter
  useEffect(() => {
    fetchAllGlobal();
  }, [fetchAllGlobal]);

  const mapKindToCat: Record<keyof Prefs, string> = {
    carbs: "Carbohidratos",
    proteins: "Proteinas",
    fiber: "Fibras",
    fats: "Grasos",
    snacks: "Snacks",
    beverages: "BebidasInfusiones",
  };

  const handleSearch = useCallback(async (kind: keyof Prefs, query: string) => {
    const q = query.trim();
    if (!q) return; // mantener sugerencias globales precargadas
    try {
      const apiCat = mapKindToCat[kind];
      const res = await fetch(`/api/account/foods/region-catalog?q=${encodeURIComponent(q)}&category=${encodeURIComponent(apiCat)}`);
      if (!res.ok) return;
      const data = await res.json();
      const cats = data?.categories || {};
      const arr = cats[apiCat] || [];
      setSearchResults(prev => ({ ...prev, [kind]: arr }));
    } catch {}
  }, []);

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
      for (const n of (prefs.beverages || [])) items.push({ nombre: n, categoria: "BebidasInfusiones" });
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

  async function addCustomItem(kind: keyof Prefs, value: string, _overrideCategory?: string | null) {
    const v = (value || "").trim();
    if (!v) return;

    const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();

  const apiCat = mapKindToCat[kind];
  // Asegurar tipado seguro: categories es un objeto con claves conocidas, pero al indexar dinámicamente
  // TypeScript necesita una firma de índice. Normalizamos a Record<string,string[]> en runtime.
  const categories: Record<string,string[]> | undefined = catalog?.categories as any;
  const localItems: string[] = categories?.[apiCat] || [];

    // Construir universo permitido: locales + resultados globales de búsqueda (si existen)
    const globalCandidateSets: string[][] = [];
    // searchResults puede tener claves en formato Prefs (carbs) o API (Carbohidratos)
    const sr: any = searchResults || {};
    if (Array.isArray(sr[kind])) globalCandidateSets.push(sr[kind]);
    if (Array.isArray(sr[apiCat])) globalCandidateSets.push(sr[apiCat]);
    const globalItems = Array.from(new Set(globalCandidateSets.flat()));

    const inLocal = localItems.some(x => normalize(x) === normalize(v));
    const inGlobal = globalItems.some(x => normalize(x) === normalize(v));
    // Permitir siempre: si no está en local ni en resultados actuales igual dejamos que el backend valide contra catálogo global.
    const imported = !inLocal; // cualquier no-local lo consideramos importado

    setPrefs((p) => (p[kind].includes(v) ? p : { ...p, [kind]: [...p[kind], v] } as Prefs));

    try {
      const res = await fetch("/api/account/foods/region-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: v, categoria: apiCat }),
      });
      if (res.ok) {
        toast.success(imported
          ? `Importado "${v}"`
          : `Añadido "${v}"`);
      } else {
        toast.error("No se pudo añadir el alimento. Intenta de nuevo.");
      }
    } catch {
      toast.error("No se pudo añadir el alimento. Verifica tu conexión.");
    }
  }

  const onInputChange = useCallback((kind: keyof Prefs, val: string) => {
    setInputs(prev => ({ ...prev, [kind]: val }));
    if (val.trim().length >= 1) void handleSearch(kind, val);
  }, [handleSearch]);

  const onAddFromGroup = useCallback((kind: keyof Prefs, value: string) => {
    const v = value.trim();
    if (!v) return;
    if (prefs[kind].includes(v)) return;
    void addCustomItem(kind, v, null);
    // limpiar input tras añadir
    setInputs(prev => ({ ...prev, [kind]: "" }));
  }, [prefs]);

  const onToggleLocal = useCallback((kind: keyof Prefs, value: string) => {
    setPrefs(p => {
      const has = p[kind].includes(value);
      const nextList = has ? p[kind].filter(x=>x!==value) : [...p[kind], value];
      if (!has) {
        // limpiar input cuando se selecciona uno nuevo
        setInputs(prev => ({ ...prev, [kind]: "" }));
      }
      return { ...p, [kind]: nextList } as Prefs;
    });
  }, []);

  const current = steps[stepIndex];
  const stepTitleMap: Record<typeof steps[number], string> = {
    carbs: "Paso 1: Elige 3 carbohidratos (mínimo)",
    proteins: "Paso 2: Elige al menos 1 proteína",
    fiber: "Paso 3: Elige 3 fibras (mínimo)",
    fats_snacks: "Paso 4: Elige 1 o más grasas/snacks",
    summary: "Resumen de tu selección",
  };

  // Construir listas a mostrar con preferencia por catálogo regional
  const cat = catalog?.categories;
  const LISTS = {
    carbs: cat?.Carbohidratos || [],
    proteins: cat?.Proteinas || [],
    fiber: cat?.Fibras || [],
    fats: cat?.Grasos || [],
    snacks: cat?.Snacks || [],
    bebidas: cat?.BebidasInfusiones || [],
  } as const;

  // Limitar visualización a 10 alimentos por categoría (según país) pero garantizando que los ya seleccionados aparezcan.
  const MAX_SHOW = 10;
  function limit(base: string[] = [], selected: string[] = [], max = MAX_SHOW) {
    if (!base.length) return selected.slice(0, max);
    const out: string[] = [];
    // 1) Incluir seleccionados en el orden en que aparecen en 'selected'
    for (const s of selected) {
      if (base.some(b => b.toLowerCase() === s.toLowerCase()) && !out.includes(s)) out.push(s);
    }
    // 2) Completar con la lista base manteniendo el orden original
    for (const b of base) {
      if (!out.includes(b)) out.push(b);
      if (out.length >= max) break;
    }
    return out.slice(0, max);
  }
  const DISPLAY = {
    carbs: limit(LISTS.carbs, prefs.carbs),
    proteins: limit(LISTS.proteins, prefs.proteins),
    fiber: limit(LISTS.fiber, prefs.fiber),
    fats: limit(LISTS.fats, prefs.fats),
    snacks: limit(LISTS.snacks, prefs.snacks),
    bebidas: limit(LISTS.bebidas, prefs.beverages || []),
  } as const;

  // Mapeo para aceptar searchResults (que usa claves de categorías API) -> Prefs keys
  const mergedSearch: Partial<Record<keyof Prefs, string[]>> = {
    carbs: searchResults.carbs || (searchResults as any).Carbohidratos || [],
    proteins: searchResults.proteins || (searchResults as any).Proteinas || [],
    fiber: searchResults.fiber || (searchResults as any).Fibras || [],
    fats: searchResults.fats || (searchResults as any).Grasos || [],
    snacks: searchResults.snacks || (searchResults as any).Snacks || [],
    beverages: searchResults.beverages || (searchResults as any).BebidasInfusiones || [],
  };

  // Eliminado el PreviewPanel lateral ya que ahora se muestra debajo de cada categoría

  return (
    <OnboardingLayout>
      <OnboardingHeader 
        title={stepTitleMap[current]} 
        subtitle={`Esto nos ayudará a sugerirte comidas y planes acordes a tus preferencias.${country ? ` País: ${country}.` : ''}${loadingCatalog ? ' Cargando catálogo regional…' : ''} Puedes buscar e importar alimentos de otros países (marcados como "importar").`} 
      />
      
      <div className="space-y-4">
        {current === "carbs" && (
          <Group title="Carbohidratos" kind="carbs" items={DISPLAY.carbs} extra={mergedSearch.carbs} selected={prefs.carbs} input={inputs.carbs} onInputChange={onInputChange} onAdd={onAddFromGroup} onToggleLocal={onToggleLocal} />
        )}
        {current === "proteins" && (
          <Group title="Proteínas" kind="proteins" items={DISPLAY.proteins} extra={mergedSearch.proteins} selected={prefs.proteins} input={inputs.proteins} onInputChange={onInputChange} onAdd={onAddFromGroup} onToggleLocal={onToggleLocal} />
        )}
        {current === "fiber" && (
          <Group title="Fibra" kind="fiber" items={DISPLAY.fiber} extra={mergedSearch.fiber} selected={prefs.fiber} input={inputs.fiber} onInputChange={onInputChange} onAdd={onAddFromGroup} onToggleLocal={onToggleLocal} />
        )}
        {current === "fats_snacks" && (
          <div className="space-y-4">
            <Group title="Grasas" kind="fats" items={DISPLAY.fats} extra={mergedSearch.fats} selected={prefs.fats} input={inputs.fats} onInputChange={onInputChange} onAdd={onAddFromGroup} onToggleLocal={onToggleLocal} />
            <Group title="Snacks" kind="snacks" items={DISPLAY.snacks} extra={mergedSearch.snacks} selected={prefs.snacks} input={inputs.snacks} onInputChange={onInputChange} onAdd={onAddFromGroup} onToggleLocal={onToggleLocal} />
            {DISPLAY.bebidas.length > 0 && (
              <Group title="Bebidas e infusiones" kind={"beverages" as keyof Prefs} items={DISPLAY.bebidas} extra={mergedSearch.beverages} selected={prefs.beverages} input={inputs.beverages} onInputChange={onInputChange} onAdd={onAddFromGroup} onToggleLocal={onToggleLocal} />
            )}
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
            {LISTS.bebidas.length > 0 && (
              <OnboardingCard>
                <div className="font-medium mb-2">Bebidas e infusiones ({(prefs.beverages || []).length})</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{(prefs.beverages || []).join(", ") || "Sin selección"}</div>
              </OnboardingCard>
            )}
          </div>
        )}
        
        <OnboardingActions
          back={{ onClick: goBack, label: "Atrás" }}
          next={{ 
            onClick: goNext, 
            label: current === "summary" ? (saving ? "Guardando..." : "Finalizar") : "Siguiente", 
            disabled: saving 
          }}
        />
        <div className="mt-1 mb-4 text-center text-xs text-muted-foreground">
          {stepIndex + 1} / {steps.length}
        </div>
      </div>
    </OnboardingLayout>
  );
}

export default function OnboardingFoodsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">Cargando catálogo…</div>}>
      <FoodsInner />
    </Suspense>
  );
}
