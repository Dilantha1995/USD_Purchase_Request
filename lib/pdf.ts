import { PDFDocument, PDFEmbeddedPage, StandardFonts, rgb, degrees } from "pdf-lib";
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

// A cash withdrawal is handed to the collector as their own take-away proof
// of receipt, so it's rendered twice on the one page (office copy + collector
// copy) — same compact layout, separated by a cut line. Tuned so a typical
// short cash line still reads clearly at roughly half a letterhead page.
const COMPACT_BASE = { font: 10, purchaseGap: 22, refToBodyGap: 24, headerGap: 16, lineGap: 14, groupGap: 5 };
const COMPACT_MIN_SCALE = 0.55;
// These three are tuned together so the signature block deterministically
// lands at (boxBottom + COMPACT_SIG_CEILING) whenever content fits within
// scale — same trick the normal layout relies on (190 - 40 = 150) — instead
// of drifting close enough to the box's bottom edge to collide with the
// second copy's logo below it.
const COMPACT_MIN_Y_BEFORE_SIGNATURE = 160;
const COMPACT_CONTENT_TO_SIG_GAP = 90;
const COMPACT_SIG_CEILING = 70;
const COMPACT_HEADER_OFFSET = 120; // box top -> title baseline, clears the (real or stamped) logo above it

function neededBodyHeight(isTransfer: boolean, transfers: Transfer[], base: typeof BASE) {
  let h = isTransfer ? 0 : base.purchaseGap;
  for (const t of transfers) {
    h += base.headerGap + t.amounts.length * base.lineGap + base.groupGap;
  }
  return h;
}

function isAllCash(transfers: Transfer[]): boolean {
  return transfers.length > 0 && transfers.every((t) => t.paymentMethod === "CASH");
}

