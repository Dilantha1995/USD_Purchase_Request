import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (session?.role !== "ADMIN")
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN")
    return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { name, email, password, role } = await req.json().catch(() => ({}));
  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  const lower = String(email).toLowerCase().trim();
  const exists = await prisma.user.findUnique({ where: { email: lower } });
  if (exists) return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: lower,
      passwordHash: await hashPassword(password),
      role: role === "ADMIN" ? "ADMIN" : "USER",
    },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });
  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN")
    return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { id, active, password } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

  const data: { active?: boolean; passwordHash?: string } = {};
  if (typeof active === "boolean") {
    if (id === session.id && active === false) {
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
    }
    data.active = active;
  }
  if (password) {
    if (String(password).length < 8)
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    data.passwordHash = await hashPassword(password);
  }
  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });
  return NextResponse.json(user);
}
