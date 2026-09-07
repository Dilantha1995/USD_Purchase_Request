import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { computeDealTotals, isDealPaymentPending } from "@/lib/deal";
import NewRequestForm from "./NewRequestForm";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({ searchParams }: { searchParams: { dealId?: string } }) {
  const session = await getSession();
  const [companies, suppliers, bankAccounts, dealRows] = await Promise.all([
    prisma.company.findMany({
      select: { id: true, name: true, refPrefix: true, brandColor: true, nextSerial: true, serialPeriod: true },
      orderBy: { id: "asc" },
    }),
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true, accounts: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { active: true }, select: { id: true, label: true, companyId: true }, orderBy: { label: "asc" } }),
    prisma.deal.findMany({
      where: { status: "OPEN" },
      include: { requests: { select: { transfers: true } }, usdReceipts: { select: { usdAmount: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const deals = dealRows
    .map((d: (typeof dealRows)[number]) => {
      const totals = computeDealTotals(d, d.requests, d.usdReceipts);
      return {
        id: d.id,
        refNo: d.refNo,
        name: d.name,
        companyId: d.companyId,
        supplierId: d.supplierId,
        rate: d.rate,
        mvrPending: totals.mvrPending,
        usdPending: totals.usdPending,
        pending: isDealPaymentPending(totals),
      };
    })
    .filter((d) => d.pending || d.id === searchParams.dealId);

  return (
    <NewRequestForm
      companies={companies}
      suppliers={suppliers as any}
      bankAccounts={bankAccounts}
      deals={deals}
      defaultDealId={searchParams.dealId}
      defaultRequestedBy={session?.name || ""}
    />
  );
}
