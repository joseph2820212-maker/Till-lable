/**
 * Fixed label templates and field limits (owner decision, 24 Sep 2026).
 *
 * Like a till's shelf-label system, every label FORMAT has fixed text sizes and every text FIELD has a
 * character limit. Nothing shrinks to fit: the product screens stop input at the limit, and the renderer
 * prints at exactly these sizes. The sizes depend only on the format (label size), the layout (with or without
 * a barcode) and the currency symbol — never on the product's text or price value — so every label of a kind
 * looks identical in size.
 */
import { measureMm, PT_PER_MM } from './textFit';
import { formatMoney, formatMoneyParts } from '../../../domain/formatMoney';
import { formatLabelDate, formatPercent, labelText } from './labelStrings';
import type { LanguageCode } from '../../../domain/types';
import { SYMBOL_MAP } from '../../../utils/currency';

/** Every currency the app offers — worst cases are taken over the whole catalogue, never a hard-coded few. */
const ALL_CURRENCIES = Object.keys(SYMBOL_MAP).map(option => option.split(' ').pop() as string);

/** Largest price a label accepts: 6 digits (9,999.99 · 999,999 · 999.999). A bigger price is refused at entry. */
export const MAX_PRICE_DIGITS = 6;

/** Labels at least this tall (inner mm) are offer cards. */
export const CARD_MIN_HEIGHT_MM = 80;
export const isCardFormat = (innerHeightMm: number): boolean => innerHeightMm >= CARD_MIN_HEIGHT_MM;

export interface FieldLimits {
  /** Product name, all lines together. */
  name: number;
  /** Pack size / second line. */
  secondLine: number;
  sku: number;
  /** Member / conditional price condition text. */
  condition: number;
  /** Maximum digits in any price on the label. */
  priceDigits: number;
}

export type TemplateVariant = 'standard' | 'promo';

