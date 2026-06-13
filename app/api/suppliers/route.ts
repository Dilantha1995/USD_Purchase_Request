import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, can } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(suppliers);
}

export async function POST(req: Request) {
  if (!(await can("canManageSuppliers")))
    return NextResponse.json({ error: "You don't have access to manage suppliers" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });
  const s = await prisma.supplier.create({
    data: {
      name: b.name.trim(),
      bankName: b.bankName?.trim() || null,
      accountName: b.accountName?.trim() || null,
      accountNo: b.accountNo?.trim() || null,
      notes: b.notes?.trim() || null,
    },
  });
  return NextResponse.json(s);
}
