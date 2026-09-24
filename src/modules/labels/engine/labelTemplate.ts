/**
 * Fixed label templates (owner decisions, 24 Sep 2026: "fixed sizes, like a till" and the G2 correction handout).
 *
 * Every {stationery format + label layout} has ONE fixed set of type sizes. A short product and a long product in
 * the same layout print at exactly the same sizes; nothing ever shrinks to make one label fit. Content that does
 * not fit at the fixed size is refused with a reason (and the screens offer a larger format or another layout).
 *
 * Layouts are separate on purpose (handout §28/§29): a standard ticket does not reserve room for a barcode or an
 * offer band it does not print, so each layout gets the best fixed sizes its own content allows.
 *
 * Catalogue data is never limited here: the product's full name, SKU, barcode and price are stored as imported.
 * The only character counter is the printable LABEL name (LABEL_NAME_MAX); everything else is measured with the
 * real embedded fonts at the fixed size.
 */
import { measureMm, PT_PER_MM, wrapLines } from './textFit';
import { formatMoney, formatMoneyParts } from '../../../domain/formatMoney';
import { formatLabelDate, formatPercentText, labelText } from './labelStrings';
import type { LanguageCode } from '../../../domain/types';
import { SYMBOL_MAP } from '../../../utils/currency';

/** Every currency the app offers — worst cases are taken over the whole catalogue, never a hard-coded few. */
const ALL_CURRENCIES = Object.keys(SYMBOL_MAP).map(option => option.split(' ').pop() as string);
const LANGS: LanguageCode[] = ['en', 'ar', 'tr', 'fr', 'es', 'de'];

/** The printable label name counter shown on the product screen (e.g. "38 / 40"). Proven to fit every launch layout. */
export const LABEL_NAME_MAX = 40;

/**
 * Significant digits the fixed price size is designed around, in the widest currency of the catalogue (each
 * currency with its own decimals, e.g. 9,999.99 · 999,999 · 999.999) on tickets and sticker labels. The A4 card is the
 * large-price fallback and is designed for 7 (99,999.99 · 9,999,999 · 9,999.999). No price is ever refused by the CATALOGUE; a price wider
 * than a format's fixed price area is refused for that format only ("This price needs a larger label format").
 */
export const PRICE_DESIGN_DIGITS = 6;
/** A6 / A5 offer cards are customer-facing: designed for 5 digits (999.99 · 99,999 · 99.999) so the price dominates. */
export const PRICE_DESIGN_DIGITS_CARD = 5;
export const PRICE_DESIGN_DIGITS_LARGEST = 7;

/** Labels at least this tall (inner mm) are offer cards. */
export const CARD_MIN_HEIGHT_MM = 80;
export const isCardFormat = (innerHeightMm: number): boolean => innerHeightMm >= CARD_MIN_HEIGHT_MM;

/**
 * standard      name · pack size · PRICE · SKU
 * unitPrice     … · PRICE · unit price + SKU
 * barcode       … · PRICE · unit price / SKU │ barcode
 * promo         offer band · … · [Now] PRICE · unit price / SKU
 * promoDetail   promo + a condition / end-date line (member prices, "until 31 Oct")
 * promoBarcode  promo + details + barcode (only where the compatibility matrix allows it)
 */
export type LabelLayout = 'standard' | 'unitPrice' | 'barcode' | 'promo' | 'promoDetail' | 'promoBarcode';
export const LABEL_LAYOUTS: LabelLayout[] = ['standard', 'unitPrice', 'barcode', 'promo', 'promoDetail', 'promoBarcode'];

/** Hints for the product / promotion screens: the printable character room of this format + layout. */
export interface FieldLimits {
  /** Printable label name, all lines together (the product's full name is stored separately, untouched). */
  labelName: number;
  /** Pack size / second line, one line. */
  secondLine: number;
  /** Member / conditional price condition text, with room kept for an end date (0 when the layout has none). */
  condition: number;
}

