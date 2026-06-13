import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import NewRequestForm from "./NewRequestForm";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const session = await getSession();
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, refPrefix: true, brandColor: true, nextSerial: true, serialPeriod: true },
    orderBy: { id: "asc" },
  });
  return <NewRequestForm companies={companies} defaultRequestedBy={session?.name || ""} />;
}
