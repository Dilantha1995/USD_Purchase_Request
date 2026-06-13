import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await can("canManageBankAccounts")))
    return NextResponse.json({ error: "You don't have access to manage bank accounts" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const data: any = {};
  for (const f of ["label", "companyId", "bankName", "accountName", "accountNo", "currency"]) {
    if (f in b) data[f] = b[f]?.trim ? b[f].trim() || null : b[f] || null;
  }
  if ("active" in b) data.active = Boolean(b.active);
  const a = await prisma.bankAccount.update({ where: { id: params.id }, data });
  return NextResponse.json(a);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await can("canManageBankAccounts")))
    return NextResponse.json({ error: "You don't have access to manage bank accounts" }, { status: 403 });
  await prisma.bankAccount.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
