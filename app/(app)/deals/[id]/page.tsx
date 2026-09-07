import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatAmount, formatDate } from "@/lib/format";
import { computeDealTotals, buildDealLedger } from "@/lib/deal";
import DealActions from "./DealActions";

export const dynamic = "force-dynamic";

export default async function DealDetail({ params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  const isAdmin = me?.role === "ADMIN";
  const canEdit = isAdmin || Boolean(me?.canEditRequests);
  const canDelete = isAdmin || Boolean(me?.canDeleteRequests);

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { id: true, name: true, brandColor: true } },
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      requests: { orderBy: { date: "asc" } },
      usdReceipts: { orderBy: { date: "asc" } },
      rateChanges: { orderBy: { changedAt: "asc" } },
    },
  });
  if (!deal) notFound();

  const totals = computeDealTotals(deal, deal.requests, deal.usdReceipts);
  const ledger = buildDealLedger(deal.requests, deal.usdReceipts);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/deals" className="text-sm text-slate-500 hover:underline">&larr; Back to deals</Link>
          <h1 className="mt-1 font-mono text-lg font-semibold">{deal.refNo}</h1>
          <p className="text-sm text-slate-500">{deal.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${deal.status === "CLOSED" ? "bg-slate-100 text-slate-600" : "bg-green-100 text-green-700"}`}
          >
            {deal.status === "CLOSED" ? "Closed" : "Open"}
          </span>
          {canEdit && (
            <>
              <Link href={`/deals/${deal.id}/edit`} className="btn-ghost">Edit deal</Link>
              <Link href={`/new?dealId=${deal.id}`} className="btn-primary">New payment for this deal</Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr,1.3fr]">
        {/* Summary */}
        <div className="card space-y-4 p-5">
          <Row label="Company">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: deal.company.brandColor }} />
              {deal.company.name}
            </span>
          </Row>
          <Row label="Supplier">{deal.supplier.name}</Row>
          <Row label="Deal date">{formatDate(deal.date)}</Row>
          <Row label="Agreed terms">
            USD {formatAmount(totals.agreedUsd)} at {deal.rate}
            {(deal.initialUsdAmount !== deal.usdAmount || deal.initialRate !== deal.rate) && (
              <span className="text-slate-400"> (originally USD {formatAmount(deal.initialUsdAmount)} at {deal.initialRate})</span>
            )}
          </Row>
          {deal.notes && <Row label="Notes">{deal.notes}</Row>}
          <Row label="Created by">{deal.createdBy.name}</Row>

          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <Stat label="Agreed MVR" value={`MVR ${formatAmount(totals.agreedMvr)}`} />
            <Stat label="MVR paid" value={`MVR ${formatAmount(totals.mvrPaid)}`} />
            <Stat
              label="MVR pending"
              value={`MVR ${formatAmount(Math.max(totals.mvrPending, 0))}`}
              tone={totals.mvrPending > 0.5 ? "warn" : "ok"}
            />
            <Stat label="USD received" value={`USD ${formatAmount(totals.usdReceived)}`} />
            <Stat
              label={totals.usdPending < -0.5 ? "USD received in advance" : "USD pending"}
              value={`USD ${formatAmount(Math.abs(totals.usdPending))}`}
              tone={totals.usdPending > 0.5 ? "warn" : totals.usdPending < -0.5 ? "info" : "ok"}
            />
          </div>

          <DealActions
            dealId={deal.id}
            currentUsdAmount={deal.usdAmount}
            currentRate={deal.rate}
            status={deal.status}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </div>

        {/* Ledger */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-sm font-semibold text-slate-700">Ledger</h2>
            <p className="text-xs text-slate-500">MVR paid (debit) vs. USD received (credit), in order.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">MVR Paid (Dr)</th>
                  <th className="px-4 py-2 text-right">USD Received (Cr)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((e, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-slate-600">{formatDate(e.date)}</td>
                    <td className="px-4 py-2">
                      {e.requestId ? (
                        <Link href={`/requests/${e.requestId}`} className="text-ink hover:underline">{e.description}</Link>
                      ) : (
                        e.description
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{e.mvrDebit ? formatAmount(e.mvrDebit) : ""}</td>
                    <td className="px-4 py-2 text-right">{e.usdCredit ? formatAmount(e.usdCredit) : ""}</td>
                  </tr>
                ))}
                {ledger.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No transactions recorded yet.</td></tr>
                )}
              </tbody>
              {ledger.length > 0 && (
                <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-medium">
                  <tr>
                    <td className="px-4 py-2" colSpan={2}>Total</td>
                    <td className="px-4 py-2 text-right">{formatAmount(totals.mvrPaid)}</td>
                    <td className="px-4 py-2 text-right">{formatAmount(totals.usdReceived)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Rate history */}
      {deal.rateChanges.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-sm font-semibold text-slate-700">Rate / amount revision history</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Old</th>
                  <th className="px-4 py-2">New</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Changed by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deal.rateChanges.map((rc) => (
                  <tr key={rc.id}>
                    <td className="px-4 py-2 text-slate-600">{formatDate(rc.changedAt)}</td>
                    <td className="px-4 py-2">USD {formatAmount(rc.oldUsdAmount)} @ {rc.oldRate}</td>
                    <td className="px-4 py-2">USD {formatAmount(rc.newUsdAmount)} @ {rc.newRate}</td>
                    <td className="px-4 py-2 text-slate-500">{rc.reason || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{rc.changedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Linked purchase requests */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-sm font-semibold text-slate-700">Purchase requests on this deal</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Ref No</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2 text-right">USD</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deal.requests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{r.refNo}</td>
                  <td className="px-4 py-2 text-slate-600">{formatDate(r.date)}</td>
                  <td className="px-4 py-2 text-right">{formatAmount(r.usdAmount)}</td>
                  <td className="px-4 py-2 text-right">{r.rate}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "PAID" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {r.status === "PAID" ? "Paid" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/requests/${r.id}`} className="text-sm font-medium text-ink hover:underline">View</Link>
                  </td>
                </tr>
              ))}
              {deal.requests.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No purchase requests linked yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" | "info" }) {
  const color = tone === "warn" ? "text-amber-700" : tone === "info" ? "text-sky-700" : "text-ink";
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}
