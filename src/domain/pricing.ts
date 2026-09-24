/**
 * Exact label arithmetic (plan §M, validation V2). Integer minor units only; every division rounds half-up once,
 * at the end, with BigInt so no step touches binary floating point. TillCalc's float formulas are NOT used.
 */
import type { Money } from './money';
import type { SellingUnit, UnitPriceBase } from './types';

const roundDiv = (num: bigint, den: bigint): bigint => (num * 2n + den) / (den * 2n);

function money(minor: bigint, like: Money): Money {
  const n = Number(minor);
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('amount out of range');
  return { minor: n, currency: like.currency, exponent: like.exponent };
}

/** Which unit-price bases make sense for a selling unit (weight → per kg / per 100 g, …). */
export function unitBasesFor(unit: SellingUnit): UnitPriceBase[] {
  switch (unit.kind) {
    case 'weight': return ['per_kg', 'per_100g'];
    case 'volume': return ['per_litre', 'per_100ml'];
    case 'length': return ['per_metre'];
    case 'pack': return ['per_item'];
    default: return [];
  }
}

/**
 * Unit price for a selling price and what it buys. `extraDecimals` adds precision (the result is then in
 * 1/10^extraDecimals of a minor unit) for countries whose rules ask for it. Null when the base does not apply.
 */
export function unitPrice(price: Money, unit: SellingUnit, base: UnitPriceBase, extraDecimals: 0 | 1 | 2 = 0): Money | null {
  if (!unitBasesFor(unit).includes(base)) return null;
  const p = BigInt(price.minor) * 10n ** BigInt(extraDecimals);
  const qty = unit.kind === 'weight' ? unit.grams : unit.kind === 'volume' ? unit.millilitres : unit.kind === 'length' ? unit.millimetres : unit.kind === 'pack' ? unit.count : 0;
  if (!Number.isInteger(qty) || qty <= 0) return null;
  const per = base === 'per_kg' || base === 'per_litre' || base === 'per_metre' ? 1000n : base === 'per_100g' || base === 'per_100ml' ? 100n : 1n;
  return money(roundDiv(p * per, BigInt(qty)), price);
}

/** Price after a percentage off (hundredths of a percent: 2500 = 25 %). */
export function applyPercentOff(price: Money, hundredths: number): Money {
  if (!Number.isInteger(hundredths) || hundredths <= 0 || hundredths >= 10000) throw new RangeError('percent must be 0.01–99.99');
  return money(roundDiv(BigInt(price.minor) * BigInt(10000 - hundredths), 10000n), price);
}

/** Price after an amount off. Refuses a result of zero or less. */
export function applyMoneyOff(price: Money, off: Money): Money {
  if (off.currency !== price.currency) throw new RangeError('mixed currency');
  if (off.minor <= 0 || off.minor >= price.minor) throw new RangeError('amount off must be more than zero and less than the price');
  return money(BigInt(price.minor - off.minor), price);
}

/** Saving between a reference ("was") price and the current price; null when there is no real saving. */
export function saving(was: Money, now: Money): Money | null {
  if (was.currency !== now.currency) throw new RangeError('mixed currency');
  return was.minor > now.minor ? money(BigInt(was.minor - now.minor), now) : null;
}

/** Percentage (hundredths) a reduced price is below the normal price, rounded half-up. */
export function percentBelow(normal: Money, reduced: Money): number {
  if (normal.currency !== reduced.currency || normal.minor <= 0 || reduced.minor >= normal.minor) return 0;
  return Number(roundDiv(BigInt(normal.minor - reduced.minor) * 10000n, BigInt(normal.minor)));
}
