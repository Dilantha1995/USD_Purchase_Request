"use client";

import { useEffect, useState } from "react";

type Account = { id: string; label: string; companyId?: string | null; bankName?: string | null; accountName?: string | null; accountNo?: string | null; currency: string; active: boolean };

const COMPANIES = [
  { id: "PSMS", name: "ProSynergy" },
  { id: "PPM", name: "ProPharma" },
];

export default function BankAccountsManager() {
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ label: "", companyId: "PSMS", bankName: "", accountName: "", accountNo: "", currency: "MVR" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/bank-accounts");
    setItems(res.ok ? await res.json() : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setError("");
    if (!form.label.trim()) { setError("An account label is required"); return; }
    setBusy(true);
    const res = await fetch("/api/bank-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setBusy(false);
    if (res.ok) { setForm({ label: "", companyId: "PSMS", bankName: "", accountName: "", accountNo: "", currency: "MVR" }); load(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || "Could not save"); }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Delete account "${label}"?`)) return;
    const res = await fetch(`/api/bank-accounts/${id}`, { method: "DELETE" });
    if (res.ok) load(); else alert("Could not delete");
  }

  const coName = (id?: string | null) => COMPANIES.find((c) => c.id === id)?.name || "—";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Our company bank accounts</h1>

      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-slate-700">Add an account</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Label * (shown on the document, e.g. PSMS BML MVR)</label><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
          <div><label className="label">Company</label><select className="input" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>{COMPANIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="label">Bank name</label><input className="input" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
          <div><label className="label">Account number</label><input className="input" value={form.accountNo} onChange={(e) => setForm({ ...form, accountNo: e.target.value })} /></div>
          <div><label className="label">Account name</label><input className="input" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} /></div>
          <div><label className="label">Currency</label><input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={add} disabled={busy} className="btn-primary">{busy ? "Saving…" : "Add account"}</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Label</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Bank</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Ccy</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{a.label}</td>
                <td className="px-4 py-3 text-slate-600">{coName(a.companyId)}</td>
                <td className="px-4 py-3 text-slate-600">{a.bankName || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{a.accountNo || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{a.currency}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => remove(a.id, a.label)} className="text-sm text-red-600 hover:underline">Delete</button></td>
              </tr>
            ))}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No accounts yet. Add one above.</td></tr>}
            {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
