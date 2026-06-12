"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildRefNo, formatAmount } from "@/lib/format";

type Company = {
  id: string;
  name: string;
  refPrefix: string;
  brandColor: string;
  nextSerial: number;
};

type TransferDraft = { recipient: string; account: string; amounts: string[] };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function NewRequestForm({
  companies,
  defaultRequestedBy,
}: {
  companies: Company[];
  defaultRequestedBy: string;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const company = companies.find((c) => c.id === companyId)!;

  const [date, setDate] = useState(todayISO());
  const [usdAmount, setUsdAmount] = useState("");
  const [rate, setRate] = useState("");
  const [source, setSource] = useState("");
  const [sourceAccount, setSourceAccount] = useState(`${company?.refPrefix ?? ""} BML MVR`);
  const [requestedBy, setRequestedBy] = useState(defaultRequestedBy);
  const [approvedBy, setApprovedBy] = useState("");
  const [transfers, setTransfers] = useState<TransferDraft[]>([
    { recipient: "", account: "", amounts: [""] },
  ]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function pickCompany(id: string) {
    setCompanyId(id);
    const c = companies.find((x) => x.id === id);
    // keep a custom source account if the user already changed it from the default
    setSourceAccount((prev) => {
      const wasDefault = companies.some((x) => prev === `${x.refPrefix} BML MVR`);
      return wasDefault && c ? `${c.refPrefix} BML MVR` : prev;
    });
  }

  const refPreview = useMemo(() => {
    if (!company) return "";
    const d = new Date(`${date}T00:00:00Z`);
    if (isNaN(d.getTime())) return "";
    return buildRefNo(company.refPrefix, d, company.nextSerial);
  }, [company, date]);

  const totalMvr = useMemo(
    () =>
      transfers.reduce(
        (s, t) => s + t.amounts.reduce((a, b) => a + (parseFloat(b) || 0), 0),
        0
      ),
    [transfers]
  );
  const expectedMvr = (parseFloat(usdAmount) || 0) * (parseFloat(rate) || 0);
  const mvrMismatch =
    expectedMvr > 0 && totalMvr > 0 && Math.abs(expectedMvr - totalMvr) > 0.5;

  // transfer editing
  const setTransfer = (i: number, patch: Partial<TransferDraft>) =>
    setTransfers((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTransfer = () =>
    setTransfers((ts) => [...ts, { recipient: "", account: "", amounts: [""] }]);
  const removeTransfer = (i: number) =>
    setTransfers((ts) => (ts.length > 1 ? ts.filter((_, idx) => idx !== i) : ts));
  const setAmount = (ti: number, ai: number, val: string) =>
    setTransfers((ts) =>
      ts.map((t, idx) =>
        idx === ti ? { ...t, amounts: t.amounts.map((a, j) => (j === ai ? val : a)) } : t
      )
    );
  const addAmount = (ti: number) =>
    setTransfers((ts) =>
      ts.map((t, idx) => (idx === ti ? { ...t, amounts: [...t.amounts, ""] } : t))
    );
  const removeAmount = (ti: number, ai: number) =>
    setTransfers((ts) =>
      ts.map((t, idx) =>
        idx === ti && t.amounts.length > 1
          ? { ...t, amounts: t.amounts.filter((_, j) => j !== ai) }
          : t
      )
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload = {
      companyId,
      date,
      usdAmount: parseFloat(usdAmount),
      rate: parseFloat(rate),
      source,
      sourceAccount,
      requestedBy,
      approvedBy,
      transfers: transfers.map((t) => ({
        recipient: t.recipient,
        account: t.account,
        amounts: t.amounts.map((a) => parseFloat(a)).filter((n) => !isNaN(n) && n > 0),
      })),
    };
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/requests/${id}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save the request.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">New dollar purchase request</h1>
        {refPreview && (
          <span className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600">
            {refPreview}
          </span>
        )}
      </div>

      {/* Company */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {companies.map((c) => {
          const active = c.id === companyId;
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => pickCompany(c.id)}
              className={`card flex items-center gap-3 p-4 text-left transition ${
                active ? "ring-2" : "hover:bg-slate-50"
              }`}
              style={active ? { boxShadow: `0 0 0 2px ${c.brandColor}` } : undefined}
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.brandColor }} />
              <span>
                <span className="block text-sm font-medium">{c.name}</span>
                <span className="block text-xs text-slate-500">Next: {c.refPrefix}/DEX/&hellip;/{String(c.nextSerial).padStart(2, "0")}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Purchase details */}
      <div className="card space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="label">USD amount</label>
            <input type="number" step="0.01" min="0" className="input" value={usdAmount} onChange={(e) => setUsdAmount(e.target.value)} placeholder="4000" required />
          </div>
          <div>
            <label className="label">Rate</label>
            <input type="number" step="0.0001" min="0" className="input" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="20.40" required />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Purchased from</label>
            <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Island amenities" required />
          </div>
          <div>
            <label className="label">Transfer from (account label)</label>
            <input className="input" value={sourceAccount} onChange={(e) => setSourceAccount(e.target.value)} placeholder="PSMS BML MVR" required />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Document line: “Purchase of USD {usdAmount ? formatAmount(parseFloat(usdAmount) || 0) : "\u2026"} from {source || "\u2026"} at {rate || "\u2026"}”
        </p>
      </div>

      {/* Transfers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Transfers</h2>
          <span className="text-sm text-slate-500">
            Total MVR: <strong className="text-ink">{formatAmount(totalMvr)}</strong>
          </span>
        </div>
        {mvrMismatch && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Heads up: USD × rate = {formatAmount(expectedMvr)}, but the transfer amounts add up to {formatAmount(totalMvr)}.
          </p>
        )}

        {transfers.map((t, ti) => (
          <div key={ti} className="card space-y-3 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Recipient name</label>
                <input className="input" value={t.recipient} onChange={(e) => setTransfer(ti, { recipient: e.target.value })} placeholder="Aishath Zoona" />
              </div>
              <div>
                <label className="label">Account number</label>
                <input className="input" value={t.account} onChange={(e) => setTransfer(ti, { account: e.target.value })} placeholder="7703-215049-101" />
              </div>
            </div>
            <div>
              <label className="label">Amounts (MVR) — split into multiple lines if the bank needs separate transfers</label>
              <div className="space-y-2">
                {t.amounts.map((a, ai) => (
                  <div key={ai} className="flex items-center gap-2">
                    <span className="w-6 text-right text-sm text-slate-400">{ai + 1})</span>
                    <input type="number" step="0.01" min="0" className="input" value={a} onChange={(e) => setAmount(ti, ai, e.target.value)} placeholder="61680" />
                    <button type="button" onClick={() => removeAmount(ti, ai)} className="btn-ghost px-2 py-1 text-xs" disabled={t.amounts.length === 1}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addAmount(ti)} className="mt-2 text-sm font-medium text-ink hover:underline">
                + Add amount
              </button>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => removeTransfer(ti)} className="text-sm text-red-600 hover:underline disabled:opacity-40" disabled={transfers.length === 1}>
                Remove transfer
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addTransfer} className="btn-ghost">
          + Add transfer to another account
        </button>
      </div>

      {/* Signatories */}
      <div className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="label">Requested by</label>
          <input className="input" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Azmal Aslam" required />
        </div>
        <div>
          <label className="label">Processed and approved by</label>
          <input className="input" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Shareefa Adam Manik" />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving\u2026" : "Save & generate"}
        </button>
        <span className="text-xs text-slate-500">
          The reference number is assigned when you save.
        </span>
      </div>
    </form>
  );
}
