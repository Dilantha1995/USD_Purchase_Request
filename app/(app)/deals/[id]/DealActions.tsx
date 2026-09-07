"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DealActions({
  dealId,
  currentUsdAmount,
  currentRate,
  status,
  canEdit,
  canDelete,
}: {
  dealId: string;
  currentUsdAmount: number;
  currentRate: number;
  status: "OPEN" | "CLOSED";
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"" | "receipt" | "rate">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Record USD receipt
  const [rDate, setRDate] = useState(todayISO());
  const [rAmount, setRAmount] = useState("");
  const [rNotes, setRNotes] = useState("");

  // Change rate/amount
  const [newUsdAmount, setNewUsdAmount] = useState(String(currentUsdAmount));
  const [newRate, setNewRate] = useState(String(currentRate));
  const [reason, setReason] = useState("");

  function closePanel() {
    setPanel("");
    setError("");
  }

  async function submitReceipt(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch(`/api/deals/${dealId}/receipts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: rDate, usdAmount: parseFloat(rAmount), notes: rNotes }),
    });
    setBusy(false);
    if (res.ok) {
      setRAmount(""); setRNotes(""); closePanel();
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not record the USD receipt");
    }
  }

  async function submitRateChange(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newUsdAmount: parseFloat(newUsdAmount), newRate: parseFloat(newRate), reason }),
    });
    setBusy(false);
    if (res.ok) {
      setReason(""); closePanel();
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not update the deal");
    }
  }

  async function toggleStatus() {
    if (!window.confirm(status === "OPEN" ? "Close this deal?" : "Reopen this deal?")) return;
    setBusy(true);
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status === "OPEN" ? "CLOSED" : "OPEN" }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("Could not update the deal status");
  }

  async function remove() {
    if (!window.confirm("Delete this deal? This only works if no payments or receipts are recorded against it.")) return;
    setBusy(true);
    const res = await fetch(`/api/deals/${dealId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) { router.push("/deals"); router.refresh(); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || "Could not delete the deal"); }
  }

  if (!canEdit) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => setPanel(panel === "receipt" ? "" : "receipt")}>
          Record USD received
        </button>
        <button type="button" className="btn-ghost" onClick={() => setPanel(panel === "rate" ? "" : "rate")}>
          Change rate / amount
        </button>
        <a href={`/api/deals/${dealId}/statement?download=1`} className="btn-ghost">Download statement</a>
        <button type="button" className="btn-ghost" onClick={toggleStatus} disabled={busy}>
          {status === "OPEN" ? "Close deal" : "Reopen deal"}
        </button>
        {canDelete && (
          <button type="button" className="text-sm text-red-600 hover:underline" onClick={remove} disabled={busy}>
            Delete deal
          </button>
        )}
      </div>

      {panel === "receipt" && (
        <form onSubmit={submitReceipt} className="card space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Record USD received from supplier</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><label className="label">Date</label><input type="date" className="input" value={rDate} onChange={(e) => setRDate(e.target.value)} required /></div>
            <div><label className="label">USD amount</label><input type="number" step="0.01" min="0" className="input" value={rAmount} onChange={(e) => setRAmount(e.target.value)} placeholder="10000" required /></div>
            <div><label className="label">Notes</label><input className="input" value={rNotes} onChange={(e) => setRNotes(e.target.value)} placeholder="e.g. Advance receipt" /></div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save receipt"}</button>
            <button type="button" className="btn-ghost" onClick={closePanel}>Cancel</button>
          </div>
        </form>
      )}

      {panel === "rate" && (
        <form onSubmit={submitRateChange} className="card space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Revise agreed USD amount / rate</h3>
          <p className="text-xs text-slate-500">This is logged in the deal&apos;s rate history. Past requests keep their original rate.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><label className="label">New USD amount</label><input type="number" step="0.01" min="0" className="input" value={newUsdAmount} onChange={(e) => setNewUsdAmount(e.target.value)} required /></div>
            <div><label className="label">New rate</label><input type="number" step="0.0001" min="0" className="input" value={newRate} onChange={(e) => setNewRate(e.target.value)} required /></div>
            <div><label className="label">Reason</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Bank rate moved" /></div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save revision"}</button>
            <button type="button" className="btn-ghost" onClick={closePanel}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
