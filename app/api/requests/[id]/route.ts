import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, can } from "@/lib/auth";

export const runtime = "nodejs";

function cleanTransfers(t: any) {
  if (!Array.isArray(t)) return [];
  return t
    .map((g) => ({
      recipient: String(g?.recipient ?? "").trim(),
      account: String(g?.account ?? "").trim(),
      supplierId: g?.supplierId || null,
      amounts: (Array.isArray(g?.amounts) ? g.amounts : [])
        .map((a: any) => Number(a))
        .filter((a: number) => Number.isFinite(a) && a > 0),
    }))
    .filter((g) => g.recipient && g.account && g.amounts.length > 0);
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
    const transfers = cleanTransfers(b.transfers);
    if (transfers.length === 0)
      return NextResponse.json({ error: "Add at least one transfer with an amount" }, { status: 400 });
    const updated = await prisma.request.update({
      where: { id: params.id },
      data: {
        date: b.date ? new Date(b.date) : undefined,
        usdAmount: Number(b.usdAmount),
        rate: Number(b.rate),
        source: String(b.source || "").trim(),
        sourceAccount: String(b.sourceAccount || "").trim(),
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
