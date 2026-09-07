import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import EditDealForm from "./EditDealForm";

export const dynamic = "force-dynamic";

function isoDate(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function EditDealPage({ params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  const canEdit = me?.role === "ADMIN" || Boolean(me?.canEditRequests);
  if (!canEdit) redirect("/deals");

  const [deal, suppliers] = await Promise.all([
    prisma.deal.findUnique({ where: { id: params.id }, include: { company: { select: { name: true } } } }),
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!deal) notFound();

  return (
    <EditDealForm
      dealId={deal.id}
      refNo={deal.refNo}
      name={deal.name}
      companyName={deal.company.name}
      suppliers={suppliers}
      initialSupplierId={deal.supplierId}
      initialDate={isoDate(deal.date)}
      initialNotes={deal.notes || ""}
    />
  );
}
