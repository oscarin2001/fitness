"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import OnboardingLayout from "@/components/onboarding/OnboardingLayout";
import OnboardingHeader from "@/components/onboarding/OnboardingHeader";
import OnboardingActions from "@/components/onboarding/OnboardingActions";
import { OnboardingCard } from "@/components/onboarding/OnboardingCard";
import WeeklyPlanByDay from "@/components/WeeklyPlanByDay";
import { useMemo } from "react";
import { Clipboard, Download } from "lucide-react";

function num(n: any): number | null {
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  if (typeof n === 'string') {
    // Extraer primer número (con signo opcional y decimales) de cadenas tipo "2637 kcal/día"
    const m = n.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    if (m) {
      const v = Number(m[0]);
      return Number.isFinite(v) ? v : null;
    }
  }
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function normalizeSummary(raw: any | null, profile?: any | null) {
  if (!raw || typeof raw !== 'object') return null as any;
  const s: any = { ...raw };
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = (s as any)[k];
      const n = num(v);
      if (n != null) return n;
    }
    return null;
  };
  const out: any = {};
  out.tmb = pick('tmb','TMB','TMB_kcal','tmb_kcal');
  out.tdee = pick('tdee','TDEE','tdee_kcal','TDEE_kcal');
  out.kcal_objetivo = pick('kcal_objetivo','kcal','calorias','calorias_objetivo');
  out.deficit_superavit_kcal = pick('deficit_superavit_kcal','deficit_kcal','superavit_kcal','deficit');
  out.ritmo_peso_kg_sem = pick('ritmo_peso_kg_sem','ritmo_kg_sem','rate_kg_week');
  out.proteinas_g = pick('proteinas_g','proteina_g','proteinas','protein_g');
  out.grasas_g = pick('grasas_g','grasas','fat_g','grasas_diarias_g');
  out.carbohidratos_g = pick('carbohidratos_g','carbohidratos','carbs_g','carbohidratos_diarios_g');

  // 1) Completar kcal si hay TDEE y déficit/superávit
  if (out.kcal_objetivo == null && out.tdee != null && out.deficit_superavit_kcal != null) {
    out.kcal_objetivo = Math.round(out.tdee - out.deficit_superavit_kcal);
  }
  // 1b) Completar kcal desde macros si están los 3
  if (out.kcal_objetivo == null && out.proteinas_g != null && out.grasas_g != null && out.carbohidratos_g != null) {
    out.kcal_objetivo = Math.max(0, Math.round(out.proteinas_g * 4 + out.grasas_g * 9 + out.carbohidratos_g * 4));
  }
  // 1c) Completar kcal desde TDEE con heurística por objetivo/velocidad si aún falta
  if (out.kcal_objetivo == null && out.tdee != null) {
    const objetivo = String(profile?.objetivo || '').toLowerCase();
    const vel = String(profile?.velocidad_cambio || '').toLowerCase();
    let delta = 0;
    if (/bajar/.test(objetivo)) {
      // Déficit recomendado
      if (/lento/.test(vel)) delta = -450;
      else if (/medio|moderad/.test(vel)) delta = -500;
      else if (/rápid|rapid/.test(vel)) delta = -700;
      else delta = -500; // por defecto
    } else if (/ganar|muscul|subir/.test(objetivo)) {
      // Superávit recomendado
      if (/lento/.test(vel)) delta = 250;
      else if (/medio|moderad/.test(vel)) delta = 350;
      else if (/rápid|rapid/.test(vel)) delta = 500;
      else delta = 300;
    } else {
      delta = 0; // Mantener
    }
    out.kcal_objetivo = Math.max(0, Math.round(out.tdee + delta));
  }

  // 2) Completar macros faltantes con heurística si ya hay kcal
  if (out.kcal_objetivo != null) {
    if (out.grasas_g == null) out.grasas_g = Math.max(0, Math.round((out.kcal_objetivo * 0.25) / 9));
    if (out.proteinas_g != null && out.carbohidratos_g == null) {
      out.carbohidratos_g = Math.max(0, Math.round((out.kcal_objetivo - (out.proteinas_g * 4) - (out.grasas_g * 9)) / 4));
    }
  }

  // 3) Completar déficit si falta y hay TDEE + kcal objetivo
  if (out.deficit_superavit_kcal == null && out.tdee != null && out.kcal_objetivo != null) {
    out.deficit_superavit_kcal = Math.round(out.tdee - out.kcal_objetivo);
  }

  // 4) Completar ritmo estimado (kg/sem) si hay déficit
  if (out.ritmo_peso_kg_sem == null && out.deficit_superavit_kcal != null) {
    // 7700 kcal ~ 1 kg
    out.ritmo_peso_kg_sem = Number(((out.deficit_superavit_kcal * 7) / 7700) * -1);
  }
  return out;
}

