// The ONE authoritative Free/Pro limit layer (carried over from TillCalc's F02 tests,
// re-pointed at TillLabel's provisional plan). Adversarial cases: at / over / around the
// threshold, bad counts, exemptions, Pro never limited, restored data never deleted.
import { checkLimit, FREE_LIMITS, LIMIT_CAPS, type LimitKind } from '../limits';

describe('checkLimit — products threshold', () => {
  it('allowed below the cap, refused AT and OVER the cap on Free', () => {
    const cap = LIMIT_CAPS.products!;
    expect(checkLimit('free', 'products', 0)).toEqual({ allowed: true, remaining: cap, limit: cap });
    expect(checkLimit('free', 'products', cap - 1)).toEqual({ allowed: true, remaining: 1, limit: cap });
    expect(checkLimit('free', 'products', cap)).toEqual({ allowed: false, remaining: 0, limit: cap });
    expect(checkLimit('free', 'products', cap + 1)).toEqual({ allowed: false, remaining: 0, limit: cap });
  });

  it('caps match the provisional plan exactly (200 products, Pro-only features)', () => {
    expect(LIMIT_CAPS).toEqual({ products: 200, proFeature: null });
    expect(FREE_LIMITS).toEqual({ products: 200 });
  });

  it('Pro-only features are refused on Free whatever the count', () => {
    expect(checkLimit('free', 'proFeature', 0).allowed).toBe(false);
    expect(checkLimit('free', 'proFeature', -5).allowed).toBe(false);
    expect(checkLimit('pro', 'proFeature', 0).allowed).toBe(true);
  });

  it.each(['products', 'proFeature'] as LimitKind[])('%s: Pro is never limited', kind => {
    for (const n of [0, 1, 200, 99999, NaN, -1, Infinity]) {
      expect(checkLimit('pro', kind, n)).toEqual({ allowed: true, remaining: Infinity, limit: null });
    }
  });
});

describe('adversarial counts can never unlock Pro capacity', () => {
  it('NaN / negative / Infinity / undefined counts are treated as AT the cap on Free', () => {
    for (const bad of [NaN, -1, -Infinity, Infinity, undefined as unknown as number]) {
      const r = checkLimit('free', 'products', bad);
      expect(r.allowed).toBe(false);
      expect(r.remaining).toBe(0);
    }
  });
  it('fractional counts floor', () => {
    expect(checkLimit('free', 'products', 199.9).allowed).toBe(true);
    expect(checkLimit('free', 'products', 200.1).allowed).toBe(false);
  });
  it('an unknown tier string is not Pro', () => {
    expect(checkLimit('premium' as any, 'products', 200).allowed).toBe(false);
    expect(checkLimit(undefined as any, 'proFeature', 0).allowed).toBe(false);
  });
});

describe('exemptions and restored data (TL-33)', () => {
  it('sample products are never limited', () => {
    expect(checkLimit('free', 'products', 500, { exempt: true }).allowed).toBe(true);
  });
  it('a restored catalogue over the cap only stops NEW products: the answer carries no deletion instruction', () => {
    const r = checkLimit('free', 'products', 1500);
    expect(r).toEqual({ allowed: false, remaining: 0, limit: 200 });
  });
});
