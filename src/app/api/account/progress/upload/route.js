import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { promises as fs } from "fs";
import path from "path";

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

export async function POST(request) {
  try {
    const userIdRaw = await getUserIdFromRequest(request);
    const userId = Number(userIdRaw);
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Archivo no provisto" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadsDir = path.join(process.cwd(), "public", "uploads", String(userId));
    await fs.mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(file.name) || ".jpg";
    const now = new Date();
    const fname = `${now.toISOString().slice(0,10)}-${now.getTime()}${ext}`;
    const fullPath = path.join(uploadsDir, fname);
    await fs.writeFile(fullPath, buffer);

    const url = `/uploads/${userId}/${fname}`;
    return NextResponse.json({ ok: true, url }, { status: 200 });
  } catch (e) {
    console.error("/api/account/progress/upload POST error", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
