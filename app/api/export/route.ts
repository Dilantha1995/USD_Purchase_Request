import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatAmount, formatDate, totalMvr, Transfer } from "@/lib/format";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";

const HEADERS = ["Ref No", "Company", "Date", "Supplier", "USD", "Rate", "Total MVR", "Status", "Requested By", "Approved By", "Created By"];

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const company = url.searchParams.get("company") || "";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";

  const where: any = {};
  if (company === "PSMS" || company === "PPM") where.companyId = company;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(`${from}T00:00:00Z`);
    if (to) where.date.lte = new Date(`${to}T23:59:59Z`);
  }

  const rows = await prisma.request.findMany({
    where,
    include: { company: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: { date: "asc" },
    take: 5000,
  });

  const list = (q
    ? rows.filter((r: (typeof rows)[number]) => {
        const t = r.transfers as unknown as Transfer[];
        return [r.refNo, r.source, r.requestedBy, r.approvedBy, ...t.map((x) => `${x.recipient} ${x.account}`)]
          .join(" ").toLowerCase().includes(q);
      })
    : rows
  ).map((r: (typeof rows)[number]) => ({
    refNo: r.refNo,
    company: r.company.name,
    date: formatDate(r.date),
    supplier: r.source,
    usd: r.usdAmount,
    rate: r.rate,
    mvr: totalMvr(r.transfers as unknown as Transfer[]),
    status: r.status === "PAID" ? "Completed" : "Pending",
    requestedBy: r.requestedBy,
    approvedBy: r.approvedBy || "",
    createdBy: r.createdBy.name,
  }));

  const rangeLabel = from || to ? `${from || "start"}_to_${to || "today"}` : "all";
  const fileBase = `dollar-purchase-${company || "all"}-${rangeLabel}`;

  if (format === "xlsx") {
    const aoa = [
      HEADERS,
      ...list.map((r: (typeof list)[number]) => [r.refNo, r.company, r.date, r.supplier, r.usd, r.rate, r.mvr, r.status, r.requestedBy, r.approvedBy, r.createdBy]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 11 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Requests");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // PDF (landscape A4 table)
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.14, 0.2);
  const PW = 842, PH = 595, ML = 30, MR = 30;
  // column widths (sum ~ 782)
  const cols = [
    { h: "Ref No", w: 92, key: "refNo", align: "l" },
    { h: "Co.", w: 38, key: "co", align: "l" },
    { h: "Date", w: 62, key: "date", align: "l" },
    { h: "Supplier", w: 120, key: "supplier", align: "l" },
    { h: "USD", w: 70, key: "usd", align: "r" },
    { h: "Rate", w: 44, key: "rate", align: "r" },
    { h: "Total MVR", w: 86, key: "mvr", align: "r" },
    { h: "Status", w: 64, key: "status", align: "l" },
    { h: "Requested", w: 100, key: "requestedBy", align: "l" },
    { h: "Created", w: 88, key: "createdBy", align: "l" },
  ];
  const xs: number[] = [];
  let cx = ML;
  for (const c of cols) { xs.push(cx); cx += c.w; }

  const clip = (s: string, w: number, b = false) => {
    const f = b ? bold : font;
    let str = String(s ?? "");
    while (str.length > 1 && f.widthOfTextAtSize(str, 8) > w - 6) str = str.slice(0, -1);
    return str;
  };

  let page = pdf.addPage([PW, PH]);
  let y = PH - 40;
  const title = `Dollar Purchase Requests — ${company || "All companies"}${from || to ? ` (${from || "start"} to ${to || "today"})` : ""}`;
  page.drawText(clip(title, PW - ML - MR, true), { x: ML, y, size: 12, font: bold, color: ink });
  y -= 22;

  const drawHeader = () => {
    cols.forEach((c, i) => {
      const x = c.align === "r" ? xs[i] + c.w - 6 - bold.widthOfTextAtSize(c.h, 8) : xs[i] + 2;
      page.drawText(c.h, { x, y, size: 8, font: bold, color: ink });
    });
    y -= 4;
    page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 0.7, color: rgb(0.8, 0.8, 0.8) });
    y -= 12;
  };
  drawHeader();

  let totalUsd = 0, totalMvrSum = 0;
  for (const r of list) {
    if (y < 40) {
      page = pdf.addPage([PW, PH]);
      y = PH - 40;
      drawHeader();
    }
    const vals: Record<string, string> = {
      refNo: r.refNo, co: r.company.includes("Synergy") ? "PSMS" : "PPM", date: r.date,
      supplier: r.supplier, usd: formatAmount(r.usd), rate: String(r.rate),
      mvr: formatAmount(r.mvr), status: r.status, requestedBy: r.requestedBy, createdBy: r.createdBy,
    };
    cols.forEach((c, i) => {
      const txt = clip(vals[c.key] ?? "", c.w);
      const x = c.align === "r" ? xs[i] + c.w - 6 - font.widthOfTextAtSize(txt, 8) : xs[i] + 2;
      page.drawText(txt, { x, y, size: 8, font, color: ink });
    });
    totalUsd += r.usd; totalMvrSum += r.mvr;
    y -= 14;
  }

  // totals
  if (y < 40) { page = pdf.addPage([PW, PH]); y = PH - 40; }
  y -= 4;
  page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 0.7, color: rgb(0.8, 0.8, 0.8) });
  y -= 14;
  page.drawText(`Total: ${list.length} request(s)`, { x: ML + 2, y, size: 8, font: bold, color: ink });
  const usdTxt = `USD ${formatAmount(totalUsd)}`;
  page.drawText(usdTxt, { x: xs[4] + cols[4].w - 6 - bold.widthOfTextAtSize(usdTxt, 8), y, size: 8, font: bold, color: ink });
  const mvrTxt = formatAmount(totalMvrSum);
  page.drawText(mvrTxt, { x: xs[6] + cols[6].w - 6 - bold.widthOfTextAtSize(mvrTxt, 8), y, size: 8, font: bold, color: ink });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
