import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

async function getSettings() {
  return (
    (await prisma.settings.findUnique({ where: { id: "default" } })) ||
    (await prisma.settings.create({ data: { id: "default", defaultBankRate: 15.42 } }))
  );
}

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getSettings());
}

export async function PATCH(req: Request) {
  const s = await getSession();
  if (s?.role !== "ADMIN")
    return NextResponse.json({ error: "Only administrators can change the bank rate" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const rate = Number(b.defaultBankRate);
  if (!Number.isFinite(rate) || rate <= 0)
    return NextResponse.json({ error: "Enter a valid bank rate" }, { status: 400 });
  await getSettings();
  const updated = await prisma.settings.update({ where: { id: "default" }, data: { defaultBankRate: rate } });
  return NextResponse.json(updated);
}
