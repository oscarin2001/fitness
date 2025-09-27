import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  if (!email) return NextResponse.json({ error: 'email param required' }, { status: 400 });
  const auth = await prisma.auth.findUnique({ where: { email: email.toLowerCase() }, include: { usuario: true } });
  if (!auth) return NextResponse.json({ exists: false });
  return NextResponse.json({
    exists: true,
    usuarioId: auth.usuarioId,
    onboarding_completed: auth.usuario.onboarding_completed,
    nombre: auth.usuario.nombre,
    apellido: auth.usuario.apellido,
  });
}