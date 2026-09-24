/**
 * One label's content → an HTML fragment sized in mm for its box. Pure and deterministic: every size and
 * line break is decided here from real font metrics (textFit.ts), and every money value goes through
 * formatMoney(amountMinor, currencyCode, labelLanguage). No app state, no app language.
 */
import type { BarcodeFormat, LabelKind, LanguageCode, UnitPriceBase } from '../../../domain/types';
import type { Money } from '../../../domain/money';
import { formatMoneyParts, formatMoneyValue } from '../../../domain/formatMoney';
import { escapeHtml } from '../../../utils/htmlEscape';
import { fitSingleLine, measureMm, PT_PER_MM, wrapLines } from './textFit';
import { fieldLimitsFor, priceDigits, templateFor } from './labelTemplate';
import { formatLabelDate, formatPercent, labelText } from './labelStrings';
import { encodeBarcode } from './barcode';
import { fontStack } from './fonts';

export interface LabelContent {
  kind: LabelKind;
  /** Printed-label language (independent of the app language). */
  language: LanguageCode;
  name: string;
  secondLine?: string;
  /** The price the customer pays now (for was/now: the "now" price). */
  price: Money;
  unitPrice?: { amount: Money; base: UnitPriceBase };
  barcode?: { value: string; format: BarcodeFormat };
  sku?: string;
  /** Normal / previous price for was-now and reduced-to-clear. */
  was?: Money;
  percentOffHundredths?: number;
  moneyOff?: Money;
  multibuy?: { quantity: number; total: Money };
  /** Printed condition for member / conditional prices. */
  condition?: string;
  /** Local date YYYY-MM-DD. */
  validUntil?: string;
}

export type LabelStyle = 'standard' | 'promo' | 'inkSaving';

export type LabelIssueCode =
  | 'mixedCurrency' | 'missingField' | 'priceDoesNotFit' | 'unitPriceDoesNotFit' | 'barcodeDoesNotFit'
  | 'barcodeInvalid' | 'contentDoesNotFit'
  /** A field is longer than this format's character limit (the product screens prevent this at entry). */
  | 'tooLong'
  /** A field is within its limit but its characters are unusually wide and do not fit at the fixed size. */
  | 'tooWide'
  /** A price has more than MAX_PRICE_DIGITS digits. */
  | 'priceTooLong';

export interface LabelIssue { code: LabelIssueCode; severity: 'error' | 'warning'; detail?: string }

export { isCardFormat } from './labelTemplate';

/** Sizes a label was rendered at; a sheet uses the smallest of each so every label on it matches. */
export interface LabelMetrics { namePt: number; pricePt: number }

export interface RenderedLabel { html: string; issues: LabelIssue[]; metrics?: LabelMetrics }

/** Kept for API compatibility: sizes are fixed per format, so a sheet needs no caps. */
export interface SizeCaps { namePt?: number; pricePt?: number }

const PROMO_KINDS: LabelKind[] = ['wasNow', 'percentOff', 'moneyOff', 'multibuy', 'reducedToClear', 'memberPrice'];
const isPromo = (k: LabelKind) => PROMO_KINDS.includes(k) || k.startsWith('offerCard');
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Isolate left-to-right runs (prices, codes, digits) so an RTL label never reorders them. */
const ltr = (s: string) => `<bdi dir="ltr">${escapeHtml(s)}</bdi>`;

function required(c: LabelContent): { field: string } | null {
  switch (c.kind) {
    case 'priceUnitPrice': return c.unitPrice ? null : { field: 'unitPrice' };
    case 'priceBarcode': return c.barcode ? null : { field: 'barcode' };
    case 'wasNow': case 'reducedToClear': return c.was ? null : { field: 'was' };
    case 'offerCardA6': case 'offerCardA5': case 'offerCardA4': return null;
    case 'percentOff': return c.percentOffHundredths ? null : { field: 'percentOffHundredths' };
    case 'moneyOff': return c.moneyOff ? null : { field: 'moneyOff' };
    case 'multibuy': return c.multibuy ? null : { field: 'multibuy' };
    case 'memberPrice': return c.condition ? null : { field: 'condition' };
    default: return null;
  }
}

/**
 * The promotion a label shows. Offer cards (A6 / A5 / A4) are a FORMAT: their promotion comes from the data
 * they carry (was price, percent, amount off, multibuy, condition), so any promotion can be printed as a card.
 */
export function promoOf(c: LabelContent): LabelKind | null {
  if (PROMO_KINDS.includes(c.kind)) return c.kind;
  if (!c.kind.startsWith('offerCard')) return null;
  if (c.was) return 'wasNow';
  if (c.percentOffHundredths) return 'percentOff';
  if (c.moneyOff) return 'moneyOff';
  if (c.multibuy) return 'multibuy';
  if (c.condition) return 'memberPrice';
  return null;
}

