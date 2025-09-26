import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

function getCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

function ensureGlobalStaples(categories) {
  try {
    const must = ["Pan integral", "Galletas integrales", "Galletas"];
    const exists = (arr, val) => arr.some((x) => (x || "").toLowerCase() === val.toLowerCase());
    for (const m of must) {
      if (!exists(categories.Carbohidratos, m)) categories.Carbohidratos.push(m);
    }
  } catch {}
}

function ensureGlobalProteinCuts(categories) {
  try {
    const cuts = [
      "Pechuga de pollo",
      "Muslo de pollo",
      "Pierna de pollo",
      "Alitas de pollo",
      "Filete de pollo",
      "Pechuga de pavo",
      "Filete de pescado",
      "Lomo de pescado",
      "Filete de res",
      "Lomo de res",
      "Bife",
      "Chuleta de cerdo",
      "Lomo de cerdo",
      "Costilla de cerdo",
      "Atún en agua",
    ];
    const exists = (arr, val) => arr.some((x) => (x || "").toLowerCase() === val.toLowerCase());
    for (const c of cuts) {
      if (!exists(categories.Proteinas, c)) categories.Proteinas.push(c);
    }
  } catch {}
}

function ensureGlobalProteins(categories) {
  try {
    // Mantener orden original del país. Solo ordenar alfabéticamente los añadidos globales.
    const baseOriginal = categories.Proteinas ? categories.Proteinas.slice() : [];
    const proteins = [
      // Carnes blancas
      "Pechuga de pollo sin piel", "Pollo desmenuzado", "Pavo molido", "Pavo en fetas",
      "Pechuga de pavo ahumada", "Codorniz", "Pato", "Conejo", "Pescado blanco fileteado",
      "Merluza", "Corvina", "Lenguado", "Trucha", "Salmón fresco", "Atún fresco",
      "Camarones pelados", "Langostinos", "Calamar", "Pulpo", "Mejillones", "Almejas",
      "Vieiras", "Cangrejo", "Centolla", "Erizo de mar", "Tilapia", "Róbalo",
      
      // Carnes rojas magras
      "Lomo fino", "Bistec de res magro", "Carne molida extra magra (5% grasa)",
      "Filete de ternera", "Solomillo de cerdo", "Lomo de cerdo magro",
      "Chuleta de cerdo sin grasa", "Costilla de cerdo magra", "Hígado de res",
      "Riñón", "Corazón", "Mollejas", "Lengua", "Cecina", "Carne seca",
      
      // Embutidos magros
      "Jamón de pavo bajo en sodio", "Pechuga de pavo ahumada", "Jamón cocido extra magro",
      "Cecina de res", "Bresaola", "Lonjas de lomito", "Salchicha de pollo casera",
      
      // Lácteos y huevos
      "Clara de huevo", "Huevo entero", "Huevo duro", "Revuelto de claras",
      "Requesón bajo en grasa", "Queso cottage bajo en grasa", "Queso panela",
      "Queso fresco desmenuzado", "Queso ricotta light", "Yogur griego sin azúcar",
      "Kéfir natural", "Leche descremada en polvo",
      
      // Proteínas vegetales
      "Tofu firme", "Tofu sedoso", "Tempeh", "Seitán", "Proteína de soya texturizada",
      "Hamburguesa vegetal casera", "Albóndigas de lentejas", "Falafel al horno",
      "Hummus casero", "Edamame", "Miso", "Natto", "Levadura nutricional",
      
      // Legumbres y derivados
      "Garbanzos cocidos", "Lentejas cocidas", "Frijoles negros cocidos",
      "Frijoles rojos cocidos", "Haba cocida", "Arvejas partidas", "Guisantes",
      "Altramuces", "Cacahuates tostados sin sal", "Mantequilla de maní natural",
      "Mantequilla de almendras", "Tahini", "Harina de garbanzo", "Harina de almendra",
      
      // Semillas y frutos secos
      "Almendras", "Nueces", "Nueces de la India", "Avellanas", "Pistachos sin sal",
      "Semillas de calabaza", "Semillas de girasol", "Semillas de chía", "Semillas de cáñamo",
      "Semillas de lino molidas", "Castañas", "Pecanas", "Macadamias", "Piñones",
      
      // Pescados enlatados
      "Atún al agua escurrido", "Sardinas en agua", "Salmón enlatado", "Caballa enlatada",
      "Anchoas enlatadas", "Mejillones enlatados al natural"
    ];
    
    const exists = (arr, val) => arr.some((x) => (x || "").toLowerCase() === val.toLowerCase());
    
    if (!categories.Proteinas) categories.Proteinas = [];

    const added = [];
    for (const prot of proteins) {
      if (!exists(categories.Proteinas, prot)) {
        added.push(prot);
      }
    }
    added.sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
    categories.Proteinas = [...baseOriginal, ...added.filter(p=>!baseOriginal.some(o=>o.toLowerCase()===p.toLowerCase()))];
    
  } catch (error) {
    console.error("Error asegurando proteínas globales:", error);
  }
}

