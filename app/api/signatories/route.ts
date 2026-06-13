import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// List (no signature bytes) - any logged in user, used for dropdowns
export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const people = await prisma.signatory.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, title: true, kind: true, active: true },
  });
  // include whether a signature image exists, without sending the bytes
  const withFlag = await prisma.signatory.findMany({ select: { id: true, signature: true } });
  const has = new Map(withFlag.map((s) => [s.id, !!s.signature]));
  return NextResponse.json(people.map((p) => ({ ...p, hasSignature: has.get(p.id) || false })));
}

// Create - ADMIN only. signature is optional base64 data URL.
export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const sig = b.signatureBase64 ? Buffer.from(String(b.signatureBase64).split(",").pop()!, "base64") : null;
  const person = await prisma.signatory.create({
    data: {
      name: b.name.trim(),
      title: b.title?.trim() || null,
      kind: ["REQUESTER", "APPROVER", "BOTH"].includes(b.kind) ? b.kind : "BOTH",
      signature: sig,
    },
  });
  return NextResponse.json({ id: person.id });
}