/**
 * The promotion headline for the band, in the label language, as { text (for measuring), html }. The words keep
 * the label's own direction; only numbers and amounts are isolated left-to-right (so an Arabic "خصم 25%" stays
 * in Arabic order while "25%" itself never reverses).
 */
function headline(c: LabelContent, promo: LabelKind | null): { text: string; html: string } | null {
  const L = c.language;
  const build = (key: Parameters<typeof labelText>[1], vars: Record<string, string | number>) => {
    const text = labelText(L, key, vars);
    const marked: Record<string, string> = {};
    Object.keys(vars).forEach((k, i) => { marked[k] = `\u0000${i}\u0000`; });
    let html = escapeHtml(labelText(L, key, marked));
    Object.keys(vars).forEach((k, i) => { html = html.replace(`\u0000${i}\u0000`, ltr(String(vars[k]))); });
    return { text, html };
  };
  switch (promo) {
    case 'wasNow': {
      const was = formatMoneyValue(c.was as Money, L);
      return { text: `${labelText(L, 'was')} ${was}`, html: `${escapeHtml(labelText(L, 'was'))} <s>${ltr(was)}</s>` };
    }
    case 'percentOff': return build('percentOff', { percent: formatPercent(c.percentOffHundredths as number, L) });
    case 'moneyOff': return build('moneyOff', { amount: formatMoneyValue(c.moneyOff as Money, L) });
    case 'multibuy': return build('multibuy', { quantity: (c.multibuy as { quantity: number }).quantity, price: formatMoneyValue((c.multibuy as { total: Money }).total, L) });
    case 'reducedToClear': return { text: labelText(L, 'reduced'), html: escapeHtml(labelText(L, 'reduced')) };
    case 'memberPrice': return { text: labelText(L, 'memberPrice'), html: escapeHtml(labelText(L, 'memberPrice')) };
    default: return null;
  }
}

/**
 * Render one label into a box of widthMm × heightMm with the given safe inset, at the FIXED sizes of its format
 * (labelTemplate.ts). Nothing shrinks: a field over its character limit, or too wide at the fixed size, is refused
 * with a reason the screens can show.
 *
 *   [promotion band]                              optional, full width
 *   product name (bold, fixed size, N lines max)  top
 *   pack size / second line                       one line
 *   condition · validity                          one line (two on cards)
 *   ─ bottom row ─
 *   tickets: start side unit price + barcode or SKU │ end side price, one shared baseline
 *   cards:   price on its own row, then unit price / SKU
 * Arabic labels mirror the columns; prices, codes and bars stay left-to-right.
 */
