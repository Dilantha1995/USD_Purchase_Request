import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  Packer,
  convertInchesToTwip,
} from "docx";
import { formatAmount, formatDate } from "./format";
import { RequestForPdf } from "./pdf";

type Seg = { text: string; bold?: boolean };

const INK = "1C2433";
const PAID_RED = "D11F1F";

function hex(color: string) {
  return color.replace(/^#/, "").toUpperCase();
}

function segRuns(segs: Seg[], size: number): TextRun[] {
  return segs.map((s) => new TextRun({ text: s.text, bold: s.bold, size, color: INK }));
}

/** Builds every paragraph/table for one copy of the document body — mirrors drawCopy() in lib/pdf.ts. */
function buildCopy(data: RequestForPdf, brandColor: string, size: number): (Paragraph | Table)[] {
  const isTransfer = data.docType === "TRF";
  const title = isTransfer ? "Transfer" : "Dollar Purchase";
  const out: (Paragraph | Table)[] = [];

  // Letterhead banner — the Word export can't reproduce the exact graphical
  // template PDF (logo artwork, colored bars), so it stands in a plain
  // colored heading bar in the company's brand color instead.
  out.push(
    new Paragraph({
      shading: { type: ShadingType.SOLID, fill: hex(brandColor) },
      spacing: { after: 240 },
      children: [new TextRun({ text: data.companyName, bold: true, size: size + 6, color: "FFFFFF" })],
    })
  );

  out.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: `${title} – ${data.companyName}`, bold: true, size: size + 2, color: INK })],
    })
  );
  out.push(new Paragraph({ children: [new TextRun({ text: `Date: ${formatDate(data.date)}`, size, color: INK })] }));
  out.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Ref No: ${data.refNo}`, size, color: INK })],
    })
  );

  if (!isTransfer) {
    out.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: `Purchase of USD ${formatAmount(data.usdAmount)} from ${data.source} at ${data.rate}`,
            size,
            color: INK,
          }),
        ],
      })
    );
  }

  let runningAmountIndex = 0;
  data.transfers.forEach((t, ti) => {
    const label = data.useLetterLabels ? `${String.fromCharCode(65 + ti)}  ` : "";
    const segs: Seg[] =
      t.paymentMethod === "CASH"
        ? [
            { text: "Cash withdrawal from " },
            { text: t.sourceAccount || data.sourceAccount, bold: true },
            { text: ` paid to ${t.recipient} — collected by ` },
            { text: t.collectedBy || "—", bold: true },
          ]
        : [
            { text: "Transfer from " },
            { text: t.sourceAccount || data.sourceAccount, bold: true },
            { text: ` to ${t.recipient}` },
            ...(t.bankName ? [{ text: ` ${t.bankName}`, bold: true }] : []),
            { text: ` A/C No. ${t.account}` },
          ];

    out.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: label, bold: true, size, color: INK }), ...segRuns(segs, size)],
      })
    );
    t.amounts.forEach((amt, i) => {
      runningAmountIndex++;
      const displayIndex = data.continuousNumbering ? runningAmountIndex : i + 1;
      const note = t.notes && t.notes[i] ? ` - ${t.notes[i]}` : "";
      out.push(
        new Paragraph({
          indent: { left: convertInchesToTwip(0.35) },
          spacing: { after: 60 },
          children: [new TextRun({ text: `${displayIndex}) ${formatAmount(amt)}${note}`, size, color: INK })],
        })
      );
    });
  });

  out.push(new Paragraph({ spacing: { after: 300 }, children: [] }));

  const hasReqSig = Boolean(data.requestedSignature) && data.status === "PAID";
  const hasApprSig = Boolean(data.approvedSignature) && data.status === "PAID";
  const borderless = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  function sigCell(imgBytes: Uint8Array | null | undefined, label: string, name: string) {
    const children: Paragraph[] = [];
    if (imgBytes) {
      children.push(
        new Paragraph({
          children: [new ImageRun({ type: "png", data: imgBytes, transformation: { width: 110, height: 38 } })],
        })
      );
    }
    children.push(new Paragraph({ children: [new TextRun({ text: label, bold: true, size, color: INK })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: name, size, color: INK })] }));
    return new TableCell({ borders: borderless, width: { size: 50, type: WidthType.PERCENTAGE }, children });
  }

  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: borderless,
      rows: [
        new TableRow({
          children: [
            sigCell(hasReqSig ? data.requestedSignature : null, "Requested By", data.requestedBy),
            sigCell(hasApprSig ? data.approvedSignature : null, "Processed and Approved By", data.approvedBy),
          ],
        }),
      ],
    })
  );

  const cashCollectors = Array.from(
    new Set(data.transfers.filter((t) => t.paymentMethod === "CASH" && t.collectedBy).map((t) => t.collectedBy as string))
  );
  if (cashCollectors.length > 0) {
    out.push(
      new Paragraph({
        spacing: { before: 300 },
        children: [new TextRun({ text: "Collected By", bold: true, size, color: INK })],
      })
    );
    out.push(new Paragraph({ children: [new TextRun({ text: cashCollectors.join(", "), size, color: INK })] }));
  }

  if (data.status === "PAID") {
    // A plain bold red stamp approximates the PDF's rotated watermark —
    // Word has no simple way to rotate inline paragraph text.
    out.push(
      new Paragraph({
        spacing: { before: 300 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "PAID", bold: true, size: size * 3, color: PAID_RED })],
      })
    );
  }

  return out;
}

/** Builds a .docx matching generateRequestPdf's content and layout as closely as Word allows. */
export async function generateRequestDocx(data: RequestForPdf & { brandColor: string }): Promise<Buffer> {
  const size = 22; // 11pt, matching the PDF body font
  const children: (Paragraph | Table)[] = buildCopy(data, data.brandColor, size);

  if (data.printReceipt) {
    // A second, identical copy below a divider — approximates the PDF's
    // office + take-away copy split by a cut line.
    children.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.DASHED, size: 6, color: "999999" } },
        spacing: { before: 300, after: 300 },
        children: [],
      })
    );
    children.push(...buildCopy(data, data.brandColor, size));
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
