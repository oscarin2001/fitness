import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import jwt from "jsonwebtoken";

function getCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

async function getUserIdFromRequest(request) {
  try {
    const cookieName = getCookieName();
    const token = request.cookies.get(cookieName)?.value;
    if (!token) return null;
    const payload = jwt.verify(token, process.env.AUTH_SECRET);
    return payload?.userId || payload?.sub || null;
  } catch {
    return null;
  }
}

function linearRegression(points) {
  // points: [{x, y}]
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const p of points) {
    sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumX2 += p.x * p.x;
  }
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const windowParam = (searchParams.get("window") || "week").toLowerCase();
    const endingStr = searchParams.get("ending");
    const end = endingStr ? new Date(endingStr + "T00:00:00") : new Date();

    const days = windowParam === "month" ? 30 : 7;
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days + 1);

    const items = await prisma.progresoCorporal.findMany({
      where: { usuarioId: Number(userId), fecha: { gte: start, lte: end } },
      orderBy: { fecha: "asc" },
    });

    // Build series
    const weightSeries = items.filter(i => i.peso_kg != null).map((i, idx) => ({ x: idx, y: i.peso_kg }));
    const bodyfatSeries = items.filter(i => i.grasa_percent != null).map((i, idx) => ({ x: idx, y: i.grasa_percent }));
    const muscleSeries = items.filter(i => i.musculo_percent != null).map((i, idx) => ({ x: idx, y: i.musculo_percent }));

    const wAvg = weightSeries.length ? Number((weightSeries.reduce((a,b)=>a+b.y,0)/weightSeries.length).toFixed(2)) : null;
    const bfAvg = bodyfatSeries.length ? Number((bodyfatSeries.reduce((a,b)=>a+b.y,0)/bodyfatSeries.length).toFixed(2)) : null;
    const mAvg = muscleSeries.length ? Number((muscleSeries.reduce((a,b)=>a+b.y,0)/muscleSeries.length).toFixed(2)) : null;

    const wLin = linearRegression(weightSeries);
    const bfLin = linearRegression(bodyfatSeries);
    const mLin = linearRegression(muscleSeries);

    // Convert slope to per-week if window is >1 day; here slope is per index step; assume roughly daily spacing
    const toPerWeek = (slope) => Number((slope * 7).toFixed(3));

    return NextResponse.json({
      window: windowParam,
      from: start.toISOString().slice(0,10),
      to: end.toISOString().slice(0,10),
      weight: { avg: wAvg, slope_kg_per_week: weightSeries.length ? toPerWeek(wLin.slope) : null },
      bodyfat: { avg_percent: bfAvg, slope_percent_points_per_week: bodyfatSeries.length ? toPerWeek(bfLin.slope) : null },
      muscle: { avg_percent: mAvg, slope_percent_points_per_week: muscleSeries.length ? toPerWeek(mLin.slope) : null },
      count: items.length,
    });
  } catch (e) {
    console.error("/api/account/progress/summary GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