export function renderLabel(c: LabelContent, box: { widthMm: number; heightMm: number; safeInsetMm: number }, style: LabelStyle = isPromo(c.kind) ? 'promo' : 'standard'): RenderedLabel {
  const issues: LabelIssue[] = [];
  const L = c.language;
  const monies = [c.price, c.was, c.moneyOff, c.unitPrice?.amount, c.multibuy?.total].filter(Boolean) as Money[];
  if (monies.some(m => m.currency !== c.price.currency)) issues.push({ code: 'mixedCurrency', severity: 'error' });
  const missing = required(c);
  if (missing) issues.push({ code: 'missingField', severity: 'error', detail: missing.field });
  if (issues.length) return { html: '', issues };
  const fail = (code: LabelIssueCode, detail?: string): RenderedLabel => ({ html: '', issues: [...issues, { code, severity: 'error', detail }] });

  const promoKind = promoOf(c);
  const t = templateFor(box, isPromo(c.kind) ? 'promo' : 'standard');
  const { widthMm: w, scale: k, gapMm: gap } = t;
  const h = t.heightMm;
  const ptToMm = (pt: number) => pt / PT_PER_MM;
  const line = (pt: number, lh = 1.18) => ptToMm(pt) * lh;
  const chars = (v: string) => [...v].length;
  const limits = fieldLimitsFor(box);

  // ── Character limits (the product screens enforce these at entry; the renderer re-checks) ──────────
  if (chars(c.name) > limits.name) return fail('tooLong', 'name');
  if (c.secondLine && chars(c.secondLine) > limits.secondLine) return fail('tooLong', 'secondLine');
  if (c.sku && chars(c.sku) > limits.sku) return fail('tooLong', 'sku');
  if (c.condition && chars(c.condition) > limits.condition) return fail('tooLong', 'condition');
  for (const m of monies) if (priceDigits(m.minor) > limits.priceDigits) return fail('priceTooLong', m === c.price ? 'price' : 'other');

  // ── Promotion band (fixed size) ───────────────────────────────────────────────────────────────────
  let bandHtml = '';
  const head = headline(c, promoKind);
  if (head) {
    if (measureMm(head.text, t.bandPt, 'bold') > w - 3 * k) return fail('tooWide', 'headline');
    bandHtml = `<div class="band" style="height:${r2(t.bandMm)}mm;font-size:${t.bandPt}pt"><span>${head.html}</span></div>`;
  }

  // ── Head: name, pack size, condition (fixed sizes) ────────────────────────────────────────────────
  const nameLines = wrapLines(c.name, w, t.namePt, 'bold');
  if (nameLines.length > t.nameLines) return fail('tooWide', 'name');
  const nameHtml = `<div class="name" style="font-size:${t.namePt}pt">${nameLines.map(l => escapeHtml(l)).join('<br/>')}</div>`;
  let secondHtml = '';
  if (c.secondLine) {
    if (measureMm(c.secondLine, t.secondPt, 'regular') > w) return fail('tooWide', 'secondLine');
    secondHtml = `<div class="second" style="font-size:${t.secondPt}pt">${escapeHtml(c.secondLine)}</div>`;
  }
  const small: string[] = [];
  if (c.condition) small.push(c.condition);
  if (c.validUntil) small.push(labelText(L, 'validUntil', { date: formatLabelDate(c.validUntil, L) }));
  let smallHtml = '';
  if (small.length) {
    const lines = wrapLines(small.join(' · '), w, t.smallPt, 'regular');
    if (lines.length > Math.max(t.smallLines, 1)) return fail('tooWide', 'condition');
    smallHtml = `<div class="small" style="font-size:${t.smallPt}pt">${lines.map(l => escapeHtml(l)).join('<br/>')}</div>`;
  }

  // ── Price: its own full-width row, fixed size for the format and variant ──────────────────────────
  const parts = formatMoneyParts(c.price.minor, c.price.currency, L);
  const symRatio = parts.wordSymbol ? 0.58 : 0.78;
  const arabicSymbol = /[؀-ۿ]/.test(parts.symbol);
  const nowWord = promoKind === 'wasNow' ? labelText(L, 'now') : '';
  const descender = arabicSymbol ? 0.3 : 0.16;
  const pricePt = t.pricePt;
  const priceWidth = measureMm(parts.number, pricePt, 'bold') + measureMm(parts.symbol + parts.space, pricePt * symRatio, 'bold');
  if (priceWidth > w + 0.01) return fail('priceDoesNotFit');
  const sym = `<span class="cur" style="font-size:${Math.round(symRatio * 100)}%">${escapeHtml(parts.symbol)}</span>`;
  const amount = parts.symbolPosition === 'before' ? `${sym}${parts.space ? '&nbsp;' : ''}${escapeHtml(parts.number)}` : `${escapeHtml(parts.number)}&nbsp;${sym}`;
  const nowHtml = nowWord ? `<span class="now" style="font-size:30%">${escapeHtml(nowWord)}</span> ` : '';
  const priceHtml = `<div class="price" style="font-size:${pricePt}pt;padding-bottom:${descender}em">${nowHtml}<bdi dir="ltr">${amount}</bdi></div>`;

  // ── Bottom row: start = unit price / SKU, end = barcode ───────────────────────────────────────────
  const startParts: string[] = [];
  let startWidth = 0;
  if (c.unitPrice) {
    const up = formatMoneyValue(c.unitPrice.amount, L);
    const base = labelText(L, c.unitPrice.base);
    const text = labelText(L, 'unitPrice', { price: up, base });
    const room = t.variant === 'promo' ? w * 0.7 : c.barcode ? w - t.barcodeReserveMm - gap : w;
    const width = measureMm(text, t.unitPt, 'bold');
    if (width > room) {
      issues.push({ code: 'unitPriceDoesNotFit', severity: c.kind === 'priceUnitPrice' ? 'error' : 'warning' });
      if (c.kind === 'priceUnitPrice') return { html: '', issues };
    } else {
      const composed = escapeHtml(labelText(L, 'unitPrice', { price: '\u0000P', base: '\u0000B' })).replace('\u0000P', ltr(up)).replace('\u0000B', escapeHtml(base));
      startParts.push(`<div class="unit" style="font-size:${t.unitPt}pt">${composed}</div>`);
      startWidth = Math.max(startWidth, width);
    }
  }
  if (c.sku) startParts.push(`<div class="sku" style="font-size:${t.skuPt}pt">${ltr(c.sku)}</div>`);

  let codeHtml = '';
  // Promotion labels never print the barcode (template 'promo' has no room reserved for it).
  if (c.barcode && t.variant === 'standard') {
    try {
      const sym2 = encodeBarcode(c.barcode.value, c.barcode.format, false);
      const mod = Math.max(MIN_MODULE_FOR_TEMPLATE, t.moduleMm);
      const [ql, qr] = sym2.quietModules.map(q => q * mod);
      const barsW = sym2.modules * mod;
      if (barsW + ql + qr > t.barcodeReserveMm + 0.01) {
        issues.push({ code: 'barcodeDoesNotFit', severity: c.kind === 'priceBarcode' ? 'error' : 'warning' });
      } else {
        // Bars are always left-to-right with both quiet zones kept inside the label.
        const svg = sym2.svg.replace('<svg ', `<svg preserveAspectRatio="none" style="width:${r2(barsW)}mm;height:${r2(t.barsMm)}mm" `);
        const digits = [...c.barcode.value].map(d => `<span>${d}</span>`).join('');
        codeHtml = `<div class="barcode" dir="ltr" style="width:${r2(barsW)}mm;padding:0 ${r2(qr)}mm 0 ${r2(ql)}mm">${svg}<div class="digits" style="font-size:${t.digitPt}pt">${digits}</div></div>`;
      }
    } catch (e) {
      issues.push({ code: 'barcodeInvalid', severity: c.kind === 'priceBarcode' ? 'error' : 'warning', detail: (e as { code?: string }).code });
    }
    if (issues.some(i => i.severity === 'error')) return { html: '', issues };
  }
  void startWidth; void h;
  const foot = t.variant === 'promo'
    ? (startParts.length ? `<div class="foot single">${startParts.join('')}</div>` : '')
    : (startParts.length || codeHtml ? `<div class="foot"><div class="start">${startParts.join('')}</div>${codeHtml}</div>` : '');

  const html = `<div class="label ${style}${isPromo(c.kind) ? ' promo-kind' : ''}${t.isCard ? ' card' : ''}" dir="${L === 'ar' ? 'rtl' : 'ltr'}" lang="${L}" style="font-family:${fontStack(L)};padding:${r2(box.safeInsetMm)}mm;width:${r2(box.widthMm)}mm;height:${r2(box.heightMm)}mm;--gap:${r2(gap)}mm">`
    + bandHtml
    + `<div class="head">${nameHtml}${secondHtml}${smallHtml}</div>`
    + priceHtml
    + foot
    + `</div>`;
  return { html, issues, metrics: { namePt: t.namePt, pricePt } };
}

