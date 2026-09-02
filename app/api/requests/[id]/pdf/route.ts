import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateRequestPdf } from "@/lib/pdf";
import { Transfer } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const request = await prisma.request.findUnique({
    where: { id: params.id },
    include: { company: true },
  });
  if (!request) return new Response("Not found", { status: 404 });

  // Guard: transfer amounts must equal USD x rate, otherwise the document can't be printed.
  const transferList = request.transfers as unknown as Transfer[];
  const transferTotal = transferList.reduce(
    (s, t) => s + t.amounts.reduce((a: number, b: number) => a + (Number(b) || 0), 0),
    0
  );
  const expected = request.usdAmount * request.rate;
  if (Math.abs(transferTotal - expected) > 0.5) {
    return new Response(
      `Cannot print: the transfer amounts (MVR ${transferTotal.toLocaleString("en-US")}) do not match USD ${request.usdAmount.toLocaleString("en-US")} x ${request.rate} = MVR ${expected.toLocaleString("en-US")}. Please correct the amounts before printing.`,
      { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const pdfBytes = await generateRequestPdf(
    new Uint8Array(request.company.templatePdf),
    {
      refNo: request.refNo,
      companyName: request.company.name,
      date: request.date,
      usdAmount: request.usdAmount,
      rate: request.rate,
      source: request.source,
      sourceAccount: request.sourceAccount,
      requestedBy: request.requestedBy,
      approvedBy: request.approvedBy,
      transfers: request.transfers as unknown as Transfer[],
      status: request.status,
    }
  );

  const download = new URL(req.url).searchParams.get("download") === "1";
  const filename = `${request.refNo.replace(/\//g, "-")}.pdf`;

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
