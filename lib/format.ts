export type Transfer = {
  recipient: string;
  account: string;
  amounts: number[];
};

/** 4,000 / 61,680.00 -> grouped with commas. Keeps up to 2 decimals only if needed. */
export function formatAmount(n: number): string {
  const hasDecimals = Math.round(n * 100) % 100 !== 0;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Builds e.g. PSMS/DEX/2606/07 from prefix "PSMS", a date, and a serial. */
export function buildRefNo(prefix: string, date: Date, serial: number): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nn = String(serial).padStart(2, "0");
  return `${prefix}/DEX/${yy}${mm}/${nn}`;
}

/** Sum of every amount across all transfer lines. */
export function totalMvr(transfers: Transfer[]): number {
  return transfers.reduce(
    (sum, t) => sum + t.amounts.reduce((a, b) => a + (Number(b) || 0), 0),
    0
  );
}
