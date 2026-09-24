/**
 * One label's content → an HTML fragment sized in mm for its box. Pure and deterministic: every size and
 * line break is decided here from real font metrics (textFit.ts), and every money value goes through
 * formatMoney(amountMinor, currencyCode, labelLanguage). No app state, no app language.
 */
import type { BarcodeFormat, LabelKind, LanguageCode, UnitPriceBase } from '../../../domain/types';
import type { Money } from '../../../domain/money';
import { formatMoneyParts, formatMoneyValue } from '../../../domain/formatMoney';
import { escapeHtml } from '../../../utils/htmlEscape';
import { measureMm, wrapLines } from './textFit';
import { LABEL_NAME_MAX, LayoutIncompatibleError, MIN_MODULE_MM, layoutHasBand, symbolRatio, templateFor, type LabelLayout } from './labelTemplate';
import { formatLabelDate, formatPercentText, labelText } from './labelStrings';
import { encodeBarcode } from './barcode';
import { fontStack } from './fonts';


export interface LabelContent {
  kind: LabelKind;
  /** Printed-label language (independent of the app language and of the currency). */
  language: LanguageCode;
  /**
   * The PRINTABLE label name (Product.labelName, or the full product name when it fits). The product's full
   * catalogue name is never shortened to make a label fit (handout §2).
   */
  name: string;
  secondLine?: string;
  /** The price the customer pays now (for was/now: the "now" price). */
  price: Money;
  /**
   * Unit price. `extraDecimals` lets a unit price carry more precision than the selling price where a country
   * profile needs it (the amount is then in 1/10^extraDecimals of a minor unit).
   */
  unitPrice?: { amount: Money; base: UnitPriceBase; extraDecimals?: 0 | 1 | 2 };
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

/** standard = white, no fill · promo = yellow offer band · inkSaving = no fill (for coloured stock). */
export type LabelStyle = 'standard' | 'promo' | 'inkSaving';

export interface RenderOptions {
  style?: LabelStyle;
  /** Print the barcode on a promotion label too — only where the format's compatibility matrix allows it. */
  promoBarcode?: boolean;
  /** Print the SKU. Default: on for shelf tickets, off for customer-facing offer cards. */
  showSku?: boolean;
}

export type LabelIssueCode =
  | 'mixedCurrency' | 'missingField' | 'unitPriceDoesNotFit' | 'barcodeDoesNotFit' | 'barcodeInvalid'
  /** The printable label name is over the label-name counter (LABEL_NAME_MAX): edit the label name. */
  | 'tooLong'
  /** Within its counter but too wide for the fixed size: edit the printable text or choose a larger format. */
  | 'tooWide'
  /** The price is wider than this format's fixed price area: "This price needs a larger label format". */
  | 'priceDoesNotFit'
  /** The requested layout (e.g. promotion + barcode) is not available on this format. */
  | 'layoutIncompatible'
  /** Optional field left off this label because it does not fit (the stored value is untouched). */
  | 'skuOmitted';

export interface LabelIssue { code: LabelIssueCode; severity: 'error' | 'warning'; detail?: string }

export { isCardFormat } from './labelTemplate';

/** Sizes a label was rendered at (for evidence and tests). */
export interface LabelMetrics { layout: LabelLayout; namePt: number; pricePt: number }

export interface RenderedLabel { html: string; issues: LabelIssue[]; metrics?: LabelMetrics }

const PROMO_KINDS: LabelKind[] = ['wasNow', 'percentOff', 'moneyOff', 'multibuy', 'reducedToClear', 'memberPrice'];
export const isPromoKind = (k: LabelKind): boolean => PROMO_KINDS.includes(k) || k.startsWith('offerCard');
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

/** The layout a label prints in: decided by what it shows, never by how long its text is. */
export function layoutFor(c: LabelContent, opts: RenderOptions = {}): LabelLayout {
  if (isPromoKind(c.kind)) {
    if (opts.promoBarcode && c.barcode) return 'promoBarcode';
    return c.condition || c.validUntil ? 'promoDetail' : 'promo';
  }
  if (c.kind === 'priceBarcode') return 'barcode';
  if (c.kind === 'priceUnitPrice' || c.unitPrice) return 'unitPrice';
  return 'standard';
}

/**
 * The promotion headline for the band, in the label language, as { text (for measuring), html }. The words keep
 * the label's own direction; numbers, amounts and percentages (sign included) are isolated left-to-right, so an
 * Arabic label reads "خصم 25٪" and never "%25 خصم".
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
    case 'percentOff': return build('percentOff', { percent: formatPercentText(c.percentOffHundredths as number, L) });
    case 'moneyOff': return build('moneyOff', { amount: formatMoneyValue(c.moneyOff as Money, L) });
    case 'multibuy': return build('multibuy', { quantity: (c.multibuy as { quantity: number }).quantity, price: formatMoneyValue((c.multibuy as { total: Money }).total, L) });
    case 'reducedToClear': return { text: labelText(L, 'reduced'), html: escapeHtml(labelText(L, 'reduced')) };
    case 'memberPrice': return { text: labelText(L, 'memberPrice'), html: escapeHtml(labelText(L, 'memberPrice')) };
    default: return null;
  }
}

/**
 * Render one label into a box at the FIXED sizes of its {format + layout} (labelTemplate.ts). Nothing shrinks:
 * required content that does not fit is refused with a reason the screens can show; an optional SKU that does
 * not fit is left off with a warning (the stored value is never changed).
 *
 *   [offer band]                                   promotions only
 *   label name (bold, fixed size, N lines max)
 *   pack size / second line
 *   condition · validity                           promotions only
 *   [Now] PRICE                                    tickets: end-aligned row · cards: centred in the free area
 *   start: unit price / SKU        end: barcode    per layout
 * Arabic labels mirror the columns; prices, codes and bars stay left-to-right.
 */
export function renderLabel(c: LabelContent, box: { widthMm: number; heightMm: number; safeInsetMm: number }, options: RenderOptions = {}): RenderedLabel {
  const issues: LabelIssue[] = [];
  const L = c.language;
  const style: LabelStyle = options.style ?? (isPromoKind(c.kind) ? 'promo' : 'standard');
  const monies = [c.price, c.was, c.moneyOff, c.unitPrice?.amount, c.multibuy?.total].filter(Boolean) as Money[];
  if (monies.some(m => m.currency !== c.price.currency)) issues.push({ code: 'mixedCurrency', severity: 'error' });
  const missing = required(c);
  if (missing) issues.push({ code: 'missingField', severity: 'error', detail: missing.field });
  if (issues.length) return { html: '', issues };
  const fail = (code: LabelIssueCode, detail?: string): RenderedLabel => ({ html: '', issues: [...issues, { code, severity: 'error', detail }] });

  const layout = layoutFor(c, options);
  let t;
  try { t = templateFor(box, layout); } catch (e) {
    if (e instanceof LayoutIncompatibleError) return fail('layoutIncompatible', layout);
    throw e;
  }
  const { widthMm: w, gapMm: gap } = t;
  const promoKind = promoOf(c);
  const showSku = options.showSku ?? !t.isCard;

  // ── Printable label name: the one counted field; everything else is measured at the fixed size ─────
  if ([...c.name].length > LABEL_NAME_MAX) return fail('tooLong', 'name');

  // ── Offer band (fixed size) ───────────────────────────────────────────────────────────────────────
  let bandHtml = '';
  const head = layoutHasBand(layout) ? headline(c, promoKind) : null;
  if (head) {
    if (measureMm(head.text, t.bandPt, 'bold') > w - 3 * t.scale) return fail('tooWide', 'headline');
    bandHtml = `<div class="band" style="height:${r2(t.bandMm)}mm;font-size:${t.bandPt}pt"><span>${head.html}</span></div>`;
  }

  // ── Head: name, pack size, condition ──────────────────────────────────────────────────────────────
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
    // A condition that cannot fit this format is not squeezed: the member-price layout needs a larger label.
    if (lines.length > Math.max(t.smallLines, 1)) return fail('tooWide', 'condition');
    smallHtml = `<div class="small" style="font-size:${t.smallPt}pt">${lines.map(l => escapeHtml(l)).join('<br/>')}</div>`;
  }

