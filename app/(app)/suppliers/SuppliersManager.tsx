"use client";

import { useEffect, useState } from "react";

type Supplier = { id: string; name: string; bankName?: string | null; accountName?: string | null; accountNo?: string | null; notes?: string | null; active: boolean };

export default function SuppliersManager() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", bankName: "", accountName: "", accountNo: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/suppliers");
    setItems(res.ok ? await res.json() : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setError("");
    if (!form.name.trim()) { setError("Supplier name is required"); return; }
    setBusy(true);
    const res = await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setBusy(false);
    if (res.ok) { setForm({ name: "", bankName: "", accountName: "", accountNo: "", notes: "" }); load(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || "Could not save"); }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete supplier "${name}"?`)) return;
    const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    if (res.ok) load(); else alert("Could not delete");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Suppliers (USD sellers)</h1>

      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-slate-700">Add a supplier</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Name *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Island amenities" /></div>
          <div><label className="label">Bank name</label><input className="input" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
          <div><label className="label">Account name</label><input className="input" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} /></div>
          <div><label className="label">Account number</label><input className="input" value={form.accountNo} onChange={(e) => setForm({ ...form, accountNo: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Notes</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={add} disabled={busy} className="btn-primary">{busy ? "Saving…" : "Add supplier"}</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Bank</th><th className="px-4 py-3">Account</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-slate-600">{s.bankName || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{s.accountNo || "—"}{s.accountName ? ` (${s.accountName})` : ""}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => remove(s.id, s.name)} className="text-sm text-red-600 hover:underline">Delete</button></td>
              </tr>
            ))}
            {!loading && items.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">No suppliers yet. Add one above.</td></tr>}
            {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
