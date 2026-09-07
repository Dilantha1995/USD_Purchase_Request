"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildRefNo, formatAmount } from "@/lib/format";

type Company = { id: string; name: string; refPrefix: string; brandColor: string; nextSerial: number; serialPeriod?: string | null };
type BankAccount = { id: string; label: string; companyId?: string | null };
type AmountRow = { value: string; note: string };
type TransferDraft = { sourceAccount: string; recipient: string; account: string; amounts: AmountRow[] };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function InternalTransferForm({
  companies, bankAccounts, defaultRequestedBy,
}: { companies: Company[]; bankAccounts: BankAccount[]; defaultRequestedBy: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const company = companies.find((c) => c.id === companyId);
  const [date, setDate] = useState(todayISO());
  const [requestedBy, setRequestedBy] = useState(defaultRequestedBy);
  const [approvedBy, setApprovedBy] = useState("");
  const [transfers, setTransfers] = useState<TransferDraft[]>([{ sourceAccount: "", recipient: "", account: "", amounts: [{ value: "", note: "" }] }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const companyBanks = bankAccounts.filter((b) => !b.companyId || b.companyId === companyId);

  const refPreview = useMemo(() => {
    if (!company) return "";
    const d = new Date(`${date}T00:00:00Z`);
    if (isNaN(d.getTime())) return "";
    const period = `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const sameMonth = company.serialPeriod === period || company.serialPeriod == null;
    const serial = sameMonth ? company.nextSerial : 1;
    return buildRefNo(company.refPrefix, d, serial, "TRF");
  }, [company, date]);

  const total = useMemo(() => transfers.reduce((s, t) => s + t.amounts.reduce((a, r) => a + (parseFloat(r.value) || 0), 0), 0), [transfers]);

  const setT = (i: number, patch: Partial<TransferDraft>) => setTransfers((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addT = () => setTransfers((ts) => [...ts, { sourceAccount: ts[ts.length - 1]?.sourceAccount || "", recipient: "", account: "", amounts: [{ value: "", note: "" }] }]);
  const rmT = (i: number) => setTransfers((ts) => (ts.length > 1 ? ts.filter((_, idx) => idx !== i) : ts));
  const setAmt = (ti: number, ai: number, patch: Partial<AmountRow>) =>
    setTransfers((ts) => ts.map((t, idx) => (idx === ti ? { ...t, amounts: t.amounts.map((r, j) => (j === ai ? { ...r, ...patch } : r)) } : t)));
  const addAmt = (ti: number) => setTransfers((ts) => ts.map((t, idx) => (idx === ti ? { ...t, amounts: [...t.amounts, { value: "", note: "" }] } : t)));
  const rmAmt = (ti: number, ai: number) => setTransfers((ts) => ts.map((t, idx) => (idx === ti && t.amounts.length > 1 ? { ...t, amounts: t.amounts.filter((_, j) => j !== ai) } : t)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSaving(true);
    const payload = {
      docType: "TRF",
      companyId, date, requestedBy, approvedBy,
      source: "Internal Transfer",
      transfers: transfers.map((t) => ({
        sourceAccount: t.sourceAccount, recipient: t.recipient, account: t.account,
        amounts: t.amounts.map((r) => parseFloat(r.value)).filter((n) => !isNaN(n) && n > 0),
        notes: t.amounts.map((r) => r.note),
      })),
    };
    const res = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (res.ok) { const { id } = await res.json(); router.push(`/requests/${id}`); router.refresh(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || "Could not save."); }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl space-y-6">
      <datalist id="trfBanks">{companyBanks.map((b) => <option key={b.id} value={b.label} />)}</datalist>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">New internal transfer</h1>
        {refPreview && <span className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600">{refPreview}</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {companies.map((c) => {
          const active = c.id === companyId;
          return (
            <button type="button" key={c.id} onClick={() => setCompanyId(c.id)}
              className={`card flex items-center gap-3 p-4 text-left transition ${active ? "ring-2" : "hover:bg-slate-50"}`}
              style={active ? { boxShadow: `0 0 0 2px ${c.brandColor}` } : undefined}>
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.brandColor }} />
              <span className="block text-sm font-medium">{c.name}</span>
            </button>
          );
        })}
      </div>

      <div className="card p-5"><label className="label">Date</label><input type="date" className="input sm:w-56" value={date} onChange={(e) => setDate(e.target.value)} required /></div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Transfers</h2>
          <span className="text-sm text-slate-500">Total MVR: <strong className="text-ink">{formatAmount(total)}</strong></span>
        </div>
        {transfers.map((t, ti) => (
          <div key={ti} className="card space-y-3 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><label className="label">Transfer from (our account)</label><input className="input" list="trfBanks" value={t.sourceAccount} onChange={(e) => setT(ti, { sourceAccount: e.target.value })} placeholder="PSMS BML MVR" /></div>
              <div><label className="label">To account</label><input className="input" list="trfBanks" value={t.recipient} onChange={(e) => setT(ti, { recipient: e.target.value })} placeholder="PSMS MIB MVR" /></div>
              <div><label className="label">A/C No.</label><input className="input" value={t.account} onChange={(e) => setT(ti, { account: e.target.value })} placeholder="90101480017691000" /></div>
            </div>
            <div>
              <label className="label">Amounts (MVR) with optional note</label>
              <div className="space-y-2">
                {t.amounts.map((r, ai) => (
                  <div key={ai} className="flex items-center gap-2">
                    <span className="w-6 text-right text-sm text-slate-400">{ai + 1})</span>
                    <input type="number" step="0.01" min="0" className="input w-40" value={r.value} onChange={(e) => setAmt(ti, ai, { value: e.target.value })} placeholder="200000" />
                    <input className="input" value={r.note} onChange={(e) => setAmt(ti, ai, { note: e.target.value })} placeholder="Processed / Submitting for Process" />
                    <button type="button" onClick={() => rmAmt(ti, ai)} className="btn-ghost px-2 py-1 text-xs" disabled={t.amounts.length === 1}>Remove</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addAmt(ti)} className="mt-2 text-sm font-medium text-ink hover:underline">+ Add amount</button>
            </div>
            <div className="flex justify-end"><button type="button" onClick={() => rmT(ti)} className="text-sm text-red-600 hover:underline disabled:opacity-40" disabled={transfers.length === 1}>Remove transfer</button></div>
          </div>
        ))}
        <button type="button" onClick={addT} className="btn-ghost">+ Add transfer to another account</button>
      </div>

      <div className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div><label className="label">Requested by</label><input className="input" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} required /></div>
        <div><label className="label">Processed and approved by</label><input className="input" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} /></div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" disabled={saving}>{saving ? "Saving\u2026" : "Save & generate"}</button>
    </form>
  );
}