  // ── Price: fixed size; measured, never capped by a digit count ────────────────────────────────────
  const parts = formatMoneyParts(c.price.minor, c.price.currency, L);
  const symRatio = symbolRatio(parts.wordSymbol);
  const arabicSymbol = /[؀-ۿ]/.test(parts.symbol);
  const nowWord = promoKind === 'wasNow' ? labelText(L, 'now') : '';
  const descender = arabicSymbol ? 0.3 : 0.16;
  const priceWidth = measureMm(parts.number, t.pricePt, 'bold') + measureMm(parts.symbol + parts.space, t.pricePt * symRatio, 'bold');
  const inlineNow = nowWord && t.nowInline ? measureMm(`${nowWord} `, t.nowPt, 'bold') : 0;
  if (priceWidth + inlineNow > w + 0.01) return fail('priceDoesNotFit', 'needsLargerFormat');
  const sym = `<span class="cur" style="font-size:${Math.round(symRatio * 100)}%">${escapeHtml(parts.symbol)}</span>`;
  const amount = parts.symbolPosition === 'before' ? `${sym}${parts.space ? '&nbsp;' : ''}${escapeHtml(parts.number)}` : `${escapeHtml(parts.number)}&nbsp;${sym}`;
  let priceHtml: string;
  if (t.isCard) {
    const nowInlineHtml = nowWord && t.nowInline ? `<span class="now" style="font-size:${t.nowPt}pt">${escapeHtml(nowWord)}</span> ` : '';
    const nowLine = nowWord && !t.nowInline ? `<div class="nowline" style="font-size:${t.nowPt}pt">${escapeHtml(nowWord)}</div>` : '';
    priceHtml = `<div class="pricebox">${nowLine}<div class="price" style="font-size:${t.pricePt}pt;padding-bottom:${descender}em">${nowInlineHtml}<bdi dir="ltr">${amount}</bdi></div></div>`;
  } else {
    const nowHtml = nowWord ? `<span class="now" style="font-size:${t.nowPt}pt">${escapeHtml(nowWord)}</span> ` : '';
    priceHtml = `<div class="price" style="font-size:${t.pricePt}pt;padding-bottom:${descender}em">${nowHtml}<bdi dir="ltr">${amount}</bdi></div>`;
  }

