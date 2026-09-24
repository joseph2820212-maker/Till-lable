export type Tier = 'free' | 'pro';

/**
 * PROVISIONAL Free plan limits (plan TNF-TL-R1-PLAN-1.1 §A, not an owner-approved commercial decision).
 * The review APK unlocks everything, so these values never block testing.
 */
export const FREE_LIMITS = {
  products: 200,
} as const;

/**
 * The ONE authoritative Free/Pro limit layer (carried over from TillCalc's F02 design).
 * `proFeature` is Pro-only (no count). A limit only ever stops adding NEW capacity:
 * existing and restored data is never deleted, hidden or locked (TL-33).
 */
export type LimitKind = 'products' | 'proFeature';

export const LIMIT_CAPS: Record<LimitKind, number | null> = {
  products: FREE_LIMITS.products,
  proFeature: null,
};

export interface LimitResult { allowed: boolean; remaining: number; limit: number | null }

const UNLIMITED: LimitResult = { allowed: true, remaining: Infinity, limit: null };

/**
 * May ONE more of `kind` be created when `currentCount` already exist?
 * Pro is never limited. `exempt` (e.g. sample products) is never limited.
 * Missing, negative or non-finite counts are treated as "at the cap" so a bad
 * count can never unlock Pro capacity on Free.
 */
export function checkLimit(tier: Tier, kind: LimitKind, currentCount: number, opts?: { exempt?: boolean }): LimitResult {
  if (tier === 'pro' || opts?.exempt) return UNLIMITED;
  const cap = LIMIT_CAPS[kind];
  if (cap == null) return { allowed: false, remaining: 0, limit: null };
  const used = Number.isFinite(currentCount) && currentCount >= 0 ? Math.floor(currentCount) : cap;
  const remaining = Math.max(0, cap - used);
  return { allowed: remaining > 0, remaining, limit: cap };
}
