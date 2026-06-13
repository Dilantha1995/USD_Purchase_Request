import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// Mark complete with USD receipt lines: [{ account, amount }]
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const receipts = (Array.isArray(b.receipts) ? b.receipts : [])
    .map((r: any) => ({ account: String(r?.account ?? "").trim(), amount: Number(r?.amount) }))
    .filter((r: any) => r.account && Number.isFinite(r.amount) && r.amount > 0);

  const updated = await prisma.request.update({
    where: { id: params.id },
    data: { status: "PAID", completedAt: new Date(), receipts: receipts as any },
    select: { id: true },
  });
  return NextResponse.json(updated);
}

// Revert to pending
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.request.update({
    where: { id: params.id },
    data: { status: "PENDING", completedAt: null, receipts: undefined },
  });
  return NextResponse.json({ ok: true });
}
