import { resolveUserId } from "@/lib/auth/resolveUserId";

export async function GET(request) {
  try {
  const userIdRaw = await resolveUserId(request);
    const userId = Number(userIdRaw);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const user = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { measurement_interval_weeks: true },
    });
    return NextResponse.json({ weeks: user?.measurement_interval_weeks ?? null }, { status: 200 });
  } catch (e) {
    console.error("/api/account/profile/measurement-interval GET error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
  const userIdRaw = await resolveUserId(request);
    const userId = Number(userIdRaw);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const weeks = Number(body?.weeks);
    if (![2,3,4].includes(weeks)) {
      return NextResponse.json({ error: "Valor inválido (2,3,4)" }, { status: 400 });
    }

    await prisma.usuario.update({
      where: { id: userId },
      data: { measurement_interval_weeks: weeks },
    });
    return NextResponse.json({ ok: true, weeks }, { status: 200 });
  } catch (e) {
    console.error("/api/account/profile/measurement-interval POST error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
