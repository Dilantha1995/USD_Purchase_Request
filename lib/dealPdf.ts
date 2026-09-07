import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatAmount, formatDate } from "./format";
import { DealTotals, LedgerEntry } from "./deal";

export type DealStatementData = {
  companyName: string;
  refNo: string;
  name: string;
  supplierName: string;
  rate: number;
  date: Date | string;
  status: string;
  totals: DealTotals;
  ledger: LedgerEntry[];
};

const PW = 595, PH = 842, ML = 40, MR = 40;
const INK = rgb(0.11, 0.14, 0.2);
const GREY = rgb(0.8, 0.8, 0.8);

export async function generateDealStatementPdf(data: DealStatementData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PW, PH]);
  let y = PH - 50;

  const text = (t: string, x: number, size: number, b = false, color = INK) =>
    page.drawText(t, { x, y, size, font: b ? bold : font, color });

  text(data.companyName, ML, 14, true);
  y -= 20;
  text("Statement of Account — Dollar Purchase Deal", ML, 12, true);
  y -= 28;

  const info: [string, string][] = [
    ["Deal ref", data.refNo],
    ["Deal name", data.name],
    ["Supplier", data.supplierName],
    ["USD Amount", `USD ${formatAmount(data.totals.agreedUsd)} @ ${data.rate}`],
    ["Date", formatDate(data.date)],
    ["Status", data.status],
  ];
  for (const [label, val] of info) {
    text(`${label}:`, ML, 10, true);
    text(val, ML + 90, 10);
    y -= 16;
  }
  y -= 8;
  page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 0.7, color: GREY });
  y -= 20;

  // Ledger table
  const cols = [
    { h: "Date", w: 62, key: "date", align: "l" as const },
    { h: "Description", w: 233, key: "desc", align: "l" as const },
    { h: "MVR Paid (Dr)", w: 100, key: "mvr", align: "r" as const },
    { h: "USD Received (Cr)", w: 120, key: "usd", align: "r" as const },
  ];
  const xs: number[] = [];
  let cx = ML;
  for (const c of cols) { xs.push(cx); cx += c.w; }

  const clip = (s: string, w: number, size = 9, b = false) => {
    const f = b ? bold : font;
    let str = String(s ?? "");
    while (str.length > 1 && f.widthOfTextAtSize(str, size) > w - 6) str = str.slice(0, -1);
    return str;
  };

  const drawHeader = () => {
    cols.forEach((c, i) => {
      const t = c.h;
      const x = c.align === "r" ? xs[i] + c.w - 6 - bold.widthOfTextAtSize(t, 9) : xs[i] + 2;
      page.drawText(t, { x, y, size: 9, font: bold, color: INK });
    });
    y -= 4;
    page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 0.7, color: GREY });
    y -= 14;
  };
  drawHeader();

  for (const entry of data.ledger) {
    if (y < 80) {
      page = pdf.addPage([PW, PH]);
      y = PH - 50;
      drawHeader();
    }
    const vals: Record<string, string> = {
      date: formatDate(entry.date),
      desc: entry.description,
      mvr: entry.mvrDebit ? formatAmount(entry.mvrDebit) : "",
      usd: entry.usdCredit ? formatAmount(entry.usdCredit) : "",
    };
    cols.forEach((c, i) => {
      const txt = clip(vals[c.key] ?? "", c.w);
      const x = c.align === "r" ? xs[i] + c.w - 6 - font.widthOfTextAtSize(txt, 9) : xs[i] + 2;
      page.drawText(txt, { x, y, size: 9, font, color: INK });
    });
    y -= 16;
  }
  if (data.ledger.length === 0) {
    text("No transactions recorded yet.", ML, 10);
    y -= 16;
  }

  y -= 6;
  page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 0.7, color: GREY });
  y -= 24;

  if (y < 140) { page = pdf.addPage([PW, PH]); y = PH - 50; }
  text("Summary", ML, 11, true);
  y -= 20;
  const t = data.totals;
  const rows: [string, string][] = [
    ["Agreed USD", `USD ${formatAmount(t.agreedUsd)}`],
    ["Agreed MVR (at current rate)", `MVR ${formatAmount(t.agreedMvr)}`],
    ["MVR paid so far", `MVR ${formatAmount(t.mvrPaid)}`],
    ["MVR pending", `MVR ${formatAmount(t.mvrPending)}`],
    ["USD received so far", `USD ${formatAmount(t.usdReceived)}`],
    ["USD pending", `USD ${formatAmount(t.usdPending)}`],
  ];
  for (const [label, val] of rows) {
    text(label, ML, 10);
    text(val, ML + 220, 10, true);
    y -= 16;
  }

  return pdf.save();
}