function ensureGlobalBeverages(categories) {
  try {
    const baseOriginal = categories.BebidasInfusiones ? categories.BebidasInfusiones.slice() : [];
    const beverages = [
      // Infusiones calientes
      "Té verde", "Té negro", "Té rojo", "Té blanco", "Té matcha", "Té de jengibre",
      "Té de canela", "Té de manzanilla", "Té de menta", "Té de boldo", "Té de cedrón",
      "Té de tilo", "Té de valeriana", "Té de pasiflora", "Té de hojas de naranjo",
      "Té de anís estrellado", "Té de clavo de olor", "Té de cúrcuma", "Té chai sin azúcar",
      "Té de jamaica caliente", "Té de hojas de guayaba", "Té de hinojo", "Té de romero",
      "Té de salvia", "Té de tomillo", "Té de orégano", "Té de toronjil", "Té de hojas de limón",
      "Té de hojas de mandarina", "Té de hojas de frambuesa", "Té de rooibos", "Té de moringa",
      "Té de diente de león", "Té de cola de caballo", "Té de ortiga", "Té de alcachofa",
      "Té de cardo mariano", "Té de hojas de guanábana", "Té de hojas de noni",
      "Té de hojas de papaya", "Té de hojas de mango", "Té de hojas de guanábana",
      
      // Cafés y sustitutos
      "Café negro sin azúcar", "Café descafeinado", "Café con canela", "Café con cardamomo",
      "Café de trigo", "Café de cebada", "Café de achicoria", "Café de garbanzo tostado",
      "Café de almendras", "Café de avellanas", "Café de maca", "Café de yacón",
      "Café de algarroba", "Café de chía", "Café de quinoa", "Café de amaranto",
      
      // Bebidas frías sin azúcar
      "Agua mineral con gas", "Agua mineral sin gas", "Agua de coco natural",
      "Agua saborizada casera (limón, pepino, jengibre)", "Agua de jamaica sin azúcar",
      "Agua de tamarindo sin azúcar", "Agua de piña sin azúcar", "Agua de pepino",
      "Agua de jengibre y limón", "Agua de hierbabuena", "Agua de albahaca",
      "Agua de canela", "Agua de vainilla", "Agua de frutos rojos", "Agua de manzana y canela",
      
      // Bebidas vegetales sin azúcar
      "Leche de almendras sin azúcar", "Leche de coco sin azúcar", "Leche de avena sin azúcar",
      "Leche de arroz sin azúcar", "Leche de anacardos sin azúcar", "Leche de avellanas sin azúcar",
      "Leche de soya sin azúcar", "Leche de alpiste", "Leche de quínoa", "Leche de cáñamo",
      "Leche de macadamia", "Leche de sésamo", "Leche de girasol", "Leche de arvejas",
      
      // Gaseosas y refrescos sin azúcar
      "Agua tónica sin azúcar", "Gaseosa cola cero", "Gaseosa lima-limón cero",
      "Gaseosa naranja cero", "Agua mineral con sabor sin azúcar", "Refresco de frutas natural sin azúcar",
      "Limonada sin azúcar", "Naranjada sin azúcar", "Limonada de coco sin azúcar",
      "Agua de valencia sin azúcar", "Té helado sin azúcar", "Café frío sin azúcar",
      
      // Bebidas funcionales
      "Kéfir de agua natural", "Kombucha natural sin azúcar", "Jugo de pasto de trigo",
      "Jugo de sábila", "Agua de chía", "Agua de linaza", "Bebida de jengibre y cúrcuma",
      "Bebida de jengibre y limón", "Bebida de jengibre y menta", "Bebida de jengibre y canela",
      "Bebida de cúrcuma y pimienta", "Bebida de canela y clavo", "Bebida de anís y canela",
      "Bebida de cardamomo y vainilla", "Bebida de jengibre y miel (baja en miel)",
      "Bebida de limón y menta", "Bebida de piña y jengibre", "Bebida de pepino y limón",
      "Bebida de sandía y menta", "Bebida de frutos rojos y albahaca", "Bebida de manzana y canela",
      "Bebida de pera y jengibre", "Bebida de durazno y vainilla", "Bebida de maracuyá y hierbabuena"
    ];
    
    const exists = (arr, val) => arr.some((x) => (x || "").toLowerCase() === val.toLowerCase());
    
    if (!categories.BebidasInfusiones) categories.BebidasInfusiones = [];

    const added = [];
    for (const bev of beverages) {
      if (!exists(categories.BebidasInfusiones, bev)) {
        added.push(bev);
      }
    }
    added.sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
    categories.BebidasInfusiones = [...baseOriginal, ...added.filter(p=>!baseOriginal.some(o=>o.toLowerCase()===p.toLowerCase()))];
    
  } catch (error) {
    console.error("Error asegurando bebidas globales:", error);
  }
}

