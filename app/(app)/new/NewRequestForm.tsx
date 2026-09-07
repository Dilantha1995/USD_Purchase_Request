"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildRefNo, formatAmount } from "@/lib/format";

type Company = { id: string; name: string; refPrefix: string; brandColor: string; nextSerial: number; serialPeriod?: string | null };
type SupplierAccount = { name: string; bankName?: string; accountNo?: string };
type Supplier = { id: string; name: string; accounts?: SupplierAccount[] | null };
type BankAccount = { id: string; label: string; companyId?: string | null };
type TransferDraft = { sourceAccount: string; recipient: string; bankName: string; account: string; amounts: string[] };
type Deal = { id: string; refNo: string; name: string; companyId: string; supplierId: string; rate: number; mvrPending: number; usdPending: number; pending: boolean; status?: "OPEN" | "CLOSED" };

type Existing = {
  id: string;
  companyId: string;
  companyName: string;
  refNo: string;
  date: string;
  usdAmount: string;
  rate: string;
  source: string;
  dealId?: string | null;
  requestedBy: string;
  approvedBy: string;
  transfers: TransferDraft[];
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NewRequestForm({
  companies, suppliers, bankAccounts, deals, defaultDealId, defaultRequestedBy, existing,
}: {
  companies: Company[];
  suppliers: Supplier[];
  bankAccounts: BankAccount[];
  deals?: Deal[];
  defaultDealId?: string;
  defaultRequestedBy: string;
  existing?: Existing;
}) {
  const router = useRouter();
  const isEdit = !!existing;
  const allDeals = deals || [];
  const linkedDeal = existing?.dealId ? allDeals.find((d) => d.id === existing.dealId) : undefined;
  const preselectedDeal = !isEdit && defaultDealId ? allDeals.find((d) => d.id === defaultDealId) : undefined;
  const initialDeal = linkedDeal ?? preselectedDeal;

  const [companyId, setCompanyId] = useState(existing?.companyId ?? initialDeal?.companyId ?? companies[0]?.id ?? "");
  const company = companies.find((c) => c.id === companyId);

  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [usdAmount, setUsdAmount] = useState(existing?.usdAmount ?? "");
  const [rate, setRate] = useState(existing?.rate ?? (initialDeal ? String(initialDeal.rate) : ""));
  const [dealId, setDealId] = useState(initialDeal?.id ?? "");
  const [supplierId, setSupplierId] = useState(() => {
    if (initialDeal) return initialDeal.supplierId;
    if (!existing) return "";
    const m = suppliers.find((s) => s.name === existing.source);
    return m?.id ?? "";
  });
  const [source, setSource] = useState(existing?.source ?? "");
  const [requestedBy, setRequestedBy] = useState(existing?.requestedBy ?? defaultRequestedBy);
  const [approvedBy, setApprovedBy] = useState(existing?.approvedBy ?? "");
  const [transfers, setTransfers] = useState<TransferDraft[]>(
    existing?.transfers?.length ? existing.transfers : [{ sourceAccount: "", recipient: "", bankName: "", account: "", amounts: [""] }]
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedDeal = allDeals.find((d) => d.id === dealId);
  const dealsForCompany = allDeals.filter((d) => d.companyId === companyId);

  function pickDeal(id: string) {
    setDealId(id);
    const d = allDeals.find((x) => x.id === id);
    if (d) {
      setSupplierId(d.supplierId);
      setRate(String(d.rate));
    }
  }

  function changeCompany(id: string) {
    setCompanyId(id);
    if (dealId && !allDeals.some((d) => d.id === dealId && d.companyId === id)) {
      setDealId("");
    }
  }

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const supplierAccounts = selectedSupplier?.accounts || [];
  const companyBankAccounts = bankAccounts.filter((b) => !b.companyId || b.companyId === companyId);

  // effective supplier/source name
  const effectiveSource = supplierId ? (selectedSupplier?.name ?? "") : source;

  const refPreview = useMemo(() => {
    if (isEdit) return existing!.refNo;
    if (!company) return "";
    const d = new Date(`${date}T00:00:00Z`);
    if (isNaN(d.getTime())) return "";
    const period = `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const sameMonth = company.serialPeriod === period || company.serialPeriod == null;
    const serial = sameMonth ? company.nextSerial : 1;
    return buildRefNo(company.refPrefix, d, serial);
  }, [company, date, isEdit, existing]);

  const totalMvr = useMemo(
    () => transfers.reduce((s, t) => s + t.amounts.reduce((a, b) => a + (parseFloat(b) || 0), 0), 0),
    [transfers]
  );
  const expectedMvr = (parseFloat(usdAmount) || 0) * (parseFloat(rate) || 0);
  const mvrMismatch = expectedMvr > 0 && totalMvr > 0 && Math.abs(expectedMvr - totalMvr) > 0.5;

  const setTransfer = (i: number, patch: Partial<TransferDraft>) =>
    setTransfers((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTransfer = () => setTransfers((ts) => [...ts, { sourceAccount: ts[ts.length - 1]?.sourceAccount || "", recipient: "", bankName: "", account: "", amounts: [""] }]);
  const removeTransfer = (i: number) => setTransfers((ts) => (ts.length > 1 ? ts.filter((_, idx) => idx !== i) : ts));
  const setAmount = (ti: number, ai: number, val: string) =>
    setTransfers((ts) => ts.map((t, idx) => (idx === ti ? { ...t, amounts: t.amounts.map((a, j) => (j === ai ? val : a)) } : t)));
  const addAmount = (ti: number) => setTransfers((ts) => ts.map((t, idx) => (idx === ti ? { ...t, amounts: [...t.amounts, ""] } : t)));
  const removeAmount = (ti: number, ai: number) =>
    setTransfers((ts) => ts.map((t, idx) => (idx === ti && t.amounts.length > 1 ? { ...t, amounts: t.amounts.filter((_, j) => j !== ai) } : t)));

  function pickRecipientAccount(ti: number, idx: string) {
    const a = supplierAccounts[Number(idx)];
    if (a) setTransfer(ti, { recipient: a.name, bankName: a.bankName || "", account: a.accountNo || "" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload: any = {
      companyId,
      date,
      usdAmount: parseFloat(usdAmount),
      rate: parseFloat(rate),
      source: effectiveSource,
      dealId: dealId || null,
      requestedBy,
      approvedBy,
      transfers: transfers.map((t) => ({
        sourceAccount: t.sourceAccount,
        recipient: t.recipient,
        bankName: t.bankName,
        account: t.account,
        amounts: t.amounts.map((a) => parseFloat(a)).filter((n) => !isNaN(n) && n > 0),
      })),
    };
    let res: Response;
    if (isEdit) {
      payload._edit = true;
      res = await fetch(`/api/requests/${existing!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      res = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setSaving(false);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      router.push(`/requests/${isEdit ? existing!.id : data.id}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save the request.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{isEdit ? "Edit request" : "New dollar purchase request"}</h1>
        {refPreview && <span className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600">{refPreview}</span>}
      </div>

      {/* Company */}
      {isEdit ? (
        <div className="card p-4 text-sm">Company: <strong>{existing!.companyName}</strong> <span className="text-slate-400">(cannot change on edit)</span></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {companies.map((c) => {
            const active = c.id === companyId;
            return (
              <button type="button" key={c.id} onClick={() => changeCompany(c.id)}
                className={`card flex items-center gap-3 p-4 text-left transition ${active ? "ring-2" : "hover:bg-slate-50"}`}
                style={active ? { boxShadow: `0 0 0 2px ${c.brandColor}` } : undefined}>
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.brandColor }} />
                <span><span className="block text-sm font-medium">{c.name}</span>
                  <span className="block text-xs text-slate-500">Next: {c.refPrefix}/DEX/&hellip;/{String(c.nextSerial).padStart(2, "0")}</span></span>
              </button>
            );
          })}
        </div>
      )}

      {/* Deal */}
      <div className="card space-y-3 p-5">
        <label className="label">Part of a deal? (optional — pays down an existing dollar purchase agreement)</label>
        <select className="input" value={dealId} onChange={(e) => pickDeal(e.target.value)}>
          <option value="">— Standalone purchase, not part of a deal —</option>
          {dealsForCompany.map((d) => (
            <option key={d.id} value={d.id}>
              {d.refNo} — {d.name} ({d.mvrPending > 0.5 ? `MVR pending ${formatAmount(d.mvrPending)}` : "fully paid"}{d.status === "CLOSED" ? " · Closed" : ""})
            </option>
          ))}
        </select>
        {selectedDeal && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Deal rate <strong>{selectedDeal.rate}</strong> — MVR pending <strong>{formatAmount(Math.max(selectedDeal.mvrPending, 0))}</strong>
            {" · "}USD {selectedDeal.usdPending < -0.5 ? "received in advance" : "pending"}{" "}
            <strong>{formatAmount(Math.abs(selectedDeal.usdPending))}</strong>
            {selectedDeal.status === "CLOSED" ? " · this deal is closed" : ""}.{" "}
            <a href={`/deals/${selectedDeal.id}`} className="underline">View deal</a>
          </p>
        )}
      </div>

      {/* Purchase details */}
      <div className="card space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div><label className="label">Date</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div><label className="label">USD amount (this payment)</label><input type="number" step="0.01" min="0" className="input" value={usdAmount} onChange={(e) => setUsdAmount(e.target.value)} placeholder="4000" required /></div>
          <div>
            <label className="label">Rate</label>
            <input type="number" step="0.0001" min="0" className="input" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="20.40" required readOnly={!!selectedDeal} />
            {selectedDeal && <p className="mt-1 text-xs text-slate-400">Locked to the deal&apos;s agreed rate. Change it from the deal page instead.</p>}
          </div>
        </div>
        <div>
          <label className="label">Supplier (USD seller)</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={!!selectedDeal}>
            <option value="">— Type manually —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {!supplierId && !selectedDeal && (
            <input className="input mt-2" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Type supplier name, e.g. Island amenities" required />
          )}
        </div>
        <p className="text-xs text-slate-500">
          Document line: “Purchase of USD {usdAmount ? formatAmount(parseFloat(usdAmount) || 0) : "\u2026"} from {effectiveSource || "\u2026"} at {rate || "\u2026"}”
        </p>
      </div>

      {/* Transfers */}
      <datalist id="companyBankAccounts">
        {companyBankAccounts.map((b) => <option key={b.id} value={b.label} />)}
      </datalist>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Transfers</h2>
          <span className="text-sm text-slate-500">Total MVR: <strong className="text-ink">{formatAmount(totalMvr)}</strong></span>
        </div>
        {mvrMismatch && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            USD × rate = {formatAmount(expectedMvr)}, but the transfer amounts add up to {formatAmount(totalMvr)}. That&apos;s fine for a partial deal payment — just double-check it&apos;s intentional.
          </p>
        )}

        {transfers.map((t, ti) => (
          <div key={ti} className="card space-y-3 p-4">
            <div>
              <label className="label">Transfer from (our account) — pick or type</label>
              <input className="input" list="companyBankAccounts" value={t.sourceAccount} onChange={(e) => setTransfer(ti, { sourceAccount: e.target.value })} placeholder="PSMS BML MVR" />
            </div>
            {supplierAccounts.length > 0 && (
              <div>
                <label className="label">Choose supplier account</label>
                <select className="input" defaultValue="" onChange={(e) => pickRecipientAccount(ti, e.target.value)}>
                  <option value="">— select an account —</option>
                  {supplierAccounts.map((a, i) => <option key={i} value={i}>{a.name}{a.accountNo ? ` · ${a.accountNo}` : ""}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><label className="label">Recipient name</label><input className="input" value={t.recipient} onChange={(e) => setTransfer(ti, { recipient: e.target.value })} placeholder="Aishath Zoona" /></div>
              <div><label className="label">Recipient bank</label><input className="input" value={t.bankName} onChange={(e) => setTransfer(ti, { bankName: e.target.value })} placeholder="BML" /></div>
              <div><label className="label">Account number</label><input className="input" value={t.account} onChange={(e) => setTransfer(ti, { account: e.target.value })} placeholder="7703-215049-101" /></div>
            </div>
            <div>
              <label className="label">Amounts (MVR) — split into multiple lines if the bank needs separate transfers</label>
              <div className="space-y-2">
                {t.amounts.map((a, ai) => (
                  <div key={ai} className="flex items-center gap-2">
                    <span className="w-6 text-right text-sm text-slate-400">{ai + 1})</span>
                    <input type="number" step="0.01" min="0" className="input" value={a} onChange={(e) => setAmount(ti, ai, e.target.value)} placeholder="61680" />
                    <button type="button" onClick={() => removeAmount(ti, ai)} className="btn-ghost px-2 py-1 text-xs" disabled={t.amounts.length === 1}>Remove</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addAmount(ti)} className="mt-2 text-sm font-medium text-ink hover:underline">+ Add amount</button>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => removeTransfer(ti)} className="text-sm text-red-600 hover:underline disabled:opacity-40" disabled={transfers.length === 1}>Remove transfer</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addTransfer} className="btn-ghost">+ Add transfer to another account</button>
      </div>

      {/* Signatories */}
      <div className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div><label className="label">Requested by</label><input className="input" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Azmal Aslam" required /></div>
        <div><label className="label">Processed and approved by</label><input className="input" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Shareefa Adam Manik" /></div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving}>{saving ? "Saving\u2026" : isEdit ? "Save changes" : "Save & generate"}</button>
        {!isEdit && <span className="text-xs text-slate-500">The reference number is assigned when you save.</span>}
      </div>
    </form>
  );
}
