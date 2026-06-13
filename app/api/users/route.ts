import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

const PERMS = ["canEditRequests", "canDeleteRequests", "canManageSuppliers", "canManageBankAccounts"] as const;

const SELECT = {
  id: true, email: true, name: true, role: true, active: true, createdAt: true,
  canEditRequests: true, canDeleteRequests: true, canManageSuppliers: true, canManageBankAccounts: true,
};

export async function GET() {
  const s = await getSession();
  if (s?.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const users = await prisma.user.findMany({ select: SELECT, orderBy: { createdAt: "asc" } });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { name, email, password, role } = await req.json().catch(() => ({}));
  if (!name?.trim() || !email?.trim() || !password)
    return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
  if (String(password).length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  const lower = String(email).toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { email: lower } }))
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  const user = await prisma.user.create({
    data: { name: name.trim(), email: lower, passwordHash: await hashPassword(password), role: role === "ADMIN" ? "ADMIN" : "USER" },
    select: SELECT,
  });
  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  const s = await getSession();
  if (s?.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  const data: any = {};
  if (typeof b.active === "boolean") {
    if (b.id === s.id && b.active === false)
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
    data.active = b.active;
  }
  if (b.role === "ADMIN" || b.role === "USER") data.role = b.role;
  for (const p of PERMS) if (p in b) data[p] = Boolean(b[p]);
  if (b.password) {
    if (String(b.password).length < 8)
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    data.passwordHash = await hashPassword(b.password);
  }
  const user = await prisma.user.update({ where: { id: b.id }, data, select: SELECT });
  return NextResponse.json(user);
}
