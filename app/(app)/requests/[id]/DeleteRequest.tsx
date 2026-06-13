"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteRequest({ id, refNo }: { id: string; refNo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!window.confirm(`Delete request ${refNo}? This cannot be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Could not delete.");
      setBusy(false);
    }
  }

  return (
    <button onClick={del} disabled={busy} className="btn-ghost text-red-600">
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
