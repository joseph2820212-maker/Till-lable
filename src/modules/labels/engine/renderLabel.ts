/**
 * One label's content → an HTML fragment sized in mm for its box. Pure and deterministic: every size and
 * line break is decided here from real font metrics (textFit.ts), and every money value goes through
 * formatMoney(amountMinor, currencyCode, labelLanguage). No app state, no app language.
 */
import type { BarcodeFormat, LabelKind, LanguageCode, UnitPriceBase } from '../../../domain/types';
import type { Money } from '../../../domain/money';
import { formatMoneyValue } from '../../../domain/formatMoney';
import { escapeHtml } from '../../../utils/htmlEscape';
import { fitSingleLine, fitText, measureMm, PT_PER_MM } from './textFit';
import { formatLabelDate, formatPercent, labelText } from './labelStrings';
import { encodeBarcode, moduleWidthFor, barcodeWidthMm } from './barcode';
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
  | 'barcodeInvalid' | 'nameShortened' | 'secondLineDropped' | 'contentDoesNotFit';

export interface LabelIssue { code: LabelIssueCode; severity: 'error' | 'warning'; detail?: string }

export interface RenderedLabel { html: string; issues: LabelIssue[] }

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
 * Render one label into a box of widthMm × heightMm with the given safe inset. Blocking issues (errors) mean the
 * label must not be printed in this format; warnings describe a controlled shortening.
 */
