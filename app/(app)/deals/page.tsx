import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatAmount, formatDate } from "@/lib/format";
import { computeDealTotals } from "@/lib/deal";

export const dynamic = "force-dynamic";

function CompanyBadge({ id, name, color }: { id: string; name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}1a`, color }}
      title={name}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {id}
    </span>
  );
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: { company?: string; status?: string; q?: string; from?: string; to?: string };
}) {
  const company = searchParams.company;
  const status = searchParams.status === "CLOSED" ? "CLOSED" : searchParams.status === "OPEN" ? "OPEN" : undefined;
  const q = (searchParams.q || "").trim().toLowerCase();
  const from = searchParams.from || "";
  const to = searchParams.to || "";

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = new Date(`${from}T00:00:00Z`);
  if (to) dateFilter.lte = new Date(`${to}T23:59:59Z`);

  const where: any = {};
  if (company === "PSMS" || company === "PPM") where.companyId = company;
  if (status) where.status = status;
  if (from || to) where.date = dateFilter;

  const deals = await prisma.deal.findMany({
    where,
    include: {
      company: { select: { id: true, name: true, brandColor: true } },
      supplier: { select: { id: true, name: true } },
      requests: { select: { transfers: true } },
      usdReceipts: { select: { usdAmount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = deals
    .map((d: (typeof deals)[number]) => ({ deal: d, totals: computeDealTotals(d, d.requests, d.usdReceipts) }))
    .filter(({ deal }: { deal: (typeof deals)[number] }) =>
      q ? `${deal.refNo} ${deal.name} ${deal.supplier.name}`.toLowerCase().includes(q) : true
    );

  const grand = rows.reduce(
    (acc: any, { totals }: (typeof rows)[number]) => ({
      agreedUsd: acc.agreedUsd + totals.agreedUsd,
      agreedMvr: acc.agreedMvr + totals.agreedMvr,
      mvrPaid: acc.mvrPaid + totals.mvrPaid,
      usdReceived: acc.usdReceived + totals.usdReceived,
    }),
    { agreedUsd: 0, agreedMvr: 0, mvrPaid: 0, usdReceived: 0 }
  );

  const params = (extra: Record<string, string> = {}) => {
    const sp = new URLSearchParams();
    if (company) sp.set("company", company);
    if (status) sp.set("status", status);
    if (q) sp.set("q", searchParams.q || "");
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    for (const [k, v] of Object.entries(extra)) sp.set(k, v);
    return sp.toString();
  };

  const tab = (val: string | undefined, label: string, key: "company" | "status") => {
    const sp = new URLSearchParams();
    if (key === "company") { if (val) sp.set("company", val); if (status) sp.set("status", status); }
    else { if (company) sp.set("company", company); if (val) sp.set("status", val); }
    if (q) sp.set("q", searchParams.q || "");
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    const active = key === "company" ? (company || "") === (val || "") : (status || "") === (val || "");
    return (
      <Link
        href={`/deals${sp.toString() ? `?${sp}` : ""}`}
        className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-slate-100 font-medium text-ink" : "text-slate-600 hover:bg-slate-50"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dollar purchase deals</h1>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/deals/export?format=xlsx&${params()}`} className="btn-ghost">Export Excel</a>
          <a href={`/api/deals/export?format=pdf&${params()}`} className="btn-ghost">Export PDF</a>
          <a href={`/api/deals/ledger-export?format=xlsx&${params()}`} className="btn-ghost">General ledger (Excel)</a>
          <a href={`/api/deals/ledger-export?format=pdf&${params()}`} className="btn-ghost">General ledger (PDF)</a>
          <Link href="/deals/new" className="btn-primary">New deal</Link>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-1">
          {tab(undefined, "All companies", "company")}
          {tab("PSMS", "ProSynergy", "company")}
          {tab("PPM", "ProPharma", "company")}
          <span className="mx-2 h-4 w-px bg-slate-200" />
          {tab(undefined, "All", "status")}
          {tab("OPEN", "Open", "status")}
          {tab("CLOSED", "Closed", "status")}
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/deals">
          {company && <input type="hidden" name="company" value={company} />}
          {status && <input type="hidden" name="status" value={status} />}
          <label className="flex items-center gap-1 text-xs text-slate-500">
            From <input type="date" name="from" defaultValue={from} className="input w-36" />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            To <input type="date" name="to" defaultValue={to} className="input w-36" />
          </label>
          <input name="q" defaultValue={searchParams.q || ""} placeholder="Search ref, name, supplier…" className="input w-56" />
          <button className="btn-ghost">Apply</button>
          {(company || status || q || from || to) && <Link href="/deals" className="text-xs text-slate-500 hover:underline">Clear</Link>}
        </form>
      </div>
      {(from || to) && (
        <p className="mb-3 text-xs text-slate-500">
          Showing deals dated {from || "the start"} to {to || "today"}. The general ledger export instead filters by each transaction&apos;s own date within this period, across the deals shown here.
        </p>
      )}

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Ref No</th>
              <th className="px-4 py-3">Deal</th>
              <th className="px-4 py-3">Co.</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 text-right">Agreed USD</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-right">MVR Paid</th>
              <th className="px-4 py-3 text-right">MVR Pending</th>
              <th className="px-4 py-3 text-right">USD Received</th>
              <th className="px-4 py-3 text-right">USD Pending</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ deal: d, totals: t }: (typeof rows)[number]) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">{d.refNo}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-slate-400">{formatDate(d.date)}</div>
                </td>
                <td className="px-4 py-3"><CompanyBadge id={d.company.id} name={d.company.name} color={d.company.brandColor} /></td>
                <td className="px-4 py-3 text-slate-600">{d.supplier.name}</td>
                <td className="px-4 py-3 text-right">{formatAmount(t.agreedUsd)}</td>
                <td className="px-4 py-3 text-right">{d.rate}</td>
                <td className="px-4 py-3 text-right">{formatAmount(t.mvrPaid)}</td>
                <td className={`px-4 py-3 text-right ${t.mvrPending > 0.5 ? "text-amber-700" : "text-slate-500"}`}>{formatAmount(Math.max(t.mvrPending, 0))}</td>
                <td className="px-4 py-3 text-right">{formatAmount(t.usdReceived)}</td>
                <td className={`px-4 py-3 text-right ${t.usdPending > 0.5 ? "text-amber-700" : t.usdPending < -0.5 ? "text-sky-700" : "text-slate-500"}`}>
                  {t.usdPending < -0.5 ? `+${formatAmount(-t.usdPending)} adv.` : formatAmount(Math.max(t.usdPending, 0))}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.status === "CLOSED" ? "bg-slate-100 text-slate-600" : "bg-green-100 text-green-700"}`}>
                    {d.status === "CLOSED" ? "Closed" : "Open"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/deals/${d.id}`} className="text-sm font-medium text-ink hover:underline">View</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-12 text-center text-sm text-slate-500">No deals match. Try clearing the filters, or create one.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-medium">
              <tr>
                <td className="px-4 py-3" colSpan={4}>Total ({rows.length} deal{rows.length === 1 ? "" : "s"})</td>
                <td className="px-4 py-3 text-right">{formatAmount(grand.agreedUsd)}</td>
                <td></td>
                <td className="px-4 py-3 text-right">{formatAmount(grand.mvrPaid)}</td>
                <td className="px-4 py-3 text-right">{formatAmount(Math.max(grand.agreedMvr - grand.mvrPaid, 0))}</td>
                <td className="px-4 py-3 text-right">{formatAmount(grand.usdReceived)}</td>
                <td className="px-4 py-3 text-right">{formatAmount(Math.max(grand.agreedUsd - grand.usdReceived, 0))}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