export interface LabelTemplate {
  layout: LabelLayout;
  /** Inner width and height after the safe inset, mm. */
  widthMm: number;
  heightMm: number;
  /** Scale relative to the 70 × 38 mm ticket. */
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
  /** "Now" (was / now), printed at a readable size: inline before the price on tickets, its own line on cards. */
  nowPt: number;
  /** Barcode bar height and module width (0 when the layout has no barcode). */
  barsMm: number;
  moduleMm: number;
  /** Fixed price size (the price has its own full-width row). */
  pricePt: number;
  /** Significant digits the price size was designed for (in the widest currency). */
  priceDesignDigits: number;
  /** Width the barcode needs with both quiet zones, at the end of the bottom row. */
  barcodeReserveMm: number;
  limits: FieldLimits;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (n: number) => Math.round(n * 10) / 10;
const halfDown = (n: number) => Math.floor(n * 2) / 2;
const line = (pt: number, lh = 1.18) => (pt / PT_PER_MM) * lh;
/** Ratio the currency symbol prints at, relative to the price digits (word codes and Arabic symbols smaller). */
export const symbolRatio = (wordSymbol: boolean): number => (wordSymbol ? 0.58 : 0.78);
/** EAN-13 / UPC-A as drawn by bwip-js: 96 units wide (95 modules + stroke padding), plus 11 + 7 quiet modules. */
export const EAN13_MODULES = 96;
export const EAN13_QUIET = 18;
/** Barcodes are never drawn with a module narrower than this (80 % of the GS1 nominal 0.33 mm). */
export const MIN_MODULE_MM = 0.264;

/** A price with `digits` significant digits (all 8s, the widest digit run). */
export const designPriceMinor = (digits: number): number => Number('8'.repeat(digits));

/** Width of a printed price at `pt`, measured exactly as renderLabel draws it (symbol at its reduced size). */
export function priceWidthMm(amountMinor: number, currency: string, lang: LanguageCode, pt: number): number {
  const parts = formatMoneyParts(amountMinor, currency, lang);
  return measureMm(parts.number, pt, 'bold') + measureMm(parts.symbol + parts.space, pt * symbolRatio(parts.wordSymbol), 'bold');
}

const perPtCache = new Map<string, number>();
const cached = (key: string, compute: () => number) => {
  const hit = perPtCache.get(key);
  if (hit !== undefined) return hit;
  const v = compute();
  perPtCache.set(key, v);
  return v;
};

/** Widest `digits`-digit price across every catalogue currency and all six languages, per point (scales linearly). */
const widestPricePerPt = (digits: number) => cached(`p${digits}`, () => {
  let widest = 0;
  for (const lang of LANGS) for (const currency of ALL_CURRENCIES) widest = Math.max(widest, priceWidthMm(designPriceMinor(digits), currency, lang, 100) / 100);
  return widest;
});

/** Widest "Now" word across the six label languages, per point, with its trailing space. */
const widestNowPerPt = () => cached('now', () => Math.max(...LANGS.map(l => measureMm(`${labelText(l, 'now')} `, 100, 'bold') / 100)));

/** Widest "valid until" text (plus separator) across the six languages and all twelve months, per point. */
const widestValidityPerPt = () => cached('valid', () => {
  let widest = 0;
  for (const lang of LANGS) for (let m = 1; m <= 12; m++) {
    const date = formatLabelDate(`2026-${String(m).padStart(2, '0')}-28`, lang);
    widest = Math.max(widest, measureMm(` · ${labelText(lang, 'validUntil', { date })}`, 100, 'regular') / 100);
  }
  return widest;
});

/** Widest promotion band text across all six languages and every promotion type, with design-size amounts, per point. */
const widestHeadlinePerPt = (digits: number) => cached(`h${digits}`, () => {
  let widest = 0;
  const big = designPriceMinor(digits);
  for (const lang of LANGS) for (const currency of ALL_CURRENCIES) {
    const amount = formatMoney(big, currency, lang);
    const texts = [
      `${labelText(lang, 'was')} ${amount}`,
      labelText(lang, 'percentOff', { percent: formatPercentText(9999, lang) }),
      labelText(lang, 'moneyOff', { amount }),
      labelText(lang, 'multibuy', { quantity: 99, price: amount }),
      labelText(lang, 'reduced'),
      labelText(lang, 'memberPrice'),
    ];
    for (const t of texts) widest = Math.max(widest, measureMm(t, 100, 'bold') / 100);
  }
  return widest;
});

/**
 * Realistic full-length printable names (≤ 40 characters) used to prove the name box: upper case, title case,
 * German compounds, French accents, Turkish letters and Arabic (handout §25). Synthetic "MMMM" strings are not the
 * acceptance definition. If any of these does not fit a layout's fixed name box, that layout's label-name room is
 * reduced (FieldLimits.labelName) rather than any label ever shrinking.
 */
export const NAME_CORPUS: { lang: LanguageCode; text: string }[] = [
  { lang: 'en', text: 'WARBURTONS TOASTIE THICK WHITE BREAD 800' },
  { lang: 'en', text: 'Fairy Platinum+ Lemon Dishwasher Tabs 42' },
  { lang: 'en', text: 'Heinz Cream of Tomato Soup Family Pack 4' },
  { lang: 'de', text: 'Bio-Vollmilchschokolade mit Haselnüssen' },
  { lang: 'de', text: 'Frischkäsezubereitung Kräuter Doppelrahm' },
  { lang: 'fr', text: 'Crème fraîche épaisse d’Isigny AOP 40 cl' },
  { lang: 'fr', text: 'CAFÉ MOULU PUR ARABICA DÉGUSTATION 250 G' },
  { lang: 'es', text: 'Aceite de oliva virgen extra Cazorla 1 l' },
  { lang: 'es', text: 'GALLETAS INTEGRALES CON CHOCOLATE NEGRO' },
  { lang: 'tr', text: 'Doğal Çiçek Balı İnce Süzme Kavanoz 850g' },
  { lang: 'tr', text: 'ŞEKERSİZ GÜNLÜK YOĞURT İÇECEĞİ ÇİLEKLİ 1' },
  { lang: 'ar', text: 'حليب طازج كامل الدسم من مزارع العين 1.5ل' },
  { lang: 'ar', text: 'زيت زيتون بكر ممتاز من جبال لبنان 750 مل' },
];

interface Plan { withBand: boolean; withSmall: boolean; withBarcode: boolean; footKind: 'sku' | 'unitSku' | 'single' | 'code' }
const PLANS: Record<LabelLayout, Plan> = {
  standard: { withBand: false, withSmall: false, withBarcode: false, footKind: 'sku' },
  unitPrice: { withBand: false, withSmall: false, withBarcode: false, footKind: 'unitSku' },
  barcode: { withBand: false, withSmall: false, withBarcode: true, footKind: 'code' },
  promo: { withBand: true, withSmall: false, withBarcode: false, footKind: 'single' },
  promoDetail: { withBand: true, withSmall: true, withBarcode: false, footKind: 'single' },
  promoBarcode: { withBand: true, withSmall: true, withBarcode: true, footKind: 'code' },
};
export const layoutHasBand = (l: LabelLayout): boolean => PLANS[l].withBand;
export const layoutHasBarcode = (l: LabelLayout): boolean => PLANS[l].withBarcode;

/** Smallest acceptable fixed price size per layout on tickets (pt, before the box scale). */
const TICKET_PRICE_FLOOR: Record<LabelLayout, number> = { standard: 24, unitPrice: 24, barcode: 24, promo: 17, promoDetail: 16, promoBarcode: 16 };
/** Bar heights tried on tickets, tallest first (truncated EAN; physical scan-back decides acceptance). */
const TICKET_BARS_MM = [10, 9, 8, 7.5, 7, 6.5];

export class LayoutIncompatibleError extends RangeError {
  constructor(public readonly layout: LabelLayout, box: { widthMm: number; heightMm: number }) {
    super(`layout ${layout} does not fit ${box.widthMm} × ${box.heightMm} mm at approved sizes`);
    this.name = 'LayoutIncompatibleError';
  }
}

type Box = { widthMm: number; heightMm: number; safeInsetMm: number };
const templateCache = new Map<string, LabelTemplate | LayoutIncompatibleError>();

/**
 * The fixed template for a label box and layout. Pure: same box and layout → same template, whatever is printed.
 * Throws LayoutIncompatibleError when the layout cannot print on this format at acceptable sizes (the
 * compatibility matrix, layoutCompatibility(), is built from this).
 */
export function templateFor(box: Box, layout: LabelLayout = 'standard'): LabelTemplate {
  const key = `${box.widthMm}|${box.heightMm}|${box.safeInsetMm}|${layout}`;
  let t = templateCache.get(key);
  if (!t) {
    try {
      t = isCardFormat(box.heightMm - 2 * box.safeInsetMm) ? cardTemplate(box, layout) : ticketTemplate(box, layout);
    } catch (e) {
      if (!(e instanceof LayoutIncompatibleError)) throw e;
      t = e;
    }
    templateCache.set(key, t);
  }
  if (t instanceof LayoutIncompatibleError) throw t;
  return t;
}

function footMm(plan: Plan, unitPt: number, skuPt: number, codeMm: number): number {
  switch (plan.footKind) {
    case 'sku': return line(skuPt);
    case 'unitSku': return line(unitPt) + line(skuPt);
    case 'single': return line(Math.max(unitPt, skuPt));
    case 'code': return Math.max(codeMm, line(unitPt) + line(skuPt));
  }
}

function limitsFor(w: number, namePt: number, nameLines: number, secondPt: number, smallPt: number, smallLines: number): FieldLimits {
  // Label name: the universal counter, reduced only if a realistic full-length name does not fit this box.
  let labelName = LABEL_NAME_MAX;
  while (labelName > 10 && NAME_CORPUS.some(n => wrapLines(n.text.slice(0, labelName), w, namePt, 'bold').length > nameLines)) labelName -= 1;
  const avg = (pt: number) => (pt * 0.55) / PT_PER_MM;
  const secondLine = Math.min(60, Math.floor((w / avg(secondPt)) * 0.85));
  const condition = smallLines ? Math.max(0, Math.min(60, Math.floor(((w * smallLines - widestValidityPerPt() * smallPt) / avg(smallPt)) * 0.85))) : 0;
  return { labelName, secondLine, condition };
}

function ticketTemplate(box: Box, layout: LabelLayout): LabelTemplate {
  const w = box.widthMm - 2 * box.safeInsetMm;
  const h = box.heightMm - 2 * box.safeInsetMm;
  const k = clamp(h / 33, 0.6, 2.2);
  const plan = PLANS[layout];
  const nameLines = 2;
  const smallLines = plan.withSmall ? 1 : 0;
  const moduleMm = MIN_MODULE_MM;
  const barcodeReserveMm = plan.withBarcode ? (EAN13_MODULES + EAN13_QUIET) * moduleMm : 0;
  const floor = TICKET_PRICE_FLOOR[layout] * Math.min(k, 1);
  const barsSteps = plan.withBarcode ? TICKET_BARS_MM.map(b => b * Math.min(k, 1.3)) : [0];

  // Text sizes are the approved ticket sizes scaled to the box; they shrink (one factor, never below 80 %) only if
  // a layout cannot otherwise reach its price floor. Bars shorten before text does.
  for (let f = 1; f >= 0.8; f = Math.round((f - 0.02) * 100) / 100) {
    for (const barsMm of barsSteps) {
      const s = k * f;
      const gap = 1.1 * k;
      const namePt = round1(clamp(10 * s, 7, 22));
      const secondPt = round1(clamp(7 * s, 6, 16));
      const smallPt = round1(clamp(6.5 * s, 5.5, 14));
      const unitPt = round1(clamp(7 * s, 6, 16));
      const skuPt = round1(clamp(6 * s, 5.5, 14));
      const digitPt = round1(clamp(6 * Math.min(s, 1.2), 5.2, 9));
      const nowPt = round1(clamp(8.5 * s, 7.5, 18)); // readable, never the old 30 %-of-price whisper
      let bandPt = 0;
      let bandMm = 0;
      if (plan.withBand) {
        bandPt = round1(clamp(10.5 * s, 7, 24));
        while (bandPt > 6 && widestHeadlinePerPt(PRICE_DESIGN_DIGITS) * bandPt > w - 3 * k) bandPt = round1(bandPt - 0.2);
        bandMm = Math.max(5.8 * s, (bandPt * 1.45) / PT_PER_MM);
      }
      const codeMm = plan.withBarcode ? barsMm + line(digitPt, 1.25) : 0;
      const head = (bandMm ? bandMm + gap * 0.6 : 0) + nameLines * line(namePt, 1.12) + line(secondPt) + smallLines * line(smallPt) + (smallLines ? 0.4 * k : 0);
      const priceRoomMm = h - head - gap - gap * 0.6 - footMm(plan, unitPt, skuPt, codeMm);
      const byHeight = (priceRoomMm * PT_PER_MM) / (0.96 + 0.3);
      const nowReserve = plan.withBand ? widestNowPerPt() * nowPt : 0; // "Now" inline at a readable size
      const byWidth = (w - nowReserve) / widestPricePerPt(PRICE_DESIGN_DIGITS);
      const pricePt = halfDown(Math.min(byHeight, byWidth, 40 * k));
      const unitRoom = plan.withBarcode ? w - barcodeReserveMm - gap : w;
      if (pricePt >= floor && unitRoom > 12) {
        return {
          layout, widthMm: w, heightMm: h, scale: k, isCard: false, gapMm: gap, bandPt, bandMm, namePt, nameLines, secondPt,
          smallPt, smallLines, unitPt, skuPt, digitPt, nowPt, barsMm, moduleMm: plan.withBarcode ? moduleMm : 0, pricePt,
          priceDesignDigits: PRICE_DESIGN_DIGITS, barcodeReserveMm,
          limits: limitsFor(w, namePt, nameLines, secondPt, smallPt, smallLines),
        };
      }
    }
  }
  throw new LayoutIncompatibleError(layout, box);
}

/**
 * Offer cards (A6 / A5 / A4): customer-facing, so the PRICE dominates. Name and details are set smaller relative
 * to the card than on tickets, the price takes the free height (capped only by the widest design price) and is
 * centred in the free area. The SKU is off by default (staff option); "Now" is its own readable line.
 */
function cardTemplate(box: Box, layout: LabelLayout): LabelTemplate {
  const w = box.widthMm - 2 * box.safeInsetMm;
  const h = box.heightMm - 2 * box.safeInsetMm;
  const k = clamp(h / 33, 1, 9);
  const plan = PLANS[layout];
  const digits = w >= 180 ? PRICE_DESIGN_DIGITS_LARGEST : PRICE_DESIGN_DIGITS_CARD;
  const gap = round1(clamp(w * 0.045, 4, 9));
  const namePt = round1(clamp(w * 0.19, 14, 36));
  const nameLines = 3;
  const secondPt = round1(namePt * 0.62);
  const smallPt = round1(namePt * 0.55);
  const smallLines = plan.withSmall ? 2 : 0;
  const unitPt = round1(namePt * 0.62);
  const skuPt = round1(namePt * 0.45);
  const nowPt = round1(namePt * 1.1);
  const digitPt = round1(clamp(namePt * 0.5, 8, 16));
  const moduleMm = round1(clamp(0.33 * (w / 93), 0.33, 0.53) * 1000) / 1000;
  const barcodeReserveMm = plan.withBarcode ? (EAN13_MODULES + EAN13_QUIET) * moduleMm : 0;
  const barsMm = plan.withBarcode ? clamp(h * 0.12, 12, 22) : 0;
  let bandPt = 0;
  let bandMm = 0;
  if (plan.withBand) {
    bandPt = round1(clamp(namePt * 1.25, 14, 48));
    while (bandPt > 8 && widestHeadlinePerPt(digits) * bandPt > w - 2 * gap) bandPt = round1(bandPt - 0.2);
    bandMm = (bandPt * 1.9) / PT_PER_MM;
  }
  const codeMm = plan.withBarcode ? barsMm + line(digitPt, 1.25) : 0;
  // Cards add 0.3 em above the pack size so large name descenders never touch it.
  const head = (bandMm ? bandMm + gap * 0.6 : 0) + nameLines * line(namePt, 1.12) + line(secondPt) + (secondPt * 0.3) / PT_PER_MM + smallLines * line(smallPt);
  const nowLine = plan.withBand ? line(nowPt, 1.1) : 0;
  const priceRoomMm = h - head - nowLine - 2 * gap - footMm(plan, unitPt, skuPt, codeMm);
  const byHeight = (priceRoomMm * PT_PER_MM) / (0.96 + 0.3);
  const byWidth = w / widestPricePerPt(digits);
  const pricePt = halfDown(Math.min(byHeight, byWidth));
  if (pricePt < namePt * 1.8 || (plan.withBarcode && w - barcodeReserveMm - gap < 20)) throw new LayoutIncompatibleError(layout, box);
  return {
    layout, widthMm: w, heightMm: h, scale: k, isCard: true, gapMm: gap, bandPt, bandMm, namePt, nameLines, secondPt, smallPt,
    smallLines, unitPt, skuPt, digitPt, nowPt, barsMm, moduleMm: plan.withBarcode ? moduleMm : 0, pricePt, priceDesignDigits: digits,
    barcodeReserveMm, limits: limitsFor(w, namePt, nameLines, secondPt, smallPt, smallLines),
  };
}

export interface LayoutAvailability { ok: boolean; reason?: 'doesNotFit' }

/** The compatibility matrix for one format: which layouts can print on it at approved fixed sizes. */
export function layoutCompatibility(box: Box): Record<LabelLayout, LayoutAvailability> {
  const out = {} as Record<LabelLayout, LayoutAvailability>;
  for (const layout of LABEL_LAYOUTS) {
    try { templateFor(box, layout); out[layout] = { ok: true }; } catch (e) {
      if (!(e instanceof LayoutIncompatibleError)) throw e;
      out[layout] = { ok: false, reason: 'doesNotFit' };
    }
  }
  return out;
}

/**
 * Printable-field hints for a format (for one layout, or the strictest of its compatible layouts). The condition
 * hint is the most generous member-price layout available; 0 means the format has none.
 */
export function fieldLimitsFor(box: Box, layout?: LabelLayout): FieldLimits {
  const layouts = layout ? [layout] : LABEL_LAYOUTS.filter(l => layoutCompatibility(box)[l].ok);
  const all = layouts.map(l => templateFor(box, l).limits);
  return {
    labelName: Math.min(...all.map(l => l.labelName)),
    secondLine: Math.min(...all.map(l => l.secondLine)),
    condition: Math.max(0, ...all.filter((_, i) => PLANS[layouts[i]].withSmall).map(l => l.condition)),
  };
}