export function renderLabel(c: LabelContent, box: { widthMm: number; heightMm: number; safeInsetMm: number }, style: LabelStyle = isPromo(c.kind) ? 'promo' : 'standard'): RenderedLabel {
  const issues: LabelIssue[] = [];
  const L = c.language;
  const monies = [c.price, c.was, c.moneyOff, c.unitPrice?.amount, c.multibuy?.total].filter(Boolean) as Money[];
  if (monies.some(m => m.currency !== c.price.currency)) issues.push({ code: 'mixedCurrency', severity: 'error' });
  const missing = required(c);
  if (missing) issues.push({ code: 'missingField', severity: 'error', detail: missing.field });
  if (issues.length) return { html: '', issues };

  const w = box.widthMm - 2 * box.safeInsetMm;
  const h = box.heightMm - 2 * box.safeInsetMm;
  const hPt = h * PT_PER_MM;
  const promoKind = promoOf(c);
  const promo = isPromo(c.kind);

  // Vertical budget in mm, filled top to bottom.
  let used = 0;
  const parts: string[] = [];

  // 1. Promotion band.
  const head = headline(c, promoKind);
  if (head) {
    const bandPt = fitSingleLine(head.text, w - 2, { maxPt: clamp(hPt * 0.16, 7, 48), minPt: 6.5, weight: 'bold' });
    if (bandPt === null) { issues.push({ code: 'contentDoesNotFit', severity: 'error', detail: 'headline' }); return { html: '', issues }; }
    const bandMm = (bandPt * 1.35) / PT_PER_MM;
    parts.push(`<div class="band" style="font-size:${bandPt}pt;height:${r2(bandMm)}mm;line-height:${r2(bandMm)}mm">${head.html}</div>`);
    used += bandMm + 0.6;
  }

  // 2. Barcode (reserved at the bottom so the price keeps its space).
  let barcodeHtml = '';
  let barcodeMm = 0;
  if (c.barcode && (c.kind === 'priceBarcode' || c.barcode)) {
    try {
      const sym = encodeBarcode(c.barcode.value, c.barcode.format, true);
      const barW = Math.min(w * (c.kind === 'priceBarcode' ? 0.62 : 0.5), 40);
      const mod = moduleWidthFor(sym, barW);
      if (mod === null) {
        issues.push({ code: 'barcodeDoesNotFit', severity: c.kind === 'priceBarcode' ? 'error' : 'warning' });
      } else {
        const widthMm = barcodeWidthMm(sym, mod);
        barcodeMm = clamp(h * 0.3, 7, 22);
        const quietL = sym.quietModules[0] * mod;
        barcodeHtml = `<div class="barcode" dir="ltr" style="height:${r2(barcodeMm)}mm;width:${r2(widthMm)}mm;padding-left:${r2(quietL)}mm">${sym.svg.replace('<svg ', `<svg preserveAspectRatio="none" style="width:${r2(sym.modules * mod)}mm;height:${r2(barcodeMm)}mm" `)}</div>`;
      }
    } catch (e) {
      issues.push({ code: 'barcodeInvalid', severity: c.kind === 'priceBarcode' ? 'error' : 'warning', detail: (e as { code?: string }).code });
    }
  }
  if (issues.some(i => i.severity === 'error')) return { html: '', issues };

  // 3. Price (never shrunk below its minimum, never clipped). A "Now" prefix (was/now) is measured with it.
  const priceText = formatMoneyValue(c.price, L);
  const nowWord = promoKind === 'wasNow' ? `${labelText(L, 'now')} ` : '';
  const priceMax = clamp(hPt * (promo ? 0.36 : 0.42), 12, 200);
  const priceMin = clamp(hPt * 0.2, 11, 60);
  const fitPrice = (width: number, maxPt: number): number | null => {
    for (let size = maxPt; size >= priceMin - 1e-9; size -= 0.5) {
      if (measureMm(priceText, size, 'bold') + (nowWord ? measureMm(nowWord, size * 0.4, 'bold') : 0) <= width) return size;
    }
    return null;
  };
  let pricePt = fitPrice(barcodeHtml ? Math.max(w - (w * 0.62 + 1), w * 0.36) : w, priceMax);
  let priceBelowBarcode = false;
  if (pricePt === null && barcodeHtml) {
    // Not enough room beside the barcode: stack the price above it instead of shrinking it below its minimum.
    // Stacked, the price is capped lower so the product name keeps a readable size.
    pricePt = fitPrice(w, Math.max(priceMin, hPt * 0.27));
    priceBelowBarcode = true;
  }
  if (pricePt === null) { issues.push({ code: 'priceDoesNotFit', severity: 'error' }); return { html: '', issues }; }
  const priceMm = (pricePt * 1.08) / PT_PER_MM;

  // 4. Unit price (required for priceUnitPrice; optional elsewhere).
  let unitHtml = '';
  let unitMm = 0;
  if (c.unitPrice) {
    const unitText = labelText(L, 'unitPrice', { price: formatMoneyValue(c.unitPrice.amount, L), base: labelText(L, c.unitPrice.base) });
    const unitPt = fitSingleLine(unitText, w, { maxPt: clamp(hPt * 0.1, 6.5, 22), minPt: 6, weight: 'regular' });
    if (unitPt === null) {
      issues.push({ code: 'unitPriceDoesNotFit', severity: c.kind === 'priceUnitPrice' ? 'error' : 'warning' });
      if (c.kind === 'priceUnitPrice') return { html: '', issues };
    } else {
      unitMm = (unitPt * 1.3) / PT_PER_MM;
      const priceHtml = ltr(formatMoneyValue(c.unitPrice.amount, L));
      const baseHtml = escapeHtml(labelText(L, c.unitPrice.base));
      const composed = labelText(L, 'unitPrice', { price: '\u0000P', base: '\u0000B' });
      unitHtml = `<div class="unit" style="font-size:${unitPt}pt">${escapeHtml(composed).replace('\u0000P', priceHtml).replace('\u0000B', baseHtml)}</div>`;
    }
  }

  // 5. Condition, validity date and SKU (small). Conditions are never hidden: the SKU is dropped first, then the
  // line may wrap to two lines; if even that does not fit, the label is refused rather than hiding a condition.
  const essentials: string[] = [];
  if (c.condition) essentials.push(c.condition);
  if (c.validUntil) essentials.push(labelText(L, 'validUntil', { date: formatLabelDate(c.validUntil, L) }));
  const withSku = c.sku && !barcodeHtml ? [...essentials, c.sku] : essentials;
  const smallMaxPt = clamp(hPt * 0.075, 5.5, 16);
  let smallFit = withSku.length ? fitText(withSku.join(' · '), w, { maxPt: smallMaxPt, minPt: 5.5, maxLines: 1, weight: 'regular' }) : null;
  let smallParts = withSku;
  if (smallFit?.overflow && withSku.length > essentials.length) {
    smallParts = essentials;
    smallFit = essentials.length ? fitText(essentials.join(' · '), w, { maxPt: smallMaxPt, minPt: 5.5, maxLines: 1, weight: 'regular' }) : null;
  }
  if (smallFit?.overflow) smallFit = fitText(smallParts.join(' · '), w, { maxPt: smallMaxPt, minPt: 5.5, maxLines: 2, weight: 'regular' });
  if (smallFit?.overflow && essentials.length) { issues.push({ code: 'contentDoesNotFit', severity: 'error', detail: 'conditions' }); return { html: '', issues }; }
  const smallMm = smallFit ? (smallFit.lines.length * smallFit.sizePt * 1.3) / PT_PER_MM : 0;
  const smallHtml = smallFit ? `<div class="small" style="font-size:${smallFit.sizePt}pt">${smallFit.lines.map(line => line.split(' · ').map(part => (part === c.sku ? ltr(part) : escapeHtml(part))).join(' · ')).join('<br/>')}</div>` : '';

  // 6. Name and second line get what is left.
  const bottomBlock = priceBelowBarcode || !barcodeHtml ? priceMm + barcodeMm : Math.max(priceMm, barcodeMm);
  const remaining = h - used - bottomBlock - unitMm - smallMm - 0.5;
  const nameMax = clamp(hPt * 0.13, 7.5, 44);
  const nameMin = Math.max(6.5, nameMax * 0.62);
  const lineMm = (size: number) => (size * 1.15) / PT_PER_MM;
  const lineCap = h >= 120 ? 4 : h >= 80 ? 3 : 2;
  const linesAtMin = Math.min(lineCap, Math.floor(remaining / lineMm(nameMin)));
  if (linesAtMin < 1) { issues.push({ code: 'contentDoesNotFit', severity: 'error', detail: 'name' }); return { html: '', issues }; }
  // Largest size (0.5 pt steps) whose wrapped lines fit both the line cap and the height left.
  let fitName: ReturnType<typeof fitText> | null = null;
  for (let size = nameMax; size >= nameMin - 1e-9; size -= 0.5) {
    const f = fitText(c.name, w, { maxPt: size, minPt: size, maxLines: lineCap, weight: 'bold' });
    if (!f.overflow && f.lines.length * lineMm(f.sizePt) <= remaining) { fitName = f; break; }
  }
  if (!fitName) fitName = fitText(c.name, w, { maxPt: nameMin, minPt: nameMin, maxLines: linesAtMin, weight: 'bold' });
  if (fitName.overflow) issues.push({ code: 'nameShortened', severity: 'warning' });
  let secondHtml = '';
  if (c.secondLine) {
    const spare = remaining - fitName.lines.length * lineMm(fitName.sizePt);
    const second = fitText(c.secondLine, w, { maxPt: Math.max(6, fitName.sizePt * 0.72), minPt: 6, maxLines: 1, weight: 'regular' });
    if (spare >= lineMm(second.sizePt)) secondHtml = `<div class="second" style="font-size:${second.sizePt}pt">${escapeHtml(second.lines[0] ?? '')}</div>`;
    else issues.push({ code: 'secondLineDropped', severity: 'warning' });
  }

  const nameHtml = `<div class="name" style="font-size:${fitName.sizePt}pt">${fitName.lines.map(escapeHtml).join('<br/>')}</div>`;
  const priceHtml = `<div class="price" style="font-size:${pricePt}pt">${promoKind === 'wasNow' ? `<span class="now">${escapeHtml(labelText(L, 'now'))}</span> ` : ''}${ltr(priceText)}</div>`;
  const bottom = barcodeHtml && !priceBelowBarcode
    ? `<div class="bottom row">${barcodeHtml}${priceHtml}</div>`
    : `<div class="bottom">${priceHtml}${barcodeHtml}</div>`;

  const html = `<div class="label ${style}${promo ? ' promo-kind' : ''}" dir="${L === 'ar' ? 'rtl' : 'ltr'}" lang="${L}" style="font-family:${fontStack(L)};padding:${r2(box.safeInsetMm)}mm;width:${r2(box.widthMm)}mm;height:${r2(box.heightMm)}mm">`
    + parts.join('')
    + `<div class="body">${nameHtml}${secondHtml}</div>`
    + unitHtml
    + smallHtml
    + bottom
    + `</div>`;
  return { html, issues };
}

