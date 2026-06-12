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
