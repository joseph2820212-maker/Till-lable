import { CATALOGUE_LIMITS, LABEL_NAME_MAX, labelNameCounter, printableName, suggestLabelName } from '../productLabel';
import { formatMoney } from '../formatMoney';

describe('catalogue name vs printable label name (owner handout §2, §26)', () => {
  const full = 'Fairy Platinum Plus All In One Dishwasher Tablets Lemon 42 Pack';
  it('the full product name is kept; the label prints the separate label name', () => {
    expect(printableName({ name: full, labelName: 'Fairy Platinum+ Lemon 42' })).toBe('Fairy Platinum+ Lemon 42');
    expect(full.length).toBeGreaterThan(LABEL_NAME_MAX); // the catalogue name itself is not limited to 40
    expect(CATALOGUE_LIMITS.productName).toBeGreaterThanOrEqual(200);
  });
  it('without a label name, a full name within 40 prints as it is; a longer one needs the user (never auto-cut)', () => {
    expect(printableName({ name: 'Heinz Cream of Tomato Soup' })).toBe('Heinz Cream of Tomato Soup');
    expect(printableName({ name: full })).toBeNull();
    expect(suggestLabelName(full)).toBeNull();
    expect(suggestLabelName('  Heinz   Cream  of Tomato  ')).toBe('Heinz Cream of Tomato');
  });
  it('the counter describes the printable field: "38 / 40"', () => {
    expect(labelNameCounter('Heinz Cream of Tomato Soup Family Pack')).toEqual({ used: 38, max: 40, over: false });
    expect(labelNameCounter(full).over).toBe(true);
    expect(labelNameCounter('حليب طازج').used).toBe(9); // code points, not UTF-16 units
  });
});

describe('unit-price precision is independent of the selling price', () => {
  it('extra decimals only when asked', () => {
    expect(formatMoney(281, 'GBP', 'en', 1)).toBe('£0.281');
    expect(formatMoney(1396, 'EUR', 'de')).toBe('13,96 €');
    expect(formatMoney(12345, 'KWD', 'en', 1)).toBe('KWD 1.2345');
  });
});
