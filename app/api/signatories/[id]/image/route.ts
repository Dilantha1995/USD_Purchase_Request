import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// Serves a signatory's signature image (for previews)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return new Response("Unauthorized", { status: 401 });
  const s = await prisma.signatory.findUnique({ where: { id: params.id }, select: { signature: true } });
  if (!s?.signature) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(s.signature), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
