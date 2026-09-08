import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { buildRefNo, Transfer } from "@/lib/format";
import { retryOnConflict } from "@/lib/dbRetry";

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
  dealId?: string | null;
};

function clean(t: any): Transfer[] {
  if (!Array.isArray(t)) return [];
  return t
    .map((g) => {
      const paymentMethod: "BANK" | "CASH" = g?.paymentMethod === "CASH" ? "CASH" : "BANK";
      return {
        recipient: String(g?.recipient ?? "").trim(),
        account: String(g?.account ?? "").trim(),
        sourceAccount: String(g?.sourceAccount ?? "").trim(),
        bankName: String(g?.bankName ?? "").trim() || undefined,
        paymentMethod,
        collectedBy: String(g?.collectedBy ?? "").trim() || undefined,
        amounts: (Array.isArray(g?.amounts) ? g.amounts : [])
          .map((a: any) => Number(a))
          .filter((a: number) => Number.isFinite(a) && a > 0),
        notes: Array.isArray(g?.notes) ? g.notes.map((n: any) => String(n ?? "").trim()) : undefined,
      };
    })
    .filter((g) => g.recipient && g.amounts.length > 0 && (g.paymentMethod === "CASH" ? g.collectedBy : g.account));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body & { docType?: string };
  const transfers = clean(body.transfers);
  const isTransfer = body.docType === "TRF";
  const segment = isTransfer ? "TRF" : "DEX";

  const usdAmount = isTransfer ? 0 : Number(body.usdAmount);
  const rate = isTransfer ? 0 : Number(body.rate);
  const date = body.date ? new Date(body.date) : new Date();

  if (!body.companyId) return NextResponse.json({ error: "Choose a company" }, { status: 400 });
  if (!isTransfer) {
    if (!Number.isFinite(usdAmount) || usdAmount <= 0)
      return NextResponse.json({ error: "Enter a valid USD amount" }, { status: 400 });
    if (!Number.isFinite(rate) || rate <= 0)
      return NextResponse.json({ error: "Enter a valid rate" }, { status: 400 });
    if (!body.source?.trim())
      return NextResponse.json({ error: "Enter where the USD is purchased from" }, { status: 400 });
  }
  const derivedSourceAccount = (body.sourceAccount?.trim() || transfers[0]?.sourceAccount || "").trim();
  if (!derivedSourceAccount)
    return NextResponse.json({ error: "Choose a transfer-from account for the transfers" }, { status: 400 });
  if (transfers.length === 0)
    return NextResponse.json({ error: "Add at least one transfer with an amount" }, { status: 400 });

  const dealId = body.dealId?.trim() || null;

  try {
    const created = await retryOnConflict(
      () =>
        prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const company = await tx.company.findUnique({ where: { id: body.companyId } });
          if (!company) throw new Error("Unknown company");

          if (dealId) {
            const deal = await tx.deal.findUnique({ where: { id: dealId } });
            if (!deal) throw new Error("Selected deal not found");
            if (deal.companyId !== company.id) throw new Error("Selected deal belongs to a different company");
          }

          // Serial restarts at 1 each calendar month (based on the document's YYMM).
          // Within the same month it continues from the company's counter, so the
          // admin "starting serial" still controls the current month's first number.
          const period = `${String(date.getUTCFullYear()).slice(-2)}${String(
            date.getUTCMonth() + 1
          ).padStart(2, "0")}`;

          // Atomic fetch-and-increment via a single UPDATE ... RETURNING closes
          // the race a separate read-then-later-update leaves open: concurrent
          // UPDATEs on the same row serialize in Postgres, so two requests can
          // no longer read the same stale counter value and collide on refNo.
          // The next serial is also floored at (max existing serial for this
          // company/period + 1), so the assignment self-heals if the counter
          // ever drifts behind the actual data instead of repeating the same
          // collision on every retry. DEX and TRF documents share one counter
          // per company/period, so the segment itself isn't filtered on here.
          const [updatedCompany] = await tx.$queryRaw<{ nextSerial: number }[]>`
            UPDATE "Company" c
            SET "nextSerial" = GREATEST(
                  CASE WHEN c."serialPeriod" = ${period} THEN c."nextSerial" ELSE 1 END,
                  (
                    SELECT COALESCE(MAX(CAST(split_part(r."refNo", '/', 4) AS INTEGER)), 0) + 1
                    FROM "Request" r
                    WHERE r."companyId" = c.id
                      AND split_part(r."refNo", '/', 1) = c."refPrefix"
                      AND split_part(r."refNo", '/', 3) = ${period}
                      AND split_part(r."refNo", '/', 4) ~ '^[0-9]+$'
                  )
                ) + 1,
                "serialPeriod" = ${period}
            WHERE c.id = ${company.id}
            RETURNING c."nextSerial"
          `;
          const serial = updatedCompany.nextSerial - 1;

          const settings = await tx.settings.findUnique({ where: { id: "default" } });
          const bankRate = settings?.defaultBankRate ?? 15.42;
          const exchangeLoss = isTransfer ? null : (rate - bankRate) * usdAmount;

          const refNo = buildRefNo(company.refPrefix, date, serial, segment);
          return tx.request.create({
            data: {
              refNo,
              serial,
              docType: segment,
              companyId: company.id,
              date,
              usdAmount,
              rate,
              bankRate: isTransfer ? null : bankRate,
              exchangeLoss,
              source: isTransfer ? (body.source?.trim() || "Internal Transfer") : body.source.trim(),
              sourceAccount: derivedSourceAccount,
              requestedBy: body.requestedBy?.trim() || session.name,
              approvedBy: body.approvedBy?.trim() || "",
              transfers: transfers as any,
              dealId,
              createdById: session.id,
            },
          });
        }),
      "refNo"
    );
    return NextResponse.json({ id: created.id, refNo: created.refNo });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save request" }, { status: 500 });
  }
}
