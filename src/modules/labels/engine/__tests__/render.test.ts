import fs from 'fs';
import path from 'path';
import { moneyFromMinor } from '../../../../domain/money';
import { PRESETS } from '../presets';
import { renderSheet, RENDERER_VERSION } from '../renderSheet';
import { renderLabel, type LabelContent } from '../renderLabel';
import { renderTestSheet } from '../testPage';
import { buildFontFaceCss } from '../fonts';
import { FONT_METRICS } from '../fontMetrics.generated';
import { measureMm, fitText } from '../textFit';
import { fieldLimitsFor, productFieldLimits, templateFor } from '../labelTemplate';
import { formatLabelDate, formatPercent, LABEL_TEXT, labelText } from '../labelStrings';
import { PAIRS, standardContent, TEST_FONTS } from './fixtures';

const shelf = PRESETS.find(p => p.id === 'preset_shelf_70x38_a4')!;
const box = { widthMm: shelf.labelWidthMm, heightMm: shelf.labelHeightMm, safeInsetMm: shelf.safeInsetMm };
const textOf = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, '\u00A0').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** The price exactly as printed (tags removed without adding spaces). */
const priceOf = (html: string) => {
  const m = /<div class="price"[^>]*>(?:<div class="now"[^>]*>[^<]*<\/div>)?<bdi dir="ltr">([\s\S]*?)<\/bdi><\/div>/.exec(html);
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '\u00A0') : '';
};

describe('six label languages × three G2 kinds on the 70 × 38 mm shelf ticket (L1, L2)', () => {
  for (let i = 0; i < PAIRS.length; i++) {
    for (const kind of ['standardPrice', 'priceUnitPrice', 'priceBarcode'] as const) {
      it(`${PAIRS[i].lang} + ${PAIRS[i].currency}: ${kind} renders with no blocking issue`, () => {
        const r = renderLabel(standardContent(i, kind), box);
        expect(r.issues.filter(x => x.severity === 'error')).toEqual([]);
        expect(r.html).toContain(`lang="${PAIRS[i].lang}"`);
        expect(r.html).toContain(`dir="${PAIRS[i].lang === 'ar' ? 'rtl' : 'ltr'}"`);
      });
    }
  }
});

describe('mixed direction (L3) and independence (L4–L6)', () => {
  it('an Arabic label keeps prices, codes and barcodes left-to-right and never mirrors bars', () => {
    const c = { ...standardContent(1, 'priceBarcode'), unitPrice: { amount: moneyFromMinor(638, 'AED'), base: 'per_litre' as const } };
    const html = renderLabel(c, box).html;
    expect(html).toContain('dir="rtl"');
    expect(priceOf(html)).toBe('12.75\u00A0د.إ');
    expect(html).toContain('<bdi dir="ltr">6.38\u00A0د.إ</bdi>');
    expect(html).toMatch(/class="barcode" dir="ltr"/);
    expect(html).not.toMatch(/scaleX\(-1\)|transform:\s*scale\(-1/);
  });
  it('the printed language, not the app, decides the words and the money format', () => {
    const en = renderLabel({ ...standardContent(1), language: 'en', name: 'Fresh full-fat milk' }, box).html;
    expect(priceOf(en)).toBe('AED\u00A012.75');
    const ar = renderLabel({ ...standardContent(3), language: 'ar', name: 'قشدة' }, box).html;
    expect(priceOf(ar)).toBe('2.89\u00A0€');
  });
  it('the engine imports no app-language or app-currency state', () => {
    const dir = path.resolve(__dirname, '..');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ts'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect({ f, bad: /from '[^']*i18n'|getCurrencyCode|getCurrencySymbol|currencyAfter\(/.test(src) }).toEqual({ f, bad: false });
    }
  });
  it('mixed currencies in one label are refused', () => {
    const r = renderLabel({ ...standardContent(0, 'wasNow'), was: moneyFromMinor(500, 'EUR') }, box);
    expect(r.issues[0]).toMatchObject({ code: 'mixedCurrency', severity: 'error' });
  });
});

