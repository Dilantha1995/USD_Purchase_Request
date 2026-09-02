import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import InternalTransferForm from "./InternalTransferForm";

export const dynamic = "force-dynamic";

export default async function NewTransferPage() {
  const session = await getSession();
  const [companies, bankAccounts] = await Promise.all([
    prisma.company.findMany({
      select: { id: true, name: true, refPrefix: true, brandColor: true, nextSerial: true, serialPeriod: true },
      orderBy: { id: "asc" },
    }),
    prisma.bankAccount.findMany({ where: { active: true }, select: { id: true, label: true, companyId: true }, orderBy: { label: "asc" } }),
  ]);
  return <InternalTransferForm companies={companies} bankAccounts={bankAccounts} defaultRequestedBy={session?.name || ""} />;
}