export async function generateRequestPdf(templateBytes: Uint8Array, data: RequestForPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPages()[0];
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const widthOf = (t: string, size: number, b = false) => (b ? bold : font).widthOfTextAtSize(t, size);
  const isTransfer = data.docType === "TRF";

  const drawSegs = (segs: Seg[], x: number, y: number, sz: number) => {
    let cx = x;
    for (const s of segs) {
      page.drawText(s.text, { x: cx, y, size: sz, font: s.bold ? bold : font, color: COLOR_INK });
      cx += widthOf(s.text, sz, s.bold);
    }
  };

  // Signature images (only when completed)
  async function placeSig(imgBytes: Uint8Array | null | undefined, x: number, y: number) {
    if (!imgBytes || data.status !== "PAID") return;
    try {
      const png = await pdf.embedPng(imgBytes);
      const maxW = 130, maxH = 45;
      const sc = Math.min(maxW / png.width, maxH / png.height, 1);
      page.drawImage(png, { x, y: y + 8, width: png.width * sc, height: png.height * sc });
    } catch {}
  }

  /** Draws one full copy of the document body between titleY and boxBottom. */
  async function drawCopy(opts: {
    titleY: number;
    boxBottom: number;
    base: typeof BASE;
    minScale: number;
    minYBeforeSignature: number;
    contentToSigGap: number;
    sigCeiling: number;
    logoStamp?: { embedded: PDFEmbeddedPage; x: number; y: number; width: number; height: number };
  }) {
    if (opts.logoStamp) {
      page.drawPage(opts.logoStamp.embedded, {
        x: opts.logoStamp.x, y: opts.logoStamp.y, width: opts.logoStamp.width, height: opts.logoStamp.height,
      });
    }

    const contentStartY = opts.titleY - 60;
    const baseNeeded = neededBodyHeight(isTransfer, data.transfers, opts.base);
    const rawScale = (contentStartY - opts.boxBottom - opts.minYBeforeSignature) / (baseNeeded + opts.base.refToBodyGap);
    const scale = Math.max(opts.minScale, Math.min(1, rawScale));
    const gap = (v: number) => v * scale;
    const size = Math.max(7.5, Math.min(opts.base.font, opts.base.font * Math.sqrt(scale)));

    let y = opts.titleY;
    const title = isTransfer ? "Transfer" : "Dollar Purchase";
    page.drawText(`${title} – ${data.companyName}`, { x: MARGIN, y, size: opts.base.font + 2, font: bold, color: COLOR_INK });
    y -= opts.base.font + 27;
    page.drawText(`Date: ${formatDate(data.date)}`, { x: MARGIN, y, size: opts.base.font, font, color: COLOR_INK });
    y -= opts.base.font + 11;
    page.drawText(`Ref No: ${data.refNo}`, { x: MARGIN, y, size: opts.base.font, font, color: COLOR_INK });
    y -= gap(opts.base.refToBodyGap);

    if (!isTransfer) {
      page.drawText(`Purchase of USD ${formatAmount(data.usdAmount)} from ${data.source} at ${data.rate}`, {
        x: MARGIN, y, size, font, color: COLOR_INK,
      });
      y -= gap(opts.base.purchaseGap);
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
      y -= gap(opts.base.headerGap);
      t.amounts.forEach((amt, i) => {
        page.drawText(`${i + 1})`, { x: MARGIN + 22, y, size, font, color: COLOR_INK });
        const note = t.notes && t.notes[i] ? ` - ${t.notes[i]}` : "";
        page.drawText(`${formatAmount(amt)}${note}`, { x: MARGIN + 44, y, size, font, color: COLOR_INK });
        y -= gap(opts.base.lineGap);
      });
      y -= gap(opts.base.groupGap);
    }

    // Signature block pinned near the bottom of this copy's box (drops just
    // below content only if the body is very long) — same rule as before,
    // just relative to this copy's own box instead of the whole page.
    const sigLabelY = Math.min(opts.boxBottom + opts.sigCeiling, y - opts.contentToSigGap);
    const rightX = 330;

    // A clear divider between the transfer details above and the signature block below.
    page.drawLine({
      start: { x: MARGIN, y: sigLabelY + 65 },
      end: { x: width - MARGIN, y: sigLabelY + 65 },
      thickness: 0.75,
      color: COLOR_LINE,
    });

    await placeSig(data.requestedSignature, MARGIN, sigLabelY);
    await placeSig(data.approvedSignature, rightX, sigLabelY);

    page.drawText("Requested By", { x: MARGIN, y: sigLabelY, size: opts.base.font, font: bold, color: COLOR_INK });
    page.drawText("Processed and Approved By", { x: rightX, y: sigLabelY, size: opts.base.font, font: bold, color: COLOR_INK });
    page.drawText(data.requestedBy, { x: MARGIN, y: sigLabelY - 20, size: opts.base.font, font, color: COLOR_INK });
    page.drawText(data.approvedBy, { x: rightX, y: sigLabelY - 20, size: opts.base.font, font, color: COLOR_INK });

    if (data.status === "PAID") {
      page.drawText("PAID", {
        x: MARGIN + 155, y: opts.boxBottom + Math.min(120, (opts.titleY - opts.boxBottom) * 0.35), size: opts.base.font * 4.9,
        font: bold, color: rgb(0.82, 0.12, 0.12), rotate: degrees(12), opacity: 0.85,
      });
    }
  }

  if (isAllCash(data.transfers)) {
    // Cash is handed over in person, so print an identical office copy and
    // collector copy on the one page, split by a cut line.
    const half = height / 2;

    // The template's own logo/heading already sits at the top of the page
    // for the first (office) copy; the second (collector) copy needs its
    // own stamped copy of that same artwork, cropped from a pristine
    // instance of the template so it isn't affected by anything drawn here.
    const logoDoc = await PDFDocument.load(templateBytes);
    const logoSrcPage = logoDoc.getPages()[0];
    const logoStripHeight = 97;
    const embeddedLogo = await pdf.embedPage(logoSrcPage, {
      left: 0, right: width, bottom: height - logoStripHeight, top: height,
    });

    await drawCopy({
      titleY: height - COMPACT_HEADER_OFFSET,
      boxBottom: half,
      base: COMPACT_BASE,
      minScale: COMPACT_MIN_SCALE,
      minYBeforeSignature: COMPACT_MIN_Y_BEFORE_SIGNATURE,
      contentToSigGap: COMPACT_CONTENT_TO_SIG_GAP,
      sigCeiling: COMPACT_SIG_CEILING,
    });

    page.drawLine({ start: { x: MARGIN, y: half }, end: { x: width - MARGIN, y: half }, thickness: 0.75, color: COLOR_LINE });

    await drawCopy({
      titleY: half - COMPACT_HEADER_OFFSET,
      boxBottom: 0,
      base: COMPACT_BASE,
      minScale: COMPACT_MIN_SCALE,
      minYBeforeSignature: COMPACT_MIN_Y_BEFORE_SIGNATURE,
      contentToSigGap: COMPACT_CONTENT_TO_SIG_GAP,
      sigCeiling: COMPACT_SIG_CEILING,
      logoStamp: { embedded: embeddedLogo, x: 0, y: half - logoStripHeight, width, height: logoStripHeight },
    });
  } else {
    await drawCopy({
      titleY: height - 185,
      boxBottom: 0,
      base: BASE,
      minScale: MIN_SCALE,
      minYBeforeSignature: MIN_Y_BEFORE_SIGNATURE,
      contentToSigGap: 40,
      sigCeiling: 150,
    });
  }

  return pdf.save();
}