function ensureGlobalVegetables(categories) {
  try {
    const baseOriginal = categories.Fibras ? categories.Fibras.slice() : [];
    const vegetables = [
      // Verduras comunes
      "Cebolla blanca", "Cebolla morada", "Cebollín", "Ajo", "Ajo porro",
      "Zanahoria", "Apio", "Perejil", "Cilantro", "Culantro",
      "Pimiento rojo", "Pimiento verde", "Pimiento amarillo", "Ají", "Chile",
      "Tomate", "Tomate cherry", "Tomatillo", "Tomatillo verde", "Tomatillo rojo",
      "Lechuga", "Espinaca", "Acelga", "Kale", "Col rizada", "Repollo", "Col morada",
      "Brócoli", "Coliflor", "Col de Bruselas", "Alcachofa", "Espárrago",
      "Calabacín", "Berenjena", "Pepino", "Calabaza", "Zapallo", "Zapallo italiano",
      "Choclo", "Elote", "Maíz tierno", "Choclo desgranado",
      "Hongos", "Champiñones", "Portobello", "Shiitake", "Orejon",
    ];
    
    const exists = (arr, val) => arr.some((x) => (x || "").toLowerCase() === val.toLowerCase());
    
  // Asegurar que las verduras estén en Fibras (o crearlo si no existe)
    if (!categories.Fibras) categories.Fibras = [];

    const added = [];
    for (const veg of vegetables) {
      if (!exists(categories.Fibras, veg)) {
        added.push(veg);
      }
    }
    added.sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
    categories.Fibras = [...baseOriginal, ...added.filter(v=>!baseOriginal.some(o=>o.toLowerCase()===v.toLowerCase()))];
    
  } catch (error) {
    console.error("Error asegurando verduras globales:", error);
  }
}

async function getUserIdFromRequest(request) {
  try {
    const cookieName = getCookieName();
    const token = request.cookies.get(cookieName)?.value;
    const secret = process.env.AUTH_SECRET;
    if (!token || !secret) return null;
    const decoded = jwt.verify(token, secret);
    return parseInt(decoded.sub, 10);
  } catch {
    return null;
  }
}