describe('every label kind has a slot (Release-1 architecture)', () => {
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
    expect(r.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(r.html).toContain('class="band"');
  });
  it('Arabic headlines keep Arabic word order; only the number is isolated left-to-right', () => {
    const html = renderLabel({ ...standardContent(1), kind: 'percentOff', percentOffHundredths: 2500 }, box).html;
    expect(html).toContain('خصم <bdi dir="ltr">25</bdi>%');
    expect(html).not.toMatch(/<bdi dir="ltr">[^<]*خصم/);
  });
  it('offer cards take their promotion from their data (any promotion can be a card)', () => {
    const p = PRESETS.find(x => x.id === 'preset_offer_a6_on_a4')!;
    const card = (extra: Partial<LabelContent>) => renderLabel({ ...standardContent(0), kind: 'offerCardA6', ...extra }, { widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm }).html;
    expect(textOf(card({ percentOffHundredths: 3000 }))).toMatch(/30\s*% off/);
    expect(textOf(card({ multibuy: { quantity: 2, total: moneyFromMinor(500, 'GBP') } }))).toMatch(/2\s*for/);
    expect(card({})).not.toContain('class="band"');
  });
  it('a promotion ticket prints the full name (never cut) at its fixed size', () => {
    const html = renderLabel({ ...standardContent(0), kind: 'wasNow', was: moneyFromMinor(599, 'GBP') }, box).html;
    const name = /class="name" style="font-size:([\d.]+)pt">([^]*?)<\/div>/.exec(html)!;
    expect(name[2].replace(/<br\/>/g, ' ')).toBe(standardContent(0).name);
    expect(name[2]).not.toContain('…');
  });
  it('a member price keeps its condition and date on the ticket', () => {
    const r = renderLabel({ ...standardContent(5), kind: 'memberPrice', condition: 'Mit Kundenkarte', validUntil: '2026-10-31' }, box);
    expect(r.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(textOf(r.html)).toContain('Mit Kundenkarte');
    expect(textOf(r.html)).toContain('Gültig bis 31. Okt. 2026');
  });
  it('the band keeps the space between words and amounts (one inline run, not separate flex items)', () => {
    const html = renderLabel({ ...standardContent(0), kind: 'wasNow', was: moneyFromMinor(599, 'GBP') }, box).html;
    expect(html).toMatch(/<div class="band"[^>]*><span>Was <s>/);
  });
  it('labels of the same kind on one sheet share one name size and one price size', () => {
    const r = renderSheet({ profile: shelf, items: PAIRS.map((_, i) => ({ content: standardContent(i, 'priceBarcode'), copies: 1 })) });
    if (!r.ok) throw new Error('sheet failed');
    const names = new Set([...r.html.matchAll(/class="name" style="font-size:([\d.]+)pt"/g)].map(m => m[1]));
    const prices = new Set([...r.html.matchAll(/class="price" style="font-size:([\d.]+)pt/g)].map(m => m[1]));
    expect(names.size).toBe(1);
    expect(prices.size).toBe(1);
  });
  it('the barcode keeps both full quiet zones inside the label', () => {
    const html = renderLabel(standardContent(0, 'priceBarcode'), box).html;
    const m = /class="barcode" dir="ltr" style="width:[\d.]+mm;padding:0 ([\d.]+)mm 0 ([\d.]+)mm"/.exec(html)!;
    expect(Number(m[2])).toBeGreaterThanOrEqual(11 * 0.264 - 0.01); // left quiet zone
    expect(Number(m[1])).toBeGreaterThanOrEqual(7 * 0.264 - 0.01);  // right quiet zone
  });
  it('promotion labels print no barcode, so the offer price keeps its size', () => {
    const html = renderLabel({ ...standardContent(0, 'priceBarcode'), kind: 'wasNow', was: moneyFromMinor(599, 'GBP') }, box).html;
    expect(html).not.toContain('class="barcode"');
  });
  it('every sample A6 offer card renders, including a long Turkish name and a wide lira price', () => {
    const r = renderSheet({ profile: PRESETS.find(p => p.id === 'preset_offer_a6_on_a4')!, items: [
      { content: { ...standardContent(0), kind: 'offerCardA6', was: moneyFromMinor(599, 'GBP') }, copies: 1 },
      { content: { ...standardContent(1), kind: 'offerCardA6', percentOffHundredths: 3000 }, copies: 1 },
      { content: { ...standardContent(3), kind: 'offerCardA6', multibuy: { quantity: 2, total: moneyFromMinor(500, 'EUR') } }, copies: 1 },
      { content: { ...standardContent(2), kind: 'offerCardA6', moneyOff: moneyFromMinor(5000, 'TRY') }, copies: 1 },
    ] });
    expect(r.ok ? [] : r.labelIssues).toEqual([]);
  });
  it('a promo kind without its data is refused, not guessed', () => {
    expect(renderLabel(promo('wasNow', {}), box).issues[0]).toMatchObject({ code: 'missingField', detail: 'was' });
  });
  it.each(['preset_offer_a6_on_a4', 'preset_offer_a5_on_a4', 'preset_offer_a4'])('offer card %s renders large', id => {
    const p = PRESETS.find(x => x.id === id)!;
    const r = renderLabel(promo('offerCardA6', { was: moneyFromMinor(599, 'GBP') }), { widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm });
    expect(r.issues.filter(i => i.severity === 'error')).toEqual([]);
    const size = Number(/class="price" style="font-size:([\d.]+)pt/.exec(r.html)![1]);
    expect(size).toBeGreaterThan(30);
  });
});

describe('fixed sizes and character limits (owner decision: like a till)', () => {
  it('real font widths: bold digits are 0.6 em', () => {
    expect(measureMm('1', 10, 'bold')).toBeCloseTo((0.6 * 1.04 * 10) / (72 / 25.4), 3);
  });
  it('every preset has till-style limits: name ≤ 40, pack size ≤ 30, SKU 20, price 6 digits', () => {
    for (const p of PRESETS) {
      const l = fieldLimitsFor({ widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm });
      expect({ id: p.id, ok: l.name >= 20 && l.name <= 40 && l.secondLine <= 30 && l.sku === 20 && l.priceDigits === 6 }).toEqual({ id: p.id, ok: true });
    }
  });
  it('one fixed set of product limits for the whole app (strictest launch format), pinned', () => {
    expect(productFieldLimits(PRESETS)).toEqual({ name: 40, secondLine: 22, sku: 20, condition: 18, priceDigits: 6 });
  });
  it('a product filled to the app-wide limits prints on every preset without an issue', () => {
    const l = productFieldLimits(PRESETS);
    for (const p of PRESETS) {
      const b = { widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm };
      // Shops often type in capitals: realistic full-length upper-case names must still fit.
      for (const name of ['WARBURTONS TOASTIE THICK WHITE BREAD 800', 'BIO-VOLLMILCHSCHOKOLADE MIT HASELNÜSSEN', 'DOĞAL ÇIÇEK BALI İNCE SÜZME KAVANOZ 850G']) {
        const r = renderLabel({ ...standardContent(0), name: name.slice(0, l.name), secondLine: 'Multipack 12 × 330 ml cans'.slice(0, l.secondLine), sku: 'M'.repeat(l.sku), price: moneyFromMinor(888888, 'GBP') }, b);
        expect({ id: p.id, name, issues: r.issues }).toEqual({ id: p.id, name, issues: [] });
      }
    }
  });
  it('sizes depend on the format and currency only: two very different products print at the same sizes', () => {
    const a = renderLabel({ ...standardContent(0), name: 'Tea', price: moneyFromMinor(99, 'GBP') }, box);
    const b = renderLabel({ ...standardContent(0), price: moneyFromMinor(999999, 'GBP') }, box);
    const size = (html: string, cls: string) => new RegExp(`class="${cls}" style="font-size:([\\d.]+)pt`).exec(html)![1];
    expect(size(a.html, 'name')).toBe(size(b.html, 'name'));
    expect(size(a.html, 'price')).toBe(size(b.html, 'price'));
  });
  it('text over its character limit is refused, never shrunk or cut', () => {
    const limits = fieldLimitsFor(box);
    const r = renderLabel({ ...standardContent(0), name: 'x'.repeat(limits.name + 1) }, box);
    expect(r.issues[0]).toMatchObject({ code: 'tooLong', detail: 'name' });
    expect(r.html).toBe('');
    expect(renderLabel({ ...standardContent(0), secondLine: 'y'.repeat(limits.secondLine + 1) }, box).issues[0]).toMatchObject({ code: 'tooLong', detail: 'secondLine' });
  });
  it('a price with more than 6 digits is refused', () => {
    const r = renderLabel({ ...standardContent(3), price: moneyFromMinor(1234567, 'EUR') }, box);
    expect(r.issues[0]).toMatchObject({ code: 'priceTooLong' });
  });
  it('unusually wide text within the limit is refused with a reason, never squeezed', () => {
    const t = templateFor(box);
    const wide = 'W'.repeat(fieldLimitsFor(box).secondLine);
    const r = renderLabel({ ...standardContent(0), secondLine: wide }, box);
    if (measureMm(wide, t.secondPt, 'regular') > t.widthMm) expect(r.issues[0]).toMatchObject({ code: 'tooWide', detail: 'secondLine' });
    else expect(r.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(r.html).not.toContain('…');
  });

  // The key guarantee: anything a shop can type within the limits prints, in every format and language.
  const atLimit = (base: string, n: number) => (base.repeat(Math.ceil(n / base.length))).slice(0, n).trim();
  const SAMPLE_WORDS: Record<string, string> = {
    en: 'Organic Mediterranean Olive Spread ', ar: 'حليب طازج كامل الدسم من مزارع ', tr: 'Doğal Süzme Çiçek Balı Şifalı ',
    fr: 'Crème fraîche épaisse d’Isigny ', es: 'Aceite de oliva virgen extra ', de: 'Bio Vollmilch Haselnuss Schokolade ',
  };
  for (const p of PRESETS) {
    it(`${p.id}: every promotion at maximum length (name, condition, 6-digit amounts) prints in all six languages`, () => {
      const b = { widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm };
      const l = fieldLimitsFor(b);
      for (let i = 0; i < PAIRS.length; i++) {
        const { lang, currency } = PAIRS[i];
        const big = moneyFromMinor(888888, currency);
        const base = { ...standardContent(i), name: atLimit(SAMPLE_WORDS[lang], l.name), secondLine: atLimit('850 g glass jar ', l.secondLine), price: big, unitPrice: { amount: moneyFromMinor(888888, currency), base: 'per_100ml' as const } };
        const promos: Partial<LabelContent>[] = [
          { kind: 'wasNow', was: big }, { kind: 'percentOff', percentOffHundredths: 9999 }, { kind: 'moneyOff', moneyOff: big },
          { kind: 'multibuy', multibuy: { quantity: 99, total: big } }, { kind: 'reducedToClear', was: big },
          { kind: 'memberPrice', condition: atLimit('With the loyalty card only ', l.condition), validUntil: '2026-12-31' },
        ];
        for (const extra of promos) {
          const r = renderLabel({ ...base, ...extra } as LabelContent, b);
          expect({ preset: p.id, lang, kind: extra.kind, errors: r.issues.filter(x => x.severity === 'error') }).toEqual({ preset: p.id, lang, kind: extra.kind, errors: [] });
        }
      }
    });
    it(`${p.id}: maximum-length name, pack size, SKU and a 6-digit price print in all six languages`, () => {
      const b = { widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm };
      const l = fieldLimitsFor(b);
      for (let i = 0; i < PAIRS.length; i++) {
        const lang = PAIRS[i].lang;
        for (const kind of ['standardPrice', 'priceUnitPrice', 'priceBarcode'] as const) {
          const c = { ...standardContent(i, kind), name: atLimit(SAMPLE_WORDS[lang], l.name), secondLine: atLimit('850 g glass jar ', l.secondLine), sku: 'S'.repeat(l.sku).slice(0, 12), price: moneyFromMinor(999999, PAIRS[i].currency) };
          const r = renderLabel(c, b);
          expect({ preset: p.id, lang, kind, errors: r.issues.filter(x => x.severity === 'error') }).toEqual({ preset: p.id, lang, kind, errors: [] });
        }
      }
    });
  }
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

describe('sheets, fonts and the test page (E1–E7, L7)', () => {
  const fontCss = buildFontFaceCss(TEST_FONTS);
  const items = PAIRS.map((_, i) => ({ content: standardContent(i, 'priceBarcode'), copies: 2 }));

  it('a full shelf-ticket sheet in six languages: exact page size, placements, embedded fonts, renderer version', () => {
    const r = renderSheet({ profile: shelf, items, fontCss, startPosition: 3 });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.pageWidthPt).toBeCloseTo(595.276, 2);
    expect(r.pageHeightPt).toBeCloseTo(841.89, 2);
    expect(r.labelCount).toBe(12);
    expect(r.pageCount).toBe(1); // positions 3–14 are exactly 12 free spaces
    const overflow = renderSheet({ profile: shelf, items, startPosition: 4 });
    expect(overflow.ok && overflow.pageCount).toBe(2);
    expect(overflow.ok && overflow.placements[11]).toMatchObject({ page: 1, position: 1 });
    expect(r.placements[0]).toMatchObject({ page: 0, position: 3, itemIndex: 0, copy: 1 });
    expect(r.html).toContain('@page{size:210mm 297mm;margin:0}');
    expect(r.html).toContain("font-family:'TL Latin'");
    expect(r.html).toContain(`content="${RENDERER_VERSION}"`);
    expect((r.html.match(/class="cut"/g) ?? []).length).toBe(12);
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
    const bad = renderSheet({ profile: { ...shelf, columns: 3 }, items });
    expect(bad.ok).toBe(false);
    const badLabel = renderSheet({ profile: shelf, items: [{ content: { ...standardContent(0, 'priceBarcode'), barcode: { value: '5000157024672', format: 'ean13' } }, copies: 1 }] });
    expect(!badLabel.ok && badLabel.labelIssues[0].issue.code).toBe('barcodeInvalid');
  });
  it('hostile product names are escaped (no markup or script reaches the PDF renderer)', () => {
    const r = renderLabel({ ...standardContent(0), name: '<img src=x onerror=alert(1)> & <script>' }, box);
    expect(r.html).not.toMatch(/<img|<script/);
    expect(r.html).toContain('&lt;img');
  });
  it('every character printed in the six-language fixtures exists in the embedded fonts (no system fallback)', () => {
    const covered = new Set([...Object.keys(FONT_METRICS.latinBold), ...Object.keys(FONT_METRICS.arabicBold)].map(Number));
    const all = PAIRS.flatMap((_, i) => ['standardPrice', 'priceUnitPrice', 'priceBarcode'].map(k => textOf(renderLabel(standardContent(i, k as any), box).html)));
    const promos = Object.values(LABEL_TEXT).flatMap(t => Object.values(t));
    const missing = new Set<string>();
    for (const s of [...all, ...promos]) for (const ch of s) { const cp = ch.codePointAt(0)!; if (cp > 32 && !covered.has(cp)) missing.add(ch); }
    expect([...missing]).toEqual([]);
  });
  it('the calibration page draws every label, rulers and the offsets', () => {
    const t = renderTestSheet(shelf, { offsetXMm: 0.5, offsetYMm: -0.5 })!;
    expect((t.html.match(/class="box"/g) ?? []).length).toBe(14);
    expect(t.html).toContain('offset X 0.5 mm, Y -0.5 mm');
    expect(renderTestSheet({ ...shelf, rows: 20 })).toBeNull();
  });

  // Evidence for owner review: TL_FIXTURE_OUT=<dir> writes the sample sheets with fonts embedded.
  const out = process.env.TL_FIXTURE_OUT;
  (out ? it : it.skip)('writes sample sheets for review', () => {
    fs.mkdirSync(out!, { recursive: true });
    const write = (name: string, html: string) => fs.writeFileSync(path.join(out!, `${name}.html`), html);
    for (const kind of ['standardPrice', 'priceUnitPrice', 'priceBarcode'] as const) {
      const r = renderSheet({ profile: shelf, fontCss, items: PAIRS.map((_, i) => ({ content: standardContent(i, kind), copies: 2 })) });
      if (r.ok) write(`shelf70x38_${kind}`, r.html);
    }
    const promos: LabelContent[] = [
      { ...standardContent(0), kind: 'wasNow', was: moneyFromMinor(599, 'GBP') },
      { ...standardContent(1), kind: 'percentOff', percentOffHundredths: 2500 },
      { ...standardContent(2), kind: 'multibuy', multibuy: { quantity: 3, total: moneyFromMinor(79900, 'TRY') } },
      { ...standardContent(3), kind: 'moneyOff', moneyOff: moneyFromMinor(50, 'EUR') },
      { ...standardContent(4), kind: 'reducedToClear', was: moneyFromMinor(1149, 'EUR'), price: moneyFromMinor(575, 'EUR') },
      { ...standardContent(5), kind: 'memberPrice', condition: 'Mit Kundenkarte', validUntil: '2026-10-31' },
    ];
    const pr = renderSheet({ profile: shelf, fontCss, items: promos.map(content => ({ content, copies: 1 })) });
    if (pr.ok) write('shelf70x38_promotions', pr.html);
    for (const id of ['preset_avery_l7160', 'preset_avery_l7163', 'preset_shelf_70x38_letter']) {
      const r = renderSheet({ profile: PRESETS.find(p => p.id === id)!, fontCss, items: PAIRS.map((_, i) => ({ content: standardContent(i, 'priceUnitPrice'), copies: 1 })) });
      if (r.ok) write(id, r.html);
    }
    const a6 = renderSheet({ profile: PRESETS.find(p => p.id === 'preset_offer_a6_on_a4')!, fontCss, items: [
      { content: { ...standardContent(0), kind: 'offerCardA6', was: moneyFromMinor(599, 'GBP') }, copies: 1 },
      { content: { ...standardContent(1), kind: 'offerCardA6', percentOffHundredths: 3000 }, copies: 1 },
      { content: { ...standardContent(3), kind: 'offerCardA6', multibuy: { quantity: 2, total: moneyFromMinor(500, 'EUR') } }, copies: 1 },
      { content: { ...standardContent(2), kind: 'offerCardA6', moneyOff: moneyFromMinor(5000, 'TRY') }, copies: 1 },
    ] });
    if (a6.ok) write('offer_a6', a6.html);
    write('calibration_shelf70x38', renderTestSheet(shelf, { offsetXMm: 0, offsetYMm: 0 }, fontCss)!.html);
    // Cross-language independence samples.
    const cross = renderSheet({ profile: shelf, fontCss, items: [
      { content: { ...standardContent(1), language: 'en', name: 'Fresh full-fat milk from Al Ain farms', secondLine: '2 litre bottle' }, copies: 1 },
      { content: { ...standardContent(3), language: 'ar', name: 'قشدة طازجة كثيفة', secondLine: '20 سل' }, copies: 1 },
      { content: { ...standardContent(3), language: 'fr' }, copies: 1 },
      { content: { ...standardContent(0), language: 'de', name: 'Heinz Tomatencremesuppe Familienpackung' }, copies: 1 },
    ] });
    if (cross.ok) write('cross_language', cross.html);
  });
});
