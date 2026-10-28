import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateRequestDocx } from "@/lib/docx";
import { Transfer } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const request = await prisma.request.findUnique({
    where: { id: params.id },
    include: { company: true },
  });
  if (!request) return new Response("Not found", { status: 404 });

  const docxBytes = await generateRequestDocx({
    refNo: request.refNo,
    companyName: request.company.name,
    brandColor: request.company.brandColor,
    date: request.date,
    usdAmount: request.usdAmount,
    rate: request.rate,
    source: request.source,
    sourceAccount: request.sourceAccount,
    requestedBy: request.requestedBy,
    approvedBy: request.approvedBy,
    transfers: request.transfers as unknown as Transfer[],
    status: request.status,
    printReceipt: request.printReceipt,
    useLetterLabels: request.useLetterLabels,
    continuousNumbering: request.continuousNumbering,
    docType: request.docType,
  });

  const filename = `${request.refNo.replace(/\//g, "-")}.docx`;

  return new Response(new Uint8Array(docxBytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
