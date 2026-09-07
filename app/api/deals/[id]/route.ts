import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, can } from "@/lib/auth";
import { computeDealTotals, buildDealLedger } from "@/lib/deal";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { id: true, name: true, brandColor: true } },
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      requests: { orderBy: { date: "asc" } },
      usdReceipts: { orderBy: { date: "asc" } },
      rateChanges: { orderBy: { changedAt: "asc" } },
    },
  });
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const totals = computeDealTotals(deal, deal.requests, deal.usdReceipts);
  const ledger = buildDealLedger(deal.requests, deal.usdReceipts);
  return NextResponse.json({ ...deal, totals, ledger });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can("canEditRequests")))
    return NextResponse.json({ error: "You don't have access to change deals" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const deal = await prisma.deal.findUnique({ where: { id: params.id } });
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  // Revise the agreed USD amount / rate — logs the change.
  if (b.newUsdAmount != null || b.newRate != null) {
    const newUsdAmount = Number(b.newUsdAmount ?? deal.usdAmount);
    const newRate = Number(b.newRate ?? deal.rate);
    if (!Number.isFinite(newUsdAmount) || newUsdAmount <= 0)
      return NextResponse.json({ error: "Enter a valid USD amount" }, { status: 400 });
    if (!Number.isFinite(newRate) || newRate <= 0)
      return NextResponse.json({ error: "Enter a valid rate" }, { status: 400 });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.dealRateChange.create({
        data: {
          dealId: deal.id,
          oldUsdAmount: deal.usdAmount,
          oldRate: deal.rate,
          newUsdAmount,
          newRate,
          reason: b.reason?.trim() || null,
          changedBy: session.name,
        },
      });
      return tx.deal.update({
        where: { id: deal.id },
        data: { usdAmount: newUsdAmount, rate: newRate },
      });
    });
    return NextResponse.json({ id: updated.id, usdAmount: updated.usdAmount, rate: updated.rate });
  }

  // Close / reopen the deal
  if (b.status === "CLOSED" || b.status === "OPEN") {
    const updated = await prisma.deal.update({
      where: { id: deal.id },
      data: { status: b.status, closedAt: b.status === "CLOSED" ? new Date() : null },
      select: { id: true, status: true },
    });
    return NextResponse.json(updated);
  }

  if (b.notes !== undefined) {
    const updated = await prisma.deal.update({
      where: { id: deal.id },
      data: { notes: String(b.notes || "").trim() || null },
      select: { id: true, notes: true },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await can("canDeleteRequests")))
    return NextResponse.json({ error: "You don't have access to delete deals" }, { status: 403 });

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: { _count: { select: { requests: true, usdReceipts: true } } },
  });
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  if (deal._count.requests > 0 || deal._count.usdReceipts > 0)
    return NextResponse.json(
      { error: "This deal has purchase requests or USD receipts recorded against it and can't be deleted" },
      { status: 400 }
    );

  await prisma.deal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
