"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StatusActions({
  id,
  initialStatus,
}: {
  id: string;
  initialStatus: "PENDING" | "PAID";
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);

  async function setTo(next: "PENDING" | "PAID") {
    setBusy(true);
    const res = await fetch(`/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (res.ok) {
      setStatus(next);
      router.refresh();
    }
  }

  return status === "PAID" ? (
    <button onClick={() => setTo("PENDING")} disabled={busy} className="btn-ghost">
      Mark as pending
    </button>
  ) : (
    <button onClick={() => setTo("PAID")} disabled={busy} className="btn-primary">
      Mark as paid
    </button>
  );
}
