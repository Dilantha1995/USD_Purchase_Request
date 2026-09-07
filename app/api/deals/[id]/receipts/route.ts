import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, can } from "@/lib/auth";

export const runtime = "nodejs";

// Records USD actually delivered by the supplier against a deal (can happen
// in advance of payment, or in a different split than the MVR payments).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can("canEditRequests")))
    return NextResponse.json({ error: "You don't have access to record USD receipts" }, { status: 403 });

  const deal = await prisma.deal.findUnique({ where: { id: params.id } });
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const usdAmount = Number(b.usdAmount);
  const date = b.date ? new Date(b.date) : new Date();
  const notes = b.notes?.trim() || null;

  if (!Number.isFinite(usdAmount) || usdAmount <= 0)
    return NextResponse.json({ error: "Enter a valid USD amount" }, { status: 400 });

  const receipt = await prisma.dealUsdReceipt.create({
    data: {
      dealId: deal.id,
      date,
      usdAmount,
      notes,
      recordedBy: session.name,
    },
  });
  return NextResponse.json(receipt);
}
