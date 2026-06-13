import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SuppliersManager from "./SuppliersManager";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const me = await getCurrentUser();
  const allowed = me?.role === "ADMIN" || Boolean(me?.canManageSuppliers);
  if (!allowed) redirect("/dashboard");
  return <SuppliersManager />;
}