// Catálogo base por país/región. Asegurar >=10 ítems por categoría.
// Nota: "Bebidas/Infusiones" se incluye en la respuesta, pero aún no está en Prisma.
const CATALOG = {
  Bolivia: {
    Proteinas: [
      "Pollo", "Hígado", "Charque", "Pescado blanco", "Sardina", "Huevo",
      "Queso fresco", "Carne de res magra", "Cerdo magro", "Lenteja", "Pavo"
    ],
    Carbohidratos: [
      "Choclo", "Papa", "Camote", "Yuca", "Arroz", "Quinua cocida",
      "Avena", "Trigo mote", "Pan marraqueta", "Tunta", "Cañahua"
    ],
    Fibras: [
      "Quinua", "Avena integral", "Trigo integral", "Chía", "Linaza",
      "Verduras mixtas", "Zanahoria", "Brócoli", "Lechuga", "Pepino", "Tomate"
    ],
    Snacks: [
      "Maní", "Pipocas", "Tojorí", "Frutos secos mixtos", "Queso fresco",
      "Yogur natural", "Barrita de granola", "Tostadas integrales", "Plátano",
      "Manzana", "Mandarina"
    ],
    Grasos: [
      "Manteca", "Queso", "Aceite de oliva", "Nueces", "Almendras",
      "Palta (Aguacate)", "Maní", "Semillas de sésamo", "Mantequilla",
      "Aceite de girasol", "Castaña"
    ],
    BebidasInfusiones: [
      "Mate de coca", "Mate de manzanilla", "Refresco de canela", "Api morado",
      "Mocochinchi", "Té negro", "Té verde", "Café", "Emoliente", "Aguayos (refresco)", "Refresco de linaza"
    ],
  },
  Uruguay: {
    Proteinas: ["Pollo", "Huevo", "Carne magra", "Pescado", "Atún", "Pavo", "Cerdo magro", "Queso fresco", "Lentejas", "Tofu", "Sardina"],
    Carbohidratos: ["Arroz", "Papa", "Batata", "Pan integral", "Avena", "Quinua", "Fideos", "Choclo", "Cebada perlada", "Galleta de arroz"],
    Fibras: ["Avena integral", "Zanahoria", "Lechuga", "Tomate", "Pepino", "Brócoli", "Espinaca", "Remolacha", "Repollo", "Apio", "Linaza"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Manzana", "Banana", "Queso fresco", "Galleta de arroz", "Mix de semillas", "Yogur con avena"],
    Grasos: ["Aceite de oliva", "Palta", "Almendras", "Nueces", "Maní", "Semillas de sésamo", "Aceitunas", "Mantequilla de maní", "Pistacho", "Avellanas"],
    BebidasInfusiones: ["Mate", "Café", "Té", "Infusión de manzanilla", "Té verde", "Limonada", "Agua con gas", "Agua de frutas", "Tisana", "Agua de avena"],
  },
  Paraguay: {
    Proteinas: ["Pollo", "Huevo", "Carne magra", "Pescado", "Atún", "Cerdo magro", "Queso fresco", "Lentejas", "Soja texturizada", "Pavo", "Sardina"],
    Carbohidratos: ["Arroz", "Mandioca (yuca)", "Chipa (moderación)", "Maíz", "Papa", "Batata", "Avena", "Pan integral", "Fideos", "Quinua"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Repollo", "Acelga", "Avena integral", "Chía", "Linaza"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Banana", "Manzana", "Queso fresco", "Pop (palomitas)", "Mandioca horneada", "Mix de semillas"],
    Grasos: ["Aceite de oliva", "Aguacate", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Castañas", "Avellanas"],
    BebidasInfusiones: ["Tereré (sin azúcar)", "Té", "Café", "Limonada", "Agua de hierbas", "Manzanilla", "Menta", "Cedrón", "Agua con limón", "Agua de avena"],
  },
  Venezuela: {
    Proteinas: ["Pollo", "Huevo", "Atún", "Pescado", "Carne magra", "Cerdo magro", "Queso blanco", "Lentejas", "Caraotas", "Pavo", "Tofu"],
    Carbohidratos: ["Arepa", "Arroz", "Yuca", "Plátano", "Papa", "Batata", "Pan integral", "Avena", "Quinua", "Fideos"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Repollo", "Auyama", "Avena integral", "Chía", "Linaza"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Banana", "Manzana", "Queso blanco", "Arepitas horneadas", "Mango", "Lechosa"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Merey", "Avellanas"],
    BebidasInfusiones: ["Agua de papelón (sin azúcar)", "Té", "Café", "Limonada", "Agua de jamaica", "Manzanilla", "Menta", "Hierbabuena", "Agua de avena", "Anís"],
  },
  Guatemala: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne magra", "Cerdo magro", "Queso fresco", "Frijol", "Lentejas", "Pavo", "Tofu"],
    Carbohidratos: ["Tortilla de maíz", "Arroz", "Frijol", "Papa", "Camote", "Pan integral", "Avena", "Quinua", "Fideos", "Elote"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Ayote"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Manzana", "Banana", "Queso fresco", "Elote", "Mango", "Papaya"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Pistache", "Nuez de la India"],
    BebidasInfusiones: ["Atol de avena", "Café", "Té", "Agua de jamaica", "Limonada", "Manzanilla", "Hierbabuena", "Canela", "Agua de tamarindo", "Atole de elote"],
  },
  Honduras: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne magra", "Cerdo magro", "Queso fresco", "Frijol", "Lentejas", "Pavo", "Tofu"],
    Carbohidratos: ["Arroz", "Frijol", "Yuca", "Plátano", "Papa", "Pan integral", "Avena", "Quinua", "Fideos", "Maíz"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Calabaza"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Banana", "Manzana", "Queso fresco", "Elote", "Mango", "Sandía"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Pistacho", "Castañas"],
    BebidasInfusiones: ["Agua de horchata", "Café", "Té", "Agua de jamaica", "Limonada", "Manzanilla", "Menta", "Jengibre", "Agua de tamarindo", "Avena"],
  },
  ElSalvador: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne magra", "Cerdo magro", "Queso fresco", "Frijol", "Lentejas", "Pavo", "Tofu"],
    Carbohidratos: ["Arroz", "Frijol", "Yuca", "Plátano", "Papa", "Pan integral", "Avena", "Quinua", "Fideos", "Maíz"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Ayote"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Banana", "Manzana", "Queso fresco", "Elote", "Mango", "Papaya"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Pistacho", "Avellanas"],
    BebidasInfusiones: ["Café", "Té", "Horchata de morro", "Agua de jamaica", "Limonada", "Manzanilla", "Hierbabuena", "Canela", "Avena", "Agua de coco"],
  },
  Nicaragua: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne magra", "Cerdo magro", "Queso fresco", "Frijol", "Lentejas", "Pavo", "Tofu"],
    Carbohidratos: ["Arroz", "Frijol", "Yuca", "Plátano", "Papa", "Pan integral", "Avena", "Quinua", "Fideos", "Maíz"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Chiltoma"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Banana", "Manzana", "Queso fresco", "Elote", "Mango", "Piña"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Pistacho", "Castañas"],
    BebidasInfusiones: ["Pinolillo (sin azúcar)", "Café", "Té", "Horchata", "Limonada", "Agua de jamaica", "Manzanilla", "Hierbabuena", "Agua de tamarindo", "Avena"],
  },
  CostaRica: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne magra", "Cerdo magro", "Queso fresco", "Frijol", "Lentejas", "Pavo", "Tofu"],
    Carbohidratos: ["Arroz", "Frijol", "Yuca", "Plátano", "Papa", "Pan integral", "Avena", "Quinua", "Fideos", "Maíz"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Ayote"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Banana", "Manzana", "Queso fresco", "Elote", "Mango", "Piña"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Pistacho", "Avellanas"],
    BebidasInfusiones: ["Agua de sapo (sin azúcar)", "Café", "Té", "Agua de jamaica", "Limonada", "Manzanilla", "Hierbabuena", "Agua de tamarindo", "Avena", "Agua de frutas"],
  },
  Panama: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne magra", "Cerdo magro", "Queso fresco", "Frijol", "Lentejas", "Pavo", "Tofu"],
    Carbohidratos: ["Arroz", "Frijol", "Yuca", "Plátano", "Papa", "Pan integral", "Avena", "Quinua", "Fideos", "Maíz"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Zapallo"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Banana", "Manzana", "Queso fresco", "Elote", "Mango", "Piña"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Pistacho", "Avellanas"],
    BebidasInfusiones: ["Agua de pipa (coco)", "Café", "Té", "Agua de jamaica", "Limonada", "Manzanilla", "Hierbabuena", "Agua de tamarindo", "Avena", "Chicha (sin azúcar)"],
  },
  Cuba: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne magra", "Cerdo magro", "Queso fresco", "Frijol", "Lentejas", "Pavo", "Tofu"],
    Carbohidratos: ["Arroz", "Frijol", "Yuca", "Plátano", "Papa", "Pan integral", "Avena", "Quinua", "Fideos", "Maíz"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Calabaza"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Banana", "Manzana", "Queso fresco", "Elote", "Mango", "Piña"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Pistacho", "Avellanas"],
    BebidasInfusiones: ["Café", "Té", "Agua de jamaica", "Limonada", "Manzanilla", "Hierbabuena", "Canela", "Avena", "Agua de coco", "Té verde"],
  },
  RepublicaDominicana: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne magra", "Cerdo magro", "Queso fresco", "Habichuelas", "Lentejas", "Pavo", "Tofu"],
    Carbohidratos: ["Arroz", "Habichuelas", "Yuca", "Plátano", "Papa", "Pan integral", "Avena", "Quinua", "Fideos", "Maíz"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Calabaza"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Banana", "Manzana", "Queso fresco", "Elote", "Mango", "Piña"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Pistacho", "Avellanas"],
    BebidasInfusiones: ["Morir soñando (sin azúcar)", "Café", "Té", "Agua de jamaica", "Limonada", "Manzanilla", "Hierbabuena", "Avena", "Agua de coco", "Té verde"],
  },
  PuertoRico: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne magra", "Cerdo magro", "Queso fresco", "Habichuelas", "Lentejas", "Pavo", "Tofu"],
    Carbohidratos: ["Arroz", "Habichuelas", "Yuca", "Plátano", "Papa", "Pan integral", "Avena", "Quinua", "Fideos", "Maíz"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Calabaza"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Banana", "Manzana", "Queso fresco", "Elote", "Mango", "Piña"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Pistacho", "Avellanas"],
    BebidasInfusiones: ["Café", "Té", "Agua de jamaica", "Limonada", "Manzanilla", "Hierbabuena", "Avena", "Agua de coco", "Té verde", "Canela"],
  },
  Chile: {
    Proteinas: ["Pollo", "Pavo", "Huevo", "Atún", "Sardina", "Jurel", "Merluza", "Carne magra", "Cerdo magro", "Queso fresco", "Lentejas"],
    Carbohidratos: ["Arroz", "Papa", "Camote", "Pan integral", "Avena", "Quinua", "Fideos", "Mote", "Tortilla", "Choclo"],
    Fibras: ["Lechuga", "Zanahoria", "Brócoli", "Espinaca", "Pepino", "Tomate", "Repollo", "Acelga", "Avena integral", "Linaza", "Chía"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita de granola", "Tostadas integrales", "Manzana", "Plátano", "Queso fresco", "Galleta de arroz", "Mix de semillas", "Hummus"],
    Grasos: ["Palta", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Aceitunas", "Semillas de sésamo", "Mantequilla de maní", "Pistacho", "Avellanas"],
    BebidasInfusiones: ["Té", "Café", "Agua con gas", "Infusión de manzanilla", "Té verde", "Agua de hierbas", "Mate", "Limonada", "Mote con huesillos (sin azúcar)", "Agua de avena"],
  },
  Colombia: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne magra", "Cerdo magro", "Queso fresco", "Lentejas", "Fríjol", "Pavo", "Tofu"],
    Carbohidratos: ["Arroz", "Papa", "Yuca", "Plátano", "Arepa", "Pan integral", "Avena", "Quinua", "Fideos", "Maíz"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Ahuyama"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita de granola", "Tostadas integrales", "Banano", "Manzana", "Queso fresco", "Arepitas horneadas", "Mango", "Sandía"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Castañas", "Avellanas"],
    BebidasInfusiones: ["Agua de panela (sin azúcar)", "Tinto", "Té", "Agua de limón", "Agua de hierbas", "Avena", "Agua de maracuyá (sin azúcar)", "Agua de jamaica", "Manzanilla", "Pimienta dulce"],
  },
  Ecuador: {
    Proteinas: ["Pollo", "Huevo", "Atún", "Pescado blanco", "Camarón", "Carne magra", "Cerdo magro", "Queso fresco", "Lentejas", "Pavo", "Tofu"],
    Carbohidratos: ["Arroz", "Papa", "Yuca", "Camote", "Plátano verde", "Pan integral", "Avena", "Quinua", "Fideos", "Maíz"],
    Fibras: ["Lechuga", "Zanahoria", "Pepino", "Tomate", "Espinaca", "Brócoli", "Avena integral", "Chía", "Linaza", "Repollo", "Pepinillo"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita de granola", "Tostadas integrales", "Banano", "Manzana", "Queso fresco", "Chifles (horneados)", "Mango", "Piña"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Maní", "Semillas", "Aceitunas", "Mantequilla de maní", "Pistacho", "Avellanas"],
    BebidasInfusiones: ["Agua de horchata", "Canelazo (sin alcohol/azúcar)", "Té", "Café", "Aguapanela", "Agua de coco", "Limonada", "Infusión de manzanilla", "Té verde", "Agua de hierbas"],
  },
  Peru: {
    Proteinas: ["Pollo", "Pescado blanco", "Trucha", "Cuy", "Huevo", "Queso fresco", "Atún", "Sardina", "Lomo de res", "Pavo", "Tarwi"],
    Carbohidratos: ["Arroz", "Papa", "Camote", "Yuca", "Quinua cocida", "Kiwicha", "Choclo", "Olluco", "Pan", "Fideos"],
    Fibras: ["Quinua", "Kiwicha", "Avena integral", "Trigo integral", "Chía", "Linaza", "Lechuga", "Zanahoria", "Brócoli", "Tomate", "Pepino"],
    Snacks: ["Maní", "Frutos secos", "Yogur natural", "Barrita de granola", "Tostadas integrales", "Banana", "Manzana", "Queso fresco", "Choclo sancochado", "Batido de fruta"],
    Grasos: ["Aceite de oliva", "Palta", "Almendras", "Nueces", "Maní", "Aceitunas", "Semillas de sésamo", "Mantequilla de maní", "Queso", "Sacha inchi"],
    BebidasInfusiones: ["Mate de coca", "Emoliente", "Infusión de manzanilla", "Té negro", "Té verde", "Café", "Chicha morada (sin azúcar)", "Agua de cebada", "Limonada", "Agua de quinua"],
  },
  Mexico: {
    Proteinas: ["Pollo", "Huevo", "Pescado", "Atún", "Carne de res magra", "Pavo", "Cerdo magro", "Queso fresco", "Frijoles", "Lentejas", "Tofu"],
    Carbohidratos: ["Tortilla de maíz", "Arroz", "Frijol", "Papa", "Camote", "Pan integral", "Avena", "Quinua", "Pasta", "Elote"],
    Fibras: ["Nopal", "Lechuga", "Espinaca", "Zanahoria", "Pepino", "Jitomate", "Brócoli", "Calabacita", "Avena integral", "Chía", "Linaza"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita de granola", "Tostadas integrales", "Manzana", "Plátano", "Jícama", "Queso fresco", "Elote", "Pepino con limón"],
    Grasos: ["Aguacate", "Aceite de oliva", "Almendras", "Nueces", "Semillas", "Maní", "Aceitunas", "Mantequilla de maní", "Pistacho", "Nuez de la India"],
    BebidasInfusiones: ["Agua de Jamaica (sin azúcar)", "Agua de limón", "Café", "Té", "Atole de avena", "Té de manzanilla", "Agua de tamarindo (sin azúcar)", "Té verde", "Canela", "Ponche (sin azúcar)"],
  },
  Argentina: {
    Proteinas: ["Pollo", "Huevo", "Atún", "Carne magra", "Cerdo magro", "Pavo", "Queso fresco", "Lentejas", "Tofu", "Sardina", "Merluza"],
    Carbohidratos: ["Arroz", "Papa", "Batata", "Pan integral", "Avena", "Quinua", "Fideos", "Humita", "Choclo", "Tortilla de harina"],
    Fibras: ["Avena integral", "Quinua", "Zanahoria", "Lechuga", "Tomate", "Pepino", "Brócoli", "Espinaca", "Remolacha", "Repollo", "Apio"],
    Snacks: ["Yogur natural", "Frutos secos", "Barrita", "Tostadas integrales", "Manzana", "Banana", "Queso fresco", "Galleta de arroz", "Mix de semillas", "Yogur con avena"],
    Grasos: ["Aceite de oliva", "Palta", "Almendras", "Nueces", "Maní", "Semillas de sésamo", "Aceitunas", "Queso", "Pistacho", "Avellanas"],
    BebidasInfusiones: ["Mate", "Café", "Té", "Limonada", "Infusión de manzanilla", "Agua de frutas", "Té verde", "Agua con gas", "Té de tilo", "Agua de avena"],
  },
  // Fallback LATAM genérico
  LATAM: {
    Proteinas: [
      "Pollo", "Atún", "Huevo", "Queso fresco", "Carne de res magra",
      "Pavo", "Cerdo magro", "Lenteja", "Garbanzos", "Tofu", "Sardina",
      "Salmón fresco", "Trucha", "Tilapia", "Camarones", "Langosta", "Calamar", "Pulpo"
    ],
    Carbohidratos: [
      "Arroz", "Papa", "Batata", "Yuca", "Quinua", "Avena", "Pan integral",
      "Tortilla de maíz", "Arepa", "Fideos", "Ñame", "Yuca frita", "Pan de yuca"
    ],
    Fibras: [
      "Avena integral", "Quinua", "Trigo integral", "Chía", "Linaza",
      "Brócoli", "Zanahoria", "Lechuga", "Pepino", "Tomate", "Espinaca",
      "Espárragos", "Alcachofas", "Col rizada"
    ],
    Snacks: [
      "Maní", "Frutos secos", "Yogur natural", "Barrita de granola",
      "Tostadas integrales", "Banana", "Manzana", "Galleta de arroz",
      "Queso fresco", "Batido de fruta", "Chips de plátano", "Chifles", "Barritas de proteína"
    ],
    Grasos: [
      "Aceite de oliva", "Aguacate", "Almendras", "Nueces", "Semillas de sésamo",
      "Maní", "Aceite de girasol", "Mantequilla de maní", "Queso", "Aceitunas",
      "Aceite de coco", "Mantequilla clarificada (ghee)"
    ],
    BebidasInfusiones: [
      "Té", "Café", "Agua de fruta", "Agua de avena", "Infusión de manzanilla",
      "Mate", "Agua de jamaica", "Agua de tamarindo", "Limonada", "Horchata",
      "Té chai", "Infusión de frutas"
    ],
  },
};

function normalizeCountry(c) {
  if (!c) return null;
  const s = String(c).toLowerCase();
  if (/bolivia/.test(s)) return "Bolivia";
  if (/per[uú]/.test(s)) return "Peru";
  if (/m[eé]xico|mexico/.test(s)) return "Mexico";
  if (/argentina/.test(s)) return "Argentina";
  if (/chile/.test(s)) return "Chile";
  if (/colombia/.test(s)) return "Colombia";
  if (/ecuador/.test(s)) return "Ecuador";
  if (/uruguay/.test(s)) return "Uruguay";
  if (/paraguay/.test(s)) return "Paraguay";
  if (/venezuela/.test(s)) return "Venezuela";
  if (/guatemala/.test(s)) return "Guatemala";
  if (/honduras/.test(s)) return "Honduras";
  if (/(el\s*salvador|elsalvador)/.test(s)) return "ElSalvador";
  if (/nicaragua/.test(s)) return "Nicaragua";
  if (/(costa\s*rica|costarica)/.test(s)) return "CostaRica";
  if (/(panam[aá]|panama)/.test(s)) return "Panama";
  if (/cuba/.test(s)) return "Cuba";
  if (/(rep[úu]blica\s*dominicana|republica\s*dominicana|rd|dominicana)/.test(s)) return "RepublicaDominicana";
  if (/(puerto\s*rico|puertorico)/.test(s)) return "PuertoRico";
  return null; // devolver null para que se use key libre + augment dinámico o LATAM
}

function emptyCategories() {
  return { Proteinas: [], Carbohidratos: [], Fibras: [], Snacks: [], Grasos: [], BebidasInfusiones: [] };
}

function buildResponseForCountry(country) {
  const norm = normalizeCountry(country);
  const key = norm || (country || '').toString();
  const baseCat = (CATALOG[norm || ''] || (norm ? CATALOG.LATAM : null)) || null;
  const categories = baseCat ? {
    Proteinas: baseCat.Proteinas.slice(),
    Carbohidratos: baseCat.Carbohidratos.slice(),
    Fibras: baseCat.Fibras.slice(),
    Snacks: baseCat.Snacks.slice(),
    Grasos: baseCat.Grasos.slice(),
    BebidasInfusiones: baseCat.BebidasInfusiones.slice(),
  } : emptyCategories();
  return { country: key, categories };
}

async function augmentFromDB(country, categories) {
  try {
    if (!country) return;
    const s = country.toString();
    const like = s.split(/[\s,]+/)[0];
    const alimentos = await prisma.alimento.findMany({
      where: {
        OR: [
          { region: { contains: s } },
          { region: { contains: like } },
        ],
      },
      select: { nombre: true, categoria: true, categoria_enum: true },
      take: 500,
    });
    for (const a of alimentos) {
      const cat = a.categoria_enum || toEnumCategory(a.categoria) || null;
      if (!cat) continue;
      if (!categories[cat]) categories[cat] = [];
      if (!categories[cat].some((x) => x.toLowerCase() === (a.nombre || '').toLowerCase())) {
        categories[cat].push(a.nombre);
      }
    }
    // Asegurar mínimo 10 por categoría si es posible, manteniendo únicos
    for (const k of Object.keys(categories)) {
      const arr = categories[k];
      categories[k] = Array.from(new Set(arr)).slice(0, Math.max(10, arr.length));
    }
  } catch {}
}

function suggestCategoryForTerm(term) {
  const t = (term || "").toString().toLowerCase();
  const tests = {
    Proteinas: /pollo|res|carne|pavo|cerdo|atun|atún|pescado|huevo|queso|lenteja|garbanzo|soja|soya|tofu|charque|sardina|pavo|pavo|pavo|pavo/i,
    Carbohidratos: /arroz|papa|patata|camote|batata|yuca|quinua|quinoa|avena|trigo|pan|fideo|pasta|choclo|maiz|maíz|arepa|tortilla/i,
    Fibras: /avena|quinua|trigo|chia|chía|linaza|verdura|br[oó]coli|zanahoria|lechuga|pepino|tomate|espinaca/i,
    Snacks: /man[ií]|maní|mani|frutos secos|barrita|granola|yogur|yogurt|tostada|galleta|batido|smoothie|pipocas|tojor[ií]|tojori/i,
    Grasos: /manteca|aceite|oliva|nuez|nueces|almendra|palta|aguacate|semilla|mantequilla/i,
    BebidasInfusiones: /mate|refresco|api|mocochinchi|t[eé]|cafe|café|limonada|infusi[oó]n|agua/i,
  };
  for (const [cat, rx] of Object.entries(tests)) {
    if (rx.test(t)) return cat;
  }
  return null;
}

function toEnumCategory(cat) {
  const s = (cat || "").toString().toLowerCase();
  if (/^prote/i.test(s)) return 'Proteinas';
  if (/^carbo/i.test(s)) return 'Carbohidratos';
  if (/^fibr/i.test(s)) return 'Fibras';
  if (/^snack/i.test(s)) return 'Snacks';
  if (/^gras/i.test(s)) return 'Grasos';
  if (/bebida|infusi/.test(s)) return 'BebidasInfusiones';
  return null;
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country") || searchParams.get("pais") || "";
    const category = searchParams.get("category") || "";
    const q = searchParams.get("q"); // término libre para sugerir/buscar
    // Rama especial: búsqueda global (agrega todas las entradas de todos los países)
    if (q && q.trim()) {
      const raw = q.trim();
      const term = raw.toLowerCase();
      const aggregated = emptyCategories();
      // Unir catálogos base de todos los países definidos
      for (const [paisKey, cats] of Object.entries(CATALOG)) {
        if (!cats) continue;
        for (const catKey of Object.keys(aggregated)) {
          const list = cats[catKey] || [];
          for (const item of list) {
            if (!aggregated[catKey].some((x) => x.toLowerCase() === item.toLowerCase())) {
              aggregated[catKey].push(item);
            }
          }
        }
      }
      // Asegurar inclusiones globales
      ensureGlobalStaples(aggregated);
      ensureGlobalProteinCuts(aggregated);
      ensureGlobalProteins(aggregated);
      ensureGlobalVegetables(aggregated);
      ensureGlobalBeverages(aggregated);
      // Si q es comodín (__all__ o *) no filtrar, sólo ordenar alfabéticamente
      const isAll = term === '__all__' || term === '*';
      if (!isAll) {
        for (const key of Object.keys(aggregated)) {
          aggregated[key] = aggregated[key].filter((item) => item.toLowerCase().includes(term));
        }
      } else {
        for (const key of Object.keys(aggregated)) {
          aggregated[key] = aggregated[key].slice().sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
        }
      }
      // Si se pidió una categoría específica, reducir
      let result = aggregated;
      if (category && result[category]) {
        result = { [category]: result[category] };
      }
      return NextResponse.json({ country, categories: result });
    }

    // Flujo normal: sólo país del usuario
    const base = buildResponseForCountry(country);
    await augmentFromDB(country, base.categories);
    ensureGlobalStaples(base.categories);
    ensureGlobalProteinCuts(base.categories);
    ensureGlobalProteins(base.categories);
    ensureGlobalVegetables(base.categories);
    ensureGlobalBeverages(base.categories);

    let filteredCategories = base.categories;
    if (category && filteredCategories[category]) {
      filteredCategories = { [category]: filteredCategories[category] };
    }
    return NextResponse.json({ country, categories: filteredCategories });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo obtener catálogo regional" }, { status: 500 });
  }
}

// POST body: { nombre: string, categoria: 'Proteinas'|'Carbohidratos'|'Fibras'|'Snacks'|'Grasos'|'BebidasInfusiones', prioridad?: number }
// Agrega/alinea un alimento para el usuario (upsert en Alimento por nombre, y relación en UsuarioAlimento)
export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const nombre = (body?.nombre || "").toString().trim();
    let categoria = (body?.categoria || "").toString().trim();
    const prioridad = body?.prioridad != null ? Number(body.prioridad) : null;

    if (!nombre) return NextResponse.json({ error: "nombre requerido" }, { status: 400 });

    const validCats = ["Proteinas", "Carbohidratos", "Fibras", "Snacks", "Grasos", "BebidasInfusiones"];
    if (!validCats.includes(categoria)) {
      // Intentar inferir
      const inferred = suggestCategoryForTerm(nombre) || "Proteinas";
      categoria = inferred;
    }

    const categoriaEnum = toEnumCategory(categoria) || "Proteinas";
    // Antes se rechazaba si no estaba en el catálogo estático. Ahora permitimos crear
    // alimentos nuevos (importados o personalizados). Solo normalizamos nombre y
    // categoría inferida. Si en un futuro se quisiera restringir, se podría chequear
    // contra una lista negra, pero NO forzamos catálogo estático.
    // Mantengo comentario para contexto histórico.

    // NOTA: BebidasInfusiones aún no está en Prisma; guardamos como categoria de texto en Alimento/UsuarioAlimento
    let alimento = await prisma.alimento.findFirst({ where: { nombre } });
    if (!alimento) {
      alimento = await prisma.alimento.create({ data: { nombre, categoria, categoria_enum: categoriaEnum } });
    } else {
      const updateData = {};
      if (!alimento.categoria && categoria) updateData.categoria = categoria;
      if (!alimento.categoria_enum && categoriaEnum) updateData.categoria_enum = categoriaEnum;
      if (Object.keys(updateData).length) await prisma.alimento.update({ where: { id: alimento.id }, data: updateData });
    }

    // Relación con el usuario (upsert por índice compuesto si existe)
    await prisma.usuarioAlimento.upsert({
      where: { usuarioId_alimentoId: { usuarioId: userId, alimentoId: alimento.id } },
      update: { categoria, categoria_enum: categoriaEnum, prioridad },
      create: { usuarioId: userId, alimentoId: alimento.id, categoria, categoria_enum: categoriaEnum, prioridad },
    });

    return NextResponse.json({ ok: true, alimento: { id: alimento.id, nombre: alimento.nombre, categoria } });
  } catch (e) {
    return NextResponse.json({ error: "No se pudo agregar el alimento" }, { status: 500 });
  }
}
