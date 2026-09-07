import { prisma } from "./db";
import { Transfer, totalMvr } from "./format";

export type DealTotals = {
  agreedUsd: number;
  agreedMvr: number;
  mvrPaid: number;
  mvrPending: number;
  usdReceived: number;
  usdPending: number;
};

const EPS = 0.5; // MVR/USD rounding tolerance

/** Agreed vs. settled totals for a deal, in both currencies. */
export function computeDealTotals(
  deal: { usdAmount: number; rate: number },
  requests: { transfers: unknown }[],
  usdReceipts: { usdAmount: number }[]
): DealTotals {
  const agreedUsd = deal.usdAmount;
  const agreedMvr = deal.usdAmount * deal.rate;
  const mvrPaid = requests.reduce(
    (sum, r) => sum + totalMvr((r.transfers as unknown as Transfer[]) || []),
    0
  );
  const usdReceived = usdReceipts.reduce((sum, r) => sum + (Number(r.usdAmount) || 0), 0);
  return {
    agreedUsd,
    agreedMvr,
    mvrPaid,
    mvrPending: agreedMvr - mvrPaid,
    usdReceived,
    usdPending: agreedUsd - usdReceived,
  };
}

/** A deal counts as "payment pending" while MVR paid hasn't reached the agreed MVR total. */
export function isDealPaymentPending(totals: DealTotals): boolean {
  return totals.mvrPending > EPS;
}

export type LedgerEntry = {
  date: Date;
  type: "PAYMENT" | "RECEIPT";
  refNo?: string;
  requestId?: string;
  receiptId?: string;
  description: string;
  mvrDebit?: number; // MVR paid out to buy USD
  usdCredit?: number; // USD actually delivered by the supplier
  notes?: string;
};

/** Chronological ledger of MVR payments (debit) and USD receipts (credit) for a deal. */
export function buildDealLedger(
  requests: { id: string; refNo: string; date: Date; transfers: unknown }[],
  usdReceipts: { id: string; date: Date; usdAmount: number; notes?: string | null }[]
): LedgerEntry[] {
  const paymentEntries: LedgerEntry[] = requests.map((r) => ({
    date: r.date,
    type: "PAYMENT",
    refNo: r.refNo,
    requestId: r.id,
    description: `Payment — ${r.refNo}`,
    mvrDebit: totalMvr((r.transfers as unknown as Transfer[]) || []),
  }));
  const receiptEntries: LedgerEntry[] = usdReceipts.map((rc) => ({
    date: rc.date,
    type: "RECEIPT",
    receiptId: rc.id,
    description: rc.notes ? `USD received — ${rc.notes}` : "USD received",
    usdCredit: Number(rc.usdAmount) || 0,
    notes: rc.notes || undefined,
  }));
  return [...paymentEntries, ...receiptEntries].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export type SelectableDeal = {
  id: string;
  refNo: string;
  name: string;
  companyId: string;
  supplierId: string;
  rate: number;
  mvrPending: number;
  usdPending: number;
  pending: boolean;
};

/**
 * Deals a purchase-request form may attach to: every deal still owing MVR,
 * plus (so it doesn't disappear from the picker) whichever deal is already
 * linked to the request being edited, even if it's since been settled/closed.
 */
export async function getAssignableDeals(includeDealId?: string | null): Promise<SelectableDeal[]> {
  const include = { requests: { select: { transfers: true } }, usdReceipts: { select: { usdAmount: true } } } as const;
  const openDeals = await prisma.deal.findMany({ where: { status: "OPEN" }, include });
  let rows = openDeals;
  if (includeDealId && !rows.some((d) => d.id === includeDealId)) {
    const extra = await prisma.deal.findUnique({ where: { id: includeDealId }, include });
    if (extra) rows = [...rows, extra];
  }
  return rows
    .map((d) => {
      const totals = computeDealTotals(d, d.requests, d.usdReceipts);
      return {
        id: d.id,
        refNo: d.refNo,
        name: d.name,
        companyId: d.companyId,
        supplierId: d.supplierId,
        rate: d.rate,
        mvrPending: totals.mvrPending,
        usdPending: totals.usdPending,
        pending: isDealPaymentPending(totals),
      };
    })
    .filter((d) => d.pending || d.id === includeDealId);
}
