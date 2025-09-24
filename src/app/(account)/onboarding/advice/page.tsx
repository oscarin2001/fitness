"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import WeeklyPlanByDay from "@/components/WeeklyPlanByDay";
import { useMemo } from "react";

function renderAdviceToHtml(markdown: string): string {
  // 1) Remove JSON_* lines from visible text
  const noJson = markdown
    .split("\n")
    .filter((ln) => !/^\s*JSON_(SUMMARY|MEALS|HYDRATION)\s*:/.test(ln))
    .join("\n");

  // 2) Escape basic HTML
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = noJson.split("\n");
  let html = "";
  let inList = false;

  const flushList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (let raw of lines) {
    let line = raw.trimEnd();

    // Headings ###, ##, #
    if (/^###\s+/.test(line)) {
      flushList();
      const content = escape(line.replace(/^###\s+/, ""));
      // Bold inline **text**
      const withBold = content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html += `<h3>${withBold}</h3>`;
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushList();
      const content = escape(line.replace(/^##\s+/, ""));
      const withBold = content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html += `<h2>${withBold}</h2>`;
      continue;
    }
    if (/^#\s+/.test(line)) {
      flushList();
      const content = escape(line.replace(/^#\s+/, ""));
      const withBold = content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html += `<h1>${withBold}</h1>`;
      continue;
    }

    // List items: lines starting with "* " or "- "
    if (/^(\*|-)\s+/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      const content = escape(line.replace(/^(\*|-)\s+/, ""))
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html += `<li>${content}</li>`;
      continue;
    } else {
      flushList();
    }

    // Empty line
    if (line.trim() === "") {
      html += "<br/>";
      continue;
    }

    // Paragraph with bold support
    const content = escape(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html += `<p>${content}</p>`;
  }

  flushList();
  return html;
}

// Convierte el markdown del consejo a texto plano legible para PDF (sin asteriscos/markup)
function renderAdviceToPlain(markdown: string): string {
  // 1) Eliminar líneas JSON_*
  const noJson = markdown
    .split("\n")
    .filter((ln) => !/^\s*JSON_(SUMMARY|MEALS|HYDRATION)\s*:/.test(ln))
    .join("\n");
  const lines = noJson.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let raw of lines) {
    let line = raw.trimEnd();
    // Quitar backticks y negritas
    line = line.replace(/`+/g, "");
    line = line.replace(/\*\*(.+?)\*\*/g, "$1");
    // Headings -> texto simple con espacio previo
    if (/^###\s+/.test(line)) {
      out.push("");
      out.push(line.replace(/^###\s+/, ""));
      continue;
    }
    if (/^##\s+/.test(line)) {
      out.push("");
      out.push(line.replace(/^##\s+/, ""));
      continue;
    }
    if (/^#\s+/.test(line)) {
      out.push("");
      out.push(line.replace(/^#\s+/, ""));
      continue;
    }
    // Listas -> viñetas
    if (/^(\*|-)\s+/.test(line)) {
      out.push("• " + line.replace(/^(\*|-)\s+/, ""));
      continue;
    }
    // Línea vacía -> mantener separación
    if (line.trim() === "") {
      out.push("");
      continue;
    }
    out.push(line);
  }
  // Compactar múltiples saltos en máx 2
  const compact: string[] = [];
  let emptyRun = 0;
  for (const l of out) {
    if (l.trim() === "") {
      emptyRun++;
      if (emptyRun <= 2) compact.push("");
    } else {
      emptyRun = 0;
      compact.push(l);
    }
  }
  return compact.join("\n");
}

export default function OnboardingAdvicePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState<string>("");
  const [summary, setSummary] = useState<any | null>(null);
  const [mealItems, setMealItems] = useState<any[] | null>(null);
  const [hydrationLiters, setHydrationLiters] = useState<number | null>(null);
  const [savingMeals, setSavingMeals] = useState(false); // (preview only now; no persist until completion elsewhere)
  const [profile, setProfile] = useState<any | null>(null);
  const [weekly, setWeekly] = useState<any | null>(null);
  const [loadingWeekly, setLoadingWeekly] = useState<boolean>(true);
  const [proposals, setProposals] = useState<any[] | null>(null);
  const [schedule, setSchedule] = useState<Record<string, string> | null>(null);
  const [showBaseProposals, setShowBaseProposals] = useState<boolean>(false);
  const [showFullAdvice, setShowFullAdvice] = useState<boolean>(false);
  // Variantes propuestas por la IA por tipo: { Desayuno: [...], Almuerzo: [...], ... }
  const [mealVariants, setMealVariants] = useState<Record<string, any[]> | null>(null);
  // Construir vista previa efímera a partir de mealItems (AI) si no hay weekly.weekly o para reemplazar cualquier plan previo guardado.
  const ephemeralWeekly = useMemo(() => {
    // Construye un plan semanal rotado SOLO en memoria partiendo de mealItems (AI).
    const hasVariants = mealVariants && typeof mealVariants === 'object' && Object.keys(mealVariants).length > 0;
    if (!hasVariants && (!Array.isArray(mealItems) || mealItems.length === 0)) return null;

    // Heurística para medidas caseras (similar a weekly-proposals backend) para mostrar peso y medida.
    function householdMeasure(name: string, grams: number) {
      const n = String(name || '').toLowerCase();
      const g = Number(grams) || 0;
      const approx = (val: number, base: number) => Math.abs(val - base) <= base * 0.25;
      if (/arroz/.test(n)) { if (approx(g,90)) return '1/2 taza'; if (approx(g,180)) return '1 taza'; }
      if (/pollo|pechuga|filete/.test(n)) { if (approx(g,120)) return '1 filete mediano'; }
      if (/papa|patata/.test(n)) { if (approx(g,150)) return '1 papa mediana'; }
      if (/nuez|almendra|mani|maní|pistacho|avellana|frutos?\s*secos|semilla/.test(n)) { if (approx(g,30)) return '1 puñado'; }
      if (/huevo/.test(n)) { if (approx(g,100)) return '2 huevos'; }
      if (/pan.*integral|pan/.test(n)) { if (approx(g,40)) return '1 rebanada'; }
      if (/yogur|yogurt/.test(n)) { if (approx(g,200)) return '1 taza'; }
      if (/verdura|ensalada|br[oó]coli|espinaca|zanahoria|pepino|tomate|lechuga/.test(n)) { if (approx(g,150)) return '1 taza'; }
      if (/avena/.test(n)) { if (approx(g,30)) return '3 cucharadas'; }
      if (/banana|pl[aá]tano|manzana/.test(n)) { if (approx(g,120) || approx(g,150)) return '1 pieza mediana'; }
      return '';
    }

    // Leer enabledMeals del perfil para saber si hay snacks separados mañana/tarde
    let enabledMeals: any = null;
    try {
      const raw = profile?.preferencias_alimentos;
      if (raw) {
        enabledMeals = typeof raw === 'string' ? JSON.parse(raw)?.enabledMeals : raw?.enabledMeals;
      }
    } catch {}
    const snackManana = enabledMeals?.snack_manana || enabledMeals?.["snack_mañana"] || false;
    const snackTarde = enabledMeals?.snack_tarde || false;
    const separateSnacks = snackManana && snackTarde;

    // Agrupar por tipo para poder rotar. Si hay 2 snacks distintos y la IA entregó items tipo "Snack",
    // asignar alternadamente Snack_manana / Snack_tarde. Priorizar variantes de la IA si existen.
    const mealsByType: Record<string, any[]> = {};
    if (hasVariants) {
      const mapKeys = (k: string) => (/^desayuno$/i.test(k) ? 'Desayuno' : /^almuerzo|comida|lunch$/i.test(k) ? 'Almuerzo' : /^cena|dinner$/i.test(k) ? 'Cena' : 'Snack');
      for (const [rawType, arr] of Object.entries(mealVariants!)) {
        const tipo = mapKeys(rawType);
        const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
        if (list.length) mealsByType[tipo] = list;
      }
    }
    if (!Object.keys(mealsByType).length && Array.isArray(mealItems)) {
      let snackToggle = 0;
      for (const m of mealItems) {
        let tipo = m?.tipo || 'Comida';
        if (/^snack$/i.test(tipo) && separateSnacks) {
          tipo = snackToggle % 2 === 0 ? 'Snack_manana' : 'Snack_tarde';
          snackToggle++;
        }
        if (!mealsByType[tipo]) mealsByType[tipo] = [];
        mealsByType[tipo].push(m);
      }
    }
    // Determinar días activos según dias_dieta del perfil (1..7). Si no hay valor válido, usar los 7.
    const allDayNames = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
    const dietDaysCount = (typeof (profile as any)?.dias_dieta === 'number' && (profile as any).dias_dieta >= 1 && (profile as any).dias_dieta <= 7)
      ? (profile as any).dias_dieta
      : 7;
    const dayNames = allDayNames.slice(0, dietDaysCount);
    // Patrón solicitado: L/J (0), M/V (1), Mi/S (2), Domingo distinto (3) solo si llega a Domingo.
    const rotationIndex: Record<string, number> = { Lunes:0, Jueves:0, Martes:1, Viernes:1, Miércoles:2, Sábado:2, Domingo:3 };
    const rotationIndexList = dayNames.map(d => rotationIndex[d] ?? 0);
    const maxRotIndex = rotationIndexList.length ? Math.max(...rotationIndexList) : 0;
    const requiredVariants = Math.min(Math.max(maxRotIndex + 1, 1), 4); // 1..4

    // Normalizar arrays generando variantes sintéticas hasta cubrir requiredVariants.
    Object.keys(mealsByType).forEach(k => {
      const arr = mealsByType[k];
      if (!Array.isArray(arr) || arr.length === 0) { delete mealsByType[k]; return; }
      // Detectar posibles proteínas alternativas del perfil para variar entre variantes.
  let candidateProteins: string[] = [];
  let candidateCarbs: string[] = [];
  let candidateFats: string[] = [];
  let candidateVeggies: string[] = [];
  let candidateFruits: string[] = [];
  let candidateSnacks: string[] = [];
      try {
        const prefRaw = profile?.preferencias_alimentos;
        let pref: any = null;
        if (prefRaw) pref = typeof prefRaw === 'string' ? JSON.parse(prefRaw) : prefRaw;
        // Heurística: recolectar strings en cualquier array anidada.
  const proteinRegex = /atun|atún|salmon|salmón|pollo|pavo|carne|cerdo|res|vacuno|huevo|clara|tofu|lenteja|garbanzo|frijol|soja|soya|tempeh|queso|yogur|caballa|sardina|marisco|camaron|camarón|langostino|tilapia|merluza|bacalao|pechuga|proteina/i;
  const carbRegex = /arroz|pasta|papa|patata|batata|quinoa|avena|pan|tortilla|arepa|cuscus|cuscús|fideo|noodle|yuca|mandioca|maiz|maíz/i;
  const fatRegex = /aguacate|palta|aceite|oliva|mani|maní|almendra|nuez|nueces|pistacho|avellana|mantequilla de mani|mantequilla de maní|cacahuete|semilla|chia|chía|linaza|ajonjoli|sésamo|sesamo|manteca de cacahuete/i;
  const vegRegex = /brocoli|brócoli|espinaca|zanahoria|pepino|lechuga|tomate|berenjena|calabacin|calabacín|pimiento|coliflor|verdura|acelga|apio|repollo|col|remolacha|betabel/i;
  const fruitRegex = /manzana|banana|plátano|platano|pera|fresa|fresas|frutilla|naranja|mandarina|uva|mango|kiwi|papaya|melon|melón|sandia|sandía|arándano|arandano|frambuesa|piña|anana|arándanos/i;
  const snackRegex = /barra|granola|yogur|yogurt|frutos secos|mix|tostada|galleta|cookie|snack|batido|smoothie|chips|tortitas|tortita/i;
        const seen = new Set<string>();
        function collect(o: any) {
          if (!o) return;
            if (Array.isArray(o)) { o.forEach(collect); return; }
            if (typeof o === 'string') {
              const low = o.toLowerCase();
              if (proteinRegex.test(o) && !seen.has('p:'+low)) { seen.add('p:'+low); candidateProteins.push(o); }
              if (carbRegex.test(o) && !seen.has('c:'+low)) { seen.add('c:'+low); candidateCarbs.push(o); }
              if (fatRegex.test(o) && !seen.has('f:'+low)) { seen.add('f:'+low); candidateFats.push(o); }
              if (vegRegex.test(o) && !seen.has('v:'+low)) { seen.add('v:'+low); candidateVeggies.push(o); }
              if (fruitRegex.test(o) && !seen.has('fr:'+low)) { seen.add('fr:'+low); candidateFruits.push(o); }
              if (snackRegex.test(o) && !seen.has('s:'+low)) { seen.add('s:'+low); candidateSnacks.push(o); }
              return;
            }
            if (typeof o === 'object') { Object.values(o).forEach(collect); }
        }
        collect(pref);
      } catch {}
      // También añadir proteínas presentes ya en las comidas base de este tipo.
  const proteinRegex2 = /atun|atún|salmon|salmón|pollo|pavo|carne|cerdo|res|vacuno|huevo|tofu|lenteja|garbanzo|frijol|soja|soya|tempeh|queso|yogur|caballa|sardina|camaron|camarón|langostino|tilapia|merluza|bacalao|pechuga/i;
  const carbRegex2 = /arroz|pasta|papa|patata|batata|quinoa|avena|pan|tortilla|arepa|cuscus|cuscús|fideo|noodle|yuca|mandioca|maiz|maíz/i;
  const fatRegex2 = /aguacate|palta|aceite|oliva|mani|maní|almendra|nuez|nueces|pistacho|avellana|mantequilla de mani|mantequilla de maní|cacahuete|semilla|chia|chía|linaza|ajonjoli|sésamo|sesamo|manteca de cacahuete/i;
  const vegRegex2 = /brocoli|brócoli|espinaca|zanahoria|pepino|lechuga|tomate|berenjena|calabacin|calabacín|pimiento|coliflor|verdura|acelga|apio|repollo|col|remolacha|betabel/i;
  const fruitRegex2 = /manzana|banana|plátano|platano|pera|fresa|fresas|frutilla|naranja|mandarina|uva|mango|kiwi|papaya|melon|melón|sandia|sandía|arándano|arandano|frambuesa|piña|anana|arándanos/i;
  const snackRegex2 = /barra|granola|yogur|yogurt|frutos secos|mix|tostada|galleta|cookie|snack|batido|smoothie|chips|tortitas|tortita/i;
      arr.forEach(m => {
        if (Array.isArray(m?.ingredientes)) {
          for (const ing of m.ingredientes) {
            const nm = (ing?.nombre || ing?.name || '').toString();
            const low = nm.toLowerCase();
            if (proteinRegex2.test(nm) && !candidateProteins.some(p => p.toLowerCase() === low)) candidateProteins.push(nm);
            if (carbRegex2.test(nm) && !candidateCarbs.some(p => p.toLowerCase() === low)) candidateCarbs.push(nm);
            if (fatRegex2.test(nm) && !candidateFats.some(p => p.toLowerCase() === low)) candidateFats.push(nm);
            if (vegRegex2.test(nm) && !candidateVeggies.some(p => p.toLowerCase() === low)) candidateVeggies.push(nm);
            if (fruitRegex2.test(nm) && !candidateFruits.some(p => p.toLowerCase() === low)) candidateFruits.push(nm);
            if (snackRegex2.test(nm) && !candidateSnacks.some(p => p.toLowerCase() === low)) candidateSnacks.push(nm);
          }
        }
      });
      // Limitar a máximo 8 para evitar explosión.
  candidateProteins = candidateProteins.slice(0, 8);
  candidateCarbs = candidateCarbs.slice(0, 8);
  candidateFats = candidateFats.slice(0, 8);
  candidateVeggies = candidateVeggies.slice(0, 12);
  candidateFruits = candidateFruits.slice(0, 8);
  candidateSnacks = candidateSnacks.slice(0, 8);

      function ensureVariants(list: any[], need: number) {
        const baseOriginal = list[0];
        if (!baseOriginal) return;
        // Helper para construir nombre descriptivo basado en ingredientes clave
        function buildNombre(tipoComida: string, ingredientes: any[], variantIndex: number): string {
          const takeMatch = (regex: RegExp) => {
            const ing = ingredientes.find(it => regex.test((it?.nombre || it?.name || '').toString().toLowerCase()));
            if (! ing) return '';
            return (ing.nombre || ing.name).toString();
          };
          const prot = takeMatch(proteinRegex2);
          const carb = takeMatch(carbRegex2);
          const veg  = takeMatch(vegRegex2);
          const fruit = takeMatch(fruitRegex2);
            const fat  = takeMatch(fatRegex2);
          const snk  = /snack/i.test(tipoComida) ? takeMatch(snackRegex2) : '';
          // Plantillas según tipo
          let base = '';
          if (/desayuno/i.test(tipoComida)) {
            base = [prot || fruit || 'Desayuno', carb, fruit && !prot ? fruit : '', fat && !carb ? fat : ''].filter(Boolean).join(' + ');
          } else if (/almuerzo|comida|lunch/i.test(tipoComida)) {
            base = [prot || 'Proteína', carb, veg].filter(Boolean).join(' con ');
          } else if (/cena|dinner/i.test(tipoComida)) {
            base = [prot || 'Proteína', veg || carb, fat && !veg ? fat : ''].filter(Boolean).join(' + ');
          } else if (/snack/i.test(tipoComida)) {
            base = [snk || prot || fruit || 'Snack', fruit && snk !== fruit ? fruit : '', fat && !snk ? fat : ''].filter(Boolean).join(' / ');
          } else {
            base = [prot || 'Comida', carb, veg].filter(Boolean).join(' + ');
          }
          if (!base) base = tipoComida || 'Comida';
          // Asegurar sufijo de variante A,B,C,D... según índice rotación
          const suffix = String.fromCharCode(65 + variantIndex); // 0->A
          return `${base} (${suffix})`;
        }
        // Asegurar que la variante base (índice 0) también tenga nombre descriptivo consistente
        if (Array.isArray(baseOriginal.ingredientes)) {
          baseOriginal.nombre = buildNombre(k, baseOriginal.ingredientes, 0);
        }
        while (list.length < need) {
          const variantIndex = list.length; // 1,2,3...
          const clone = JSON.parse(JSON.stringify(baseOriginal));
          if (!Array.isArray(clone.ingredientes)) clone.ingredientes = [];
          // Reordenar para variar
          if (clone.ingredientes.length > 1) {
            const shift = variantIndex % clone.ingredientes.length;
            clone.ingredientes = [...clone.ingredientes.slice(shift), ...clone.ingredientes.slice(0, shift)];
          }
          function rotateCategory(candidates: string[], regex: RegExp, defaultGrams: number) {
            if (!candidates || candidates.length < 2) return;
            const target = candidates[variantIndex % candidates.length];
            let idx = -1;
            for (let i = 0; i < clone.ingredientes.length; i++) {
              const nm = (clone.ingredientes[i]?.nombre || clone.ingredientes[i]?.name || '').toString();
              if (regex.test(nm)) { idx = i; break; }
            }
            if (idx >= 0) {
              const grams = clone.ingredientes[idx]?.gramos ?? clone.ingredientes[idx]?.g ?? defaultGrams;
              clone.ingredientes[idx].nombre = target;
              if (grams) clone.ingredientes[idx].gramos = grams;
            } else {
              clone.ingredientes.push({ nombre: target, gramos: defaultGrams });
            }
          }
          rotateCategory(candidateProteins, proteinRegex2, 120);
          rotateCategory(candidateCarbs, carbRegex2, 90);
          rotateCategory(candidateVeggies, vegRegex2, 80);
          rotateCategory(candidateFats, fatRegex2, 15);
          rotateCategory(candidateFruits, fruitRegex2, 120);
          if (/snack/i.test(k)) rotateCategory(candidateSnacks, snackRegex2, 30);
          // Crear nombre final único descriptivo
          clone.nombre = buildNombre(k, clone.ingredientes, variantIndex);
          list.push(clone);
        }
      }
      ensureVariants(arr, requiredVariants);
    });

    const dailyProtein = (summary && typeof summary === 'object' && typeof summary.proteinas_g === 'number') ? Math.round(summary.proteinas_g) : null;
  const typeKeys = Object.keys(mealsByType);
    const proteinShare = typeKeys.length ? (1 / typeKeys.length) : 0;

    return dayNames.map(day => {
      const rot = rotationIndex[day] ?? 0;
      const mealsForDay = typeKeys.map(tipo => {
        const variants = mealsByType[tipo];
        const variant = variants[rot % variants.length];
        const nombre = variant?.nombre || variant?.titulo || `${tipo} base`;
        const ings = Array.isArray(variant?.ingredientes) ? variant.ingredientes : [];
        const itemsText = ings.map((ing: any) => {
          const nm = ing?.nombre || ing?.name || 'Ingrediente';
            const g = Number(ing?.gramos ?? ing?.g ?? 0);
            const hm = g > 0 ? householdMeasure(nm, g) : '';
            if (g > 0 && hm) return `${nm} (${g} g • ${hm})`;
            if (g > 0) return `${nm} (${g} g)`;
            return nm;
        });
        return {
          tipo,
          receta: { nombre },
          targetProteinG: dailyProtein ? Math.round(dailyProtein * proteinShare) : null,
          itemsText
        };
      });
      return { day, active: true, meals: mealsForDay };
    });
  }, [mealItems, summary, profile, mealVariants]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Restaurar preferencia Ver más/Ver menos
        try {
          const v = localStorage.getItem("advice_show_full");
          if (v === "1") setShowFullAdvice(true);
        } catch {}
        // Cargar perfil para mostrar resumen de selección (días, proteína, comidas habilitadas)
        try {
          const prof = await fetch("/api/account/profile", { cache: "no-store" });
          if (prof.ok) {
            const pj = await prof.json();
            if (!cancelled) setProfile(pj?.user || null);
          }
        } catch {}

        // Cargar horarios de comidas (si existen)
        try {
          const sRes = await fetch("/api/account/meal-plan/schedule", { cache: "no-store" });
          if (sRes.ok) {
            const sj = await sRes.json().catch(() => ({}));
            const sched = sj?.schedule && typeof sj.schedule === "object" ? sj.schedule : null;
            if (!cancelled) setSchedule(sched);
          }
        } catch {}

        const res = await fetch("/api/account/advice", { method: "POST" });
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            if (!cancelled) router.replace("/auth/login");
            return;
          }
          if (res.status === 400 && json?.step) {
            toast.error(json?.error || "Faltan datos. Serás redirigido.");
            if (!cancelled) router.replace(`/onboarding/${json.step}`);
            return;
          }
          throw new Error(json?.error || "AI error");
        }
        if (!cancelled) {
          setText(json.advice);
          setSummary(json.summary ?? null);
          const items = json.meals?.items;
          setMealItems(Array.isArray(items) && items.length ? items : null);
          const variants = json.meals?.variants;
          setMealVariants(variants && typeof variants === 'object' ? variants : null);
          const litros = json.hydration?.litros;
          setHydrationLiters(typeof litros === "number" && litros > 0 ? litros : null);
        }
      } catch (e) {
        if (!cancelled) setText("No se pudo generar el consejo en este momento.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persistir preferencia de ver más/menos
  useEffect(() => {
    try { localStorage.setItem("advice_show_full", showFullAdvice ? "1" : "0"); } catch {}
  }, [showFullAdvice]);

  // (sin persistencia de ver más/menos; el consejo se muestra completo)

  // Generar plan semanal con lo ya seleccionado (dias_dieta, enabledMeals, proteína)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingWeekly(true);
        const res = await fetch("/api/account/meal-plan/weekly-proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // No enviamos daysSelected para que use usuario.dias_dieta
          body: JSON.stringify({}),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || "No se pudo generar el plan semanal");
        if (!cancelled) {
          setWeekly(j);
          setProposals(Array.isArray(j?.proposals) ? j.proposals : null);
        }
      } catch (e) {
        console.warn("weekly-proposals error", e);
      } finally {
        if (!cancelled) setLoadingWeekly(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Eliminado guardado inmediato del plan inicial. El plan semanal aquí es solo una vista previa.
  // Se evita llamar a /api/account/onboarding/initial-plan hasta finalizar onboarding para que
  // al presionar "Volver" no quede ningún plan parcial persistido.

  async function regenerateLong() {
    try {
      setLoading(true);
      const res = await fetch("/api/account/advice?mode=long", { method: "POST", body: JSON.stringify({ long: true }) });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error || "No se pudo regenerar el consejo");
        return;
      }
      setText(json.advice || "");
      setSummary(json.summary ?? null);
      const items = json.meals?.items;
      setMealItems(Array.isArray(items) && items.length ? items : null);
      const litros = json.hydration?.litros;
      setHydrationLiters(typeof litros === "number" && litros > 0 ? litros : null);
      toast.success("Consejo regenerado (largo)");
    } catch {
      toast.error("Error regenerando el consejo");
    } finally {
      setLoading(false);
    }
  }

  async function next() {
    try {
      // Guardar plan inicial SOLO ahora (al finalizar) usando las comidas generadas por la IA (mealItems)
      if (Array.isArray(mealItems) && mealItems.length) {
        try {
          const res = await fetch("/api/account/onboarding/initial-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: mealItems }),
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) {
            console.warn("No se pudo guardar el plan inicial (finalizar)", await res.text());
            toast.error("No se pudo guardar el plan de comidas");
          }
        } catch (e) {
          console.warn("Error guardando plan inicial al finalizar", e);
          toast.error("Error guardando el plan de comidas");
        }
      }

  // 2) Guardar objetivo de hidratación si vino en la respuesta
      if (typeof hydrationLiters === "number" && hydrationLiters > 0) {
        try {
          const res = await fetch("/api/account/hydration/goal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ litros: hydrationLiters }),
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) console.warn("No se pudo guardar hidratación", await res.text());
        } catch (e) {
          console.warn("Error guardando hidratación", e);
        }
      }

  // 3) Aplicar objetivos de plan (kcal y macros) y guardar el consejo para el usuario
      try {
        const applyBody: any = {};
        if (summary && typeof summary === "object") applyBody.summary = summary;
        if (typeof hydrationLiters === "number" && hydrationLiters > 0) applyBody.agua_litros_obj = hydrationLiters;
        if (text) applyBody.advice = text;
        if (Object.keys(applyBody).length) {
          const applyRes = await fetch("/api/account/plan/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(applyBody),
            credentials: "include",
            cache: "no-store",
          });
          if (!applyRes.ok) console.warn("No se pudieron aplicar objetivos del plan", await applyRes.text());
        }
      } catch (e) {
        console.warn("Error aplicando objetivos del plan", e);
      }

      // 4) Descargar PDF automáticamente antes de finalizar
      try { await downloadPdf(); } catch {}

      const done = await fetch("/api/auth/onboarding/complete", { method: "POST", cache: "no-store", credentials: "include" });
      if (done.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!done.ok) throw new Error();
      toast.success("¡Listo!", { description: "Onboarding completado" });
      // Hard navigation para asegurar que el middleware lea las cookies nuevas
      try {
        document.cookie = `first_login=false; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
        document.cookie = `onboarded=true; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      } catch {}
      // Ir al dashboard
      window.location.replace("/dashboard");
    } catch {
      toast.error("No se pudo finalizar el onboarding");
    }
  }

  async function skip() {
    try {
      const done = await fetch("/api/auth/onboarding/complete", { method: "POST", cache: "no-store", credentials: "include" });
      if (done.status === 401) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        router.replace("/auth/login");
        return;
      }
      if (!done.ok) throw new Error();
      try {
        document.cookie = `first_login=false; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
        document.cookie = `onboarded=true; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      } catch {}
      window.location.replace("/dashboard");
    } catch {
      toast.error("No se pudo finalizar el onboarding");
    }
  }

  async function downloadPdf() {
    try {
      // Cargar jsPDF UMD si no está cargado
      const ensureJsPdf = () => new Promise<void>((resolve, reject) => {
        const w = window as any;
        if (w.jspdf?.jsPDF) return resolve();
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("No se pudo cargar jsPDF"));
        document.head.appendChild(script);
      });
      await ensureJsPdf();
      const jsPDF = (window as any).jspdf?.jsPDF;
      if (!jsPDF) throw new Error("jsPDF no disponible");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const usableWidth = pageWidth - margin * 2;

      // Título
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Consejo personalizado - FitBalance", margin, margin);

      // Fecha
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(new Date().toLocaleString(), margin, margin + 16);

      // Resumen estructurado (si existe)
      let cursorY = margin + 40;
      if (summary) {
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Resumen", margin, cursorY);
        cursorY += 18;
        doc.setFont("helvetica", "normal");
        const rows: Array<[string, string]> = [
          ["TMB", summary.tmb != null ? `${Math.round(summary.tmb)} kcal` : "—"],
          ["TDEE", summary.tdee != null ? `${Math.round(summary.tdee)} kcal` : "—"],
          ["Kcal objetivo", summary.kcal_objetivo != null ? `${Math.round(summary.kcal_objetivo)} kcal` : "—"],
          ["Déficit/Superávit", summary.deficit_superavit_kcal != null ? `${Math.round(summary.deficit_superavit_kcal)} kcal/día` : "—"],
          ["Ritmo estimado", summary.ritmo_peso_kg_sem != null ? `${summary.ritmo_peso_kg_sem.toFixed(2)} kg/sem` : "—"],
          ["Proteínas", summary.proteinas_g != null ? `${Math.round(summary.proteinas_g)} g` : "—"],
          ["Grasas", summary.grasas_g != null ? `${Math.round(summary.grasas_g)} g` : "—"],
          ["Carbohidratos", summary.carbohidratos_g != null ? `${Math.round(summary.carbohidratos_g)} g` : "—"],
        ];
        const leftColWidth = 140;
        const lineHeight = 16;
        rows.forEach(([k, v]) => {
          if (cursorY > pageHeight - margin) {
            doc.addPage();
            cursorY = margin;
          }
          doc.text(k + ":", margin, cursorY);
          doc.text(v, margin + leftColWidth, cursorY);
          cursorY += lineHeight;
        });
        // separador
        cursorY += 8;
        doc.setDrawColor(200);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);
        cursorY += 16;
      }

      // Contenido (texto plano sin markdown)
      doc.setTextColor(0);
      doc.setFontSize(12);
      const content = renderAdviceToPlain(text || "No hay contenido disponible.");
      const lines = doc.splitTextToSize(content, usableWidth);
      const lineHeight = 16;
      lines.forEach((line: string) => {
        if (cursorY > pageHeight - margin) {
          doc.addPage();
          cursorY = margin;
        }
        doc.text(line, margin, cursorY);
        cursorY += lineHeight;
      });

      // Separador antes del plan semanal
      cursorY += 12;
      if (cursorY > pageHeight - margin) { doc.addPage(); cursorY = margin; }
      doc.setDrawColor(200);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 18;

      // Título de plan semanal
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Plan semanal", margin, cursorY);
      cursorY += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      const weeklyPlan = weekly?.weekly;
      if (Array.isArray(weeklyPlan) && weeklyPlan.length) {
        for (const day of weeklyPlan) {
          if (cursorY > pageHeight - margin) { doc.addPage(); cursorY = margin; }
          // Día
          doc.setFont("helvetica", "bold");
          const isFree = !day?.active || !Array.isArray(day?.meals) || day.meals.length === 0;
          const dayTitle = String(day.day || "Día") + (isFree ? " (libre)" : "");
          doc.text(dayTitle, margin, cursorY);
          cursorY += 14;
          doc.setFont("helvetica", "normal");
          // Comidas del día
          const meals = Array.isArray(day.meals) ? day.meals : [];
          if (meals.length === 0) {
            const wrapped = doc.splitTextToSize("Día libre (sin plan de comidas)", usableWidth);
            for (const ln of wrapped) {
              if (cursorY > pageHeight - margin) { doc.addPage(); cursorY = margin; }
              doc.text(ln, margin + 12, cursorY);
              cursorY += 14;
            }
            // Espacio entre días y continuar
            cursorY += 6;
            continue;
          }
          for (const m of meals) {
            const tipo = String(m?.tipo ?? "");
            const nombre = m?.receta?.nombre ? String(m.receta.nombre) : "—";
            const prot = (typeof m?.targetProteinG === 'number' && m.targetProteinG > 0) ? ` • ${m.targetProteinG} g proteína` : "";
            const line = `${tipo}: ${nombre}${prot}`;
            const wrapped = doc.splitTextToSize(line, usableWidth);
            for (const ln of wrapped) {
              if (cursorY > pageHeight - margin) { doc.addPage(); cursorY = margin; }
              doc.text(ln, margin + 12, cursorY);
              cursorY += 14;
            }
            // Items de referencia, si hay
            const items = Array.isArray(m?.itemsText) ? m.itemsText : [];
            for (const it of items) {
              if (cursorY > pageHeight - margin) { doc.addPage(); cursorY = margin; }
              const wrappedIt = doc.splitTextToSize(`- ${it}`, usableWidth - 18);
              for (const wi of wrappedIt) {
                if (cursorY > pageHeight - margin) { doc.addPage(); cursorY = margin; }
                doc.text(wi, margin + 24, cursorY);
                cursorY += 14;
              }
            }
          }
          // Espacio entre días
          cursorY += 6;
        }
      } else {
        const fallback = doc.splitTextToSize("No hay plan semanal disponible.", usableWidth);
        for (const ln of fallback) {
          if (cursorY > pageHeight - margin) { doc.addPage(); cursorY = margin; }
          doc.text(ln, margin, cursorY);
          cursorY += 14;
        }
      }

      doc.save("Consejo-FitBalance.pdf");
    } catch (e) {
      toast.error("No se pudo generar el PDF");
      throw e;
    }
  }

  return (
    <OnboardingLayout>
        <OnboardingHeader title="Consejo personalizado" subtitle="Aquí verás recomendaciones y tu plan semanal sugerido según lo que seleccionaste." />

        {/* Resumen movido a /onboarding/review para evitar redundancia */}
        <OnboardingCard>
          {loading ? (
            <div className="min-h-[200px]">Generando recomendaciones con IA...</div>
          ) : (
            <>
              <div className={`${showFullAdvice ? '' : 'max-h-[360px] overflow-hidden relative'}`}>
                <div
                  className="prose dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderAdviceToHtml(text) }}
                />
                {!showFullAdvice && (
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
                )}
              </div>
              <div className="mt-2 flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    try {
                      const plain = renderAdviceToPlain(text || "");
                      navigator.clipboard?.writeText(plain);
                      toast.success("Consejo copiado al portapapeles");
                    } catch {
                      toast.error("No se pudo copiar");
                    }
                  }}
                >
                  Copiar consejo
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowFullAdvice(v => !v)}>
                  {showFullAdvice ? 'Ver menos' : 'Ver más'}
                </Button>
              </div>
            </>
          )}
        </OnboardingCard>

        {/* Plan semanal sugerido (compacto por días) */}
        <OnboardingCard>
          <div className="font-medium">Plan semanal sugerido (vista previa)</div>
          <div className="text-xs text-muted-foreground">No se guarda todavía; si retrocedes no se persistirá ningún cambio. (Generado en memoria)</div>
          {loading && !ephemeralWeekly ? (
            <div className="text-sm text-muted-foreground mt-2">Generando plan semanal…</div>
          ) : ephemeralWeekly ? (
            <div className="mt-3">
              <WeeklyPlanByDay weekly={ephemeralWeekly} schedule={schedule} />
            </div>
          ) : loadingWeekly ? (
            <div className="text-sm text-muted-foreground mt-2">Generando plan semanal…</div>
          ) : weekly?.weekly ? (
            <div className="mt-3">
              <WeeklyPlanByDay weekly={weekly.weekly} schedule={schedule} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground mt-2">No hay plan semanal para mostrar.</div>
          )}
        </OnboardingCard>

        {/* Propuestas base (3) para rotación */}
        {/* Propuestas base removidas por simplicidad */}
        {/* Preview del plan eliminado por redundancia */}
        {/* Importante: ningún dato (resumen, hidratación, comidas) se persiste mientras el usuario está aquí.
            Solo al presionar "Guardar y terminar" se aplican objetivos, se guarda el consejo y se completa el onboarding. */}
        <OnboardingActions
          back={{ onClick: () => router.push("/onboarding/review"), label: "Volver" }}
          next={{ onClick: next, label: "Guardar y terminar", disabled: loading }}
        />
    </OnboardingLayout>
  );
}

function labelForTipo(t: string) {
  const s = String(t);
  if (/^Snack_manana$/.test(s)) return "Snack mañana";
  if (/^Snack_tarde$/.test(s)) return "Snack tarde";
  return s;
}

