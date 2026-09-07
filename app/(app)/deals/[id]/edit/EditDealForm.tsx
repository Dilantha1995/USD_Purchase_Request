"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Supplier = { id: string; name: string };

export default function EditDealForm({
  dealId,
  refNo,
  name,
  companyName,
  suppliers,
  initialSupplierId,
  initialDate,
  initialNotes,
}: {
  dealId: string;
  refNo: string;
  name: string;
  companyName: string;
  suppliers: Supplier[];
  initialSupplierId: string;
  initialDate: string;
  initialNotes: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [date, setDate] = useState(initialDate);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _edit: true, supplierId, date, notes }),
    });
    setSaving(false);
    if (res.ok) {
      router.push(`/deals/${dealId}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save the deal.");
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit deal</h1>
        <span className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600">{refNo}</span>
      </div>

      <div className="card p-4 text-sm">
        Company: <strong>{companyName}</strong> <span className="text-slate-400">(cannot change on edit)</span>
        <div className="mt-1 text-slate-400">Deal name: <span className="font-mono">{name}</span></div>
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <label className="label">Supplier (USD seller) *</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="">— select a supplier —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Deal date</label>
          <input type="date" className="input sm:w-56" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="text-xs text-slate-500">
          To revise the agreed USD amount or rate, use &quot;Change rate / amount&quot; on the deal page instead — that keeps a log of the change.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        <button type="button" className="btn-ghost" onClick={() => router.push(`/deals/${dealId}`)}>Cancel</button>
      </div>
    </form>
  );
}
