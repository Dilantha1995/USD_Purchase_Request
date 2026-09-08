import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession, can } from "@/lib/auth";
import { buildRefNo, buildDealName } from "@/lib/format";
import { computeDealTotals, isDealPaymentPending } from "@/lib/deal";
import { retryOnConflict } from "@/lib/dbRetry";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const pendingOnly = url.searchParams.get("pending") === "1";
  const companyId = url.searchParams.get("companyId") || undefined;

  const deals = await prisma.deal.findMany({
    where: companyId ? { companyId } : undefined,
    include: {
      supplier: { select: { id: true, name: true } },
      company: { select: { id: true, name: true, brandColor: true } },
      requests: { select: { transfers: true } },
      usdReceipts: { select: { usdAmount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const withTotals = deals.map((d: (typeof deals)[number]) => {
    const totals = computeDealTotals(d, d.requests, d.usdReceipts);
    const { requests, usdReceipts, ...rest } = d;
    return { ...rest, totals };
  });

  const filtered = pendingOnly
    ? withTotals.filter((d: (typeof withTotals)[number]) => d.status === "OPEN" && isDealPaymentPending(d.totals))
    : withTotals;

  return NextResponse.json(filtered);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can("canEditRequests")))
    return NextResponse.json({ error: "You don't have access to create deals" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const companyId = String(b.companyId || "");
  const supplierId = String(b.supplierId || "");
  const usdAmount = Number(b.usdAmount);
  const rate = Number(b.rate);
  const date = b.date ? new Date(b.date) : new Date();
  const notes = b.notes?.trim() || null;

  if (!companyId) return NextResponse.json({ error: "Choose a company" }, { status: 400 });
  if (!supplierId) return NextResponse.json({ error: "Choose a supplier" }, { status: 400 });
  if (!Number.isFinite(usdAmount) || usdAmount <= 0)
    return NextResponse.json({ error: "Enter a valid agreed USD amount" }, { status: 400 });
  if (!Number.isFinite(rate) || rate <= 0)
    return NextResponse.json({ error: "Enter a valid agreed rate" }, { status: 400 });

  try {
    const created = await retryOnConflict(
      () =>
        prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const company = await tx.company.findUnique({ where: { id: companyId } });
          if (!company) throw new Error("Unknown company");
          const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
          if (!supplier) throw new Error("Unknown supplier");

          const period = `${String(date.getUTCFullYear()).slice(-2)}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

          // Atomic fetch-and-increment via a single UPDATE ... RETURNING closes
          // the race a separate read-then-later-update leaves open: concurrent
          // UPDATEs on the same row serialize in Postgres, so two requests can
          // no longer read the same stale counter value and collide on refNo.
          const [updatedCompany] = await tx.$queryRaw<{ nextDealSerial: number }[]>`
            UPDATE "Company"
            SET "nextDealSerial" = CASE WHEN "dealSerialPeriod" = ${period} THEN "nextDealSerial" + 1 ELSE 2 END,
                "dealSerialPeriod" = ${period}
            WHERE id = ${company.id}
            RETURNING "nextDealSerial"
          `;
          const serial = updatedCompany.nextDealSerial - 1;

          const refNo = buildRefNo(company.refPrefix, date, serial, "DEAL");
          const name = buildDealName(supplier.name, usdAmount, rate, date);

          return tx.deal.create({
            data: {
              refNo,
              name,
              companyId: company.id,
              supplierId: supplier.id,
              date,
              initialUsdAmount: usdAmount,
              initialRate: rate,
              usdAmount,
              rate,
              notes,
              createdById: session.id,
            },
          });
        }),
      "refNo"
    );
    return NextResponse.json({ id: created.id, refNo: created.refNo, name: created.name });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not create the deal" }, { status: 500 });
  }
}
