import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (s?.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const data: any = {};
  if (b.name?.trim()) data.name = b.name.trim();
  if ("title" in b) data.title = b.title?.trim() || null;
  if (["REQUESTER", "APPROVER", "BOTH"].includes(b.kind)) data.kind = b.kind;
  if ("active" in b) data.active = Boolean(b.active);
  if (typeof b.signatureBase64 === "string") {
    data.signature = b.signatureBase64
      ? Buffer.from(b.signatureBase64.split(",").pop()!, "base64")
      : null; // empty string clears the signature
  }
  await prisma.signatory.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (s?.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  await prisma.signatory.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
