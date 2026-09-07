import { prisma } from "@/lib/db";
import NewDealForm from "./NewDealForm";

export const dynamic = "force-dynamic";

export default async function NewDealPage() {
  const [companies, suppliers] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true, brandColor: true }, orderBy: { id: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <NewDealForm companies={companies} suppliers={suppliers} />;
}
