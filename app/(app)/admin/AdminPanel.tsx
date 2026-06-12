"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Company = { id: string; name: string; refPrefix: string; brandColor: string; nextSerial: number };
type User = { id: string; email: string; name: string; role: "ADMIN" | "USER"; active: boolean };

export default function AdminPanel({
  companies,
  users,
  currentUserId,
}: {
  companies: Company[];
  users: User[];
  currentUserId: string;
}) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Admin</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Reference numbering</h2>
        <p className="text-sm text-slate-500">
          The serial counts up continuously and never resets. Set the next number to match where
          your manual sequence left off.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {companies.map((c) => (
            <SerialCard key={c.id} company={c} onSaved={() => router.refresh()} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Users</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} onChanged={() => router.refresh()} />
              ))}
            </tbody>
          </table>
        </div>
        <AddUser onCreated={() => router.refresh()} />
      </section>
    </div>
  );
}

function SerialCard({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [val, setVal] = useState(String(company.nextSerial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/companies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: company.id, nextSerial: Number(val) }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("Saved");
      onSaved();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error || "Could not save");
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: company.brandColor }} />
        <span className="text-sm font-medium">{company.name}</span>
      </div>
      <label className="label">Next serial number</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          className="input w-32"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <button onClick={save} disabled={busy} className="btn-primary">
          Save
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
      <p className="mt-2 font-mono text-xs text-slate-400">
        {company.refPrefix}/DEX/&hellip;/{String(Number(val) || 0).padStart(2, "0")}
      </p>
    </div>
  );
}

function UserRow({ user, isSelf, onChanged }: { user: User; isSelf: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, ...body }),
    });
    setBusy(false);
    onChanged();
  }

  async function resetPassword() {
    const pw = window.prompt(`Set a new password for ${user.name} (min 8 characters):`);
    if (!pw) return;
    if (pw.length < 8) {
      alert("Password must be at least 8 characters.");
      return;
    }
    await patch({ password: pw });
    alert("Password updated.");
  }

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-medium">{user.name}</td>
      <td className="px-4 py-3 text-slate-600">{user.email}</td>
      <td className="px-4 py-3">{user.role === "ADMIN" ? "Admin" : "User"}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
          {user.active ? "Active" : "Disabled"}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-3">
          <button onClick={resetPassword} disabled={busy} className="text-sm text-slate-600 hover:underline">
            Reset password
          </button>
          {!isSelf && (
            <button
              onClick={() => patch({ active: !user.active })}
              disabled={busy}
              className={`text-sm hover:underline ${user.active ? "text-red-600" : "text-green-700"}`}
            >
              {user.active ? "Disable" : "Enable"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function AddUser({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    setBusy(false);
    if (res.ok) {
      setName("");
      setEmail("");
      setPassword("");
      setRole("USER");
      setOpen(false);
      onCreated();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not create user");
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-ghost">
        + Add user
      </button>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Temporary password</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters" />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")}>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={create} disabled={busy} className="btn-primary">
          {busy ? "Creating\u2026" : "Create user"}
        </button>
        <button onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}
