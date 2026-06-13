import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await can("canManageSuppliers")))
    return NextResponse.json({ error: "You don't have access to manage suppliers" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const data: any = {};
  for (const f of ["name", "bankName", "accountName", "accountNo", "notes"]) {
    if (f in b) data[f] = b[f]?.trim() || (f === "name" ? undefined : null);
  }
  if ("active" in b) data.active = Boolean(b.active);
  const s = await prisma.supplier.update({ where: { id: params.id }, data });
  return NextResponse.json(s);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await can("canManageSuppliers")))
    return NextResponse.json({ error: "You don't have access to manage suppliers" }, { status: 403 });
  await prisma.supplier.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
