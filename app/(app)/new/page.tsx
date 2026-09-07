import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getAssignableDeals } from "@/lib/deal";
import NewRequestForm from "./NewRequestForm";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({ searchParams }: { searchParams: { dealId?: string } }) {
  const session = await getSession();
  const [companies, suppliers, bankAccounts, deals] = await Promise.all([
    prisma.company.findMany({
      select: { id: true, name: true, refPrefix: true, brandColor: true, nextSerial: true, serialPeriod: true },
      orderBy: { id: "asc" },
    }),
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true, accounts: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { active: true }, select: { id: true, label: true, companyId: true }, orderBy: { label: "asc" } }),
    getAssignableDeals(searchParams.dealId),
  ]);

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