function renderAdviceToHtml(markdown: string): string {
  // 1) Limpieza agresiva: eliminar fences ```...``` (incluye ```json ... ```)
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, "");
  // 2) Quitar cualquier línea que contenga JSON_*, aunque no esté al inicio,
  // títulos o párrafos de hidratación, y recomendaciones directas de agua.
  const noJson = withoutFences
    .split("\n")
    .filter((ln) => !/JSON_(SUMMARY|MEALS|HYDRATION|BEVERAGES)/i.test(ln))
    .filter((ln) => {
      const raw = ln.trim();
      const l = raw.toLowerCase();
      // Encabezados o líneas de hidratación
      if (/^#+\s*hidrataci[oó]n/.test(l)) return false;
      if (/hidrataci[oó]n diaria/.test(l)) return false;
      // Recomendaciones directas de agua
      if (/beber\s+agua/.test(l)) return false;
      if (/bebe\s+agua/.test(l)) return false;
      if (/toma(r)?\s+agua/.test(l)) return false;
      if (/^\s*agua[:\-]/.test(l)) return false;
      // Línea que solo sea la palabra agua
      if (/^agua\.?$/i.test(raw)) return false;
      // Listados de bebidas con ml: eliminar (té, infusiones, gaseosa, mate, café) y cualquier línea con ml de agua
      if (/\b\d{2,4}\s*ml\b/i.test(l)) {
        if (/(agua|te\s|t[eé]\s|t[eé]\b|t[eé]\s|té|infusi[oó]n|cafe|caf[eé]|gaseosa|cola|mate)/i.test(l)) return false;
      }
      return true;
    })
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
  // 1) Eliminar fences ```...``` completos
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, "");
  // 2) Eliminar cualquier línea que contenga JSON_* y referencias directas a hidratación/agua.
  const noJson = withoutFences
    .split("\n")
    .filter((ln) => !/JSON_(SUMMARY|MEALS|HYDRATION|BEVERAGES)/i.test(ln))
    .filter((ln) => {
      const raw = ln.trim();
      const l = raw.toLowerCase();
      if (/^#+\s*hidrataci[oó]n/.test(l)) return false;
      if (/hidrataci[oó]n diaria/.test(l)) return false;
      if (/beber\s+agua/.test(l)) return false;
      if (/bebe\s+agua/.test(l)) return false;
      if (/toma(r)?\s+agua/.test(l)) return false;
      if (/^\s*agua[:\-]/.test(l)) return false;
      if (/^agua\.?$/i.test(raw)) return false;
      if (/\b\d{2,4}\s*ml\b/i.test(l)) {
        if (/(agua|te\s|t[eé]\s|té|infusi[oó]n|cafe|caf[eé]|gaseosa|cola|mate)/i.test(l)) return false;
      }
      return true;
    })
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
  // rawBeverages: respuesta directa de la IA (sin procesar)
  const [rawBeverages, setRawBeverages] = useState<any[] | null>(null);
  // beverages: bebidas finales procesadas (deduplicadas + distribución de "General")
  const [beverages, setBeverages] = useState<any[] | null>(null); // {nombre, ml, momento}
  const [savingMeals, setSavingMeals] = useState(false); // (preview only now; no persist until completion elsewhere)
  const [profile, setProfile] = useState<any | null>(null);
  const [weekly, setWeekly] = useState<any | null>(null);
  const [loadingWeekly, setLoadingWeekly] = useState<boolean>(true);
  // Summary normalizado para uso consistente (PDF, vista semanal, persistencia)
  const normSummary = useMemo(() => normalizeSummary(summary, profile), [summary, profile]);
  const [proposals, setProposals] = useState<any[] | null>(null);
  const [schedule, setSchedule] = useState<Record<string, string> | null>(null);
  const [showBaseProposals, setShowBaseProposals] = useState<boolean>(false);
  const [showFullAdvice, setShowFullAdvice] = useState<boolean>(false);
  // Variantes propuestas por la IA por tipo: { Desayuno: [...], Almuerzo: [...], ... }
  const [mealVariants, setMealVariants] = useState<Record<string, any[]> | null>(null);
  // Progreso sintético y ETA mientras se genera el consejo (sin streaming real todavía)
  const [progress, setProgress] = useState<number>(0); // 0..100
  const [etaSec, setEtaSec] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startRef = useRef<number | null>(null);
  const expectedRef = useRef<number>(20000); // ms estimados
  const intervalRef = useRef<any>(null);
  // Modo estricto activado en onboarding para evitar fallbacks
  const strictMode = true;
  // Construir URL del endpoint con flags + propagación de params de la página
  function buildAdviceUrl() {
    try {
      const url = new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost');
      const base = new URL('/api/account/advice', url.origin);
      // Propagar params existentes útiles
      const params = new URLSearchParams(url.search);
      // Opción A: no forzar long/ensureFull y desactivar strict para usar el modelo flash
      params.set('strict', '0');
      params.delete('forceLong');
      params.delete('ensureFull');
      base.search = params.toString();
      return base.pathname + (base.search ? base.search : '');
    } catch {
      return '/api/account/advice';
    }
  }
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

    // Normalización: asegurar que los tipos requeridos por enabledMeals existan como buckets
    const requiredTypes: string[] = [];
    if (enabledMeals?.desayuno) requiredTypes.push('Desayuno');
    if (enabledMeals?.almuerzo) requiredTypes.push('Almuerzo');
    if (enabledMeals?.cena) requiredTypes.push('Cena');
    const wantsSnackManana = Boolean(enabledMeals?.snack_manana || enabledMeals?.['snack_mañana']);
    const wantsSnackTarde  = Boolean(enabledMeals?.snack_tarde);
    if (wantsSnackManana && wantsSnackTarde) {
      requiredTypes.push('Snack_manana','Snack_tarde');
    } else if (wantsSnackManana || wantsSnackTarde) {
      requiredTypes.push('Snack');
    }

    // Si el usuario quiere dos snacks separados pero solo hay 'Snack' genérico, clonar para crear ambos buckets
    if (wantsSnackManana && wantsSnackTarde) {
      const genericSnack = mealsByType['Snack'] || [];
      if (!mealsByType['Snack_manana'] && (mealsByType['Snack_tarde'] || genericSnack.length)) {
        mealsByType['Snack_manana'] = (mealsByType['Snack_tarde'] && mealsByType['Snack_tarde'].length)
          ? JSON.parse(JSON.stringify(mealsByType['Snack_tarde']))
          : JSON.parse(JSON.stringify(genericSnack));
      }
      if (!mealsByType['Snack_tarde'] && (mealsByType['Snack_manana'] || genericSnack.length)) {
        mealsByType['Snack_tarde'] = (mealsByType['Snack_manana'] && mealsByType['Snack_manana'].length)
          ? JSON.parse(JSON.stringify(mealsByType['Snack_manana']))
          : JSON.parse(JSON.stringify(genericSnack));
      }
    }

    // Asegurar que todos los requiredTypes existan; si falta alguno, clonar del más parecido
    for (const t of requiredTypes) {
      if (!mealsByType[t] || !mealsByType[t].length) {
        if (/Snack/.test(t)) {
          const src = mealsByType['Snack'] || mealsByType['Snack_manana'] || mealsByType['Snack_tarde'] || [];
          if (src.length) mealsByType[t] = JSON.parse(JSON.stringify(src));
        } else {
          // Para comidas principales, clonar de otro principal si existe
          const src = mealsByType['Almuerzo'] || mealsByType['Cena'] || mealsByType['Desayuno'] || [];
          if (src.length) mealsByType[t] = JSON.parse(JSON.stringify(src));
        }
        if (!mealsByType[t]) mealsByType[t] = [];
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

    const dailyProtein = (normSummary && typeof normSummary === 'object' && typeof normSummary.proteinas_g === 'number') ? Math.round(normSummary.proteinas_g) : null;
    const typeKeys = Object.keys(mealsByType);
    // Orden sugerido por horario si existe; si no, orden lógico
    const baseOrder = ['Desayuno','Snack_manana','Snack','Almuerzo','Snack_tarde','Cena'];
    const scheduleOrder = schedule ? (Object.keys(schedule) as string[]) : baseOrder;
    const typeKeysSorted = typeKeys.slice().sort((a,b) => {
      const ia = scheduleOrder.indexOf(a) === -1 ? 999 : scheduleOrder.indexOf(a);
      const ib = scheduleOrder.indexOf(b) === -1 ? 999 : scheduleOrder.indexOf(b);
      return ia - ib;
    });
    const proteinShare = typeKeysSorted.length ? (1 / typeKeysSorted.length) : 0;

    return dayNames.map(day => {
      const rot = rotationIndex[day] ?? 0;
      const mealsForDay = typeKeysSorted.map(tipo => {
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
  }, [mealItems, normSummary, profile, mealVariants]);

  // Lanzar fetch inicial del consejo con progreso sintético
  useEffect(() => {
    let cancelled = false;

    // Inicializar progreso y loading inmediatamente al montar (antes de cualquier fetch)
    setError(null);
    setLoading(true);
    setLoadingWeekly(true);
    startRef.current = performance.now();
    const base = 14000;
    const extra = Math.random() * 12000; // 0-12s
    expectedRef.current = base + extra;
    setProgress(3);
    setEtaSec(Math.round(expectedRef.current / 1000));

    async function loadProfileAndSchedule() {
      // Restaurar preferencia Ver más/Ver menos
      try {
        const v = localStorage.getItem("advice_show_full");
        if (v === "1") setShowFullAdvice(true);
      } catch {}
      // Perfil
      try {
        const prof = await fetch("/api/account/profile", { cache: "no-store" });
        if (prof.ok) {
          const pj = await prof.json();
            if (!cancelled) setProfile(pj?.user || null);
        }
      } catch {}
      // Horarios
      try {
        const sRes = await fetch("/api/account/meal-plan/schedule", { cache: "no-store" });
        if (sRes.ok) {
          const sj = await sRes.json().catch(() => ({}));
          const sched = sj?.schedule && typeof sj.schedule === "object" ? sj.schedule : null;
          if (!cancelled) setSchedule(sched);
        }
      } catch {}
    }

    async function fetchAdvice() {
      setError(null);
      try {
        const res = await fetch(buildAdviceUrl(), { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (res.status === 422) {
          // Modo estricto: salida incompleta -> mostrar error claro
          setError(json?.error || 'La IA no devolvió todos los bloques requeridos. Intenta nuevamente.');
          setLoading(false);
          setProgress(100);
          setEtaSec(0);
          return;
        }
        // Caso: generación todavía en curso (202 started/pending desde prefetch)
        if (res.status === 202 && (json?.started || json?.pending)) {
          // Polling hasta 60s
            const pollStart = performance.now();
            async function poll() {
              if (cancelled) return;
              try {
                const r2 = await fetch(buildAdviceUrl(), { method: "POST" });
                const j2 = await r2.json().catch(() => ({}));
                if (r2.ok && !j2.started && !j2.pending) {
                  // completado
                  if (!cancelled) {
                    if (strictMode && j2.fallback) {
                      setError('El modelo devolvió fallback y el modo estricto está activado. Intenta nuevamente.');
                      setLoading(false);
                      setProgress(100);
                      setEtaSec(0);
                      return;
                    }
                    setText(j2.advice || "");
                    setSummary(j2.summary ?? null);
                    const items = j2.meals?.items;
                    setMealItems(Array.isArray(items) && items.length ? items : null);
                    const variants = j2.meals?.variants;
                    setMealVariants(variants && typeof variants === 'object' ? variants : null);
                    const litros = j2.hydration?.litros;
                    setHydrationLiters(typeof litros === "number" && litros > 0 ? litros : null);
                    const bevs = j2.beverages?.items;
                    setRawBeverages(Array.isArray(bevs) && bevs.length ? bevs : null);
                    setLoading(false);
                    setProgress(100);
                    setEtaSec(0);
                  }
                  return;
                }
                if (performance.now() - pollStart > 60000) {
                  if (!cancelled) {
                    setError('La generación está tardando demasiado. Puedes reintentar.');
                    setLoading(false);
                    setEtaSec(0);
                  }
                  return;
                }
              } catch {}
              if (!cancelled) setTimeout(poll, 2000);
            }
            poll();
            return; // salimos para que el flujo normal no se ejecute aún
        }
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
          if (strictMode && json.fallback) {
            setError('El modelo devolvió fallback y el modo estricto está activado. Intenta nuevamente.');
            setLoading(false);
            setProgress(100);
            setEtaSec(0);
            return;
          }
          setText(json.advice || "");
          setSummary(json.summary ?? null);
          const items = json.meals?.items;
          setMealItems(Array.isArray(items) && items.length ? items : null);
          const variants = json.meals?.variants;
          setMealVariants(variants && typeof variants === 'object' ? variants : null);
          const litros = json.hydration?.litros;
          setHydrationLiters(typeof litros === "number" && litros > 0 ? litros : null);
          const bevs = json.beverages?.items;
          setRawBeverages(Array.isArray(bevs) && bevs.length ? bevs : null);
          if (json.cached) {
            // Ajustar progreso instantáneo para cache
            setProgress(100);
            setEtaSec(0);
          } else if (typeof json.took_ms === 'number') {
            try { localStorage.setItem('advice_last_ms', String(json.took_ms)); } catch {}
          }
        }
      } catch (e:any) {
        if (!cancelled) {
          setError(e?.message || 'No se pudo generar el consejo');
          setText("No se pudo generar el consejo en este momento.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          // completar progreso a 100 de forma suave
          setProgress(p => p < 100 ? 100 : p);
          setEtaSec(0);
        }
      }
    }

    // Ejecutar en paralelo: no esperes a perfil/schedule para comenzar IA
    Promise.allSettled([loadProfileAndSchedule(), fetchAdvice()]);

    return () => { cancelled = true; };
  }, []);

  // Intervalo de actualización del progreso sintético
  useEffect(() => {
    if (loading) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (!startRef.current) return;
        const now = performance.now();
        const elapsed = now - startRef.current;
        const expected = expectedRef.current || 20000;
        // Curva por tramos: 0-3s -> hasta 40%; 3-8s -> 40-70%; 8s- (expected*0.9) -> 70-93%; resto se frena en 96%.
        let target = 0;
        if (elapsed < 3000) {
          target = (elapsed / 3000) * 40;
        } else if (elapsed < 8000) {
          target = 40 + ((elapsed - 3000) / 5000) * 30; // 40-70
        } else if (elapsed < expected * 0.9) {
          const span = expected * 0.9 - 8000;
          target = 70 + ((elapsed - 8000) / span) * 23; // 70-93
        } else {
          target = 96; // se detiene aquí hasta completar
        }
        setProgress(p => {
          const next = Math.min(loading ? target : 100, 100);
            return next > p ? next : p; // monotónico
        });
        const remainingMs = Math.max(0, expected - elapsed);
        setEtaSec(remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0);
      }, 500);
      return () => { clearInterval(intervalRef.current); };
    } else {
      // Loading terminó -> limpiar
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Ocultar barra después de breve delay (mantener 100% por feedback)
      const timeout = setTimeout(() => {
        setEtaSec(null);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [loading]);

  function retryAdvice() {
    // Reinicia la lógica de fetch usando el mismo efecto anterior: simplemente replicamos fetchAdvice
    setError(null);
    setText("");
    setMealItems(null);
    setMealVariants(null);
    setHydrationLiters(null);
    setRawBeverages(null);
    // re-disparar usando lógica separada: reusar código -> simple fetch inline
    (async () => {
      setLoading(true);
      startRef.current = performance.now();
      expectedRef.current = 14000 + Math.random() * 12000;
      setProgress(3);
      setEtaSec(Math.round(expectedRef.current / 1000));
      try {
        const res = await fetch(buildAdviceUrl(), { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (res.status === 422) throw new Error(json?.error || 'Salida incompleta (modo estricto)');
        if (!res.ok) throw new Error(json?.error || 'AI error');
        if (strictMode && json.fallback) throw new Error('El modelo devolvió fallback (modo estricto)');
        setText(json.advice || "");
        setSummary(json.summary ?? null);
        const items = json.meals?.items;
        setMealItems(Array.isArray(items) && items.length ? items : null);
        const variants = json.meals?.variants;
        setMealVariants(variants && typeof variants === 'object' ? variants : null);
        const litros = json.hydration?.litros;
        setHydrationLiters(typeof litros === "number" && litros > 0 ? litros : null);
        const bevs = json.beverages?.items;
        setRawBeverages(Array.isArray(bevs) && bevs.length ? bevs : null);
      } catch(e:any) {
        setError(e?.message || 'No se pudo generar el consejo');
        setText("No se pudo generar el consejo en este momento.");
      } finally {
        setLoading(false);
        setProgress(100);
        setEtaSec(0);
      }
    })();
  }

  // Procesamiento de bebidas: deduplicar (mismo nombre + momento) sumando ml y limitando a 250; distribuir las de momento "General".
  useEffect(() => {
    if (!rawBeverages || !Array.isArray(rawBeverages) || rawBeverages.length === 0) {
      setBeverages(null);
      return;
    }

    // Normalizar claves (sin tildes, minúsculas, trim)
    const norm = (s: string) => s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();

    // Detectar comidas habilitadas para ordenar momentos
    let enabledMeals: any = null;
    try {
      const rawPref = profile?.preferencias_alimentos;
      const pref = rawPref ? (typeof rawPref === 'string' ? JSON.parse(rawPref) : rawPref) : null;
      enabledMeals = pref?.enabledMeals || null;
    } catch {}
    const snackManana = enabledMeals?.snack_manana || enabledMeals?.["snack_mañana"] || false;
    const snackTarde = enabledMeals?.snack_tarde || false;

    // Orden base de momentos
    const baseOrder: string[] = ['Desayuno'];
    if (snackManana) baseOrder.push('Snack mañana');
    baseOrder.push('Almuerzo');
    if (snackTarde) baseOrder.push('Snack tarde');
    baseOrder.push('Cena');

    // Si hay schedule, usar sus claves para priorizar el orden real horario
    let scheduleOrder: string[] = [];
    if (schedule && typeof schedule === 'object') {
      scheduleOrder = Object.keys(schedule)
        .filter(k => typeof schedule[k] === 'string')
        .sort((a,b) => {
          const ta = (schedule as any)[a];
          const tb = (schedule as any)[b];
          return String(ta).localeCompare(String(tb));
        });
    }
    const momentOrder = scheduleOrder.length ? scheduleOrder : baseOrder;

    // 1) Clonar y normalizar entradas iniciales
    const cloned = rawBeverages.map(b => ({
        nombre: (b?.nombre || b?.name || 'Bebida').toString().trim(),
        ml: Math.min(250, Math.max(0, Number(b?.ml) || 0)),
        momento: (b?.momento || b?.moment || '').toString().trim()
      }))
      // Filtrar agua directa (no mostrarla ni contabilizarla)
      .filter(b => b.ml > 0 && !/^agua(\b|\s|$)/i.test(b.nombre));

    // 2) Separar las generales
    const general: any[] = [];
    const withMoment: any[] = [];
    cloned.forEach(b => {
      if (!b.momento || /^general$/i.test(b.momento)) general.push(b); else withMoment.push(b);
    });

    // 3) Distribuir bebidas "General" cíclicamente entre los momentos conocidos
    if (general.length && momentOrder.length) {
      general.forEach((b, idx) => {
        b.momento = momentOrder[idx % momentOrder.length];
      });
    }

    // 4) Unir listas
    const all = [...withMoment, ...general];

    // 5) Deduplicar (nombre + momento) sumando ml y limitando a 250 ml totales
    const map = new Map<string, { nombre: string; momento: string; ml: number }>();
    for (const b of all) {
      const key = norm(b.nombre) + '|' + norm(b.momento || 'General');
      const prev = map.get(key);
      if (prev) {
        prev.ml = Math.min(250, prev.ml + b.ml);
      } else {
        map.set(key, { nombre: b.nombre, momento: b.momento || 'General', ml: Math.min(250, b.ml) });
      }
    }

    // 6) Ordenar por orden de momentos y luego por nombre
    const orderIndex = (m: string) => {
      const i = momentOrder.findIndex(o => o.toLowerCase() === m.toLowerCase());
      return i === -1 ? 999 : i;
    };
    let finalList = Array.from(map.values()).sort((a,b) => {
      const om = orderIndex(a.momento) - orderIndex(b.momento);
      if (om !== 0) return om;
      return a.nombre.localeCompare(b.nombre, 'es');
    });

    // Limitar a máximo 2 bebidas totales (2 tipos/momentos) según nueva regla
    if (finalList.length > 2) {
      const picked = [];
      const momentsSeen = new Set();
      for (const b of finalList) {
        const mKey = b.momento.toLowerCase();
        if (momentsSeen.has(mKey)) continue;
        picked.push(b);
        momentsSeen.add(mKey);
        if (picked.length === 2) break;
      }
      finalList = picked;
    }

    setBeverages(finalList.length ? finalList : null);
  }, [rawBeverages, schedule, profile]);

  // Persistir preferencia de ver más/menos
  useEffect(() => {
    try { localStorage.setItem("advice_show_full", showFullAdvice ? "1" : "0"); } catch {}
  }, [showFullAdvice]);

  // (sin persistencia de ver más/menos; el consejo se muestra completo)

  // Generar plan semanal desde las comidas generadas por IA
  useEffect(() => {
    if (!mealItems || !Array.isArray(mealItems) || mealItems.length === 0) {
      setWeekly(null);
      setLoadingWeekly(false);
      return;
    }

    // Crear plan semanal variado basado en las comidas generadas por IA
    const createWeeklyPlan = () => {
      const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const enabledMeals = profile?.preferencias_alimentos?.enabledMeals;
      const mealTypes: string[] = [];

      if (enabledMeals?.desayuno) mealTypes.push('Desayuno');
      if (enabledMeals?.almuerzo) mealTypes.push('Almuerzo');
      if (enabledMeals?.cena) mealTypes.push('Cena');
      if (enabledMeals?.snack_manana || enabledMeals?.snack_mañana) mealTypes.push('Snack_manana');
      if (enabledMeals?.snack_tarde) mealTypes.push('Snack_tarde');

      if (mealTypes.length === 0) {
        mealTypes.push('Desayuno', 'Almuerzo', 'Cena', 'Snack');
      }

      // Organizar comidas por tipo
      const mealsByType: Record<string, any[]> = {};
      mealItems.forEach(meal => {
        const tipo = meal.tipo || 'Snack';
        if (!mealsByType[tipo]) mealsByType[tipo] = [];
        mealsByType[tipo].push(meal);
      });

      // Crear rotación semanal para cada tipo de comida
      const weekly = days.map((day, dayIndex) => {
        const meals = mealTypes.map((tipo, typeIndex) => {
          const availableMeals = mealsByType[tipo] || [];
          if (availableMeals.length === 0) {
            return {
              tipo,
              receta: { nombre: `${tipo} básico` },
              targetProteinG: summary?.proteinas_g ? Math.round(summary.proteinas_g / mealTypes.length) : null,
              itemsText: [`Comida ${tipo.toLowerCase()} no disponible`]
            };
          }

          // Rotar comidas para variar entre días
          const mealIndex = (dayIndex + typeIndex) % availableMeals.length;
          const selectedMeal = availableMeals[mealIndex];

          return {
            tipo,
            receta: { nombre: selectedMeal.nombre || `${tipo} personalizado` },
            targetProteinG: summary?.proteinas_g ? Math.round(summary.proteinas_g / mealTypes.length) : null,
            itemsText: selectedMeal.ingredientes?.map((ing: any) => {
              const nombre = ing.nombre || ing.name || 'Ingrediente';
              const gramos = ing.gramos || ing.g || 0;
              if (gramos > 0) {
                return `${nombre} (${gramos} g)`;
              }
              return nombre;
            }) || []
          };
        });

        return {
          day,
          active: true,
          objectiveLabel: profile?.objetivo === 'Bajar_grasa' ? 'Bajar de peso' :
                         profile?.objetivo === 'Ganar_musculo' ? 'Subir masa muscular' :
                         profile?.objetivo ? 'Mantener peso' : 'Objetivo',
          proteinDailyTarget: summary?.proteinas_g || null,
          meals
        };
      });

      return weekly;
    };

    setWeekly({ weekly: createWeeklyPlan() });
    setLoadingWeekly(false);
  }, [mealItems, summary, profile]);

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
      // Bloquear si no hay plan generado aún
      if (!ephemeralWeekly && !(weekly?.weekly && Array.isArray(weekly.weekly) && weekly.weekly.length)) {
        toast.error("Primero genera el plan semanal (espera a que termine la IA)");
        return;
      }
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

      // 2b) Guardar plan de bebidas (cada bebida <=250ml, no confundir con hidratación total)
      if (Array.isArray(beverages) && beverages.length) {
        try {
          const res = await fetch("/api/account/beverages-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: beverages.map(b => ({ nombre: b.nombre, ml: b.ml, momento: b.momento })) }),
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) console.warn("No se pudo guardar plan de bebidas", await res.text());
        } catch (e) {
          console.warn("Error guardando plan de bebidas", e);
        }
      }

  // 3) Aplicar objetivos de plan (kcal y macros) y guardar el consejo para el usuario
      try {
        const applyBody: any = {};
        if (summary && typeof summary === "object") {
          // Usar summary normalizado para asegurar campos completos
          const s: any = normalizeSummary(summary, profile) || { ...summary };
          // Si aun faltara kcal, intentar una estimación mínima desde TDEE/deficit o macros
          let kcal = Number(s.kcal_objetivo);
          const prot = Number(s.proteinas_g) || null;
          if (!Number.isFinite(kcal)) {
            const tdee = Number(s.tdee);
            const def = Number(s.deficit_superavit_kcal);
            if (Number.isFinite(tdee) && Number.isFinite(def)) kcal = Math.round(tdee - def);
            if (!Number.isFinite(kcal) && Number.isFinite(Number(s.grasas_g)) && Number.isFinite(Number(s.carbohidratos_g)) && prot != null) {
              kcal = Math.round(prot * 4 + Number(s.grasas_g) * 9 + Number(s.carbohidratos_g) * 4);
            }
            if (Number.isFinite(kcal)) s.kcal_objetivo = kcal;
          }
          // Completar grasas/carbos si faltan con kcal
          if (Number.isFinite(Number(s.kcal_objetivo)) && (!Number.isFinite(Number(s.grasas_g)) || Number(s.grasas_g) <= 0)) {
            s.grasas_g = Math.max(0, Math.round((Number(s.kcal_objetivo) * 0.25) / 9));
          }
          if (Number.isFinite(Number(s.kcal_objetivo)) && prot && (!Number.isFinite(Number(s.carbohidratos_g)) || Number(s.carbohidratos_g) <= 0)) {
            const carbs = Math.round((Number(s.kcal_objetivo) - (prot * 4) - (Number(s.grasas_g) * 9)) / 4);
            s.carbohidratos_g = Math.max(0, carbs);
          }
          applyBody.summary = s;
        }
        if (typeof hydrationLiters === "number" && hydrationLiters > 0) applyBody.agua_litros_obj = hydrationLiters;
        if (text) applyBody.advice = text;
        // Persistir bebidas/infusiones si existen
        if (Array.isArray(beverages) && beverages.length) {
          applyBody.beverages = beverages.map(b => ({
            nombre: (b?.nombre || b?.name || 'Bebida').toString().trim(),
            ml: Math.min(250, Math.max(0, Number(b?.ml) || 0)),
            momento: (b?.momento || 'General').toString()
          }));
        }
        // Persistir plan semanal final (usamos la vista previa efímera si existe; si no, el weekly persistido)
        const finalWeekly = Array.isArray(ephemeralWeekly) ? ephemeralWeekly : (Array.isArray(weekly?.weekly) ? weekly.weekly : null);
        if (finalWeekly) applyBody.weekly = finalWeekly;
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
        const s: any = normSummary || summary;
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Resumen", margin, cursorY);
        cursorY += 18;
        doc.setFont("helvetica", "normal");
        const rows: Array<[string, string]> = [
          ["TMB", s?.tmb != null ? `${Math.round(s.tmb)} kcal` : "—"],
          ["TDEE", s?.tdee != null ? `${Math.round(s.tdee)} kcal` : "—"],
          ["Kcal objetivo", s?.kcal_objetivo != null ? `${Math.round(s.kcal_objetivo)} kcal` : "—"],
          ["Déficit/Superávit", s?.deficit_superavit_kcal != null ? `${Math.round(s.deficit_superavit_kcal)} kcal/día` : "—"],
          ["Ritmo estimado", s?.ritmo_peso_kg_sem != null ? `${Number(s.ritmo_peso_kg_sem).toFixed(2)} kg/sem` : "—"],
          ["Proteínas", s?.proteinas_g != null ? `${Math.round(s.proteinas_g)} g` : "—"],
          ["Grasas", s?.grasas_g != null ? `${Math.round(s.grasas_g)} g` : "—"],
          ["Carbohidratos", s?.carbohidratos_g != null ? `${Math.round(s.carbohidratos_g)} g` : "—"],
          // Objetivo de agua (separado de bebidas) si hydrationLiters está presente
          ["Agua (objetivo)", (typeof hydrationLiters === 'number' && hydrationLiters > 0) ? `${hydrationLiters.toFixed(2)} L` : "—"],
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

      // Se elimina sección de bebidas del PDF según nueva política (no listar hidratación ni agua)

      doc.save("Consejo-FitBalance.pdf");
    } catch (e) {
      toast.error("No se pudo generar el PDF");
      throw e;
    }
  }

  return (
    <OnboardingLayout>
        <OnboardingHeader title="Consejo personalizado" subtitle="Aquí verás recomendaciones y tu plan semanal sugerido según lo que seleccionaste." />
        {typeof hydrationLiters === 'number' && hydrationLiters > 0 && (
          <div className="mb-4 text-xs text-muted-foreground">
            Agua (objetivo diario): <span className="font-medium text-foreground">{hydrationLiters.toFixed(2)} L</span>
          </div>
        )}

        {/* Resumen movido a /onboarding/review para evitar redundancia */}
        <OnboardingCard>
          {loading ? (
            <div className="min-h-[200px] flex flex-col gap-3">
              <div>Generando recomendaciones con IA...</div>
              <div className="w-full h-3 rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, progress).toFixed(1)}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>{Math.round(progress)}%</span>
                {etaSec != null && etaSec > 0 && <span>~{etaSec}s restantes</span>}
                {etaSec === 0 && <span>Procesando…</span>}
              </div>
              {error && (
                <div className="text-xs text-destructive">{error}</div>
              )}
              {error && (
                <div>
                  <Button variant="outline" size="sm" onClick={retryAdvice}>Reintentar</Button>
                </div>
              )}
            </div>
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
              <div className="mt-2 flex gap-1 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    try {
                      const plain = renderAdviceToPlain(text || "");
                      navigator.clipboard?.writeText(plain);
                      toast.success("Consejo copiado al portapapeles");
                    } catch {
                      toast.error("No se pudo copiar");
                    }
                  }}
                  aria-label="Copiar consejo"
                  title="Copiar consejo"
                >
                  <Clipboard className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    downloadPdf().catch(() => toast.error("No se pudo descargar el PDF"));
                  }}
                  aria-label="Descargar PDF"
                  title="Descargar PDF"
                >
                  <Download className="w-4 h-4" />
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
            <div className="w-full mt-3">
              <div className="text-sm mb-2 text-muted-foreground flex items-center justify-between">
                <span>Generando plan semanal…</span>
                {progress < 100 && <span className="text-[10px]">{Math.round(Math.min(progress, 96))}%</span>}
              </div>
              <div className="h-2 w-full rounded bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.min(progress, 96).toFixed(1)}%` }} />
              </div>
            </div>
          ) : ephemeralWeekly ? (
            <div className="mt-3">
              <WeeklyPlanByDay weekly={ephemeralWeekly} schedule={schedule} beverages={beverages} />
            </div>
          ) : loadingWeekly ? (
            <div className="text-sm text-muted-foreground mt-2">Generando plan semanal…</div>
          ) : weekly?.weekly ? (
            <div className="mt-3">
              <WeeklyPlanByDay weekly={weekly.weekly} schedule={schedule} beverages={beverages} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground mt-2">No hay plan semanal para mostrar.</div>
          )}
        </OnboardingCard>

        {/* Tarjeta de plan de bebidas eliminada según solicitud. */}

        {/* Propuestas base (3) para rotación */}
        {/* Propuestas base removidas por simplicidad */}
        {/* Preview del plan eliminado por redundancia */}
        {/* Importante: ningún dato (resumen, hidratación, comidas) se persiste mientras el usuario está aquí.
            Solo al presionar "Guardar y terminar" se aplican objetivos, se guarda el consejo y se completa el onboarding. */}
        <OnboardingActions
          back={{ onClick: () => router.push("/onboarding/review"), label: "Volver" }}
          next={{ onClick: next, label: "Guardar y terminar", disabled: loading || (!ephemeralWeekly && !(weekly?.weekly && Array.isArray(weekly.weekly) && weekly.weekly.length)) }}
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

