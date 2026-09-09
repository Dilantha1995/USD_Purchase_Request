import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, can } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: { id: string; receiptId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can("canEditRequests")))
    return NextResponse.json({ error: "You don't have access to edit USD receipts" }, { status: 403 });

  const receipt = await prisma.dealUsdReceipt.findUnique({ where: { id: params.receiptId } });
  if (!receipt || receipt.dealId !== params.id) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const usdAmount = Number(b.usdAmount);
  const date = b.date ? new Date(b.date) : receipt.date;
  const notes = b.notes?.trim() || null;

  if (!Number.isFinite(usdAmount) || usdAmount <= 0)
    return NextResponse.json({ error: "Enter a valid USD amount" }, { status: 400 });

  const updated = await prisma.dealUsdReceipt.update({
    where: { id: receipt.id },
    data: { date, usdAmount, notes },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string; receiptId: string } }) {
  if (!(await can("canDeleteRequests")))
    return NextResponse.json({ error: "You don't have access to delete USD receipts" }, { status: 403 });

  const receipt = await prisma.dealUsdReceipt.findUnique({ where: { id: params.receiptId } });
  if (!receipt || receipt.dealId !== params.id) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

  await prisma.dealUsdReceipt.delete({ where: { id: receipt.id } });
  return NextResponse.json({ ok: true });
}
