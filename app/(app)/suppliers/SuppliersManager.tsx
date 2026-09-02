"use client";

import { useEffect, useState } from "react";

type Account = { name: string; bankName: string; accountNo: string };
type Supplier = { id: string; name: string; notes?: string | null; accounts?: Account[] | null };

const emptyAccount = (): Account => ({ name: "", bankName: "", accountNo: "" });

function AccountEditor({
  accounts,
  setAccounts,
}: {
  accounts: Account[];
  setAccounts: (a: Account[]) => void;
}) {
  const set = (i: number, patch: Partial<Account>) =>
    setAccounts(accounts.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  return (
    <div className="space-y-2">
      <div className="label">Bank accounts (add one row per beneficiary company/account)</div>
      {accounts.map((a, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr,1fr,1fr,auto]">
          <input className="input" placeholder="Account / company name" value={a.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input className="input" placeholder="Bank" value={a.bankName} onChange={(e) => set(i, { bankName: e.target.value })} />
          <input className="input" placeholder="Account number" value={a.accountNo} onChange={(e) => set(i, { accountNo: e.target.value })} />
          <button type="button" onClick={() => setAccounts(accounts.filter((_, idx) => idx !== i))} className="btn-ghost px-2 text-xs" disabled={accounts.length === 1}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => setAccounts([...accounts, emptyAccount()])} className="text-sm font-medium text-ink hover:underline">+ Add bank account</button>
    </div>
  );
}

export default function SuppliersManager() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([emptyAccount()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/suppliers");
    const data = res.ok ? await res.json() : [];
    setItems(data.map((s: any) => ({ ...s, accounts: Array.isArray(s.accounts) ? s.accounts : [] })));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setError("");
    if (!name.trim()) { setError("Supplier name is required"); return; }
    setBusy(true);
    const res = await fetch("/api/suppliers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, notes, accounts: accounts.filter((a) => a.name || a.accountNo) }),
    });
    setBusy(false);
    if (res.ok) { setName(""); setNotes(""); setAccounts([emptyAccount()]); load(); }
    else { const d = await res.json().catch(() => ({})); setError(d.error || "Could not save"); }
  }

  async function remove(id: string, nm: string) {
    if (!window.confirm(`Delete supplier "${nm}"?`)) return;
    const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    if (res.ok) load(); else alert("Could not delete");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Suppliers (USD sellers)</h1>

      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-slate-700">Add a supplier</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Supplier name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Island amenities" /></div>
          <div><label className="label">Notes</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <AccountEditor accounts={accounts} setAccounts={setAccounts} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={add} disabled={busy} className="btn-primary">{busy ? "Saving…" : "Add supplier"}</button>
      </div>

      <div className="space-y-3">
        {loading && <div className="card p-6 text-center text-slate-500">Loading…</div>}
        {!loading && items.length === 0 && <div className="card p-6 text-center text-slate-500">No suppliers yet. Add one above.</div>}
        {items.map((s) => (
          <SupplierCard key={s.id} supplier={s} editing={editing === s.id} onEdit={() => setEditing(s.id)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} onDelete={() => remove(s.id, s.name)} />
        ))}
      </div>
    </div>
  );
}

function SupplierCard({
  supplier, editing, onEdit, onClose, onSaved, onDelete,
}: {
  supplier: Supplier; editing: boolean; onEdit: () => void; onClose: () => void; onSaved: () => void; onDelete: () => void;
}) {
  const [name, setName] = useState(supplier.name);
  const [notes, setNotes] = useState(supplier.notes || "");
  const [accounts, setAccounts] = useState<Account[]>(supplier.accounts?.length ? supplier.accounts : [emptyAccount()]);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, notes, accounts: accounts.filter((a) => a.name || a.accountNo) }),
    });
    setBusy(false);
    if (res.ok) onSaved(); else alert("Could not save");
  }

  if (!editing) {
    const list = supplier.accounts || [];
    return (
      <div className="card p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-medium">{supplier.name}</div>
            {supplier.notes && <div className="text-xs text-slate-500">{supplier.notes}</div>}
          </div>
          <div className="flex gap-3">
            <button onClick={onEdit} className="text-sm text-ink hover:underline">Edit</button>
            <button onClick={onDelete} className="text-sm text-red-600 hover:underline">Delete</button>
          </div>
        </div>
        <div className="mt-2 text-sm text-slate-600">
          {list.length === 0 ? <span className="text-slate-400">No bank accounts yet — click Edit to add.</span> : (
            <ul className="space-y-0.5">
              {list.map((a, i) => (
                <li key={i}>{a.name}{a.bankName ? ` · ${a.bankName}` : ""}{a.accountNo ? ` · A/C ${a.accountNo}` : ""}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4 ring-2 ring-slate-200">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label">Supplier name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Notes</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <AccountEditor accounts={accounts} setAccounts={setAccounts} />
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save changes"}</button>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}
