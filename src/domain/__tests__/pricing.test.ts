import { moneyFromMinor } from '../money';
import { applyMoneyOff, applyPercentOff, percentBelow, saving, unitBasesFor, unitPrice } from '../pricing';

const gbp = (m: number) => moneyFromMinor(m, 'GBP');

describe('exact label arithmetic', () => {
  it('unit price per kg / 100 g / litre / 100 ml / metre / item, half-up', () => {
    expect(unitPrice(gbp(449), { kind: 'weight', grams: 1600 }, 'per_kg')!.minor).toBe(281); // 280.625 → 281
    expect(unitPrice(gbp(349), { kind: 'weight', grams: 250 }, 'per_100g')!.minor).toBe(140); // 139.6
    expect(unitPrice(moneyFromMinor(1149, 'EUR'), { kind: 'volume', millilitres: 1000 }, 'per_litre')!.minor).toBe(1149);
    expect(unitPrice(gbp(199), { kind: 'volume', millilitres: 330 }, 'per_100ml')!.minor).toBe(60); // 60.30
    expect(unitPrice(gbp(500), { kind: 'length', millimetres: 2500 }, 'per_metre')!.minor).toBe(200);
    expect(unitPrice(gbp(1100), { kind: 'pack', count: 42 }, 'per_item')!.minor).toBe(26); // 26.19
  });
  it('extra precision for unit prices when a country profile needs it', () => {
    expect(unitPrice(gbp(1100), { kind: 'pack', count: 42 }, 'per_item', 1)!.minor).toBe(262); // £0.262
  });
  it('refuses bases that do not match the selling unit', () => {
    expect(unitPrice(gbp(100), { kind: 'each' }, 'per_kg')).toBeNull();
    expect(unitPrice(gbp(100), { kind: 'weight', grams: 500 }, 'per_litre')).toBeNull();
    expect(unitBasesFor({ kind: 'each' })).toEqual([]);
  });
  it('3-decimal and 0-decimal currencies keep their exponent', () => {
    expect(unitPrice(moneyFromMinor(1250, 'KWD'), { kind: 'weight', grams: 500 }, 'per_kg')).toMatchObject({ minor: 2500, exponent: 3 });
    expect(applyPercentOff(moneyFromMinor(999, 'JPY'), 1000)).toMatchObject({ minor: 899, exponent: 0 }); // 899.1
  });
  it('percent off, money off, saving and percent below are exact', () => {
    expect(applyPercentOff(gbp(599), 2500).minor).toBe(449); // 449.25
    expect(applyPercentOff(gbp(1), 5000).minor).toBe(1); // 0.5 → 1 (half-up)
    expect(applyMoneyOff(gbp(599), gbp(100)).minor).toBe(499);
    expect(() => applyMoneyOff(gbp(599), gbp(599))).toThrow();
    expect(() => applyMoneyOff(gbp(599), moneyFromMinor(100, 'EUR'))).toThrow();
    expect(saving(gbp(599), gbp(449))!.minor).toBe(150);
    expect(saving(gbp(449), gbp(449))).toBeNull();
    expect(percentBelow(gbp(350), gbp(100))).toBe(7143);
  });
  it('no float step: large amounts stay exact', () => {
    expect(applyPercentOff(moneyFromMinor(9007199254740, 'GBP'), 3333).minor).toBe(6005099743135);
  });
});
