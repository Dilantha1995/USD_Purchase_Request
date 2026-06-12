import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { Transfer, formatAmount, formatDate } from "./format";

export type RequestForPdf = {
  refNo: string;
  companyName: string;
  date: Date | string;
  usdAmount: number;
  rate: number;
  source: string;
  sourceAccount: string;
  requestedBy: string;
  approvedBy: string;
  transfers: Transfer[];
  status: "PENDING" | "PAID";
};

type Seg = { text: string; bold?: boolean };

const MARGIN = 60;
const COLOR_INK = rgb(0.11, 0.14, 0.2);

export async function generateRequestPdf(
  templateBytes: Uint8Array,
  data: RequestForPdf
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPages()[0];
  const { height } = page.getSize();

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const widthOf = (t: string, size: number, b = false) =>
    (b ? bold : font).widthOfTextAtSize(t, size);

  const drawSegs = (segs: Seg[], x: number, y: number, size: number) => {
    let cx = x;
    for (const s of segs) {
      page.drawText(s.text, { x: cx, y, size, font: s.bold ? bold : font, color: COLOR_INK });
      cx += widthOf(s.text, size, s.bold);
    }
  };

  // Title
  let y = height - 185;
  page.drawText(`Dollar Purchase \u2013 ${data.companyName}`, {
    x: MARGIN,
    y,
    size: 13,
    font: bold,
    color: COLOR_INK,
  });

  // Date + Ref
  y -= 38;
  page.drawText(`Date: ${formatDate(data.date)}`, { x: MARGIN, y, size: 11, font, color: COLOR_INK });
  y -= 22;
  page.drawText(`Ref No: ${data.refNo}`, { x: MARGIN, y, size: 11, font, color: COLOR_INK });

  // Purchase line
  y -= 40;
  page.drawText(
    `Purchase of USD ${formatAmount(data.usdAmount)} from ${data.source} at ${data.rate}`,
    { x: MARGIN, y, size: 11, font, color: COLOR_INK }
  );

  // Transfers
  y -= 38;
  for (const t of data.transfers) {
    drawSegs(
      [
        { text: "Transfer from " },
        { text: data.sourceAccount, bold: true },
        { text: ` to ${t.recipient} A/C No. ${t.account}` },
      ],
      MARGIN,
      y,
      11
    );
    y -= 24;
    t.amounts.forEach((amt, i) => {
      page.drawText(`${i + 1})`, { x: MARGIN + 22, y, size: 11, font, color: COLOR_INK });
      page.drawText(formatAmount(amt), { x: MARGIN + 44, y, size: 11, font, color: COLOR_INK });
      y -= 20;
    });
    y -= 8;
  }

  // Signature block (fixed near the lower third, leaving room above for a wet signature)
  const sigLabelY = Math.min(y - 60, 230);
  const rightX = 330;
  page.drawText("Requested By", { x: MARGIN, y: sigLabelY, size: 11, font: bold, color: COLOR_INK });
  page.drawText("Processed and Approved By", { x: rightX, y: sigLabelY, size: 11, font: bold, color: COLOR_INK });
  page.drawText(data.requestedBy, { x: MARGIN, y: sigLabelY - 20, size: 11, font, color: COLOR_INK });
  page.drawText(data.approvedBy, { x: rightX, y: sigLabelY - 20, size: 11, font, color: COLOR_INK });

  // PAID stamp
  if (data.status === "PAID") {
    page.drawText("PAID", {
      x: 215,
      y: 120,
      size: 54,
      font: bold,
      color: rgb(0.82, 0.12, 0.12),
      rotate: degrees(12),
      opacity: 0.85,
    });
  }

  return pdf.save();
}
