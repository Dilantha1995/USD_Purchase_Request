import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import TopBar from "./_components/TopBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  return (
    <div className="min-h-screen">
      <TopBar
        name={me.name}
        role={me.role}
        canManageSuppliers={me.role === "ADMIN" || me.canManageSuppliers}
        canManageBankAccounts={me.role === "ADMIN" || me.canManageBankAccounts}
      />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
