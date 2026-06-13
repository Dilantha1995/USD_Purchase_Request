import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (session?.role !== "ADMIN") redirect("/dashboard");

  const [companies, users] = await Promise.all([
    prisma.company.findMany({
      select: { id: true, name: true, refPrefix: true, brandColor: true, nextSerial: true },
      orderBy: { id: "asc" },
    }),
    prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, canEditRequests: true, canDeleteRequests: true, canManageSuppliers: true, canManageBankAccounts: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return <AdminPanel companies={companies} users={users} currentUserId={session.id} />;
}
