/**
 * One label's content → an HTML fragment sized in mm for its box. Pure and deterministic: every size and
 * line break is decided here from real font metrics (textFit.ts), and every money value goes through
 * formatMoney(amountMinor, currencyCode, labelLanguage). No app state, no app language.
 */
import type { BarcodeFormat, LabelKind, LanguageCode, UnitPriceBase } from '../../../domain/types';
import type { Money } from '../../../domain/money';
import { formatMoneyParts, formatMoneyValue } from '../../../domain/formatMoney';
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

/** Labels at least this tall (inner mm) are offer cards: each stands alone, price first, no sheet-wide size cap. */
export const CARD_MIN_HEIGHT_MM = 80;
export const isCardFormat = (innerHeightMm: number): boolean => innerHeightMm >= CARD_MIN_HEIGHT_MM;

/** Sizes a label was rendered at; a sheet uses the smallest of each so every label on it matches. */
export interface LabelMetrics { namePt: number; pricePt: number }

export interface RenderedLabel { html: string; issues: LabelIssue[]; metrics?: LabelMetrics }

/** Upper limits imposed by the sheet (uniform sizing). A label never goes above them. */
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
 * Render one label into a box of widthMm × heightMm with the given safe inset.
 *
 * Layout (the same template at every size, scaled from the 70 × 38 mm ticket):
 *   [promotion band]                          optional, full width
 *   product name (bold, up to 2 lines)        top, start-aligned
 *   pack size / second line                   small
 *   conditions · validity                     small, only when present
 *   ─ bottom row, one shared bottom line ─
 *   start side: unit price, then barcode (or SKU)      end side: price
 * Arabic labels mirror the columns; prices, codes and bars stay left-to-right.
 * Blocking issues (errors) mean the label must not be printed in this format.
 */
