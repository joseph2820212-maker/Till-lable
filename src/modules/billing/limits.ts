export type Tier = 'free' | 'pro';

/**
 * Free plan limits — owner-approved 24 Sep 2026 (docs/SCOPE_LOCK.md §4). Pro is a lifetime purchase
 * (launch price set per store and country in the stores, not in code; UK £14.99); no subscription. The review APK unlocks everything.
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

/** Everything in Free (owner decision). Printing, calibration, import and backup are never paywalled. */
export const FREE_FEATURES = [
  'quickLabel',
  'standardLabel',
  'priceBarcodeLabel',
  'unitPriceLabel',
  'csvImport',
  'tillcalcImport',
  'pdfPreview',
  'calibration',
  'printing',
  'backupRestore',
  'allLanguages',
] as const;

/** Pro-only features (owner decision). Each is gated with checkLimit(tier, 'proFeature', 0) in the gate that builds it. */
export const PRO_FEATURES = [
  'wasNow',
  'percentOff',
  'moneyOff',
  'multibuy',
  'reducedToClear',
  'offerCards',
  'customStationery',
  'multipleProfiles',
  'bulkQueue',
] as const;

export type FreeFeature = (typeof FREE_FEATURES)[number];
export type ProFeature = (typeof PRO_FEATURES)[number];

/** True when `feature` may be used on this tier. Unknown features are treated as Pro (fail closed). */
export function canUseFeature(tier: Tier, feature: FreeFeature | ProFeature): boolean {
  if ((FREE_FEATURES as readonly string[]).includes(feature)) return true;
  return checkLimit(tier, 'proFeature', 0).allowed;
}

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
