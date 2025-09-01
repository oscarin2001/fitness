"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Ingredient = { id: number; nombre: string; categoria: string | null };

type SuggestRequest = { ingredientIds: number[]; mealType?: "Desayuno" | "Almuerzo" | "Cena" | "Snack" };

type SuggestResponse = {
  items: Array<{
    id: number;
    nombre: string;
    porciones: number;
    matchCount: number;
    macros: { kcal: number; proteinas: number; grasas: number; carbohidratos: number };
    alimentos: Array<{ id: number; nombre: string; gramos: number }>;
  }>;
  mealType?: string | null;
  reason?: string;
};

// Normaliza items para asegurar que siempre exista 'macros' y 'alimentos'
function normalizeItems(items: any[]): SuggestResponse["items"] {
  return (Array.isArray(items) ? items : []).map((r: any, idx: number) => {
    const macros = r?.macros ?? {
      kcal: Number(r?.kcal ?? r?.calorias ?? 0) || 0,
      proteinas: Number(r?.proteinas ?? r?.protein ?? 0) || 0,
      grasas: Number(r?.grasas ?? r?.fat ?? 0) || 0,
      carbohidratos: Number(r?.carbohidratos ?? r?.carbs ?? 0) || 0,
    };
    const alimentos = Array.isArray(r?.alimentos)
      ? r.alimentos.map((a: any) => ({ id: Number(a?.id) || 0, nombre: String(a?.nombre ?? a?.name ?? ""), gramos: Number(a?.gramos ?? a?.grams ?? 0) || 0 }))
      : [];
    return {
      id: Number(r?.id ?? 0) || 0,
      nombre: String(r?.nombre ?? r?.name ?? `Receta ${idx + 1}`),
      porciones: Number(r?.porciones ?? r?.servings ?? 1) || 1,
      matchCount: Number(r?.matchCount ?? r?.matches ?? 0) || 0,
      macros: {
        kcal: Number(macros?.kcal ?? 0) || 0,
        proteinas: Number(macros?.proteinas ?? 0) || 0,
        grasas: Number(macros?.grasas ?? 0) || 0,
        carbohidratos: Number(macros?.carbohidratos ?? 0) || 0,
      },
      alimentos,
    };
  });
}

const MEAL_TYPES: SuggestRequest["mealType"][] = ["Desayuno", "Almuerzo", "Cena", "Snack"];

