import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, can } from "@/lib/auth";

export const runtime = "nodejs";

function cleanTransfers(t: any) {
  if (!Array.isArray(t)) return [];
  return t
    .map((g) => {
      const paymentMethod = g?.paymentMethod === "CASH" ? "CASH" : "BANK";
      return {
        recipient: String(g?.recipient ?? "").trim(),
        account: String(g?.account ?? "").trim(),
        sourceAccount: String(g?.sourceAccount ?? "").trim(),
        bankName: String(g?.bankName ?? "").trim() || undefined,
        paymentMethod,
        collectedBy: String(g?.collectedBy ?? "").trim() || undefined,
        supplierId: g?.supplierId || null,
        amounts: (Array.isArray(g?.amounts) ? g.amounts : [])
          .map((a: any) => Number(a))
          .filter((a: number) => Number.isFinite(a) && a > 0),
      };
    })
    .filter((g) => g.recipient && g.amounts.length > 0 && (g.paymentMethod === "CASH" ? g.collectedBy : g.account));
}

// Toggle status (kept for backward compatibility) - any logged in user
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  // Full edit (requires permission)
  if (b._edit) {
    if (!(await can("canEditRequests")))
      return NextResponse.json({ error: "You don't have access to edit requests" }, { status: 403 });
    const existing = await prisma.request.findUnique({ where: { id: params.id }, select: { companyId: true } });
    if (!existing) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    const transfers = cleanTransfers(b.transfers);
    if (transfers.length === 0)
      return NextResponse.json({ error: "Add at least one transfer with an amount" }, { status: 400 });
    const usd = Number(b.usdAmount);
    const rt = Number(b.rate);
    const settings = await prisma.settings.findUnique({ where: { id: "default" } });
    const bankRate = settings?.defaultBankRate ?? 15.42;
    const srcAcct = (String(b.sourceAccount || "").trim() || transfers[0]?.sourceAccount || "").trim();

    const dealId = b.dealId?.trim() || null;
    if (dealId) {
      const deal = await prisma.deal.findUnique({ where: { id: dealId } });
      if (!deal) return NextResponse.json({ error: "Selected deal not found" }, { status: 400 });
      if (deal.companyId !== existing.companyId)
        return NextResponse.json({ error: "Selected deal belongs to a different company" }, { status: 400 });
    }

    let refNo: string | undefined;
    if (b.refNo !== undefined) {
      refNo = String(b.refNo || "").trim();
      if (!refNo) return NextResponse.json({ error: "Reference number can't be empty" }, { status: 400 });
      const clash = await prisma.request.findFirst({ where: { refNo, NOT: { id: params.id } }, select: { id: true } });
      if (clash) return NextResponse.json({ error: `Reference number "${refNo}" is already in use` }, { status: 400 });
    }

    const updated = await prisma.request.update({
      where: { id: params.id },
      data: {
        refNo,
        date: b.date ? new Date(b.date) : undefined,
        usdAmount: usd,
        rate: rt,
        bankRate,
        exchangeLoss: (rt - bankRate) * usd,
        source: String(b.source || "").trim(),
        sourceAccount: srcAcct,
        dealId,
        requestedBy: String(b.requestedBy || "").trim(),
        approvedBy: String(b.approvedBy || "").trim(),
        requestedSignatoryId: b.requestedSignatoryId || null,
        approvedSignatoryId: b.approvedSignatoryId || null,
        transfers: transfers as any,
      },
      select: { id: true },
    });
    return NextResponse.json(updated);
  }

  // Simple status change
  if (b.status === "PAID" || b.status === "PENDING") {
    const updated = await prisma.request.update({
      where: { id: params.id },
      data: { status: b.status, completedAt: b.status === "PAID" ? new Date() : null },
      select: { id: true, status: true },
    });
    return NextResponse.json(updated);
  }
  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await can("canDeleteRequests")))
    return NextResponse.json({ error: "You don't have access to delete requests" }, { status: 403 });
  await prisma.request.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
