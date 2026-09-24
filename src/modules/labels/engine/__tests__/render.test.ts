import fs from 'fs';
import path from 'path';
import { moneyFromMinor } from '../../../../domain/money';
import { PRESETS } from '../presets';
import { renderSheet, RENDERER_VERSION } from '../renderSheet';
import { layoutFor, renderLabel, type LabelContent } from '../renderLabel';
import { renderTestSheet, REFERENCE_LINE_MM } from '../testPage';
import { buildFontFaceCss } from '../fonts';
import { FONT_METRICS } from '../fontMetrics.generated';
import { measureMm } from '../textFit';
import {
  fieldLimitsFor, LABEL_LAYOUTS, LABEL_NAME_MAX, layoutCompatibility, NAME_CORPUS, templateFor, type LabelLayout,
} from '../labelTemplate';
import { formatLabelDate, formatPercent, formatPercentText, LABEL_TEXT, labelText } from '../labelStrings';
import { classifyCalibration, CALIBRATION_TEXT } from '../calibration';
import { marksPrinted, printFlow, showsConfirmationQuestion, startPreview, type PrintFlowEvent } from '../printFlow';
import { PAIRS, standardContent, TEST_FONTS } from './fixtures';

const shelf = PRESETS.find(p => p.id === 'preset_shelf_70x38_a4')!;
const boxOf = (id: string) => { const p = PRESETS.find(x => x.id === id)!; return { widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm }; };
const box = boxOf('preset_shelf_70x38_a4');
const a6 = boxOf('preset_offer_a6_on_a4');
const a4card = boxOf('preset_offer_a4');
const textOf = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const errors = (r: { issues: { severity: string }[] }) => r.issues.filter(i => i.severity === 'error');

/** The price exactly as printed (tags removed without adding spaces). */
const priceOf = (html: string) => {
  const m = /<div class="price"[^>]*>(?:<span class="now"[^>]*>[^<]*<\/span> )?<bdi dir="ltr">([\s\S]*?)<\/bdi><\/div>/.exec(html);
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ') : '';
};
const sizeOf = (html: string, cls: string) => Number(new RegExp(`class="${cls}" style="font-size:([\\d.]+)pt`).exec(html)?.[1]);

describe('six label languages × three G2 kinds on the 70 × 38 mm shelf ticket (L1, L2)', () => {
  for (let i = 0; i < PAIRS.length; i++) {
    for (const kind of ['standardPrice', 'priceUnitPrice', 'priceBarcode'] as const) {
      it(`${PAIRS[i].lang} + ${PAIRS[i].currency}: ${kind} renders with no blocking issue`, () => {
        const r = renderLabel(standardContent(i, kind), box);
        expect(errors(r)).toEqual([]);
        expect(r.html).toContain(`lang="${PAIRS[i].lang}"`);
        expect(r.html).toContain(`dir="${PAIRS[i].lang === 'ar' ? 'rtl' : 'ltr'}"`);
      });
    }
  }
});

describe('mixed direction (L3) and independence (L4–L6)', () => {
  it('an Arabic label keeps prices, SKU, EAN digits and bars left-to-right and never mirrors bars', () => {
    const c = { ...standardContent(1, 'priceBarcode'), unitPrice: { amount: moneyFromMinor(638, 'AED'), base: 'per_litre' as const } };
    const html = renderLabel(c, box).html;
    expect(html).toContain('dir="rtl"');
    expect(priceOf(html)).toBe('12.75 د.إ');
    expect(html).toContain('<bdi dir="ltr">6.38 د.إ</bdi>');
    expect(html).toContain('<bdi dir="ltr">ALN-MILK-2L</bdi>');
    expect(html).toMatch(/class="barcode" dir="ltr"/);
    expect(html).toContain('<span>6</span><span>2</span><span>9</span>'); // EAN digits in order
    expect(html).not.toMatch(/scaleX\(-1\)|transform:\s*scale\(-1/);
  });
  it('Arabic money is one isolated, non-breaking run: number, NBSP, symbol — never hand-concatenated RTL/LTR', () => {
    const html = renderLabel(standardContent(1), box).html;
    expect(html).toMatch(/<bdi dir="ltr">12\.75&nbsp;<span class="cur"[^>]*>د\.إ<\/span><\/bdi>/);
  });
  it('the printed language, not the app, decides the words and the money format (EN label + AED, AR label + EUR)', () => {
    const en = renderLabel({ ...standardContent(1), language: 'en', name: 'Fresh full-fat milk' }, box).html;
    expect(priceOf(en)).toBe('AED 12.75');
    const ar = renderLabel({ ...standardContent(3), language: 'ar', name: 'قشدة' }, box).html;
    expect(priceOf(ar)).toBe('2.89 €');
    const de = renderLabel({ ...standardContent(0), language: 'de' }, box).html;
    expect(priceOf(de)).toBe('4,49 £');
    const deTry = renderLabel({ ...standardContent(2), language: 'de' }, box).html;
    expect(priceOf(deTry)).toBe('289,90 ₺');
  });
  it('the engine imports no app-language or app-currency state (Arabic UI + English label, English UI + Arabic label)', () => {
    const dir = path.resolve(__dirname, '..');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ts'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect({ f, bad: /from '[^']*i18n'|getCurrencyCode|getCurrencySymbol|currencyAfter\(/.test(src) }).toEqual({ f, bad: false });
    }
  });
  it('no locale has its own geometry: every language uses the same template for a format and layout', () => {
    const sizes = new Set(PAIRS.map((_, i) => { const h = renderLabel(standardContent(i), box).html; return `${sizeOf(h, 'name')}|${sizeOf(h, 'price')}`; }));
    expect(sizes.size).toBe(1);
  });
  it('mixed currencies in one label are refused', () => {
    const r = renderLabel({ ...standardContent(0, 'wasNow'), was: moneyFromMinor(500, 'EUR') }, box);
    expect(r.issues[0]).toMatchObject({ code: 'mixedCurrency', severity: 'error' });
  });
});