export default function ChecklistPage() {
  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [mealType, setMealType] = useState<SuggestRequest["mealType"]>(undefined);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestingLLM, setSuggestingLLM] = useState(false);
  const [results, setResults] = useState<SuggestResponse["items"]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingRecipeId, setSavingRecipeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [llmReason, setLlmReason] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const [adding, setAdding] = useState(false);
  const [autoSuggest, setAutoSuggest] = useState(true);
  const [savingQuick, setSavingQuick] = useState(false);
  const [autoUseAI, setAutoUseAI] = useState(true);
  const [preferDessert, setPreferDessert] = useState(false);
  const [freeText, setFreeText] = useState("");

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    try {
      setLoading(true);
      const res = await fetch("/api/recipes/ingredients");
      const data = await res.json();
      setIngredients(data.items || []);
      // Nota: se eliminó la autoselección de ingredientes del usuario para evitar que se marquen solos al recargar
    } catch {
      setError("No se pudieron cargar los ingredientes");
    } finally {
      setLoading(false);
    }
  }

  async function saveAiAsRecipe(r: any) {
    try {
      setSavingRecipeId(r.id);
      const body = {
        nombre: r.nombre,
        tipo: r.tipo || mealType,
        porciones: r.porciones || 1,
        ingredientes: (r.alimentos || []).map((a: any) => ({ alimentoId: a.id, gramos: a.gramos })),
      };
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newId = data.id;
      // actualizar resultados: reemplazar item con id=0 por uno con id=newId
      setResults((prev) => prev.map((it) => (it === r ? { ...it, id: newId } : it)));
    } catch {
      setError("No se pudo guardar la receta");
    } finally {
      setSavingRecipeId(null);
    }
  }

  async function saveAsPlan(recipeId: number) {
    if (!mealType) {
      setError("Selecciona un tipo de comida para guardar");
      return;
    }
    setSavingId(recipeId);
    setError(null);
    try {
      const res = await fetch("/api/account/meal-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: mealType, recetaId: recipeId, porciones: 1 }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError("No se pudo guardar el plan");
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter((i) => i.nombre.toLowerCase().includes(q) || (i.categoria || "").toLowerCase().includes(q));
  }, [ingredients, query]);

  function toggle(id: number) {
    // Al seleccionar desde checklist, limpiar el texto libre para que los modos sean excluyentes
    setFreeText("");
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    try {
      const body: SuggestRequest = { ingredientIds: selected };
      if (mealType) body.mealType = mealType;
      const res = await fetch("/api/recipes/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const data: SuggestResponse = await res.json();
      const items = normalizeItems(data.items || []);
      setResults(items);
      // Si no hay resultados y está activo el uso de IA, hacer fallback a LLM
      if (items.length === 0 && autoUseAI) {
        await suggestLLM();
      }
    } catch {
      setError("No se pudieron obtener sugerencias");
    } finally {
      setSuggesting(false);
    }
  }

  async function suggestLLM() {
    setSuggestingLLM(true);
    setError(null);
    setLlmReason(null);
    try {
      const body: any = { mealType: mealType ?? undefined, limit: 6, selectedIds: selected };
      if (preferDessert) body.preference = "postre_batido"; // pista opcional para el backend
      const res = await fetch("/api/recipes/suggest-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const data: any = await res.json();
      setResults(normalizeItems(data.items || []));
      if ((!data.items || data.items.length === 0) && data.reason) setLlmReason(String(data.reason));
    } catch {
      setError("No se pudieron obtener sugerencias con IA");
    } finally {
      setSuggestingLLM(false);
    }
  }

  // Sugerir desde texto libre ("Tengo: ...") usando IA
  async function suggestFromText() {
    if (!freeText.trim()) return;
    setSuggestingLLM(true);
    setError(null);
    setLlmReason(null);
    try {
      const body: any = { mealType: mealType ?? undefined, limit: 6, freeText: freeText.trim() };
      if (preferDessert) body.preference = "postre_batido";
      const res = await fetch("/api/recipes/suggest-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const data: any = await res.json();
      setResults(normalizeItems(data.items || []));
      if ((!data.items || data.items.length === 0) && data.reason) setLlmReason(String(data.reason));
    } catch {
      setError("No se pudieron obtener sugerencias desde texto");
    } finally {
      setSuggestingLLM(false);
    }
  }

  // Autosugerir con debounce cuando cambia la selección o el tipo de comida
  useEffect(() => {
    if (!autoSuggest) return;
    if (selected.length < 2) return; // umbral mínimo
    const id = setTimeout(() => {
      if (autoUseAI) {
        suggestLLM();
      } else {
        suggest();
      }
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, mealType, autoSuggest, autoUseAI]);

  // Inferir Snack y preferencia batido/postre si hay lácteo + fruta seleccionados
  useEffect(() => {
    if (!Array.isArray(ingredients) || ingredients.length === 0) return;
    const byId: Record<number, Ingredient> = Object.fromEntries(ingredients.map(i => [i.id, i]));
    const names = selected.map(id => byId[id]?.nombre?.toLowerCase?.() || "");
    const hasDairy = names.some(n => /\b(leche|milk|yogur|yogurt|yoghurt|queso|lácte[oa])\b/.test(n));
    const hasFruit = names.some(n => /(plátano|platano|banana|fresa|frut|manzana|pera|mango|kiwi|arándano|naranja|mandarina)/.test(n));
    const prefer = hasDairy && hasFruit;
    setPreferDessert(prefer);
  }, [selected, ingredients]);

  // Crear comida rápida: crea receta con ingredientes seleccionados y la guarda en el plan
  async function quickCreateMeal() {
    setError(null);
    if (!mealType) {
      setError("Elige un tipo de comida para crearla");
      return;
    }
    if (selected.length === 0) {
      setError("Selecciona al menos 1 ingrediente");
      return;
    }
    setSavingQuick(true);
    try {
      // Mapear ingredientes seleccionados a { alimentoId, gramos }
      const byId: Record<number, Ingredient> = Object.fromEntries(ingredients.map(i => [i.id, i]));
      const picks = selected
        .map((id) => byId[id])
        .filter(Boolean)
        .slice(0, 6); // limitar a 6
      const gramsDefault = mealType === "Snack" ? 50 : 100;
      const ingredientes = picks.map((i) => ({ alimentoId: i.id, gramos: gramsDefault }));

      // Crear receta rápida
      const nombre = `Comida rápida ${mealType} ${new Date().toLocaleDateString()}`;
      const createRes = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, tipo: mealType, porciones: 1, ingredientes }),
      });
      if (!createRes.ok) throw new Error("No se pudo crear la receta");
      const created = await createRes.json().catch(() => ({} as any));
      const recetaId = Number(created?.id);
      if (!Number.isFinite(recetaId)) throw new Error("ID de receta inválido");

      // Guardar en plan
      const planRes = await fetch("/api/account/meal-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: mealType, recetaId, porciones: 1 }),
      });
      if (!planRes.ok) throw new Error("No se pudo guardar la comida en tu plan");
    } catch (e: any) {
      setError(e?.message || "No se pudo crear la comida rápida");
    } finally {
      setSavingQuick(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Checklist de ingredientes</h1>
          <p className="text-muted-foreground mt-1">Elige ingredientes y genera sugerencias de recetas</p>
        </div>
        <Button asChild variant="outline"><Link href="/dashboard">Volver al dashboard</Link></Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Ingredientes</CardTitle>
            <CardDescription>Busca y selecciona</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Cargando…</div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : (
              <>
                {selected.length > 0 && (
                  <div className="mb-2 text-xs text-muted-foreground">Se cargaron {selected.length} ingredientes guardados</div>
                )}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  className="mb-3 w-full rounded-md border px-3 py-2 text-sm"
                />
                {/* Agregar nuevo ingrediente */}
                <div className="mb-3 grid grid-cols-1 gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nuevo ingrediente (nombre)"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                  <input
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    placeholder="Categoría (opcional)"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                  <Button
                    disabled={adding || !newName.trim()}
                    onClick={async () => {
                      setAdding(true);
                      setError(null);
                      try {
                        const res = await fetch("/api/account/user-ingredients", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ mode: "append", items: [{ nombre: newName.trim(), categoria: newCat.trim() || undefined }] }),
                        });
                        if (!res.ok) throw new Error();
                        setNewName("");
                        setNewCat("");
                        await reload();
                      } catch {
                        setError("No se pudo agregar el ingrediente");
                      } finally {
                        setAdding(false);
                      }
                    }}
                  >
                    {adding ? "Agregando…" : "Agregar"}
                  </Button>
                </div>
                <div className="max-h-[360px] overflow-auto space-y-4 pr-1">
                  {(() => {
                    const cat = (s: string | null) => (s || "Otros").toLowerCase();
                    const order = ["proteina", "carbohidrato", "grasa", "fibra", "snack", "otros"];
                    const groups: Record<string, Ingredient[]> = {};
                    for (const i of filtered) {
                      const k = cat(i.categoria);
                      groups[k] = groups[k] || [];
                      groups[k].push(i);
                    }
                    const human: Record<string, string> = {
                      proteina: "Proteínas",
                      carbohidrato: "Carbohidratos",
                      grasa: "Grasas",
                      fibra: "Fibra",
                      snack: "Snacks",
                      otros: "Otros",
                    };
                    const keys = Object.keys(groups).sort((a, b) => (order.indexOf(a) - order.indexOf(b)));
                    return keys.map((k) => (
                      <div key={k}>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{human[k] || k}</div>
                        <div className="space-y-2">
                          {groups[k].map((i) => (
                            <label key={i.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={selected.includes(i.id)}
                                disabled={!!freeText.trim()}
                                onChange={() => toggle(i.id)}
                              />
                              <span className="font-medium">{i.nombre}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                  {filtered.length === 0 && <div className="text-xs text-muted-foreground">Sin resultados</div>}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sugerencias</CardTitle>
            <CardDescription>En base a los ingredientes elegidos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <select
                value={mealType ?? ""}
                onChange={(e) => setMealType((e.target.value || undefined) as SuggestRequest["mealType"])}
                className="min-w-[160px] rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Tipo de comida (opcional)</option>
                {MEAL_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <Button onClick={suggest} disabled={selected.length === 0 || suggesting}>
                {suggesting ? "Generando…" : "Sugerir recetas"}
              </Button>
              <Button variant="secondary" onClick={suggestLLM} disabled={suggestingLLM}>
                {suggestingLLM ? "Consultando IA…" : "Sugerir con IA"}
              </Button>
              <label className="ml-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={autoSuggest}
                  onChange={() => setAutoSuggest(v => !v)}
                />
                Autosugerir al seleccionar
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={autoUseAI}
                  onChange={() => setAutoUseAI(v => !v)}
                />
                Usar IA
              </label>
            </div>
            <div className="mt-2 flex items-start gap-2">
              <textarea
                className="w-full min-h-[60px] text-sm rounded-md border px-2 py-1"
                placeholder="Tengo: pechuga, salchicha, ajo..."
                value={freeText}
                disabled={selected.length > 0}
                onChange={(e) => {
                  const v = e.target.value;
                  setFreeText(v);
                  if (v.trim().length > 0 && selected.length > 0) {
                    setSelected([]);
                  }
                }}
              />
              <Button onClick={suggestFromText} disabled={suggestingLLM || !freeText.trim()}>
                {suggestingLLM ? "Generando…" : "Sugerir desde texto"}
              </Button>
              <Button
                className="ml-auto"
                onClick={quickCreateMeal}
                disabled={savingQuick || selected.length === 0 || !mealType}
                title={!mealType ? "Elige un tipo de comida" : undefined}
              >
                {savingQuick ? "Creando…" : "Crear comida rápida"}
              </Button>
              <span className="text-xs text-muted-foreground">{selected.length} ingrediente(s) seleccionados</span>
            </div>

            {results.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {llmReason ? llmReason : "No hay sugerencias aún"}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {results.map((r, idx) => (
                  <div key={`${r.id}-${idx}`} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{r.nombre}</div>
                        <div className="text-xs text-muted-foreground">Coincidencias: {r.matchCount} • Porciones: {r.porciones}</div>
                      </div>
                      <div className="text-right text-xs">
                        <div><span className="font-medium">{r.macros.kcal}</span> kcal</div>
                        <div className="text-muted-foreground">P {r.macros.proteinas}g • G {r.macros.grasas}g • C {r.macros.carbohidratos}g</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {r.alimentos.map((a, idx) => (
                        <span key={a.id} className="inline-block mr-2 mb-1 rounded bg-muted px-2 py-0.5">
                          {a.nombre} {a.gramos}g
                        </span>
                      ))}
                    </div>
                    <div className="mt-3">
                      <Button
                        disabled={!mealType || savingId === r.id || r.id === 0}
                        onClick={() => saveAsPlan(r.id)}
                        title={r.id === 0 ? "Sugerencia IA: primero guarda una receta basada en esto" : undefined}
                      >
                        {!mealType ? "Elige tipo de comida" : savingId === r.id ? "Guardando…" : r.id === 0 ? "No guardable (IA)" : "Guardar como plan"}
                      </Button>
                      {r.id === 0 && (
                        <Button
                          className="ml-2"
                          variant="outline"
                          disabled={savingRecipeId === r.id}
                          onClick={() => saveAiAsRecipe(r)}
                        >
                          {savingRecipeId === r.id ? "Guardando receta…" : "Guardar como receta"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
