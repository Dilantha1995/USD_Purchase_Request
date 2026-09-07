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
  docType?: string;
  requestedSignature?: Uint8Array | null;
  approvedSignature?: Uint8Array | null;
};

type Seg = { text: string; bold?: boolean };

const MARGIN = 60;
const COLOR_INK = rgb(0.11, 0.14, 0.2);
const COLOR_LINE = rgb(0.8, 0.8, 0.8);

// Base (unscaled) spacing for the transfer body. Everything above this
// (title/date/ref no) is fixed height; the body below shrinks — down to
// MIN_SCALE — so a request with many transfer lines still keeps the
// signature block on the single letterhead page instead of running past it.
const BASE = { font: 11, purchaseGap: 38, refToBodyGap: 40, headerGap: 24, lineGap: 20, groupGap: 8 };
const MIN_SCALE = 0.45;
const MIN_Y_BEFORE_SIGNATURE = 190;

function neededBodyHeight(isTransfer: boolean, transfers: Transfer[]) {
  let h = isTransfer ? 0 : BASE.purchaseGap;
  for (const t of transfers) {
    h += BASE.headerGap + t.amounts.length * BASE.lineGap + BASE.groupGap;
  }
  return h;
}

export async function generateRequestPdf(templateBytes: Uint8Array, data: RequestForPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPages()[0];
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const widthOf = (t: string, size: number, b = false) => (b ? bold : font).widthOfTextAtSize(t, size);
  const isTransfer = data.docType === "TRF";

  const contentStartY = height - 245;
  const baseNeeded = neededBodyHeight(isTransfer, data.transfers);
  const rawScale = (contentStartY - MIN_Y_BEFORE_SIGNATURE) / (baseNeeded + BASE.refToBodyGap);
  const scale = Math.max(MIN_SCALE, Math.min(1, rawScale));
  const gap = (v: number) => v * scale;
  const size = Math.max(7.5, Math.min(BASE.font, BASE.font * Math.sqrt(scale)));

  const drawSegs = (segs: Seg[], x: number, y: number, sz: number) => {
    let cx = x;
    for (const s of segs) {
      page.drawText(s.text, { x: cx, y, size: sz, font: s.bold ? bold : font, color: COLOR_INK });
      cx += widthOf(s.text, sz, s.bold);
    }
  };

  let y = height - 185;
  const title = isTransfer ? "Transfer" : "Dollar Purchase";
  page.drawText(`${title} – ${data.companyName}`, { x: MARGIN, y, size: 13, font: bold, color: COLOR_INK });
  y -= 38;
  page.drawText(`Date: ${formatDate(data.date)}`, { x: MARGIN, y, size: 11, font, color: COLOR_INK });
  y -= 22;
  page.drawText(`Ref No: ${data.refNo}`, { x: MARGIN, y, size: 11, font, color: COLOR_INK });
  y -= gap(BASE.refToBodyGap);

  if (!isTransfer) {
    page.drawText(`Purchase of USD ${formatAmount(data.usdAmount)} from ${data.source} at ${data.rate}`, {
      x: MARGIN, y, size, font, color: COLOR_INK,
    });
    y -= gap(BASE.purchaseGap);
  }

  for (const t of data.transfers) {
    if (t.paymentMethod === "CASH") {
      drawSegs(
        [
          { text: "Cash withdrawal from " },
          { text: t.sourceAccount || data.sourceAccount, bold: true },
          { text: ` paid to ${t.recipient} — collected by ` },
          { text: t.collectedBy || "—", bold: true },
        ],
        MARGIN, y, size
      );
    } else {
      drawSegs(
        [
          { text: "Transfer from " },
          { text: t.sourceAccount || data.sourceAccount, bold: true },
          { text: ` to ${t.recipient}` },
          ...(t.bankName ? [{ text: ` ${t.bankName}`, bold: true }] : []),
          { text: ` A/C No. ${t.account}` },
        ],
        MARGIN, y, size
      );
    }
    y -= gap(BASE.headerGap);
    t.amounts.forEach((amt, i) => {
      page.drawText(`${i + 1})`, { x: MARGIN + 22, y, size, font, color: COLOR_INK });
      const note = t.notes && t.notes[i] ? ` - ${t.notes[i]}` : "";
      page.drawText(`${formatAmount(amt)}${note}`, { x: MARGIN + 44, y, size, font, color: COLOR_INK });
      y -= gap(BASE.lineGap);
    });
    y -= gap(BASE.groupGap);
  }

  // Signature block pinned near the bottom of the page (drops just below content only if the body is very long)
  const sigLabelY = Math.min(150, y - 40);
  const rightX = 330;

  // A clear divider between the transfer details above and the signature block below.
  page.drawLine({
    start: { x: MARGIN, y: sigLabelY + 65 },
    end: { x: width - MARGIN, y: sigLabelY + 65 },
    thickness: 0.75,
    color: COLOR_LINE,
  });

  // Signature images (only when completed)
  async function placeSig(imgBytes: Uint8Array | null | undefined, x: number) {
    if (!imgBytes || data.status !== "PAID") return;
    try {
      const png = await pdf.embedPng(imgBytes);
      const maxW = 130, maxH = 45;
      const scale = Math.min(maxW / png.width, maxH / png.height, 1);
      page.drawImage(png, { x, y: sigLabelY + 8, width: png.width * scale, height: png.height * scale });
    } catch {}
  }
  await placeSig(data.requestedSignature, MARGIN);
  await placeSig(data.approvedSignature, rightX);

  page.drawText("Requested By", { x: MARGIN, y: sigLabelY, size: 11, font: bold, color: COLOR_INK });
  page.drawText("Processed and Approved By", { x: rightX, y: sigLabelY, size: 11, font: bold, color: COLOR_INK });
  page.drawText(data.requestedBy, { x: MARGIN, y: sigLabelY - 20, size: 11, font, color: COLOR_INK });
  page.drawText(data.approvedBy, { x: rightX, y: sigLabelY - 20, size: 11, font, color: COLOR_INK });

  if (data.status === "PAID") {
    page.drawText("PAID", {
      x: 215, y: 120, size: 54, font: bold, color: rgb(0.82, 0.12, 0.12), rotate: degrees(12), opacity: 0.85,
    });
  }
  return pdf.save();
}
