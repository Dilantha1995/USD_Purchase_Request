import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatAmount, formatDate, totalMvr, Transfer } from "@/lib/format";

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

export default async function Dashboard({
  searchParams,
}: {
  searchParams: { company?: string; q?: string; from?: string; to?: string };
}) {
  const company = searchParams.company;
  const q = (searchParams.q || "").trim().toLowerCase();
  const from = searchParams.from || "";
  const to = searchParams.to || "";

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = new Date(`${from}T00:00:00Z`);
  if (to) dateFilter.lte = new Date(`${to}T23:59:59Z`);

  const where: any = {};
  if (company === "PSMS" || company === "PPM") where.companyId = company;
  if (from || to) where.date = dateFilter;

  const rows = await prisma.request.findMany({
    where,
    include: {
      company: { select: { id: true, name: true, brandColor: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const filtered = q
    ? rows.filter((r: (typeof rows)[number]) => {
        const transfers = r.transfers as unknown as Transfer[];
        const hay = [
          r.refNo,
          r.source,
          r.requestedBy,
          r.approvedBy,
          ...transfers.map((t) => `${t.recipient} ${t.account}`),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
    : rows;

  const params = (extra: Record<string, string> = {}) => {
    const sp = new URLSearchParams();
    if (company) sp.set("company", company);
    if (q) sp.set("q", searchParams.q || "");
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    for (const [k, v] of Object.entries(extra)) sp.set(k, v);
    return sp.toString();
  };

  const tab = (val: string | undefined, label: string) => {
    const sp = new URLSearchParams();
    if (val) sp.set("company", val);
    if (q) sp.set("q", searchParams.q || "");
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    const active = (company || "") === (val || "");
    return (
      <Link
        href={`/dashboard${sp.toString() ? `?${sp}` : ""}`}
        className={`rounded-md px-3 py-1.5 text-sm ${
          active ? "bg-slate-100 font-medium text-ink" : "text-slate-600 hover:bg-slate-50"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Requests</h1>
        <div className="flex items-center gap-2">
          <a href={`/api/export?format=xlsx&${params()}`} className="btn-ghost">Export Excel</a>
          <a href={`/api/export?format=pdf&${params()}`} className="btn-ghost">Export PDF</a>
          <Link href="/new" className="btn-primary">New request</Link>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-1">
          {tab(undefined, "All")}
          {tab("PSMS", "ProSynergy")}
          {tab("PPM", "ProPharma")}
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/dashboard">
          {company && <input type="hidden" name="company" value={company} />}
          <label className="flex items-center gap-1 text-xs text-slate-500">
            From <input type="date" name="from" defaultValue={from} className="input w-36" />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            To <input type="date" name="to" defaultValue={to} className="input w-36" />
          </label>
          <input
            name="q"
            defaultValue={searchParams.q || ""}
            placeholder="Search ref no, recipient…"
            className="input w-48"
          />
          <button className="btn-ghost">Apply</button>
          {(from || to || q) && (
            <Link href="/dashboard" className="text-xs text-slate-500 hover:underline">Clear</Link>
          )}
        </form>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Ref No</th>
              <th className="px-4 py-3">Co.</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 text-right">USD</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-right">Total MVR</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r: (typeof filtered)[number]) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">{r.refNo}</td>
                <td className="px-4 py-3">
                  <CompanyBadge id={r.company.id} name={r.company.name} color={r.company.brandColor} />
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDate(r.date)}</td>
                <td className="px-4 py-3 text-slate-600">{r.source}</td>
                <td className="px-4 py-3 text-right">{formatAmount(r.usdAmount)}</td>
                <td className="px-4 py-3 text-right">{r.rate}</td>
                <td className="px-4 py-3 text-right">
                  {formatAmount(totalMvr(r.transfers as unknown as Transfer[]))}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === "PAID"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {r.status === "PAID" ? "Completed" : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.createdBy.name}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/requests/${r.id}`} className="text-sm font-medium text-ink hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">
                  No requests match. Try clearing the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
