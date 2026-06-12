import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import TopBar from "./_components/TopBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <TopBar name={session.name} role={session.role} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
