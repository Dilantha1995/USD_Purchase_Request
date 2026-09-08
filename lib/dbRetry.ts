import { Prisma } from "@prisma/client";

/** True if `e` is a Prisma unique-constraint violation (P2002) on `field`. */
export function isUniqueConflict(e: unknown, field: string): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    Array.isArray((e.meta as any)?.target) &&
    (e.meta as any).target.includes(field)
  );
}

/**
 * Retries `fn` on a unique-constraint conflict on `field` — defense-in-depth
 * for the rare residual race (e.g. two requests landing on either side of a
 * calendar-month boundary) after the caller's atomic counter update has
 * already closed the main race window.
 */
export async function retryOnConflict<T>(fn: () => Promise<T>, field: string, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isUniqueConflict(e, field)) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}