  // ── Bottom row ────────────────────────────────────────────────────────────────────────────────────
  let codeHtml = '';
  if (layout === 'barcode' || layout === 'promoBarcode') {
    const bc = c.barcode;
    if (bc) {
      try {
        const sym2 = encodeBarcode(bc.value, bc.format, false);
        const mod = Math.max(MIN_MODULE_MM, t.moduleMm);
        const [ql, qr] = sym2.quietModules.map(q => q * mod);
        const barsW = sym2.modules * mod;
        if (barsW + ql + qr > t.barcodeReserveMm + 0.01) return fail('barcodeDoesNotFit');
        // Bars are always left-to-right, never truncated or rewritten, with both quiet zones inside the label.
        const svg = sym2.svg.replace('<svg ', `<svg preserveAspectRatio="none" style="width:${r2(barsW)}mm;height:${r2(t.barsMm)}mm" `);
        const digits = [...bc.value].map(d => `<span>${d}</span>`).join('');
        codeHtml = `<div class="barcode" dir="ltr" style="width:${r2(barsW)}mm;padding:0 ${r2(qr)}mm 0 ${r2(ql)}mm">${svg}<div class="digits" style="font-size:${t.digitPt}pt">${digits}</div></div>`;
      } catch (e) {
        return fail('barcodeInvalid', (e as { code?: string }).code);
      }
    }
  }
  const startRoom = codeHtml ? w - t.barcodeReserveMm - gap : w;
  const startParts: string[] = [];
  let unitWidth = 0;
  if (c.unitPrice) {
    const up = formatMoneyParts(c.unitPrice.amount.minor, c.unitPrice.amount.currency, L, c.unitPrice.extraDecimals ?? 0);
    const upText = up.symbolPosition === 'after' ? `${up.number}${up.space}${up.symbol}` : `${up.symbol}${up.space}${up.number}`;
    const base = labelText(L, c.unitPrice.base);
    const text = labelText(L, 'unitPrice', { price: upText, base });
    unitWidth = measureMm(text, t.unitPt, 'bold');
    if (unitWidth > startRoom) {
      if (c.kind === 'priceUnitPrice') return fail('unitPriceDoesNotFit');
      issues.push({ code: 'unitPriceDoesNotFit', severity: 'warning' });
      unitWidth = 0;
    } else {
      const composed = escapeHtml(labelText(L, 'unitPrice', { price: '\u0000P', base: '\u0000B' })).replace('\u0000P', ltr(upText)).replace('\u0000B', escapeHtml(base));
      startParts.push(`<div class="unit" style="font-size:${t.unitPt}pt">${composed}</div>`);
    }
  }
  let skuHtml = '';
  if (c.sku && showSku) {
    // On a single-line promotion foot the SKU shares the line with the unit price.
    const room = layout === 'promo' || layout === 'promoDetail' ? w - unitWidth - (unitWidth ? gap : 0) : startRoom;
    if (measureMm(c.sku, t.skuPt, 'regular') > room) issues.push({ code: 'skuOmitted', severity: 'warning' });
    else skuHtml = `<div class="sku" style="font-size:${t.skuPt}pt">${ltr(c.sku)}</div>`;
  }
  let foot = '';
  if (layout === 'promo' || layout === 'promoDetail') {
    if (startParts.length || skuHtml) foot = `<div class="foot single">${startParts.join('')}${skuHtml}</div>`;
  } else if (startParts.length || skuHtml || codeHtml) {
    foot = `<div class="foot"><div class="start">${startParts.join('')}${skuHtml}</div>${codeHtml}</div>`;
  }