describe('promotions: wording, band, Now, barcode policy', () => {
  const promo = (kind: LabelContent['kind'], extra: Partial<LabelContent>): LabelContent => ({ ...standardContent(0), kind, ...extra });
  it.each([
    ['wasNow', { was: moneyFromMinor(599, 'GBP') }],
    ['percentOff', { percentOffHundredths: 2500 }],
    ['moneyOff', { moneyOff: moneyFromMinor(100, 'GBP') }],
    ['multibuy', { multibuy: { quantity: 3, total: moneyFromMinor(1000, 'GBP') } }],
    ['reducedToClear', { was: moneyFromMinor(350, 'GBP'), price: moneyFromMinor(100, 'GBP') }],
    ['memberPrice', { condition: 'With loyalty card', validUntil: '2026-10-31' }],
  ] as [LabelContent['kind'], Partial<LabelContent>][])('%s renders on the shelf ticket', (kind, extra) => {
    const r = renderLabel(promo(kind, extra), box);
    expect(errors(r)).toEqual([]);
    expect(r.html).toContain('class="band"');
  });
  it('Arabic percent off reads "خصم 25٪": Arabic percent sign, kept inside the isolated number run', () => {
    const html = renderLabel({ ...standardContent(1), kind: 'percentOff', percentOffHundredths: 2500 }, box).html;
    expect(html).toContain('خصم <bdi dir="ltr">25٪</bdi>');
    expect(html).not.toMatch(/<\/bdi>%|%<bdi|%\s*خصم/);
    expect(labelText('ar', 'percentOff', { percent: formatPercentText(3000, 'ar') })).toBe('خصم 30٪');
  });
  it('percent text per label language (regression)', () => {
    expect(formatPercentText(2500, 'en')).toBe('25%');
    expect(formatPercentText(2500, 'ar')).toBe('25٪');
    expect(formatPercentText(2500, 'tr')).toBe('%25');
    expect(formatPercentText(1250, 'fr')).toBe('12,5 %');
    expect(formatPercentText(2500, 'de')).toBe('25 %');
    expect(formatPercentText(2500, 'es')).toBe('25 %');
  });
  it('German member price is "Mitgliederpreis" (regression: never "Mitgliedpreis")', () => {
    expect(LABEL_TEXT.de.memberPrice).toBe('Mitgliederpreis');
    const html = renderLabel({ ...standardContent(5), kind: 'memberPrice', condition: 'Mit Kundenkarte' }, box).html;
    expect(html).toContain('Mitgliederpreis');
    expect(html).not.toContain('Mitgliedpreis');
  });
  it('"Now" is readable: at least 7.5 pt on tickets, its own line on cards', () => {
    const ticket = renderLabel(promo('wasNow', { was: moneyFromMinor(599, 'GBP') }), box).html;
    expect(Number(/class="now" style="font-size:([\d.]+)pt/.exec(ticket)![1])).toBeGreaterThanOrEqual(7.5);
    const card = renderLabel(promo('offerCardA6', { was: moneyFromMinor(599, 'GBP') }), a6).html;
    expect(card).toMatch(/class="nowline" style="font-size:([\d.]+)pt">Now</);
    expect(Number(/class="nowline" style="font-size:([\d.]+)pt/.exec(card)![1])).toBeGreaterThan(sizeOf(card, 'name'));
  });
  it('offer cards take their promotion from their data (any promotion can be a card)', () => {
    const card = (extra: Partial<LabelContent>) => renderLabel({ ...standardContent(0), kind: 'offerCardA6', ...extra }, a6).html;
    expect(textOf(card({ percentOffHundredths: 3000 }))).toMatch(/30%\s*off/);
    expect(textOf(card({ multibuy: { quantity: 2, total: moneyFromMinor(500, 'GBP') } }))).toMatch(/2\s*for/);
    expect(card({})).not.toContain('class="band"');
  });
  it('a promotion ticket prints the full label name (never cut) at its fixed size', () => {
    const html = renderLabel(promo('wasNow', { was: moneyFromMinor(599, 'GBP') }), box).html;
    const name = /class="name" style="font-size:([\d.]+)pt">([^]*?)<\/div>/.exec(html)!;
    expect(name[2].replace(/<br\/>/g, ' ')).toBe(standardContent(0).name);
    expect(name[2]).not.toContain('…');
  });
  it('a member price keeps its condition and date on the ticket (details layout)', () => {
    const c: LabelContent = { ...standardContent(5), kind: 'memberPrice', condition: 'Mit Kundenkarte', validUntil: '2026-10-31' };
    expect(layoutFor(c)).toBe('promoDetail');
    const r = renderLabel(c, box);
    expect(errors(r)).toEqual([]);
    expect(textOf(r.html)).toContain('Mit Kundenkarte');
    expect(textOf(r.html)).toContain('Gültig bis 31. Okt. 2026');
  });
  it('a condition too long for the smallest format is refused there (needs a larger label), and fits a card', () => {
    const long = 'Nur mit Kundenkarte und ab zwei Packungen je Einkauf';
    expect(renderLabel({ ...standardContent(5), kind: 'memberPrice', condition: long, validUntil: '2026-10-31' }, box).issues[0]).toMatchObject({ code: 'tooWide', detail: 'condition' });
    expect(errors(renderLabel({ ...standardContent(5), kind: 'offerCardA6', condition: long, validUntil: '2026-10-31' }, a6))).toEqual([]);
  });
  it('the band keeps the space between words and amounts (one inline run)', () => {
    const html = renderLabel(promo('wasNow', { was: moneyFromMinor(599, 'GBP') }), box).html;
    expect(html).toMatch(/<div class="band"[^>]*><span>Was <s>/);
  });
  it('barcode on promotions is layout-specific, not banned: off by default, refused on narrow tickets, allowed on cards', () => {
    const withCode = { ...standardContent(0, 'priceBarcode'), kind: 'wasNow' as const, was: moneyFromMinor(599, 'GBP') };
    expect(renderLabel(withCode, box).html).not.toContain('class="barcode"');
    expect(renderLabel(withCode, box, { promoBarcode: true }).issues[0]).toMatchObject({ code: 'layoutIncompatible', detail: 'promoBarcode' });
    const card = renderLabel({ ...withCode, kind: 'offerCardA6' }, a6, { promoBarcode: true });
    expect(errors(card)).toEqual([]);
    expect(card.html).toContain('class="barcode"');
  });
  it('yellow offer band, ink-saving (no fill) band for coloured stock, and standard labels stay white', () => {
    const yellow = renderLabel(promo('wasNow', { was: moneyFromMinor(599, 'GBP') }), box).html;
    const ink = renderLabel(promo('wasNow', { was: moneyFromMinor(599, 'GBP') }), box, { style: 'inkSaving' }).html;
    expect(yellow).toMatch(/class="label promo /);
    expect(ink).toMatch(/class="label inkSaving /);
    expect(renderLabel(standardContent(0), box).html).toMatch(/class="label standard /);
  });
  it('a promo kind without its data is refused, not guessed', () => {
    expect(renderLabel(promo('wasNow', {}), box).issues[0]).toMatchObject({ code: 'missingField', detail: 'was' });
  });
});

describe('offer cards: price dominates, centred, SKU off by default', () => {
  it.each(['preset_offer_a6_on_a4', 'preset_offer_a5_on_a4', 'preset_offer_a4'])('%s: price well above the name size and centred', id => {
    const r = renderLabel({ ...standardContent(0), kind: 'offerCardA6', was: moneyFromMinor(599, 'GBP') }, boxOf(id));
    expect(errors(r)).toEqual([]);
    expect(sizeOf(r.html, 'price')).toBeGreaterThanOrEqual(2.2 * sizeOf(r.html, 'name'));
    expect(r.html).toContain('class="pricebox"');
  });
  it('SKU hidden on customer-facing cards unless the staff option is on', () => {
    const c = { ...standardContent(0), kind: 'offerCardA6' as const, was: moneyFromMinor(599, 'GBP') };
    expect(renderLabel(c, a6).html).not.toContain('class="sku"');
    expect(renderLabel(c, a6, { showSku: true }).html).toContain('class="sku"');
    expect(renderLabel(standardContent(0), box).html).toContain('class="sku"');
  });
  it('every sample A6 offer card renders, including a Turkish name and a lira price', () => {
    const r = renderSheet({ profile: PRESETS.find(p => p.id === 'preset_offer_a6_on_a4')!, items: [
      { content: { ...standardContent(0), kind: 'offerCardA6', was: moneyFromMinor(599, 'GBP') }, copies: 1 },
      { content: { ...standardContent(1), kind: 'offerCardA6', percentOffHundredths: 3000 }, copies: 1 },
      { content: { ...standardContent(3), kind: 'offerCardA6', multibuy: { quantity: 2, total: moneyFromMinor(500, 'EUR') } }, copies: 1 },
      { content: { ...standardContent(2), kind: 'offerCardA6', moneyOff: moneyFromMinor(5000, 'TRY') }, copies: 1 },
    ] });
    expect(r.ok ? [] : r.labelIssues).toEqual([]);
  });
});

/** Content for a layout, so every layout can be proven with the same product. */
function contentFor(layout: LabelLayout, c: LabelContent): LabelContent {
  const code = { value: '5000157024671', format: 'ean13' as const };
  switch (layout) {
    case 'standard': return { ...c, kind: 'standardPrice', unitPrice: undefined };
    case 'unitPrice': return { ...c, kind: 'priceUnitPrice', unitPrice: { amount: c.price, base: 'per_kg' } };
    case 'barcode': return { ...c, kind: 'priceBarcode', barcode: code };
    case 'promo': return { ...c, kind: 'wasNow', was: c.price };
    case 'promoDetail': return { ...c, kind: 'wasNow', was: c.price, validUntil: '2026-12-31' };
    case 'promoBarcode': return { ...c, kind: 'wasNow', was: c.price, barcode: code };
  }
}

describe('catalogue data is never shortened; only the printable label name has a counter', () => {
  it('the label-name counter is 40 and every realistic 40-character name (6 languages, upper/title case) fits every compatible layout', () => {
    expect(LABEL_NAME_MAX).toBe(40);
    for (const p of PRESETS) {
      const b = { widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm };
      const compat = layoutCompatibility(b);
      for (const layout of LABEL_LAYOUTS.filter(l => compat[l].ok)) {
        expect({ id: p.id, layout, labelName: templateFor(b, layout).limits.labelName }).toEqual({ id: p.id, layout, labelName: 40 });
        for (const n of NAME_CORPUS) {
          expect([...n.text].length).toBeLessThanOrEqual(40);
          const c: LabelContent = { ...standardContent(PAIRS.findIndex(x => x.lang === n.lang)), name: n.text };
          const r = renderLabel(contentFor(layout, c), b, { promoBarcode: layout === 'promoBarcode' });
          expect({ id: p.id, layout, name: n.text, errors: errors(r) }).toEqual({ id: p.id, layout, name: n.text, errors: [] });
        }
      }
    }
  });
  it('a label name over 40 is refused with "edit the label name" (the product name itself is not limited here)', () => {
    const r = renderLabel({ ...standardContent(0), name: 'Fairy Platinum Plus All In One Dishwasher Tablets Lemon 42 Pack' }, box);
    expect(r.issues[0]).toMatchObject({ code: 'tooLong', detail: 'name' });
    expect(r.html).toBe('');
  });
  it('an SKU too wide for the layout is left off with a warning — never truncated', () => {
    const sku = 'SUPPLIER-REF-0000000000000000000000000000000000-X';
    const r = renderLabel({ ...standardContent(0, 'priceBarcode'), sku }, box);
    expect(errors(r)).toEqual([]);
    expect(r.issues).toContainEqual({ code: 'skuOmitted', severity: 'warning' });
    expect(r.html).not.toContain('class="sku"');
    expect(r.html).not.toContain(sku.slice(0, 10));
  });
  it('barcodes are never shortened or rewritten: a wrong check digit is refused', () => {
    const r = renderLabel({ ...standardContent(0, 'priceBarcode'), barcode: { value: '5000157024672', format: 'ean13' } }, box);
    expect(r.issues[0].code).toBe('barcodeInvalid');
  });
  it('unusually wide pack-size text is refused with a reason, never squeezed', () => {
    const r = renderLabel({ ...standardContent(0), secondLine: 'W'.repeat(40) }, box);
    expect(r.issues[0]).toMatchObject({ code: 'tooWide', detail: 'secondLine' });
    expect(r.html).not.toContain('…');
  });
});

describe('prices: no global digit cap — measured against each format’s fixed price area', () => {
  it('a 7-digit price in a narrow-symbol currency still fits the ticket (measured, not counted)', () => {
    expect(errors(renderLabel({ ...standardContent(0), price: moneyFromMinor(9999999, 'GBP') }, box))).toEqual([]);
  });
  it('a price wider than the ticket’s price area gets "This price needs a larger label format"', () => {
    expect(renderLabel({ ...standardContent(0), price: moneyFromMinor(9999999, 'MXN') }, box).issues[0]).toMatchObject({ code: 'priceDoesNotFit', detail: 'needsLargerFormat' });
  });
  it.each([
    ['JPY', 9999999], ['GBP', 9999999], ['KWD', 9999999], ['AED', 9999999], ['MXN', 9999999],
  ] as [string, number][])('%s %s minor units (9,999,999 · 99,999.99 · 9,999.999): fits the A4 offer card in all six languages', (currency, minor) => {
    for (let i = 0; i < PAIRS.length; i++) {
      const r = renderLabel({ ...standardContent(i), kind: 'offerCardA4', price: moneyFromMinor(minor, currency), was: moneyFromMinor(minor, currency) }, a4card);
      expect({ currency, lang: PAIRS[i].lang, errors: errors(r) }).toEqual({ currency, lang: PAIRS[i].lang, errors: [] });
    }
  });
  it('the fixed size never changes with the product: "Tea £0.99" and a 40-character £99,999.99 product print at the same sizes', () => {
    const a = renderLabel({ ...standardContent(0), name: 'Tea', price: moneyFromMinor(99, 'GBP') }, box);
    const b = renderLabel({ ...standardContent(0), name: NAME_CORPUS[0].text, price: moneyFromMinor(9999999, 'GBP') }, box);
    expect(sizeOf(a.html, 'name')).toBe(sizeOf(b.html, 'name'));
    expect(sizeOf(a.html, 'price')).toBe(sizeOf(b.html, 'price'));
  });
  it('no dynamic shrinking anywhere: the renderer has no size search, only template lookups', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../renderLabel.ts'), 'utf8');
    expect(src).not.toMatch(/fitText|fitSingleLine|for \(let size|while \(size/);
  });
  it('unit prices can carry more precision than the selling price', () => {
    const r = renderLabel({ ...standardContent(0, 'priceUnitPrice'), unitPrice: { amount: moneyFromMinor(281, 'GBP'), base: 'per_100g', extraDecimals: 1 } }, box);
    expect(textOf(r.html)).toMatch(/£0\.281\s+per 100 g/);
  });
});

describe('fixed typography per {format + layout} and the compatibility matrix (pinned)', () => {
  const pin = (id: string, layout: LabelLayout) => { const t = templateFor(boxOf(id), layout); return [t.namePt, t.pricePt]; };
  it('70 × 38 ticket', () => {
    expect(pin('preset_shelf_70x38_a4', 'standard')).toEqual([10, 30]);
    expect(pin('preset_shelf_70x38_a4', 'unitPrice')).toEqual([10, 30]);
    expect(pin('preset_shelf_70x38_a4', 'barcode')).toEqual([10, 24]);
    expect(pin('preset_shelf_70x38_a4', 'promo')).toEqual([10, 22]);
    expect(templateFor(box, 'barcode').barsMm).toBeGreaterThanOrEqual(7);
  });
  it('A6 card', () => {
    expect(pin('preset_offer_a6_on_a4', 'promo')).toEqual([17.7, 51.5]);
  });
  it('matrix: promotion + barcode is unavailable on every ticket / sticker format and available on every card', () => {
    for (const p of PRESETS) {
      const m = layoutCompatibility({ widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm });
      const card = p.material === 'promoCard';
      expect({ id: p.id, promoBarcode: m.promoBarcode.ok, standard: m.standard.ok, promo: m.promo.ok }).toEqual({ id: p.id, promoBarcode: card, standard: true, promo: true });
    }
  });
  it('labels of the same layout on one sheet share one name size and one price size', () => {
    const r = renderSheet({ profile: shelf, items: PAIRS.map((_, i) => ({ content: standardContent(i, 'priceBarcode'), copies: 1 })) });
    if (!r.ok) throw new Error('sheet failed');
    expect(new Set([...r.html.matchAll(/class="name" style="font-size:([\d.]+)pt"/g)].map(m => m[1])).size).toBe(1);
    expect(new Set([...r.html.matchAll(/class="price" style="font-size:([\d.]+)pt/g)].map(m => m[1])).size).toBe(1);
  });
  it('the barcode keeps both full quiet zones inside the label', () => {
    const html = renderLabel(standardContent(0, 'priceBarcode'), box).html;
    const m = /class="barcode" dir="ltr" style="width:[\d.]+mm;padding:0 ([\d.]+)mm 0 ([\d.]+)mm"/.exec(html)!;
    expect(Number(m[2])).toBeGreaterThanOrEqual(11 * 0.264 - 0.01);
    expect(Number(m[1])).toBeGreaterThanOrEqual(7 * 0.264 - 0.01);
  });
  it('critical content keeps ≥ 2 mm from every cut edge on every launch preset', () => {
    for (const p of PRESETS) expect({ id: p.id, ok: p.safeInsetMm >= 2 }).toEqual({ id: p.id, ok: true });
    expect(shelf.safeInsetMm).toBe(2.5);
  });
  it('field hints: printable pack size and a condition room per format', () => {
    const t = fieldLimitsFor(box);
    expect(t.labelName).toBe(40);
    expect(t.secondLine).toBeGreaterThanOrEqual(30);
    expect(t.condition).toBeGreaterThan(0);
    expect(fieldLimitsFor(a6).condition).toBeGreaterThan(t.condition);
  });
});

describe('label words, dates and percentages in six languages', () => {
  it('every language has every key and every placeholder', () => {
    const keys = Object.keys(LABEL_TEXT.en).sort();
    for (const lang of Object.keys(LABEL_TEXT) as (keyof typeof LABEL_TEXT)[]) {
      expect(Object.keys(LABEL_TEXT[lang]).sort()).toEqual(keys);
      for (const k of keys) {
        const vars = (LABEL_TEXT.en as any)[k].match(/\{\{\w+\}\}/g) ?? [];
        for (const v of vars) expect(((LABEL_TEXT[lang] as any)[k] as string)).toContain(v);
      }
    }
    expect(() => labelText('en', 'save')).toThrow(/missing value/);
  });
  it('dates use month names, never an ambiguous numeric form', () => {
    expect(formatLabelDate('2026-03-04', 'en')).toBe('4 Mar 2026');
    expect(formatLabelDate('2026-03-04', 'de')).toBe('4. März 2026');
    expect(formatLabelDate('2026-03-04', 'tr')).toBe('4 Mar 2026');
    expect(formatLabelDate('2026-10-31', 'ar')).toBe('31 أكتوبر 2026');
    expect(() => formatLabelDate('04/03/2026', 'en')).toThrow();
  });
  it('percentages use the label language decimal mark and refuse nonsense', () => {
    expect(formatPercent(2000, 'en')).toBe('20');
    expect(formatPercent(1250, 'fr')).toBe('12,5');
    expect(formatPercent(1250, 'ar')).toBe('12.5');
    expect(() => formatPercent(0, 'en')).toThrow();
    expect(() => formatPercent(10000, 'en')).toThrow();
  });
});

describe('calibration: 100 mm scale line, Actual size, offset vs drift', () => {
  it('the calibration page draws every label, rulers, the offsets, a 100 mm line and the Actual size warning', () => {
    const t = renderTestSheet(shelf, { offsetXMm: 0.5, offsetYMm: -0.5 })!;
    expect((t.html.match(/class="box"/g) ?? []).length).toBe(14);
    expect(t.html).toContain('offset X 0.5 mm, Y -0.5 mm');
    expect(t.html).toContain(`class="refline" style="left:2mm;width:${REFERENCE_LINE_MM}mm"`);
    expect(t.html).toContain('Print at 100% / Actual size. Do not use Fit to page.');
    expect(renderTestSheet({ ...shelf, rows: 20 })).toBeNull();
  });
  it('the page text follows the chosen language', () => {
    for (const lang of ['ar', 'tr', 'fr', 'es', 'de'] as const) {
      expect(renderTestSheet(shelf, undefined, '', lang)!.html).toContain(CALIBRATION_TEXT[lang].measureLine.slice(0, 12));
    }
  });
  it('classifies measurements: aligned, uniform offset (corrected in 0.5 mm steps), scaling, progressive drift', () => {
    const zero = { dxMm: 0, dyMm: 0 };
    expect(classifyCalibration({ referenceLineMm: 100, first: zero, last: { dxMm: 0.1, dyMm: -0.1 } })).toEqual({ kind: 'aligned' });
    expect(classifyCalibration({ referenceLineMm: 100.2, first: { dxMm: 1.1, dyMm: -0.9 }, last: { dxMm: 1.0, dyMm: -1.1 } })).toEqual({ kind: 'uniformOffset', offsetXMm: -1, offsetYMm: 1 });
    expect(classifyCalibration({ referenceLineMm: 97, first: zero, last: zero })).toEqual({ kind: 'scaling', percent: 97 });
    expect(classifyCalibration({ referenceLineMm: 100, first: { dxMm: 0, dyMm: 0.2 }, last: { dxMm: 0.1, dyMm: 2.4 } })).toEqual({ kind: 'progressiveDrift', driftXMm: 0.1, driftYMm: 2.2 });
  });
});

describe('preview → print → confirm (one PDF; sharing is not printing)', () => {
  const run = (events: PrintFlowEvent['type'][]) => events.reduce((s, type) => printFlow(s, { type } as PrintFlowEvent), startPreview('abc'));
  it('no confirmation question on the first preview', () => {
    expect(showsConfirmationQuestion(startPreview('abc'))).toBe(false);
  });
  it('asks only after Print → system dialog → back in the app', () => {
    expect(showsConfirmationQuestion(run(['tapPrint']))).toBe(false);
    expect(showsConfirmationQuestion(run(['tapPrint', 'returnedFromPrintDialog']))).toBe(true);
    expect(marksPrinted(run(['tapPrint', 'returnedFromPrintDialog', 'answerPrinted']))).toBe(true);
    expect(run(['tapPrint', 'returnedFromPrintDialog', 'answerKeepWaiting']).phase).toBe('keptWaiting');
    expect(run(['tapPrint', 'returnedFromPrintDialog', 'answerPrintAgain']).phase).toBe('printDialogOpen');
  });
  it('Share PDF never asks, never marks printed', () => {
    expect(run(['tapShare', 'tapShare'])).toEqual(startPreview('abc'));
    expect(marksPrinted(run(['tapShare', 'answerPrinted']))).toBe(false);
    expect(run(['tapPrint', 'returnedFromPrintDialog', 'tapShare']).phase).toBe('askConfirmation');
  });
  it('the same PDF identity is carried through every state', () => {
    expect(run(['tapPrint', 'returnedFromPrintDialog', 'answerPrinted']).pdfSha256).toBe('abc');
  });
});

describe('sheets, fonts and geometry (E1–E7, L7)', () => {
  const fontCss = buildFontFaceCss(TEST_FONTS);
  const items = PAIRS.map((_, i) => ({ content: standardContent(i, 'priceBarcode'), copies: 2 }));

  it('generic plain-A4 70 × 38 is 14-up (2 × 7): a full sheet in six languages, exact page size, fonts, renderer version', () => {
    expect(shelf.rows * shelf.columns).toBe(14);
    const full = [...items, { content: standardContent(0), copies: 1 }, { content: standardContent(3), copies: 1 }];
    const r = renderSheet({ profile: shelf, items: full, fontCss });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.pageWidthPt).toBeCloseTo(595.276, 2);
    expect(r.pageHeightPt).toBeCloseTo(841.89, 2);
    expect(r.labelCount).toBe(14);
    expect(r.pageCount).toBe(1);
    expect(r.html).toContain('@page{size:210mm 297mm;margin:0}');
    expect(r.html).toContain("font-family:'TL Latin'");
    expect(r.html).toContain(`content="${RENDERER_VERSION}"`);
    expect((r.html.match(/class="cut"/g) ?? []).length).toBe(14);
  });
  it('start positions and page overflow', () => {
    const r = renderSheet({ profile: shelf, items, startPosition: 3 });
    expect(r.ok && [r.pageCount, r.placements[0].position]).toEqual([1, 3]);
    const overflow = renderSheet({ profile: shelf, items, startPosition: 4 });
    expect(overflow.ok && overflow.pageCount).toBe(2);
    expect(overflow.ok && overflow.placements[11]).toMatchObject({ page: 1, position: 1 });
  });
  it('US Letter sheets render at 612 × 792 pt', () => {
    const letter = PRESETS.find(p => p.id === 'preset_shelf_70x38_letter')!;
    const r = renderSheet({ profile: letter, items: [items[0]] });
    expect(r.ok && [r.pageWidthPt, r.pageHeightPt]).toEqual([612, 792]);
  });
  it('adhesive sheets get no cutting guides', () => {
    const r = renderSheet({ profile: PRESETS.find(p => p.id === 'preset_avery_l7160')!, items: [items[0]] });
    expect(r.ok && r.html.includes('class="cut"')).toBe(false);
  });
  it('an invalid profile or label blocks the whole sheet with reasons (no partial PDF)', () => {
    expect(renderSheet({ profile: { ...shelf, columns: 3 }, items }).ok).toBe(false);
    const badLabel = renderSheet({ profile: shelf, items: [{ content: { ...standardContent(0, 'priceBarcode'), barcode: { value: '5000157024672', format: 'ean13' } }, copies: 1 }] });
    expect(!badLabel.ok && badLabel.labelIssues[0].issue.code).toBe('barcodeInvalid');
  });
  it('hostile product names are escaped (no markup or script reaches the PDF renderer)', () => {
    const r = renderLabel({ ...standardContent(0), name: '<img src=x onerror=alert(1)> & <script>' }, box);
    expect(r.html).not.toMatch(/<img|<script/);
    expect(r.html).toContain('&lt;img');
  });
  it('the engine carries no manufacturer assumptions: Avery appears only in presets', () => {
    const dir = path.resolve(__dirname, '..');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ts') && f !== 'presets.ts')) {
      expect({ f, avery: /avery|L71\d\d/i.test(fs.readFileSync(path.join(dir, f), 'utf8')) }).toEqual({ f, avery: false });
    }
  });
  it('every character printed in the fixtures, corpus, promotions and calibration text exists in the embedded fonts', () => {
    const covered = new Set([...Object.keys(FONT_METRICS.latinBold), ...Object.keys(FONT_METRICS.arabicBold)].map(Number));
    const all = PAIRS.flatMap((_, i) => ['standardPrice', 'priceUnitPrice', 'priceBarcode'].map(k => textOf(renderLabel(standardContent(i, k as any), box).html)));
    const promos = Object.values(LABEL_TEXT).flatMap(t => Object.values(t));
    const cal = Object.values(CALIBRATION_TEXT).flatMap(t => Object.values(t));
    const pct = (['en', 'ar', 'tr', 'fr', 'es', 'de'] as const).map(l => formatPercentText(1250, l));
    const missing = new Set<string>();
    for (const s of [...all, ...promos, ...cal, ...pct, ...NAME_CORPUS.map(n => n.text)]) for (const ch of s) { const cp = ch.codePointAt(0)!; if (cp > 32 && !covered.has(cp)) missing.add(ch); }
    expect([...missing]).toEqual([]);
  });
  it('the printed price never exceeds the inner width at its fixed size', () => {
    const t = templateFor(box, 'standard');
    for (let i = 0; i < PAIRS.length; i++) {
      expect(measureMm(priceOf(renderLabel(standardContent(i), box).html), t.pricePt, 'bold')).toBeLessThanOrEqual(t.widthMm + 0.5);
    }
  });

  // Evidence for owner review: TL_FIXTURE_OUT=<dir> writes the sample sheets with fonts embedded.
  const out = process.env.TL_FIXTURE_OUT;
  (out ? it : it.skip)('writes sample sheets for review', () => {
    fs.mkdirSync(out!, { recursive: true });
    const write = (name: string, html: string) => fs.writeFileSync(path.join(out!, `${name}.html`), html);
    const sheet = (name: string, profileId: string, list: { content: LabelContent; copies?: number; options?: object }[]) => {
      const r = renderSheet({ profile: PRESETS.find(p => p.id === profileId)!, fontCss, items: list.map(x => ({ content: x.content, copies: x.copies ?? 1, options: x.options })) });
      if (!r.ok) throw new Error(`${name}: ${JSON.stringify(r)}`);
      write(name, r.html);
    };
    // 14-up: six languages twice, plus two cross-language labels.
    const fill14 = (kind: LabelContent['kind']) => [
      ...PAIRS.map((_, i) => ({ content: standardContent(i, kind), copies: 2 })),
      { content: { ...standardContent(1, kind), language: 'en' as const, name: 'Fresh full-fat milk, Al Ain', secondLine: '2 litre bottle' } },
      { content: { ...standardContent(3, kind), language: 'ar' as const, name: 'قشدة طازجة كثيفة', secondLine: 'عبوة 20 سل' } },
    ];
    sheet('shelf70x38_standardPrice', 'preset_shelf_70x38_a4', fill14('standardPrice'));
    sheet('shelf70x38_priceUnitPrice', 'preset_shelf_70x38_a4', fill14('priceUnitPrice'));
    sheet('shelf70x38_priceBarcode', 'preset_shelf_70x38_a4', fill14('priceBarcode'));
    const promos: LabelContent[] = [
      { ...standardContent(0), kind: 'wasNow', was: moneyFromMinor(599, 'GBP') },
      { ...standardContent(1), kind: 'percentOff', percentOffHundredths: 2500 },
      { ...standardContent(2), kind: 'multibuy', multibuy: { quantity: 3, total: moneyFromMinor(79900, 'TRY') } },
      { ...standardContent(3), kind: 'moneyOff', moneyOff: moneyFromMinor(50, 'EUR') },
      { ...standardContent(4), kind: 'reducedToClear', was: moneyFromMinor(1149, 'EUR'), price: moneyFromMinor(575, 'EUR') },
      { ...standardContent(5), kind: 'memberPrice', condition: 'Mit Kundenkarte', validUntil: '2026-10-31' },
    ];
    sheet('shelf70x38_promotions', 'preset_shelf_70x38_a4', [
      ...promos.map(content => ({ content })),
      ...promos.slice(0, 2).map(content => ({ content, options: { style: 'inkSaving' } })),
      { content: { ...standardContent(1), kind: 'percentOff', percentOffHundredths: 3000 } },
      { content: { ...standardContent(5), kind: 'percentOff', percentOffHundredths: 2000 } },
    ]);
    sheet('preset_avery_l7160', 'preset_avery_l7160', PAIRS.map((_, i) => ({ content: standardContent(i, 'priceUnitPrice') })));
    sheet('preset_avery_l7163', 'preset_avery_l7163', PAIRS.map((_, i) => ({ content: standardContent(i, 'priceBarcode') })));
    sheet('offer_a6', 'preset_offer_a6_on_a4', [
      { content: { ...standardContent(0), kind: 'offerCardA6', was: moneyFromMinor(599, 'GBP') } },
      { content: { ...standardContent(1), kind: 'offerCardA6', percentOffHundredths: 3000 } },
      { content: { ...standardContent(3), kind: 'offerCardA6', multibuy: { quantity: 2, total: moneyFromMinor(500, 'EUR') } } },
      { content: { ...standardContent(2, 'priceBarcode'), kind: 'offerCardA6', moneyOff: moneyFromMinor(5000, 'TRY') }, options: { promoBarcode: true } },
    ]);
    sheet('offer_a5', 'preset_offer_a5_on_a4', [
      { content: { ...standardContent(5), kind: 'offerCardA5', condition: 'Mit Kundenkarte', validUntil: '2026-10-31' } },
      { content: { ...standardContent(4), kind: 'offerCardA5', was: moneyFromMinor(1149, 'EUR'), price: moneyFromMinor(575, 'EUR') } },
    ]);
    sheet('offer_a4', 'preset_offer_a4', [{ content: { ...standardContent(0), kind: 'offerCardA4', name: 'Samsung 55" Crystal UHD Smart TV', secondLine: 'Model UE55DU7100', was: moneyFromMinor(49900, 'GBP'), price: moneyFromMinor(39900, 'GBP') } }]);
    write('calibration_shelf70x38', renderTestSheet(shelf, { offsetXMm: 0, offsetYMm: 0 }, fontCss)!.html);
    sheet('cross_language', 'preset_shelf_70x38_a4', [
      { content: { ...standardContent(1), language: 'en', name: 'Fresh full-fat milk from Al Ain farms', secondLine: '2 litre bottle' } },
      { content: { ...standardContent(3), language: 'ar', name: 'قشدة طازجة كثيفة', secondLine: 'عبوة 20 سل' } },
      { content: { ...standardContent(0), language: 'de', name: 'Heinz Tomatencremesuppe Familienpackung' } },
      { content: { ...standardContent(2), language: 'fr', name: 'Miel de fleurs sauvages filtré', secondLine: 'Pot en verre 850 g' } },
    ]);
  });
});
