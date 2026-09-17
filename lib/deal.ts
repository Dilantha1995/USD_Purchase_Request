import { prisma } from "./db";
import { Transfer } from "./format";

export type DealTotals = {
  agreedUsd: number;
  agreedMvr: number;
  mvrPaid: number;
  mvrPending: number;
  usdReceived: number;
  usdPending: number;
};

const EPS = 0.5; // MVR/USD rounding tolerance

export type RequestForDealCalc = {
  dealId: string | null;
  transfers: unknown;
};

/**
 * Which deal (if any) a specific amount line pays into. Each line can pick
 * its own deal explicitly; a line with no explicit choice falls back to the
 * request's own (legacy, whole-request) dealId, so requests created before
 * per-line deal selection existed still total correctly.
 */
export function effectiveDealId(transfer: Transfer, amountIndex: number, requestDealId: string | null): string | null {
  return transfer.dealIds?.[amountIndex] || requestDealId || null;
}

/** Every distinct deal a request's transfers touch, across all its amount lines. */
export function distinctDealIds(request: RequestForDealCalc): string[] {
  const transfers = (request.transfers as unknown as Transfer[]) || [];
  const ids = new Set<string>();
  for (const t of transfers) {
    t.amounts.forEach((_, i) => {
      const id = effectiveDealId(t, i, request.dealId);
      if (id) ids.add(id);
    });
  }
  return Array.from(ids);
}

/** Whether any amount line on this request pays into the given deal. */
export function requestTouchesDeal(request: RequestForDealCalc, dealId: string): boolean {
  return distinctDealIds(request).includes(dealId);
}

/** Sum of a request's amount lines that pay into the given deal (0 if none do). */
function requestMvrForDeal(request: RequestForDealCalc, dealId: string): number {
  const transfers = (request.transfers as unknown as Transfer[]) || [];
  let sum = 0;
  for (const t of transfers) {
    t.amounts.forEach((amt, i) => {
      if (effectiveDealId(t, i, request.dealId) === dealId) sum += Number(amt) || 0;
    });
  }
  return sum;
}

/** Agreed vs. settled totals for a deal, in both currencies. */
export function computeDealTotals(
  deal: { id: string; usdAmount: number; rate: number },
  requests: RequestForDealCalc[],
  usdReceipts: { usdAmount: number }[]
): DealTotals {
  const agreedUsd = deal.usdAmount;
  const agreedMvr = deal.usdAmount * deal.rate;
  const mvrPaid = requests.reduce((sum, r) => sum + requestMvrForDeal(r, deal.id), 0);
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

/** e.g. "2 Paid, 1 Pending" — how the linked purchase requests are settling, not the deal's own Open/Closed status. */
export function summarizeRequestStatuses(requests: { status: "PENDING" | "PAID" }[]): string {
  if (requests.length === 0) return "—";
  const paid = requests.filter((r) => r.status === "PAID").length;
  const pending = requests.length - paid;
  if (pending === 0) return `${paid} Paid`;
  if (paid === 0) return `${pending} Pending`;
  return `${paid} Paid, ${pending} Pending`;
}

export type LedgerEntry = {
  date: Date;
  type: "PAYMENT" | "RECEIPT";
  refNo?: string;
  requestId?: string;
  requestStatus?: "PENDING" | "PAID"; // the underlying request's own payment status (PAYMENT rows only)
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
 * one specific deal. Every individual amount line that pays into this deal
 * is its own line — a single "Dollar Purchase Request" document can bundle
 * several transactions (to different accounts, split for bank limits, or
 * even paying down different deals), so `requests` is the full candidate
 * set and each amount line is matched against `dealId` independently.
 */
export function buildDealLedger(
  dealId: string,
  requests: { id: string; refNo: string; date: Date; transfers: unknown; status: "PENDING" | "PAID"; dealId: string | null }[],
  usdReceipts: { id: string; date: Date; usdAmount: number; notes?: string | null }[]
): LedgerEntry[] {
  const paymentEntries: LedgerEntry[] = [];
  for (const r of requests) {
    const transfers = (r.transfers as unknown as Transfer[]) || [];
    for (const t of transfers) {
      const target = transferTargetLabel(t);
      t.amounts.forEach((amt, i) => {
        if (effectiveDealId(t, i, r.dealId) !== dealId) return;
        paymentEntries.push({
          date: r.date,
          type: "PAYMENT",
          refNo: r.refNo,
          requestId: r.id,
          requestStatus: r.status,
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
 * Deals a purchase-request form may attach individual amount lines to.
 *
 * By default (onlyPending: true — the "New request" flow), only deals still
 * owing MVR are offered, plus (so it doesn't disappear from the picker)
 * whichever deal is already linked via includeDealId, even if it's since
 * been settled/closed.
 *
 * With onlyPending: false (the "Edit request" flow), every deal is offered
 * regardless of status or settled amount — attaching an already-created
 * request to a deal after the fact is a bookkeeping correction, not a new
 * payment, so it shouldn't be limited to deals that still look "pending".
 *
 * Totals are computed from every request in the system (not just a given
 * deal's own relation), since one amount line can pay into any deal
 * regardless of which request it's bundled into.
 */
export async function getAssignableDeals(
  includeDealId?: string | null,
  opts?: { onlyPending?: boolean }
): Promise<SelectableDeal[]> {
  const onlyPending = opts?.onlyPending ?? true;
  const include = { usdReceipts: { select: { usdAmount: true } } } as const;

  let rows = await prisma.deal.findMany({ where: onlyPending ? { status: "OPEN" } : undefined, include });
  if (onlyPending && includeDealId && !rows.some((d) => d.id === includeDealId)) {
    const extra = await prisma.deal.findUnique({ where: { id: includeDealId }, include });
    if (extra) rows = [...rows, extra];
  }

  const allRequests = await prisma.request.findMany({ select: { dealId: true, transfers: true } });

  return rows
    .map((d) => {
      const totals = computeDealTotals(d, allRequests, d.usdReceipts);
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
