import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatAmount, formatDate } from "@/lib/format";
import { buildDealLedger, computeDealTotals, LedgerEntry } from "@/lib/deal";
import ExcelJS from "exceljs";
import { renderTablePdf, PdfCol, PdfRow, slugifyTitle } from "@/lib/pdfTable";

export const runtime = "nodejs";

const HEADERS = ["Date", "Type", "Status", "Description", "MVR Debit", "USD Credit", "Remarks"];
const COL_COUNT = HEADERS.length;

const THIN = { style: "thin" as const, color: { argb: "FF000000" } };
const DOUBLE = { style: "double" as const, color: { argb: "FF000000" } };
const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const FILL_GREEN: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
const FILL_YELLOW: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };

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
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("General Ledger");
    ws.columns = [
      { width: 13 }, { width: 10 }, { width: 10 }, { width: 66 }, { width: 15 }, { width: 15 }, { width: 16 },
    ];

    let r = 1;
    ws.mergeCells(r, 1, r, COL_COUNT);
    ws.getCell(r, 1).value = title;
    ws.getCell(r, 1).font = { bold: true, size: 14 };
    r++;
    if (subtitle) {
      ws.mergeCells(r, 1, r, COL_COUNT);
      ws.getCell(r, 1).value = subtitle;
      ws.getCell(r, 1).font = { italic: true };
      r++;
    }
    r++; // blank spacer

    const writeHeaderRow = () => {
      HEADERS.forEach((h, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.border = BOX;
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      });
      r++;
    };

    for (const { deal, entries, mvrPending, usdPending } of deriveDealRows) {
      let subMvr = 0, subUsd = 0;
      writeHeaderRow();
      const remarksRow = r; // deal's remark spans from here through its Pending USD row

      const headingCell = ws.getCell(r, 1);
      ws.mergeCells(r, 1, r, COL_COUNT - 1);
      headingCell.value = `${deal.refNo} — ${deal.name} — ${deal.supplier.name}`;
      headingCell.font = { bold: true };
      headingCell.border = BOX;
      r++;

      for (const e of entries) {
        const row = ws.getRow(r);
        row.getCell(1).value = formatDate(e.date);
        row.getCell(2).value = e.type === "PAYMENT" ? "Payment" : "Receipt";
        row.getCell(3).value = e.type === "PAYMENT" ? (e.requestStatus === "PAID" ? "Paid" : "Pending") : "";
        row.getCell(4).value = e.description;
        row.getCell(5).value = e.mvrDebit || 0;
        row.getCell(6).value = e.usdCredit || 0;
        for (let c = 1; c <= 6; c++) {
          const cell = row.getCell(c);
          cell.border = BOX;
          if (c === 4) cell.alignment = { wrapText: true, vertical: "middle" };
          if (c >= 5) cell.numFmt = "#,##0.00";
        }
        subMvr += e.mvrDebit || 0;
        subUsd += e.usdCredit || 0;
        r++;
      }

      const subtotalRow = ws.getRow(r);
      subtotalRow.getCell(4).value = `Subtotal — ${deal.refNo}`;
      subtotalRow.getCell(5).value = subMvr;
      subtotalRow.getCell(6).value = subUsd;
      for (let c = 4; c <= 6; c++) {
        const cell = subtotalRow.getCell(c);
        cell.font = { bold: true };
        cell.border = { top: THIN, bottom: DOUBLE };
        if (c >= 5) cell.numFmt = "#,##0.00";
      }
      subtotalRow.getCell(4).alignment = { horizontal: "right" };
      r++;

      const pendingMvrRow = ws.getRow(r);
      pendingMvrRow.getCell(4).value = "Pending MVR to pay";
      pendingMvrRow.getCell(5).value = mvrPending;
      pendingMvrRow.getCell(4).font = { bold: true };
      pendingMvrRow.getCell(4).alignment = { horizontal: "right" };
      pendingMvrRow.getCell(5).font = { bold: true };
      pendingMvrRow.getCell(5).border = { bottom: DOUBLE };
      pendingMvrRow.getCell(5).numFmt = "#,##0.00";
      r++;

      const pendingUsdRow = ws.getRow(r);
      pendingUsdRow.getCell(4).value = "Pending USD to receive";
      pendingUsdRow.getCell(6).value = usdPending;
      pendingUsdRow.getCell(4).font = { bold: true };
      pendingUsdRow.getCell(4).alignment = { horizontal: "right" };
      pendingUsdRow.getCell(6).font = { bold: true };
      pendingUsdRow.getCell(6).border = { bottom: DOUBLE };
      pendingUsdRow.getCell(6).numFmt = "#,##0.00";

      // The deal's own notes, shown once as a remark spanning its whole block.
      if (deal.notes) {
        ws.mergeCells(remarksRow, COL_COUNT, r, COL_COUNT);
        const remarkCell = ws.getCell(remarksRow, COL_COUNT);
        remarkCell.value = deal.notes;
        remarkCell.alignment = { wrapText: true, vertical: "middle", horizontal: "left" };
        remarkCell.border = BOX;
      }
      r++;
      r++; // blank spacer so deals don't visually run into each other

      grand.mvrDebit += subMvr;
      grand.usdCredit += subUsd;
      grand.mvrPending += mvrPending;
      grand.usdPending += usdPending;
    }

    const grandPaidRow = ws.getRow(r);
    grandPaidRow.getCell(4).value = "Grand total (paid / received)";
    grandPaidRow.getCell(5).value = grand.mvrDebit;
    grandPaidRow.getCell(6).value = grand.usdCredit;
    for (let c = 4; c <= 6; c++) {
      const cell = grandPaidRow.getCell(c);
      cell.font = { bold: true };
      cell.fill = FILL_GREEN;
      if (c >= 5) cell.numFmt = "#,##0.00";
    }
    grandPaidRow.getCell(4).alignment = { horizontal: "right" };
    r++;

    const grandPendingRow = ws.getRow(r);
    grandPendingRow.getCell(4).value = "Grand total pending (to pay / to receive)";
    grandPendingRow.getCell(5).value = grand.mvrPending;
    grandPendingRow.getCell(6).value = grand.usdPending;
    for (let c = 4; c <= 6; c++) {
      const cell = grandPendingRow.getCell(c);
      cell.font = { bold: true };
      cell.fill = FILL_YELLOW;
      if (c >= 5) cell.numFmt = "#,##0.00";
    }
    grandPendingRow.getCell(4).alignment = { horizontal: "right" };

    const buf = await wb.xlsx.writeBuffer();
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
  // multi-amount transfer) still isn't truncated, plus a Remarks column
  // repeating the deal's notes on every line of its block (this renderer
  // can't merge cells across rows the way the Excel export does).
  const cols: PdfCol[] = [
    { h: "Date", w: 55, key: "date", align: "l" },
    { h: "Type", w: 50, key: "type", align: "l" },
    { h: "Status", w: 50, key: "reqStatus", align: "l" },
    { h: "Description", w: 545, key: "description", align: "l" },
    { h: "MVR Debit", w: 85, key: "mvrDebit", align: "r" },
    { h: "USD Credit", w: 85, key: "usdCredit", align: "r" },
    { h: "Remarks", w: 220, key: "remarks", align: "l" },
  ];
  const PDF_WIDTH = 1150;

  const pdfRows: PdfRow[] = [];
  for (const { deal, entries, mvrPending, usdPending } of deriveDealRows) {
    let subMvr = 0, subUsd = 0;
    const remarks = deal.notes || "";
    pdfRows.push({ cells: {}, heading: `${deal.refNo} — ${deal.name} — ${deal.supplier.name}` });
    for (const e of entries) {
      pdfRows.push({
        cells: {
          date: formatDate(e.date),
          type: e.type === "PAYMENT" ? "Payment" : "Receipt",
          reqStatus: e.type === "PAYMENT" ? (e.requestStatus === "PAID" ? "Paid" : "Pending") : "",
          description: e.description,
          mvrDebit: e.mvrDebit ? formatAmount(e.mvrDebit) : "",
          usdCredit: e.usdCredit ? formatAmount(e.usdCredit) : "",
          remarks,
        },
      });
      subMvr += e.mvrDebit || 0;
      subUsd += e.usdCredit || 0;
    }
    pdfRows.push({
      bold: true,
      topBorder: true,
      cells: { description: `Subtotal — ${deal.refNo}`, mvrDebit: formatAmount(subMvr), usdCredit: formatAmount(subUsd), remarks },
    });
    pdfRows.push({ cells: { description: "Pending MVR to pay", mvrDebit: formatAmount(mvrPending), remarks } });
    pdfRows.push({ cells: { description: "Pending USD to receive", usdCredit: formatAmount(usdPending), remarks } });
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
      fill: [0.573, 0.784, 0.314], // matches the Excel export's green highlight
      cells: { description: "Grand total (paid / received)", mvrDebit: formatAmount(grand.mvrDebit), usdCredit: formatAmount(grand.usdCredit) },
    });
    pdfRows.push({
      bold: true,
      fill: [1, 1, 0], // matches the Excel export's yellow highlight
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
