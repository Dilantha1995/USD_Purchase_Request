import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { computeDealTotals, buildDealLedger } from "@/lib/deal";
import { generateDealStatementPdf } from "@/lib/dealPdf";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { name: true } },
      supplier: { select: { name: true } },
      requests: { orderBy: { date: "asc" } },
      usdReceipts: { orderBy: { date: "asc" } },
    },
  });
  if (!deal) return new Response("Deal not found", { status: 404 });

  const totals = computeDealTotals(deal, deal.requests, deal.usdReceipts);
  const ledger = buildDealLedger(deal.requests, deal.usdReceipts);

  const bytes = await generateDealStatementPdf({
    companyName: deal.company.name,
    refNo: deal.refNo,
    name: deal.name,
    supplierName: deal.supplier.name,
    date: deal.date,
    status: deal.status,
    totals,
    ledger,
  });

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  const fileName = `${deal.refNo.replace(/\//g, "-")}-statement.pdf`;

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
