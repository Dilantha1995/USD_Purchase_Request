import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const SELECT = {
  id: true,
  name: true,
  refPrefix: true,
  brandColor: true,
  nextSerial: true,
} as const;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companies = await prisma.company.findMany({ select: SELECT, orderBy: { id: "asc" } });
  return NextResponse.json(companies);
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN")
    return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { id, nextSerial } = await req.json().catch(() => ({}));
  const serial = Number(nextSerial);
  if (!id || !Number.isInteger(serial) || serial < 1) {
    return NextResponse.json({ error: "Enter a whole number of 1 or more" }, { status: 400 });
  }
  const updated = await prisma.company.update({
    where: { id },
    data: { nextSerial: serial },
    select: SELECT,
  });
  return NextResponse.json(updated);
}
