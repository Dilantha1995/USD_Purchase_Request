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

function transferTargetLabel(t: Transfer): string {
  if (t.paymentMethod === "CASH") return `${t.recipient} (Cash — collected by ${t.collectedBy || "—"})`;
  if (t.bankName) return `${t.recipient} (${t.bankName}${t.account ? ` A/C ${t.account}` : ""})`;
  if (t.account) return `${t.recipient} (A/C ${t.account})`;
  return t.recipient;
}

/**
 * Chronological ledger of MVR payments (debit) and USD receipts (credit) for
 * a deal. Every individual transfer amount on a request is its own line —
 * a single "Dollar Purchase Request" document often bundles several
 * transactions (to different accounts, or split for bank limits), and each
 * one is a distinct payment, not just the document's grand total.
 */
export function buildDealLedger(
  requests: { id: string; refNo: string; date: Date; transfers: unknown }[],
  usdReceipts: { id: string; date: Date; usdAmount: number; notes?: string | null }[]
): LedgerEntry[] {
  const paymentEntries: LedgerEntry[] = [];
  for (const r of requests) {
    const transfers = (r.transfers as unknown as Transfer[]) || [];
    for (const t of transfers) {
      const target = transferTargetLabel(t);
      t.amounts.forEach((amt, i) => {
        paymentEntries.push({
          date: r.date,
          type: "PAYMENT",
          refNo: r.refNo,
          requestId: r.id,
          description: `Payment — ${r.refNo} — ${target}${t.amounts.length > 1 ? ` (${i + 1}/${t.amounts.length})` : ""}`,
          mvrDebit: Number(amt) || 0,
        });
      });
    }
  }
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
  status: "OPEN" | "CLOSED";
};

/**
 * Deals a purchase-request form may attach to.
 *
 * By default (onlyPending: true — the "New request" flow), only deals still
 * owing MVR are offered, plus (so it doesn't disappear from the picker)
 * whichever deal is already linked to the request being edited, even if
 * it's since been settled/closed.
 *
 * With onlyPending: false (the "Edit request" flow), every deal is offered
 * regardless of status or settled amount — attaching an already-created
 * request to a deal after the fact is a bookkeeping correction, not a new
 * payment, so it shouldn't be limited to deals that still look "pending".
 */
export async function getAssignableDeals(
  includeDealId?: string | null,
  opts?: { onlyPending?: boolean }
): Promise<SelectableDeal[]> {
  const onlyPending = opts?.onlyPending ?? true;
  const include = { requests: { select: { transfers: true } }, usdReceipts: { select: { usdAmount: true } } } as const;

  let rows = await prisma.deal.findMany({ where: onlyPending ? { status: "OPEN" } : undefined, include });
  if (onlyPending && includeDealId && !rows.some((d) => d.id === includeDealId)) {
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
        status: d.status,
      };
    })
    .filter((d) => !onlyPending || d.pending || d.id === includeDealId);
}
