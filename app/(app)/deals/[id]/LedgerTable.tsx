"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatAmount } from "@/lib/format";

export type LedgerRowVM = {
  key: string;
  dateLabel: string;
  dateISO: string;
  description: string;
  mvrDebit?: number;
  usdCredit?: number;
  requestId?: string;
  receiptId?: string;
  notes?: string;
};

export default function LedgerTable({
  dealId,
  rows,
  totalMvrPaid,
  totalUsdReceived,
  canEdit,
  canDelete,
}: {
  dealId: string;
  rows: LedgerRowVM[];
  totalMvrPaid: number;
  totalUsdReceived: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [eDate, setEDate] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eNotes, setENotes] = useState("");

  function startEdit(r: LedgerRowVM) {
    setEditingKey(r.key);
    setError("");
    setEDate(r.dateISO);
    setEAmount(String(r.usdCredit ?? ""));
    setENotes(r.notes || "");
  }

  async function saveEdit(receiptId: string) {
    setBusyKey(receiptId);
    setError("");
    const res = await fetch(`/api/deals/${dealId}/receipts/${receiptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: eDate, usdAmount: parseFloat(eAmount), notes: eNotes }),
    });
    setBusyKey(null);
    if (res.ok) {
      setEditingKey(null);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not update the receipt");
    }
  }

  async function deleteReceipt(receiptId: string) {
    if (!window.confirm("Delete this USD receipt?")) return;
    setBusyKey(receiptId);
    const res = await fetch(`/api/deals/${dealId}/receipts/${receiptId}`, { method: "DELETE" });
    setBusyKey(null);
    if (res.ok) router.refresh();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Could not delete the receipt");
    }
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-2">Date</th>
          <th className="px-4 py-2">Description</th>
          <th className="px-4 py-2 text-right">MVR Paid (Dr)</th>
          <th className="px-4 py-2 text-right">USD Received (Cr)</th>
          {(canEdit || canDelete) && <th className="px-4 py-2"></th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) =>
          editingKey === r.key ? (
            <tr key={r.key} className="bg-slate-50">
              <td className="px-4 py-2" colSpan={canEdit || canDelete ? 5 : 4}>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="label">Date</label>
                    <input type="date" className="input" value={eDate} onChange={(e) => setEDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">USD amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      value={eAmount}
                      onChange={(e) => setEAmount(e.target.value)}
                    />
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <label className="label">Notes</label>
                    <input className="input" value={eNotes} onChange={(e) => setENotes(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyKey === r.receiptId}
                      onClick={() => r.receiptId && saveEdit(r.receiptId)}
                    >
                      {busyKey === r.receiptId ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setEditingKey(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              </td>
            </tr>
          ) : (
            <tr key={r.key}>
              <td className="px-4 py-2 text-slate-600">{r.dateLabel}</td>
              <td className="px-4 py-2">
                {r.requestId ? (
                  <Link href={`/requests/${r.requestId}`} className="text-ink hover:underline">
                    {r.description}
                  </Link>
                ) : (
                  r.description
                )}
              </td>
              <td className="px-4 py-2 text-right">{r.mvrDebit ? formatAmount(r.mvrDebit) : ""}</td>
              <td className="px-4 py-2 text-right">{r.usdCredit ? formatAmount(r.usdCredit) : ""}</td>
              {(canEdit || canDelete) && (
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {r.requestId && canEdit && (
                    <Link href={`/requests/${r.requestId}/edit`} className="text-sm font-medium text-ink hover:underline">
                      Edit
                    </Link>
                  )}
                  {r.receiptId && canEdit && (
                    <button
                      type="button"
                      className="text-sm font-medium text-ink hover:underline"
                      onClick={() => startEdit(r)}
                    >
                      Edit
                    </button>
                  )}
                  {r.receiptId && canDelete && (
                    <button
                      type="button"
                      className="ml-3 text-sm text-red-600 hover:underline"
                      disabled={busyKey === r.receiptId}
                      onClick={() => deleteReceipt(r.receiptId!)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              )}
            </tr>
          )
        )}
        {rows.length === 0 && (
          <tr>
            <td colSpan={canEdit || canDelete ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
              No transactions recorded yet.
            </td>
          </tr>
        )}
      </tbody>
      {rows.length > 0 && (
        <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-medium">
          <tr>
            <td className="px-4 py-2" colSpan={2}>
              Total
            </td>
            <td className="px-4 py-2 text-right">{formatAmount(totalMvrPaid)}</td>
            <td className="px-4 py-2 text-right">{formatAmount(totalUsdReceived)}</td>
            {(canEdit || canDelete) && <td className="px-4 py-2"></td>}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
