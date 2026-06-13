import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import BankAccountsManager from "./BankAccountsManager";

export const dynamic = "force-dynamic";

export default async function BankAccountsPage() {
  const me = await getCurrentUser();
  const allowed = me?.role === "ADMIN" || Boolean(me?.canManageBankAccounts);
  if (!allowed) redirect("/dashboard");
  return <BankAccountsManager />;
}