export interface LabelTemplate {
  /** Inner width and height after the safe inset, mm. */
  widthMm: number;
  heightMm: number;
  /** Scale relative to the 70 × 38 mm ticket (before fitting). */
  scale: number;
  isCard: boolean;
  gapMm: number;
  bandPt: number;
  bandMm: number;
  namePt: number;
  nameLines: number;
  secondPt: number;
  smallPt: number;
  smallLines: number;
  unitPt: number;
  skuPt: number;
  digitPt: number;
  /** Barcode bar height and module width. */
  barsMm: number;
  moduleMm: number;
  /** Which content the template was sized for: plain labels, or promotions (band + "Now" + condition line). */
  variant: TemplateVariant;
  /** Fixed price size (the price has its own full-width row). */
  pricePt: number;
  /** Width the barcode needs with its quiet zones, at the end of the bottom row. */
  barcodeReserveMm: number;
  limits: FieldLimits;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (n: number) => Math.round(n * 10) / 10;
const halfDown = (n: number) => Math.floor(n * 2) / 2;
/** A conservative average character width (em) for capacity: mixed-case text in the bold face. */
const AVG_EM_BOLD = 0.62;
const AVG_EM_REGULAR = 0.55;
const capacity = (widthMm: number, pt: number, em: number) => Math.floor(widthMm / ((pt * em) / PT_PER_MM));
const line = (pt: number, lh = 1.18) => (pt / PT_PER_MM) * lh;
/** EAN-13 / UPC-A as drawn by bwip-js: 96 units wide (95 modules + stroke padding), plus 11 + 7 quiet modules. */
const EAN13_MODULES = 96;
const EAN13_QUIET = 18;

/** Widest allowed price text (6 digits) across every catalogue currency (word and glyph symbols), all six languages. */
function widestPriceMm(pt: number): number {
  let widest = 0;
  for (const lang of ['en', 'ar', 'tr', 'fr', 'es', 'de'] as LanguageCode[]) {
    for (const currency of ALL_CURRENCIES) {
      const minor = Number('8'.repeat(MAX_PRICE_DIGITS));
      const parts = formatMoneyParts(minor, currency, lang);
      const r = parts.wordSymbol ? 0.58 : 0.78;
      widest = Math.max(widest, measureMm(parts.number, pt, 'bold') + measureMm(parts.symbol + parts.space, pt * r, 'bold'));
    }
  }
  return widest;
}

/** Widest "valid until" text (plus separator) across the six languages and all twelve months. */
function widestValidityMm(pt: number): number {
  let widest = 0;
  for (const lang of ['en', 'ar', 'tr', 'fr', 'es', 'de'] as LanguageCode[]) {
    for (let m = 1; m <= 12; m++) {
      const date = formatLabelDate(`2026-${String(m).padStart(2, '0')}-28`, lang);
      widest = Math.max(widest, measureMm(` · ${labelText(lang, 'validUntil', { date })}`, pt, 'regular'));
    }
  }
  return widest;
}

/** Widest promotion band text across all six languages and every promotion type, with the largest amounts. */
function widestHeadlineMm(pt: number): number {
  let widest = 0;
  const big = Number('8'.repeat(MAX_PRICE_DIGITS));
  for (const lang of ['en', 'ar', 'tr', 'fr', 'es', 'de'] as LanguageCode[]) {
    for (const currency of ALL_CURRENCIES) {
      const amount = formatMoney(big, currency, lang);
      const texts = [
        `${labelText(lang, 'was')} ${amount}`,
        labelText(lang, 'percentOff', { percent: formatPercent(9999, lang) }),
        labelText(lang, 'moneyOff', { amount }),
        labelText(lang, 'multibuy', { quantity: 99, price: amount }),
        labelText(lang, 'reduced'),
        labelText(lang, 'memberPrice'),
      ];
      for (const t of texts) widest = Math.max(widest, measureMm(t, pt, 'bold'));
    }
  }
  return widest;
}

/** Widest "Now" prefix across the six label languages, at the price size (printed at 30 %). */
function widestNowMm(pt: number): number {
  return Math.max(...(['en', 'ar', 'tr', 'fr', 'es', 'de'] as LanguageCode[]).map(l => measureMm(`${NOW_WORDS[l]} `, pt * 0.3, 'bold')));
}
const NOW_WORDS: Record<LanguageCode, string> = { en: 'Now', ar: 'الآن', tr: 'Şimdi', fr: 'Maintenant', es: 'Ahora', de: 'Jetzt' };

function largestPricePt(areaMm: number, maxPt: number, withNow = false): number {
  let size = halfDown(maxPt);
  while (size > 6 && widestPriceMm(size) + (withNow ? widestNowMm(size) : 0) > areaMm) size -= 0.5;
  return size;
}

/**
 * The fixed template for a label box and variant. Pure: same box and variant → same template, whatever is printed.
 *
 * Layout (every format):  name · pack size · [condition]   /   PRICE (full width, end-aligned)   /
 *                         start: unit price or SKU   end: barcode
 * Sizes start from the 70 × 38 mm ticket scaled to the box, then shrink together (one factor) until the
 * worst-case label of the variant — maximum-length name on every line, pack size, the widest 6-digit price,
 * unit price and barcode, plus band, "Now" and a condition line for promotions — fits. So any content within the
 * limits always fits, and every label of a format and variant prints at identical sizes.
 */
export function templateFor(box: { widthMm: number; heightMm: number; safeInsetMm: number }, variant: TemplateVariant = 'standard'): LabelTemplate {
  const w = box.widthMm - 2 * box.safeInsetMm;
  const h = box.heightMm - 2 * box.safeInsetMm;
  const k = clamp(h / 34, 0.6, 7);
  const isCard = isCardFormat(h);
  const promo = variant === 'promo';
  const nameLines = h >= 120 ? 4 : isCard ? 3 : 2;
  const smallLines = promo ? (isCard ? 2 : 1) : 0;
  // Tickets use the 80 % EAN size (0.264 mm module, still scannable); cards scale it up.
  const moduleMm = isCard ? clamp(0.33 * Math.min(k, 1.6), 0.33, 0.53) : 0.264;
  const barcodeReserveMm = (EAN13_MODULES + EAN13_QUIET) * moduleMm; // quiet zones kept fully inside the label

  // Text sizes shrink (one factor) only as far as needed; the price then takes the height that is left,
  // capped by the widest allowed price, and must stay at or above its floor.
  const priceFloorPt = (isCard ? 28 : 18) * Math.min(k, 1);
  let chosen: LabelTemplate | null = null;
  for (let f = 1; f >= 0.5 && !chosen; f -= 0.02) {
    const s = k * f;
    const gap = 1.1 * k * Math.max(f, 0.6);
    // Cards: the price is the hero, so text scales more gently than on the ticket.
    const cardText = isCard ? 0.7 : 1;
    // The band has one fixed size per format: the widest possible headline must fit it.
    let bandPt = round1(clamp(10.5 * s * (isCard ? 0.8 : 1), 7, 44));
    while (promo && bandPt > 6 && widestHeadlineMm(bandPt) > w - 3 * k) bandPt = round1(bandPt - 0.2);
    const bandMm = promo ? Math.max(5.8 * s * (isCard ? 0.8 : 1), (bandPt * 1.45) / PT_PER_MM) : 0;
    const namePt = round1(clamp(10 * s * cardText, 7, 44));
    const secondPt = round1(clamp(7 * s * (isCard ? 0.65 : 1), 6, 28));
    const smallPt = round1(clamp(6.5 * s * (isCard ? 0.7 : 1), 5.5, 24));
    const unitPt = round1(clamp(7 * s * (isCard ? 0.65 : 1), 6, 26));
    const skuPt = round1(clamp(6 * s * (isCard ? 0.65 : 1), 5.5, 20));
    const digitPt = round1(clamp(6 * Math.min(s, k), 5.2, 16));
    const barsMm = clamp(h * 0.18 * Math.max(f, 0.7), 5, 22);
    const codeMm = barsMm + line(digitPt, 1.25);
    // Promotion labels carry no barcode (the product's normal ticket has it): their foot is one line,
    // unit price at the start and SKU at the end. Plain labels stack unit price and SKU beside the barcode.
    const footMm = promo ? line(Math.max(unitPt, skuPt)) : Math.max(codeMm, line(unitPt) + line(skuPt));
    const headMm = (bandMm ? bandMm + gap * 0.6 : 0) + nameLines * line(namePt, 1.12) + line(secondPt) + smallLines * line(smallPt) + (smallLines ? 0.4 * k : 0);
    const priceRoomMm = h - headMm - gap - gap * 0.6 - footMm;
    const byHeight = (priceRoomMm * PT_PER_MM) / (0.96 + 0.3); // + descender room
    // "Now" (was/now) prints inline before the price at 30 % size, so promotions reserve its width, not a line.
    const pricePt = largestPricePt(w, Math.min((isCard ? 40 : 34) * s / f, byHeight), promo);
    const unitMaxMm = w - barcodeReserveMm - gap;
    if (pricePt >= priceFloorPt && unitMaxMm > 0) {
      chosen = {
        widthMm: w, heightMm: h, scale: k, isCard, variant, gapMm: gap, bandPt, bandMm, namePt, nameLines, secondPt, smallPt, smallLines,
        unitPt, skuPt, digitPt, barsMm, moduleMm, pricePt, barcodeReserveMm,
        limits: {
          // 80 % of raw capacity leaves room for word wrapping; capped at till-style maximums.
          name: Math.min(40, Math.floor(capacity(w, namePt, AVG_EM_BOLD) * nameLines * 0.8)),
          secondLine: Math.min(30, Math.floor(capacity(w, secondPt, AVG_EM_REGULAR) * 0.85)),
          sku: 20,
          // The condition shares its line(s) with the validity date, so the widest date is set aside first.
          condition: Math.min(40, Math.floor(((w * Math.max(smallLines, 1) - widestValidityMm(smallPt)) / ((smallPt * AVG_EM_REGULAR) / PT_PER_MM)) * 0.85)),
          priceDigits: MAX_PRICE_DIGITS,
        },
      };
    }
  }
  if (!chosen) throw new RangeError(`label ${box.widthMm} × ${box.heightMm} mm is too small for a price label`);
  return chosen;
}

/**
 * Field limits for a label box: the stricter of the plain and promotion templates, so a product typed once
 * fits every label kind in that format. Used by the product screens to stop input at the limit.
 */
export function fieldLimitsFor(box: { widthMm: number; heightMm: number; safeInsetMm: number }): FieldLimits {
  const a = templateFor(box, 'standard').limits;
  const b = templateFor(box, 'promo').limits;
  return { name: Math.min(a.name, b.name), secondLine: Math.min(a.secondLine, b.secondLine), sku: 20, condition: b.condition, priceDigits: MAX_PRICE_DIGITS };
}

/** Count of digits in a minor-unit amount as it would print (e.g. 999999 → 6). */
export const priceDigits = (minor: number): number => String(Math.abs(Math.trunc(minor))).replace(/^0+(?=\d)/, '').length;

/**
 * The fixed character limits the product screens enforce (like a till): the strictest limits across every
 * built-in stationery preset, so a product typed once prints on every launch format without cutting or
 * shrinking. Custom stationery (Pro) is still checked per format by renderLabel.
 */
export function productFieldLimits(presets: ReadonlyArray<{ labelWidthMm: number; labelHeightMm: number; safeInsetMm: number }>): FieldLimits {
  const all = presets.map(p => fieldLimitsFor({ widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm }));
  const min = (k: keyof FieldLimits) => Math.min(...all.map(l => l[k]));
  return { name: min('name'), secondLine: min('secondLine'), sku: min('sku'), condition: min('condition'), priceDigits: MAX_PRICE_DIGITS };
}
