/**
 * Catalogue records → printable label content. The catalogue is never changed here; a product whose full name
 * is longer than the label-name counter and has no label name is reported, never cut (owner handout §2).
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { BarcodeFormat, LanguageCode, Product, Promotion, ReductionBatch } from '../../domain/types';
import { printableName } from '../../domain/productLabel';
import { applyMoneyOff, applyPercentOff, unitPrice } from '../../domain/pricing';
import type { LabelContent } from './engine/renderLabel';
import { validateBarcode } from './engine/barcode';
import type { ShelfKind } from '../settings/storage/labelSettings';

export type ContentProblem = 'noLabelName' | 'noBarcode' | 'noUnitPrice' | 'badPromotion';
export type ContentResult = { ok: true; content: LabelContent } | { ok: false; problem: ContentProblem };

export interface ContentOptions { language: LanguageCode; kind?: ShelfKind; extraDecimals?: 0 | 1 | 2 }

/** The first stored barcode that can be printed, exactly as stored (never rewritten). */
export function printableBarcode(p: Pick<Product, 'barcodes'>): { value: string; format: BarcodeFormat } | null {
  for (const b of p.barcodes ?? []) {
    const candidates: { value: string; format: BarcodeFormat }[] = [];
    if (b.format !== 'unknown') candidates.push({ value: b.format === 'upca' && b.normalized.length === 13 ? b.normalized.slice(1) : b.raw.trim(), format: b.format });
    if (/^\d{13}$/.test(b.normalized)) candidates.push({ value: b.normalized, format: 'ean13' });
    if (/^\d{8}$/.test(b.raw.trim())) candidates.push({ value: b.raw.trim(), format: 'ean8' });
    for (const c of candidates) if (validateBarcode(c.value, c.format) === null) return c;
  }
  return null;
}

function base(p: Product, o: ContentOptions): { ok: true; content: LabelContent } | { ok: false; problem: ContentProblem } {
  const name = printableName(p);
  if (!name) return { ok: false, problem: 'noLabelName' };
  const c: LabelContent = { kind: 'standardPrice', language: o.language, name, price: p.price };
  if (p.secondLine?.trim()) c.secondLine = p.secondLine.trim();
  if (p.sku?.trim()) c.sku = p.sku.trim();
  if (p.unitPriceBase) {
    const up = unitPrice(p.price, p.sellingUnit, p.unitPriceBase, o.extraDecimals ?? 0);
    if (up) c.unitPrice = { amount: up, base: p.unitPriceBase, extraDecimals: o.extraDecimals ?? 0 };
  }
  return { ok: true, content: c };
}

export function productContent(p: Product, o: ContentOptions): ContentResult {
  const r = base(p, o);
  if (!r.ok) return r;
  const kind = o.kind ?? p.labelKind ?? 'standardPrice';
  const c = { ...r.content, kind };
  if (kind === 'priceBarcode') {
    const bc = printableBarcode(p);
    if (!bc) return { ok: false, problem: 'noBarcode' };
    c.barcode = bc;
  }
  if (kind === 'priceUnitPrice' && !c.unitPrice) return { ok: false, problem: 'noUnitPrice' };
  if (kind === 'standardPrice') delete c.unitPrice;
  return { ok: true, content: c };
}

/** A promotion on one product. The product's normal price is never changed by a promotion (TL-02). */
export function promotionContent(promo: Promotion, p: Product, o: ContentOptions & { withBarcode?: boolean }): ContentResult {
  const r = base(p, o);
  if (!r.ok) return r;
  const c: LabelContent = { ...r.content };
  try {
    switch (promo.type.kind) {
      case 'wasNow': c.kind = 'wasNow'; c.was = promo.type.referencePrice; break;
      case 'percentOff': c.kind = 'percentOff'; c.percentOffHundredths = promo.type.percentHundredths; c.price = applyPercentOff(p.price, promo.type.percentHundredths); break;
      case 'moneyOff': c.kind = 'moneyOff'; c.moneyOff = promo.type.amount; c.price = applyMoneyOff(p.price, promo.type.amount); break;
      case 'multibuy': c.kind = 'multibuy'; c.multibuy = { quantity: promo.type.quantity, total: promo.type.totalPrice }; break;
      case 'conditional': c.kind = 'memberPrice'; c.condition = promo.type.condition; c.price = promo.type.conditionalPrice; break;
    }
  } catch {
    return { ok: false, problem: 'badPromotion' };
  }
  if (promo.type.kind !== 'conditional' && promo.conditions?.trim()) c.condition = promo.conditions.trim();
  if (promo.endDate) c.validUntil = promo.endDate;
  if (c.unitPrice && c.price !== p.price) {
    const up = p.unitPriceBase ? unitPrice(c.price, p.sellingUnit, p.unitPriceBase, o.extraDecimals ?? 0) : null;
    if (up) c.unitPrice = { ...c.unitPrice, amount: up }; else delete c.unitPrice;
  }
  if (o.withBarcode) { const bc = printableBarcode(p); if (bc) c.barcode = bc; }
  return { ok: true, content: c };
}

export function reductionContent(r: ReductionBatch, o: ContentOptions, product?: Product): LabelContent {
  const c: LabelContent = { kind: 'reducedToClear', language: o.language, name: r.productName, price: r.reducedPrice, was: r.normalPrice };
  if (product?.secondLine) c.secondLine = product.secondLine;
  if (product?.sku) c.sku = product.sku;
  return c;
}

/** Hash of everything that appears on the printed label (stable key order). */
export function contentFingerprint(c: LabelContent): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as object).sort().filter(k => (v as Record<string, unknown>)[k] !== undefined).map(k => [k, stable((v as Record<string, unknown>)[k])]));
    return v;
  };
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(stable(c))))).slice(0, 24);
}
