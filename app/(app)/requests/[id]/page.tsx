import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatAmount, formatDate, totalMvr, Transfer } from "@/lib/format";
import StatusActions from "./StatusActions";
import DeleteRequest from "./DeleteRequest";

export const dynamic = "force-dynamic";

export default async function RequestDetail({ params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  const isAdmin = me?.role === "ADMIN";
  const canDelete = isAdmin || Boolean(me?.canDeleteRequests);
  const r = await prisma.request.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { id: true, name: true, brandColor: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!r) notFound();

  const transfers = r.transfers as unknown as Transfer[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
            &larr; Back to requests
          </Link>
          <h1 className="mt-1 font-mono text-lg font-semibold">{r.refNo}</h1>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/requests/${r.id}/pdf?download=1`} className="btn-ghost">
            Download PDF
          </a>
          <StatusActions id={r.id} initialStatus={r.status} />
          {canDelete && <DeleteRequest id={r.id} refNo={r.refNo} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr,1.15fr]">
        {/* Summary */}
        <div className="card space-y-4 p-5">
          <Row label="Company">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.company.brandColor }} />
              {r.company.name}
            </span>
          </Row>
          <Row label="Date">{formatDate(r.date)}</Row>
          <Row label="Status">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                r.status === "PAID" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {r.status === "PAID" ? "Paid" : "Pending"}
            </span>
          </Row>
          <Row label="Purchase">
            USD {formatAmount(r.usdAmount)} from {r.source} at {r.rate}
          </Row>
          <Row label="Transfer from">{r.sourceAccount}</Row>

          <div>
            <div className="label">Transfers</div>
            <div className="space-y-3">
              {transfers.map((t, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="font-medium">{t.recipient}</div>
                  <div className="text-slate-500">A/C No. {t.account}</div>
                  <ul className="mt-1 space-y-0.5">
                    {t.amounts.map((a, j) => (
                      <li key={j} className="text-slate-700">
                        {j + 1}) {formatAmount(a)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <Row label="Total MVR">
            <strong>{formatAmount(totalMvr(transfers))}</strong>
          </Row>
          <Row label="Requested by">{r.requestedBy}</Row>
          <Row label="Approved by">{r.approvedBy || "\u2014"}</Row>
          <Row label="Created by">
            {r.createdBy.name} · {formatDate(r.createdAt)}
          </Row>
        </div>

        {/* PDF preview */}
        <div className="card overflow-hidden">
          <iframe
            src={`/api/requests/${r.id}/pdf`}
            className="h-[820px] w-full"
            title="Request PDF preview"
          />
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