export function renderLabel(c: LabelContent, box: { widthMm: number; heightMm: number; safeInsetMm: number }, style: LabelStyle = isPromo(c.kind) ? 'promo' : 'standard', caps: SizeCaps = {}): RenderedLabel {
  const issues: LabelIssue[] = [];
  const L = c.language;
  const monies = [c.price, c.was, c.moneyOff, c.unitPrice?.amount, c.multibuy?.total].filter(Boolean) as Money[];
  if (monies.some(m => m.currency !== c.price.currency)) issues.push({ code: 'mixedCurrency', severity: 'error' });
  const missing = required(c);
  if (missing) issues.push({ code: 'missingField', severity: 'error', detail: missing.field });
  if (issues.length) return { html: '', issues };
  const fail = (code: LabelIssueCode, detail?: string): RenderedLabel => ({ html: '', issues: [...issues, { code, severity: 'error', detail }] });

  const w = box.widthMm - 2 * box.safeInsetMm;
  const h = box.heightMm - 2 * box.safeInsetMm;
  const k = clamp(h / 34, 0.6, 7);            // scale from the 70 × 38 mm ticket (34 mm inner height)
  const gap = 1.1 * k;                         // one vertical rhythm for every zone
  const promoKind = promoOf(c);
  const ptToMm = (pt: number) => pt / PT_PER_MM;
  const line = (pt: number, lh = 1.18) => ptToMm(pt) * lh;

  // ── Promotion band ───────────────────────────────────────────────────────────
  let bandHtml = '';
  let bandMm = 0;
  const head = headline(c, promoKind);
  if (head) {
    const bandPt = fitSingleLine(head.text, w - 3 * k, { maxPt: 11.5 * k, minPt: 6.5, weight: 'bold' });
    if (bandPt === null) return fail('contentDoesNotFit', 'headline');
    bandMm = Math.max(6 * k, line(bandPt, 1.45));
    bandHtml = `<div class="band" style="height:${r2(bandMm)}mm;font-size:${r2(bandPt)}pt"><span>${head.html}</span></div>`;
  }

  // ── Price parts (symbol sized separately) ────────────────────────────────────
  const parts = formatMoneyParts(c.price.minor, c.price.currency, L);
  const symRatio = parts.wordSymbol ? 0.58 : 0.78;
  const arabicSymbol = /[؀-ۿ]/.test(parts.symbol);
  const priceWidthAt = (pt: number) => measureMm(parts.number, pt, 'bold') + measureMm(parts.symbol + parts.space, pt * symRatio, 'bold');
  const nowWord = promoKind === 'wasNow' ? labelText(L, 'now') : '';
  const descender = arabicSymbol ? 0.3 : 0.16;                 // room for "," and Arabic letters below the line
  const priceBoxMm = (pt: number) => ptToMm(pt) * (0.96 + descender) + (nowWord ? line(pt * 0.3) : 0);

  // ── Start column of the bottom row: unit price + barcode (or SKU) ────────────
  let unitHtml = '';
  let unitMm = 0;
  let unitWidth = 0;
  if (c.unitPrice) {
    const up = formatMoneyValue(c.unitPrice.amount, L);
    const base = labelText(L, c.unitPrice.base);
    const text = labelText(L, 'unitPrice', { price: up, base });
    const unitPt = fitSingleLine(text, w * 0.55, { maxPt: 7.5 * k, minPt: 6, weight: 'bold' });
    if (unitPt === null) {
      issues.push({ code: 'unitPriceDoesNotFit', severity: c.kind === 'priceUnitPrice' ? 'error' : 'warning' });
      if (c.kind === 'priceUnitPrice') return { html: '', issues };
    } else {
      const composed = escapeHtml(labelText(L, 'unitPrice', { price: '\u0000P', base: '\u0000B' })).replace('\u0000P', ltr(up)).replace('\u0000B', escapeHtml(base));
      unitHtml = `<div class="unit" style="font-size:${r2(unitPt)}pt">${composed}</div>`;
      unitMm = line(unitPt);
      unitWidth = measureMm(text, unitPt, 'bold');
    }
  }

  let codeHtml = '';
  let codeMm = 0;
  let codeWidth = 0;
  if (c.barcode) {
    try {
      const sym = encodeBarcode(c.barcode.value, c.barcode.format, false);
      const mod = moduleWidthFor(sym, Math.min(w * 0.5, 42 * k));
      if (mod === null) {
        issues.push({ code: 'barcodeDoesNotFit', severity: c.kind === 'priceBarcode' ? 'error' : 'warning' });
      } else {
        const barsW = sym.modules * mod;
        const barsH = clamp(h * 0.22, 5.5, 26);
        const digitPt = clamp(6.2 * k, 5.2, 16);
        const [ql, qr] = sym.quietModules.map(q => q * mod);
        const svg = sym.svg.replace('<svg ', `<svg preserveAspectRatio="none" style="width:${r2(barsW)}mm;height:${r2(barsH)}mm" `);
        const digits = [...c.barcode.value].map(d => `<span>${d}</span>`).join('');
        // Quiet zones are required blank space for scanning. The start zone may overlap the label's own safe
        // inset (blank label edge) but is never shortened: blank space to the label edge is always >= ql.
        const pullIn = Math.min(ql, box.safeInsetMm);
        const ltrLabel = L !== 'ar';
        const padStart = ql, padEnd = qr;
        const [padLeft, padRight] = ltrLabel ? [padStart, padEnd] : [padEnd, padStart];
        const [mLeft, mRight] = ltrLabel ? [-pullIn, 0] : [0, -pullIn];
        codeHtml = `<div class="barcode" dir="ltr" style="width:${r2(barsW)}mm;padding:0 ${r2(padRight)}mm 0 ${r2(padLeft)}mm;margin:0 ${r2(mRight)}mm 0 ${r2(mLeft)}mm">${svg}<div class="digits" style="font-size:${r2(digitPt)}pt">${digits}</div></div>`;
        codeMm = barsH + line(digitPt, 1.25);
        codeWidth = barsW + ql + qr - pullIn;
      }
    } catch (e) {
      issues.push({ code: 'barcodeInvalid', severity: c.kind === 'priceBarcode' ? 'error' : 'warning', detail: (e as { code?: string }).code });
    }
    if (issues.some(i => i.severity === 'error')) return { html: '', issues };
  }
  if (!codeHtml && c.sku) {
    const skuPt = clamp(6 * k, 5.5, 14);
    codeHtml = `<div class="sku" style="font-size:${r2(skuPt)}pt">${ltr(c.sku)}</div>`;
    codeMm = line(skuPt);
    codeWidth = measureMm(c.sku, skuPt, 'regular');
  }
  const startMm = unitMm + codeMm + (unitHtml && codeHtml ? 0.6 * k : 0);
  const startWidth = Math.max(unitWidth, codeWidth);

  // ── Head: name, second line, conditions ──────────────────────────────────────
  const small: string[] = [];
  if (c.condition) small.push(c.condition);
  if (c.validUntil) small.push(labelText(L, 'validUntil', { date: formatLabelDate(c.validUntil, L) }));
  const smallFit = small.length ? fitText(small.join(' · '), w, { maxPt: 6.8 * k, minPt: 5.5, maxLines: 2, weight: 'regular' }) : null;
  if (smallFit?.overflow) return fail('contentDoesNotFit', 'conditions');
  const smallMm = smallFit ? smallFit.lines.length * line(smallFit.sizePt) : 0;

  const nameMax = Math.min(10.5 * k, caps.namePt ?? Infinity);
  const nameMin = Math.min(nameMax, Math.max(7, 7.2 * k));
  const lineCap = h >= 120 ? 4 : isCardFormat(h) ? 3 : 2;
  const secondPt = clamp(7 * k, 6, 30);

  // Price: as large as the height and width allow, never below its minimum, never above the sheet cap.
  // Minimum is about legibility: full scale on tickets, growing gently on large cards so wide prices still fit.
  const priceMin = k <= 1 ? Math.max(11, 17 * k) : 17 + 8 * (k - 1);
  const priceMax = Math.min(34 * k, caps.pricePt ?? Infinity);

  const layout = (namePt: number, besideStart: boolean) => {
    const f = fitText(c.name, w, { maxPt: namePt, minPt: namePt, maxLines: lineCap, weight: 'bold' });
    const secondMm = c.secondLine ? line(secondPt) : 0;
    const headMm = f.lines.length * line(namePt, 1.12) + secondMm + (smallMm ? smallMm + 0.4 * k : 0);
    const fixed = bandMm + (bandMm ? gap * 0.6 : 0) + headMm + gap;
    const room = h - fixed;
    const priceRoomW = besideStart && startWidth ? w - startWidth - gap * 1.5 : w;
    let pt: number | null = null;
    for (let size = priceMax; size >= priceMin - 1e-9; size -= 0.5) {
      const rowMm = besideStart ? Math.max(priceBoxMm(size), startMm) : priceBoxMm(size) + (startMm ? startMm + gap * 0.6 : 0);
      if (priceWidthAt(size) <= priceRoomW && rowMm <= room) { pt = size; break; }
    }
    return { f, pt, headMm };
  };

  let chosen: { f: ReturnType<typeof fitText>; pt: number; beside: boolean; namePt: number } | null = null;
  const nameFits = (namePt: number) => { const f = fitText(c.name, w, { maxPt: namePt, minPt: namePt, maxLines: lineCap, weight: 'bold' }); return f.overflow ? null : f; };
  if (!isCardFormat(h)) {
    // Shelf tickets: one calm arrangement. Name first (largest that still leaves a legal price), price beside the
    // unit price / barcode; stacked only when the price cannot fit beside them at its minimum.
    for (const beside of [true, false]) {
      for (let namePt = nameMax; namePt >= nameMin - 1e-9 && !chosen; namePt -= 0.5) {
        const r = layout(namePt, beside);
        if (!r.f.overflow && r.pt !== null) chosen = { f: r.f, pt: r.pt, beside, namePt };
      }
      if (chosen) break;
    }
  } else {
    // Offer cards: the price is the hero. Largest price in either arrangement, then the largest name around it.
    for (const beside of [true, false]) {
      const atMinName = layout(nameMin, beside);
      if (atMinName.pt === null || !nameFits(nameMin)) continue;
      const pricePt = atMinName.pt;
      if (chosen && chosen.pt >= pricePt) continue;
      for (let namePt = nameMax; namePt >= nameMin - 1e-9; namePt -= 0.5) {
        const r = layout(namePt, beside);
        if (!r.f.overflow && r.pt !== null && r.pt >= pricePt - 1e-9) { chosen = { f: r.f, pt: pricePt, beside, namePt }; break; }
      }
    }
  }
  if (!chosen) {
    // Last resort: shorten the name (reported) rather than the price.
    for (const beside of [true, false]) {
      const r = layout(nameMin, beside);
      if (r.pt !== null) { chosen = { f: fitText(c.name, w, { maxPt: nameMin, minPt: nameMin, maxLines: lineCap, weight: 'bold' }), pt: r.pt, beside, namePt: nameMin }; break; }
    }
  }
  if (!chosen) return fail('priceDoesNotFit');
  if (chosen.f.overflow) issues.push({ code: 'nameShortened', severity: 'warning' });

  let secondHtml = '';
  if (c.secondLine) {
    const sf = fitText(c.secondLine, w, { maxPt: secondPt, minPt: secondPt, maxLines: 1, weight: 'regular' });
    if (sf.overflow) issues.push({ code: 'secondLineDropped', severity: 'warning' });
    secondHtml = `<div class="second" style="font-size:${r2(secondPt)}pt">${escapeHtml(sf.lines[0] ?? '')}</div>`;
  }
  const smallHtml = smallFit ? `<div class="small" style="font-size:${r2(smallFit.sizePt)}pt">${smallFit.lines.map(l => escapeHtml(l)).join('<br/>')}</div>` : '';
  const nameHtml = `<div class="name" style="font-size:${r2(chosen.namePt)}pt">${chosen.f.lines.map(l => escapeHtml(l)).join('<br/>')}</div>`;

  const pt = chosen.pt;
  const sym = `<span class="cur" style="font-size:${Math.round(symRatio * 100)}%">${escapeHtml(parts.symbol)}</span>`;
  const amount = parts.symbolPosition === 'before' ? `${sym}${parts.space ? '&nbsp;' : ''}${escapeHtml(parts.number)}` : `${escapeHtml(parts.number)}&nbsp;${sym}`;
  const nowHtml = nowWord ? `<div class="now" style="font-size:${r2(pt * 0.3)}pt">${escapeHtml(nowWord)}</div>` : '';
  const priceHtml = `<div class="price" style="font-size:${r2(pt)}pt;padding-bottom:${descender}em">${nowHtml}<bdi dir="ltr">${amount}</bdi></div>`;
  const startHtml = unitHtml || codeHtml ? `<div class="start">${unitHtml}${codeHtml}</div>` : '';
  const bottom = chosen.beside
    ? `<div class="bottom beside">${startHtml}${priceHtml}</div>`
    : `<div class="bottom stacked">${priceHtml}${startHtml}</div>`;

  const html = `<div class="label ${style}${isPromo(c.kind) ? ' promo-kind' : ''}" dir="${L === 'ar' ? 'rtl' : 'ltr'}" lang="${L}" style="font-family:${fontStack(L)};padding:${r2(box.safeInsetMm)}mm;width:${r2(box.widthMm)}mm;height:${r2(box.heightMm)}mm;--gap:${r2(gap)}mm">`
    + bandHtml
    + `<div class="head">${nameHtml}${secondHtml}${smallHtml}</div>`
    + bottom
    + `</div>`;
  return { html, issues, metrics: { namePt: chosen.namePt, pricePt: pt } };
}

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
.label .second{line-height:1.18;color:#1a1a1a;margin-top:0.3mm}
.label .small{line-height:1.18;color:#1a1a1a;margin-top:0.4mm}
.label .bottom{margin-top:auto;flex:0 0 auto;display:flex}
.label .bottom.beside{flex-direction:row;align-items:last baseline;justify-content:space-between;gap:var(--gap)}
.label .bottom.stacked{flex-direction:column;justify-content:flex-end;align-items:flex-end;gap:calc(var(--gap) * 0.6)}
.label .bottom.stacked .start{align-self:flex-start}
.label .start{display:flex;flex-direction:column;align-items:flex-start;gap:0.6mm;flex:0 0 auto}
.label .unit{font-weight:700;line-height:1.18;white-space:nowrap}
.label .sku{line-height:1.18;color:#1a1a1a;white-space:nowrap}
.label .barcode{direction:ltr;box-sizing:content-box;flex:0 0 auto}
.label .barcode svg{display:block}
.label .digits{display:flex;justify-content:space-between;line-height:1.25;font-variant-numeric:tabular-nums;letter-spacing:0}
.label .price{font-weight:700;line-height:0.96;white-space:nowrap;text-align:end;flex:0 0 auto;font-variant-numeric:tabular-nums}
.label .price .now{font-weight:700;line-height:1.18}
.label .price .cur{font-weight:700}
`;
