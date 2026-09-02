import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import NewRequestForm from "./NewRequestForm";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const session = await getSession();
  const [companies, suppliers, bankAccounts] = await Promise.all([
    prisma.company.findMany({
      select: { id: true, name: true, refPrefix: true, brandColor: true, nextSerial: true, serialPeriod: true },
      orderBy: { id: "asc" },
    }),
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true, accounts: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { active: true }, select: { id: true, label: true, companyId: true }, orderBy: { label: "asc" } }),
  ]);
  return (
    <NewRequestForm
      companies={companies}
      suppliers={suppliers as any}
      bankAccounts={bankAccounts}
      defaultRequestedBy={session?.name || ""}
    />
  );
}
