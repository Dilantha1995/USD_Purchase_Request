"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function TopBar({
  name,
  role,
  canManageSuppliers,
  canManageBankAccounts,
}: {
  name: string;
  role: "ADMIN" | "USER";
  canManageSuppliers?: boolean;
  canManageBankAccounts?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/dashboard", label: "Requests" },
    { href: "/new", label: "New request" },
    { href: "/transfer/new", label: "New transfer" },
    { href: "/deals", label: "Deals" },
    ...(canManageSuppliers ? [{ href: "/suppliers", label: "Suppliers" }] : []),
    ...(canManageBankAccounts ? [{ href: "/bank-accounts", label: "Bank accounts" }] : []),
    ...(role === "ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex w-full items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-semibold text-ink">
            Dollar Purchase
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    active ? "bg-slate-100 font-medium text-ink" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{name}</span>
          <button onClick={logout} className="btn-ghost px-3 py-1.5 text-sm">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
