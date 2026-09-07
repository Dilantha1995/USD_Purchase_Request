import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatAmount, formatDate } from "@/lib/format";
import { computeDealTotals } from "@/lib/deal";
import * as XLSX from "xlsx";
import { renderTablePdf, PdfCol, slugifyTitle } from "@/lib/pdfTable";

export const runtime = "nodejs";

const HEADERS = [
  "Ref No", "Deal Name", "Company", "Supplier", "Date", "Agreed USD", "Rate",
  "Agreed MVR", "MVR Paid", "MVR Pending", "USD Received", "USD Pending", "Status",
];

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

  const where: any = {};
  if (company === "PSMS" || company === "PPM") where.companyId = company;
  if (status) where.status = status;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(`${from}T00:00:00Z`);
    if (to) where.date.lte = new Date(`${to}T23:59:59Z`);
  }

  const deals = await prisma.deal.findMany({
    where,
    include: {
      company: { select: { id: true, name: true } },
      supplier: { select: { name: true } },
      requests: { select: { transfers: true } },
      usdReceipts: { select: { usdAmount: true } },
    },
    orderBy: { date: "asc" },
  });

  const list = deals
    .filter((d: (typeof deals)[number]) =>
      q ? `${d.refNo} ${d.name} ${d.supplier.name}`.toLowerCase().includes(q) : true
    )
    .map((d: (typeof deals)[number]) => {
      const t = computeDealTotals(d, d.requests, d.usdReceipts);
      return {
        refNo: d.refNo,
        dealName: d.name,
        company: d.company.id,
        supplier: d.supplier.name,
        date: formatDate(d.date),
        agreedUsd: t.agreedUsd,
        rate: d.rate,
        agreedMvr: t.agreedMvr,
        mvrPaid: t.mvrPaid,
        mvrPending: Math.max(t.mvrPending, 0),
        usdReceived: t.usdReceived,
        usdPending: Math.max(t.usdPending, 0),
        status: d.status === "CLOSED" ? "Closed" : "Open",
      };
    });

  const title = `Dollar Purchase Deals — ${company || "All companies"}${status ? ` (${status === "CLOSED" ? "Closed" : "Open"})` : ""}`;
  const rangeLabel = from || to ? `${from || "start"}_to_${to || "today"}` : "all";
  const fileBase = `${slugifyTitle(title)}-${rangeLabel}`;

  if (format === "xlsx") {
    const aoa = [
      HEADERS,
      ...list.map((r: (typeof list)[number]) => [
        r.refNo, r.dealName, r.company, r.supplier, r.date, r.agreedUsd, r.rate,
        r.agreedMvr, r.mvrPaid, r.mvrPending, r.usdReceived, r.usdPending, r.status,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 18 }, { wch: 34 }, { wch: 9 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 8 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 9 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Deals");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const cols: PdfCol[] = [
    { h: "Ref No", w: 88, key: "refNo", align: "l" },
    { h: "Deal Name", w: 150, key: "dealName", align: "l" },
    { h: "Co.", w: 32, key: "company", align: "l" },
    { h: "Supplier", w: 90, key: "supplier", align: "l" },
    { h: "Agreed USD", w: 68, key: "agreedUsd", align: "r" },
    { h: "Rate", w: 40, key: "rate", align: "r" },
    { h: "MVR Paid", w: 76, key: "mvrPaid", align: "r" },
    { h: "MVR Pending", w: 80, key: "mvrPending", align: "r" },
    { h: "USD Received", w: 80, key: "usdReceived", align: "r" },
    { h: "USD Pending", w: 78, key: "usdPending", align: "r" },
    { h: "Status", w: 56, key: "status", align: "l" },
  ];

  const totals = list.reduce(
    (acc: any, r: (typeof list)[number]) => ({
      agreedUsd: acc.agreedUsd + r.agreedUsd,
      mvrPaid: acc.mvrPaid + r.mvrPaid,
      mvrPending: acc.mvrPending + r.mvrPending,
      usdReceived: acc.usdReceived + r.usdReceived,
      usdPending: acc.usdPending + r.usdPending,
    }),
    { agreedUsd: 0, mvrPaid: 0, mvrPending: 0, usdReceived: 0, usdPending: 0 }
  );

  const bytes = await renderTablePdf({
    title,
    subtitle: from || to ? `Period: ${from || "start"} to ${to || "today"}` : undefined,
    cols,
    rows: [
      ...list.map((r: (typeof list)[number]) => ({
        cells: {
          refNo: r.refNo,
          dealName: r.dealName,
          company: r.company,
          supplier: r.supplier,
          agreedUsd: formatAmount(r.agreedUsd),
          rate: String(r.rate),
          mvrPaid: formatAmount(r.mvrPaid),
          mvrPending: formatAmount(r.mvrPending),
          usdReceived: formatAmount(r.usdReceived),
          usdPending: formatAmount(r.usdPending),
          status: r.status,
        },
      })),
      {
        bold: true,
        topBorder: true,
        cells: {
          refNo: `Total (${list.length} deal${list.length === 1 ? "" : "s"})`,
          agreedUsd: formatAmount(totals.agreedUsd),
          mvrPaid: formatAmount(totals.mvrPaid),
          mvrPending: formatAmount(totals.mvrPending),
          usdReceived: formatAmount(totals.usdReceived),
          usdPending: formatAmount(totals.usdPending),
        },
      },
    ],
  });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
