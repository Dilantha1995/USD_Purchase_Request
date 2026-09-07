import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** Turns a report heading into a matching download filename base (no extension). */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type PdfCol = { h: string; w: number; key: string; align?: "l" | "r" };
export type PdfRow = { cells: Record<string, string>; bold?: boolean; topBorder?: boolean };

/** Generic paginated table renderer shared by the report export routes. */
export async function renderTablePdf(opts: {
  title: string;
  subtitle?: string;
  cols: PdfCol[];
  rows: PdfRow[];
  pageWidth?: number;
  pageHeight?: number;
  margin?: number;
}): Promise<Uint8Array> {
  const PW = opts.pageWidth ?? 842;
  const PH = opts.pageHeight ?? 595;
  const M = opts.margin ?? 30;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.14, 0.2);
  const grey = rgb(0.8, 0.8, 0.8);

  const xs: number[] = [];
  let cx = M;
  for (const c of opts.cols) {
    xs.push(cx);
    cx += c.w;
  }

  const clip = (s: string, w: number, b = false, size = 8) => {
    const f = b ? bold : font;
    let str = String(s ?? "");
    while (str.length > 1 && f.widthOfTextAtSize(str, size) > w - 6) str = str.slice(0, -1);
    return str;
  };

  let page = pdf.addPage([PW, PH]);
  let y = PH - 40;
  page.drawText(clip(opts.title, PW - M * 2, true, 12), { x: M, y, size: 12, font: bold, color: ink });
  y -= 18;
  if (opts.subtitle) {
    page.drawText(clip(opts.subtitle, PW - M * 2, false, 9), { x: M, y, size: 9, font, color: ink });
    y -= 16;
  } else {
    y -= 4;
  }

  const drawHeader = () => {
    opts.cols.forEach((c, i) => {
      const x = c.align === "r" ? xs[i] + c.w - 6 - bold.widthOfTextAtSize(c.h, 8) : xs[i] + 2;
      page.drawText(c.h, { x, y, size: 8, font: bold, color: ink });
    });
    y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.7, color: grey });
    y -= 12;
  };
  drawHeader();

  for (const row of opts.rows) {
    if (y < 40) {
      page = pdf.addPage([PW, PH]);
      y = PH - 40;
      drawHeader();
    }
    if (row.topBorder) {
      page.drawLine({ start: { x: M, y: y + 9 }, end: { x: PW - M, y: y + 9 }, thickness: 0.5, color: grey });
    }
    const f = row.bold ? bold : font;
    opts.cols.forEach((c, i) => {
      const txt = clip(row.cells[c.key] ?? "", c.w, row.bold);
      const x = c.align === "r" ? xs[i] + c.w - 6 - f.widthOfTextAtSize(txt, 8) : xs[i] + 2;
      page.drawText(txt, { x, y, size: 8, font: f, color: ink });
    });
    y -= 14;
  }

  if (opts.rows.length === 0) {
    page.drawText("No data for the selected filters.", { x: M, y, size: 9, font, color: ink });
  }

  return pdf.save();
}
