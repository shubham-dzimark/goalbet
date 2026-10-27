import { type UserLimit } from '@goalbet/db';

export const DAY = 86_400_000;

/** Effective value of a limit right now (increases and removals wait for their cooling-off time). */
export function effectiveLimit(l: UserLimit, now = Date.now()): number | null {
  if (l.pendingAmountBani !== null && l.effectiveAt.getTime() <= now) return l.pendingAmountBani === 0 ? null : l.pendingAmountBani;
  return l.amountBani;
}

/** Player self-limits and operator limits: the strictest value of each type applies. */
export function strictestLimits(limits: UserLimit[], now = Date.now()): Map<string, number> {
  const strictest = new Map<string, number>();
  for (const l of limits) {
    const v = effectiveLimit(l, now);
    if (v === null) continue;
    strictest.set(l.type, Math.min(v, strictest.get(l.type) ?? Number.MAX_SAFE_INTEGER));
  }
  return strictest;
}
