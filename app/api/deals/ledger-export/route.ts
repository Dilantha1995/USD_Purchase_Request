import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatAmount, formatDate } from "@/lib/format";
import { buildDealLedger, computeDealTotals, LedgerEntry } from "@/lib/deal";
import * as XLSX from "xlsx";
import { renderTablePdf, PdfCol, slugifyTitle, buildReportSheet } from "@/lib/pdfTable";

export const runtime = "nodejs";

const HEADERS = ["Date", "Deal Ref", "Deal Name", "Supplier", "Type", "Description", "MVR Debit", "USD Credit"];

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const company = url.searchParams.get("company") || "";
  const status = url.searchParams.get("status") === "CLOSED" ? "CLOSED" : url.searchParams.get("status") === "OPEN" ? "OPEN" : "";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const dealId = url.searchParams.get("dealId") || "";

  const where: any = dealId ? { id: dealId } : {};
  if (!dealId) {
    if (company === "PSMS" || company === "PPM") where.companyId = company;
    if (status) where.status = status;
  }

  const deals = await prisma.deal.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
      supplier: { select: { name: true } },
      requests: { orderBy: { date: "asc" } },
      usdReceipts: { orderBy: { date: "asc" } },
    },
    orderBy: { refNo: "asc" },
  });

  const fromDate = from ? new Date(`${from}T00:00:00Z`) : null;
  const toDate = to ? new Date(`${to}T23:59:59Z`) : null;

  const deriveDealRows = deals
    .filter((d: (typeof deals)[number]) =>
      dealId || !q ? true : `${d.refNo} ${d.name} ${d.supplier.name}`.toLowerCase().includes(q)
    )
    .map((d: (typeof deals)[number]) => {
      const entries = buildDealLedger(d.requests, d.usdReceipts).filter((e) => {
        if (fromDate && e.date < fromDate) return false;
        if (toDate && e.date > toDate) return false;
        return true;
      });
      // Pending amounts reflect the deal's current standing overall, not just
      // the transactions within the selected period.
      const totals = computeDealTotals(d, d.requests, d.usdReceipts);
      return { deal: d, entries, mvrPending: Math.max(totals.mvrPending, 0), usdPending: Math.max(totals.usdPending, 0) };
    })
    .filter(({ entries }: { entries: LedgerEntry[] }) => entries.length > 0);

  const title = dealId && deriveDealRows[0]
    ? `General Ledger — ${deriveDealRows[0].deal.refNo} · ${deriveDealRows[0].deal.name}`
    : `General Ledger — Dollar Purchase Deals — ${company || "All companies"}${status ? ` (${status === "CLOSED" ? "Closed" : "Open"})` : ""}`;
  const subtitle = from || to ? `Period: ${from || "start"} to ${to || "today"}` : undefined;
  const rangeLabel = from || to ? `${from || "start"}_to_${to || "today"}` : "all";
  const fileBase = `${slugifyTitle(title)}-${rangeLabel}`;

  const grand = { mvrDebit: 0, usdCredit: 0, mvrPending: 0, usdPending: 0 };

  if (format === "xlsx") {
    const aoa: (string | number)[][] = [];
    for (const { deal, entries, mvrPending, usdPending } of deriveDealRows) {
      let subMvr = 0, subUsd = 0;
      for (const e of entries) {
        aoa.push([
          formatDate(e.date), deal.refNo, deal.name, deal.supplier.name,
          e.type === "PAYMENT" ? "Payment" : "Receipt", e.description,
          e.mvrDebit || 0, e.usdCredit || 0,
        ]);
        subMvr += e.mvrDebit || 0;
        subUsd += e.usdCredit || 0;
      }
      aoa.push(["", "", "", "", "", `Subtotal — ${deal.refNo}`, subMvr, subUsd]);
      aoa.push(["", "", "", "", "", "Pending MVR to pay", mvrPending, ""]);
      aoa.push(["", "", "", "", "", "Pending USD to receive", "", usdPending]);
      aoa.push([]); // blank row so deals don't visually run into each other
      grand.mvrDebit += subMvr;
      grand.usdCredit += subUsd;
      grand.mvrPending += mvrPending;
      grand.usdPending += usdPending;
    }
    aoa.push(["", "", "", "", "", "Grand total (paid / received)", grand.mvrDebit, grand.usdCredit]);
    aoa.push(["", "", "", "", "", "Grand total pending (to pay / to receive)", grand.mvrPending, grand.usdPending]);

    const ws = buildReportSheet({
      title,
      subtitle,
      headers: HEADERS,
      rows: aoa,
      colWidths: [12, 18, 34, 20, 9, 40, 14, 14],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "General Ledger");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Matches the Excel export's columns exactly, on a page wide enough that
  // the Description column (recipient, account, and which split n/m of a
  // multi-amount transfer) still isn't truncated even with Deal Name shown.
  const cols: PdfCol[] = [
    { h: "Date", w: 50, key: "date", align: "l" },
    { h: "Deal Ref", w: 105, key: "dealRef", align: "l" },
    { h: "Deal Name", w: 165, key: "dealName", align: "l" },
    { h: "Supplier", w: 85, key: "supplier", align: "l" },
    { h: "Type", w: 42, key: "type", align: "l" },
    { h: "Description", w: 460, key: "description", align: "l" },
    { h: "MVR Debit", w: 78, key: "mvrDebit", align: "r" },
    { h: "USD Credit", w: 78, key: "usdCredit", align: "r" },
  ];
  const PDF_WIDTH = 1150;

  const pdfRows: { cells: Record<string, string>; bold?: boolean; topBorder?: boolean }[] = [];
  for (const { deal, entries, mvrPending, usdPending } of deriveDealRows) {
    let subMvr = 0, subUsd = 0;
    for (const e of entries) {
      pdfRows.push({
        cells: {
          date: formatDate(e.date),
          dealRef: deal.refNo,
          dealName: deal.name,
          supplier: deal.supplier.name,
          type: e.type === "PAYMENT" ? "Payment" : "Receipt",
          description: e.description,
          mvrDebit: e.mvrDebit ? formatAmount(e.mvrDebit) : "",
          usdCredit: e.usdCredit ? formatAmount(e.usdCredit) : "",
        },
      });
      subMvr += e.mvrDebit || 0;
      subUsd += e.usdCredit || 0;
    }
    pdfRows.push({
      bold: true,
      topBorder: true,
      cells: { description: `Subtotal — ${deal.refNo}`, mvrDebit: formatAmount(subMvr), usdCredit: formatAmount(subUsd) },
    });
    pdfRows.push({ cells: { description: "Pending MVR to pay", mvrDebit: formatAmount(mvrPending) } });
    pdfRows.push({ cells: { description: "Pending USD to receive", usdCredit: formatAmount(usdPending) } });
    pdfRows.push({ cells: {} }); // blank row so deals don't visually run into each other
    grand.mvrDebit += subMvr;
    grand.usdCredit += subUsd;
    grand.mvrPending += mvrPending;
    grand.usdPending += usdPending;
  }
  if (!dealId && deriveDealRows.length > 1) {
    pdfRows.push({
      bold: true,
      topBorder: true,
      cells: { description: "Grand total (paid / received)", mvrDebit: formatAmount(grand.mvrDebit), usdCredit: formatAmount(grand.usdCredit) },
    });
    pdfRows.push({
      bold: true,
      cells: { description: "Grand total pending (to pay / to receive)", mvrDebit: formatAmount(grand.mvrPending), usdCredit: formatAmount(grand.usdPending) },
    });
  }

  const bytes = await renderTablePdf({
    title,
    subtitle,
    cols,
    pageWidth: PDF_WIDTH,
    rows: pdfRows,
  });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
