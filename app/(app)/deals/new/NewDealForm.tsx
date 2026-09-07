"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildDealName, formatAmount } from "@/lib/format";

type Company = { id: string; name: string; brandColor: string };
type Supplier = { id: string; name: string };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NewDealForm({ companies, suppliers }: { companies: Company[]; suppliers: Supplier[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [usdAmount, setUsdAmount] = useState("");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const supplier = suppliers.find((s) => s.id === supplierId);

  const namePreview = useMemo(() => {
    if (!supplier || !usdAmount || !rate) return "";
    const d = new Date(`${date}T00:00:00Z`);
    if (isNaN(d.getTime())) return "";
    return buildDealName(supplier.name, parseFloat(usdAmount) || 0, parseFloat(rate) || 0, d);
  }, [supplier, usdAmount, rate, date]);

  const totalMvr = (parseFloat(usdAmount) || 0) * (parseFloat(rate) || 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        supplierId,
        date,
        usdAmount: parseFloat(usdAmount),
        rate: parseFloat(rate),
        notes,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/deals/${data.id}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not create the deal.");
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-xl font-semibold">New dollar purchase deal</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {companies.map((c) => {
          const active = c.id === companyId;
          return (
            <button type="button" key={c.id} onClick={() => setCompanyId(c.id)}
              className={`card flex items-center gap-3 p-4 text-left transition ${active ? "ring-2" : "hover:bg-slate-50"}`}
              style={active ? { boxShadow: `0 0 0 2px ${c.brandColor}` } : undefined}>
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.brandColor }} />
              <span className="text-sm font-medium">{c.name}</span>
            </button>
          );
        })}
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <label className="label">Supplier (USD seller) *</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="">— select a supplier —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div><label className="label">Deal date</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div><label className="label">Agreed USD amount</label><input type="number" step="0.01" min="0" className="input" value={usdAmount} onChange={(e) => setUsdAmount(e.target.value)} placeholder="50000" required /></div>
          <div><label className="label">Agreed rate</label><input type="number" step="0.0001" min="0" className="input" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="20.15" required /></div>
        </div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. To be settled within 10 days across multiple payments" /></div>

        {totalMvr > 0 && (
          <p className="text-xs text-slate-500">
            Total to pay: <strong className="text-ink">MVR {formatAmount(totalMvr)}</strong> for USD {formatAmount(parseFloat(usdAmount) || 0)} at {rate || "…"}
          </p>
        )}
        {namePreview && (
          <p className="text-xs text-slate-500">
            Deal name: <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-ink">{namePreview}</span>
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Create deal"}</button>
    </form>
  );
}
