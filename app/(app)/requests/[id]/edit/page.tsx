import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Transfer } from "@/lib/format";
import { getAssignableDeals } from "@/lib/deal";
import NewRequestForm from "../../../new/NewRequestForm";

export const dynamic = "force-dynamic";

function isoDate(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function EditRequestPage({ params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  const canEdit = me?.role === "ADMIN" || Boolean(me?.canEditRequests);
  if (!canEdit) redirect("/dashboard");

  const [r, companies, suppliers, bankAccounts] = await Promise.all([
    prisma.request.findUnique({ where: { id: params.id }, include: { company: true } }),
    prisma.company.findMany({ select: { id: true, name: true, refPrefix: true, brandColor: true, nextSerial: true, serialPeriod: true }, orderBy: { id: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true, accounts: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { active: true }, select: { id: true, label: true, companyId: true }, orderBy: { label: "asc" } }),
  ]);
  if (!r) notFound();
  const deals = await getAssignableDeals(r.dealId, { onlyPending: false });

  const transfers = (r.transfers as unknown as Transfer[]).map((t) => ({
    sourceAccount: t.sourceAccount || r.sourceAccount || "",
    recipient: t.recipient,
    bankName: t.bankName || "",
    account: t.account,
    amounts: t.amounts.map((a) => String(a)),
  }));

  const existing = {
    id: r.id,
    companyId: r.companyId,
    companyName: r.company.name,
    refNo: r.refNo,
    date: isoDate(r.date),
    usdAmount: String(r.usdAmount),
    rate: String(r.rate),
    source: r.source,
    dealId: r.dealId,
    requestedBy: r.requestedBy,
    approvedBy: r.approvedBy,
    transfers,
  };

  return (
    <NewRequestForm
      companies={companies}
      suppliers={suppliers as any}
      bankAccounts={bankAccounts}
      deals={deals}
      defaultRequestedBy={me?.name || ""}
      existing={existing}
    />
  );
}
