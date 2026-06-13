import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, can } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accounts = await prisma.bankAccount.findMany({ orderBy: { label: "asc" } });
  return NextResponse.json(accounts);
}

export async function POST(req: Request) {
  if (!(await can("canManageBankAccounts")))
    return NextResponse.json({ error: "You don't have access to manage bank accounts" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.label?.trim()) return NextResponse.json({ error: "An account label is required" }, { status: 400 });
  const a = await prisma.bankAccount.create({
    data: {
      label: b.label.trim(),
      companyId: b.companyId || null,
      bankName: b.bankName?.trim() || null,
      accountName: b.accountName?.trim() || null,
      accountNo: b.accountNo?.trim() || null,
      currency: b.currency?.trim() || "MVR",
    },
  });
  return NextResponse.json(a);
}