/** Barcodes are never drawn with a module narrower than this, whatever the format. */
const MIN_MODULE_FOR_TEMPLATE = 0.264;

/** CSS shared by every label (sizes are inline per label). */
export const LABEL_CSS = `
.label{box-sizing:border-box;position:relative;overflow:hidden;display:flex;flex-direction:column;color:#000;background:#fff;text-align:start}
.label .band{flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-weight:700;white-space:nowrap;overflow:hidden;border-radius:0.8mm;margin-bottom:calc(var(--gap) * 0.6);line-height:1}
.label.promo .band{background:#FFD400;color:#000}
.label.inkSaving .band{background:#fff;color:#000;border:0.4mm solid #000}
.label.standard .band{background:#000;color:#fff}
.label .band s{text-decoration-thickness:0.25mm}
.label .head{flex:0 0 auto}
.label .name{font-weight:700;line-height:1.12;letter-spacing:-0.005em}
.label .second{line-height:1.18;color:#1a1a1a}
.label .small{line-height:1.18;color:#1a1a1a;margin-top:0.4mm}
.label.card .price{margin-block:auto}
.label .price{margin-top:auto;font-weight:700;line-height:0.96;white-space:nowrap;text-align:end;font-variant-numeric:tabular-nums}
.label .price .now{font-weight:700;vertical-align:baseline}
.label .price .cur{font-weight:700}
.label .foot{flex:0 0 auto;display:flex;flex-direction:row;align-items:last baseline;justify-content:space-between;gap:var(--gap);margin-top:calc(var(--gap) * 0.6)}
.label .foot.single{align-items:baseline}
.label .start{display:flex;flex-direction:column;align-items:flex-start;gap:0.3mm;min-width:0}
.label .unit{font-weight:700;line-height:1.18;white-space:nowrap}
.label .sku{line-height:1.18;color:#1a1a1a;white-space:nowrap}
.label .barcode{direction:ltr;box-sizing:content-box;flex:0 0 auto}
.label .barcode svg{display:block}
.label .digits{display:flex;justify-content:space-between;line-height:1.25;font-variant-numeric:tabular-nums;letter-spacing:0}
`;