/** CSS shared by every label (sizes are inline per label). */
export const LABEL_CSS = `
.label{box-sizing:border-box;position:relative;overflow:hidden;display:flex;flex-direction:column;color:#000;background:#fff;text-align:start}
.label .band{font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;border-radius:1mm;margin-bottom:0.6mm}
.label.promo .band{background:#FFD400;color:#000}
.label.inkSaving .band{background:#fff;color:#000;border:0.5mm solid #000}
.label.standard .band{background:#000;color:#fff}
.label .body{flex:1 1 auto;min-height:0;overflow:hidden}
.label .name{font-weight:700;line-height:1.15}
.label .second{line-height:1.15;color:#222}
.label .unit{line-height:1.3;color:#000}
.label .small{line-height:1.3;color:#222}
.label .bottom{display:flex;flex-direction:column;align-items:flex-end}
.label[dir=rtl] .bottom{align-items:flex-start}
.label .bottom.row{flex-direction:row;justify-content:space-between;align-items:flex-end}
.label .price{font-weight:700;line-height:1.08;white-space:nowrap}
.label .price .now{font-size:40%;font-weight:700}
.label .barcode{direction:ltr;flex:0 0 auto;box-sizing:content-box}
.label .barcode svg{display:block}
.label s{text-decoration-thickness:0.3mm}
`;
