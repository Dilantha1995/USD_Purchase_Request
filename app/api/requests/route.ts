import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { buildRefNo, Transfer } from "@/lib/format";

export const runtime = "nodejs";

type Body = {
  companyId: string;
  date: string;
  usdAmount: number;
  rate: number;
  source: string;
  sourceAccount: string;
  requestedBy: string;
  approvedBy: string;
  transfers: Transfer[];
};

function clean(t: any): Transfer[] {
  if (!Array.isArray(t)) return [];
  return t
    .map((g) => ({
      recipient: String(g?.recipient ?? "").trim(),
      account: String(g?.account ?? "").trim(),
      amounts: (Array.isArray(g?.amounts) ? g.amounts : [])
        .map((a: any) => Number(a))
        .filter((a: number) => Number.isFinite(a) && a > 0),
    }))
    .filter((g) => g.recipient && g.account && g.amounts.length > 0);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const transfers = clean(body.transfers);

  const usdAmount = Number(body.usdAmount);
  const rate = Number(body.rate);
  const date = body.date ? new Date(body.date) : new Date();

  if (!body.companyId) return NextResponse.json({ error: "Choose a company" }, { status: 400 });
  if (!Number.isFinite(usdAmount) || usdAmount <= 0)
    return NextResponse.json({ error: "Enter a valid USD amount" }, { status: 400 });
  if (!Number.isFinite(rate) || rate <= 0)
    return NextResponse.json({ error: "Enter a valid rate" }, { status: 400 });
  if (!body.source?.trim())
    return NextResponse.json({ error: "Enter where the USD is purchased from" }, { status: 400 });
  if (!body.sourceAccount?.trim())
    return NextResponse.json({ error: "Enter the transfer-from account" }, { status: 400 });
  if (transfers.length === 0)
    return NextResponse.json({ error: "Add at least one transfer with an amount" }, { status: 400 });

  try {
    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const company = await tx.company.findUnique({ where: { id: body.companyId } });
      if (!company) throw new Error("Unknown company");

      // Serial restarts at 1 each calendar month (based on the document's YYMM).
      // Within the same month it continues from the company's counter, so the
      // admin "starting serial" still controls the current month's first number.
      const period = `${String(date.getUTCFullYear()).slice(-2)}${String(
        date.getUTCMonth() + 1
      ).padStart(2, "0")}`;
      const sameMonth = company.serialPeriod === period || company.serialPeriod == null;
      const serial = sameMonth ? company.nextSerial : 1;

      const refNo = buildRefNo(company.refPrefix, date, serial);
      const request = await tx.request.create({
        data: {
          refNo,
          serial,
          companyId: company.id,
          date,
          usdAmount,
          rate,
          source: body.source.trim(),
          sourceAccount: body.sourceAccount.trim(),
          requestedBy: body.requestedBy?.trim() || session.name,
          approvedBy: body.approvedBy?.trim() || "",
          transfers: transfers as any,
          createdById: session.id,
        },
      });
      await tx.company.update({
        where: { id: company.id },
        data: { nextSerial: serial + 1, serialPeriod: period },
      });
      return request;
    });
    return NextResponse.json({ id: created.id, refNo: created.refNo });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save request" }, { status: 500 });
  }
}