  const html = `<div class="label ${style} layout-${layout}${t.isCard ? ' card' : ''}" dir="${L === 'ar' ? 'rtl' : 'ltr'}" lang="${L}" style="font-family:${fontStack(L)};padding:${r2(box.safeInsetMm)}mm;width:${r2(box.widthMm)}mm;height:${r2(box.heightMm)}mm;--gap:${r2(gap)}mm">`
    + bandHtml
    + `<div class="head">${nameHtml}${secondHtml}${smallHtml}</div>`
    + priceHtml
    + foot
    + `</div>`;
  return { html, issues, metrics: { layout, namePt: t.namePt, pricePt: t.pricePt } };
}

/** CSS shared by every label (sizes are inline per label). Standard labels print white with no fill. */
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
.label .price{margin-top:auto;font-weight:700;line-height:0.96;white-space:nowrap;text-align:end;font-variant-numeric:tabular-nums}
.label .price .now{font-weight:700;vertical-align:baseline}
.label .price .cur{font-weight:700}
.label.card .second{margin-top:0.3em}
.label.card .pricebox{margin-block:auto;display:flex;flex-direction:column;align-items:center;text-align:center}
.label.card .pricebox .price{margin-top:0;text-align:center}
.label.card .nowline{font-weight:700;line-height:1.1}
.label .foot{flex:0 0 auto;display:flex;flex-direction:row;align-items:last baseline;justify-content:space-between;gap:var(--gap);margin-top:calc(var(--gap) * 0.6)}
.label .foot.single{align-items:baseline}
.label .start{display:flex;flex-direction:column;align-items:flex-start;gap:0.3mm;min-width:0}
.label .unit{font-weight:700;line-height:1.18;white-space:nowrap}
.label .sku{line-height:1.18;color:#1a1a1a;white-space:nowrap}
.label .barcode{direction:ltr;box-sizing:content-box;flex:0 0 auto}
.label .barcode svg{display:block}
.label .digits{display:flex;justify-content:space-between;line-height:1.25;font-variant-numeric:tabular-nums;letter-spacing:0}
`;
