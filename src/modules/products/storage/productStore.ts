/**
 * The product catalogue. Source data is stored as imported or typed (owner handout §2–§4): the full name, SKU and
 * barcodes are never shortened, and there is no price-digit limit. Saving a product whose PRINTED content changed
 * puts its label in the changed-only queue in the same transaction.
 */
import { TL_KEYS } from '../../../storage/keys';
import { readList, transact, updateList } from '../../../storage/repo';
import { SCHEMA_VERSIONS, type PrintIntent, type Product, type ProductBarcode, type SellingUnit, type UnitPriceBase } from '../../../domain/types';
import type { Money } from '../../../domain/money';
import { CATALOGUE_LIMITS, LABEL_NAME_MAX } from '../../../domain/productLabel';
import { unitBasesFor } from '../../../domain/pricing';
import { normalizeBarcode, type BarcodeSymbology } from '../utils/barcode';
import { makeId, makeRevision, nowIso } from '../utils/ids';
import { planEnqueue, type PrintedMark, type QueueContext } from '../../queue/storage/queueStore';

export interface ProductDraft {
  name: string;
  labelName?: string;
  secondLine?: string;
  price: Money;
  sellingUnit?: SellingUnit;
  unitPriceBase?: UnitPriceBase;
  barcodes?: { raw: string; symbology?: BarcodeSymbology }[];
  sku?: string;
  labelKind?: Product['labelKind'];
  shelfLocation?: string;
}

export type ProductError =
  | 'nameRequired' | 'nameTooLong' | 'labelNameTooLong' | 'secondLineTooLong' | 'skuTooLong'
  | 'priceRequired' | 'badCurrency' | 'unitBaseMismatch' | 'duplicateBarcode' | 'notFound';

export class ProductValidationError extends Error {
  constructor(public readonly code: ProductError, public readonly otherProductId?: string) { super(code); this.name = 'ProductValidationError'; }
}

const len = (s?: string) => [...(s ?? '')].length;
const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();

export function barcodeFormatOf(raw: string): ProductBarcode['format'] {
  if (/^\d{13}$/.test(raw)) return 'ean13';
  if (/^\d{12}$/.test(raw)) return 'upca';
  if (/^\d{8}$/.test(raw)) return 'ean8';
  if (/^[\x20-\x7E]+$/.test(raw) && !/^\d+$/.test(raw)) return 'code128';
  return 'unknown';
}

function toBarcodes(list: ProductDraft['barcodes']): ProductBarcode[] {
  const out: ProductBarcode[] = [];
  for (const b of list ?? []) {
    const raw = (b.raw ?? '').trim();
    if (!raw) continue;
    const normalized = normalizeBarcode(raw, b.symbology ?? 'unknown');
    if (out.some(x => x.normalized === normalized)) continue;
    out.push({ raw, normalized, format: barcodeFormatOf(raw) });
  }
  return out;
}

export function validateDraft(d: ProductDraft): ProductError | null {
  const name = clean(d.name);
  if (!name) return 'nameRequired';
  if (len(name) > CATALOGUE_LIMITS.productName) return 'nameTooLong';
  if (d.labelName && len(clean(d.labelName)) > LABEL_NAME_MAX) return 'labelNameTooLong';
  if (len(clean(d.secondLine)) > CATALOGUE_LIMITS.secondLine) return 'secondLineTooLong';
  if (len(clean(d.sku)) > CATALOGUE_LIMITS.sku) return 'skuTooLong';
  if (!d.price || !Number.isSafeInteger(d.price.minor) || d.price.minor <= 0) return 'priceRequired';
  if (!/^[A-Z]{3}$/.test(d.price.currency)) return 'badCurrency';
  if (d.unitPriceBase && !unitBasesFor(d.sellingUnit ?? { kind: 'each' }).includes(d.unitPriceBase)) return 'unitBaseMismatch';
  return null;
}

/** Fields that appear on a label: a change here bumps the revision and re-queues the label. */
function printedSignature(p: Pick<Product, 'name' | 'labelName' | 'secondLine' | 'price' | 'sellingUnit' | 'unitPriceBase' | 'barcodes' | 'sku' | 'labelKind'>): string {
  return JSON.stringify([p.name, p.labelName ?? '', p.secondLine ?? '', p.price.minor, p.price.currency, p.sellingUnit, p.unitPriceBase ?? '', p.barcodes.map(b => b.raw), p.sku ?? '', p.labelKind ?? '']);
}

export async function listProducts(opts: { includeArchived?: boolean } = {}): Promise<Product[]> {
  const all = await readList<Product>(TL_KEYS.products);
  return all.filter(p => p && p.id && (opts.includeArchived || p.status !== 'archived'));
}

export async function getProduct(id: string): Promise<Product | null> {
  return (await readList<Product>(TL_KEYS.products)).find(p => p.id === id) ?? null;
}

export async function findByBarcode(raw: string, symbology: BarcodeSymbology = 'unknown'): Promise<Product | null> {
  const n = normalizeBarcode(raw, symbology);
  if (!n) return null;
  return (await readList<Product>(TL_KEYS.products)).find(p => p.status !== 'archived' && p.barcodes?.some(b => b.normalized === n)) ?? null;
}

/** Products that count toward the Free limit (archived ones too: archiving is not a way around the limit). */
export async function countProductsForLimit(): Promise<number> {
  return (await listProducts({ includeArchived: true })).filter(p => !p.isSample).length;
}

export interface SaveResult { product: Product; queued: boolean }

/** Build the next product record from a draft (pure; shared with the importer). */
export function applyDraft(existing: Product | undefined, draft: ProductDraft): { product: Product; printedChanged: boolean; priceChanged: boolean } {
  const now = nowIso();
  const fields = {
    name: clean(draft.name),
    labelName: clean(draft.labelName) || undefined,
    secondLine: clean(draft.secondLine) || undefined,
    price: draft.price,
    sellingUnit: draft.sellingUnit ?? { kind: 'each' as const },
    unitPriceBase: draft.unitPriceBase,
    barcodes: toBarcodes(draft.barcodes),
    sku: clean(draft.sku) || undefined,
    labelKind: draft.labelKind,
    shelfLocation: clean(draft.shelfLocation) || undefined,
  };
  if (existing) {
    const printedChanged = printedSignature(existing) !== printedSignature({ ...existing, ...fields });
    const priceChanged = existing.price.minor !== fields.price.minor || existing.price.currency !== fields.price.currency;
    return { product: { ...existing, ...fields, revision: printedChanged ? makeRevision() : existing.revision, updatedAt: now }, printedChanged, priceChanged };
  }
  return {
    product: { schemaVersion: SCHEMA_VERSIONS.product, id: makeId('prd'), ...fields, revision: makeRevision(), status: 'active', isSample: false, createdAt: now, updatedAt: now },
    printedChanged: true, priceChanged: true,
  };
}

/**
 * Create (id undefined) or update a product. `queue` decides whether a printed-content change adds or refreshes
 * its label in To print (default true). Everything happens in one transaction over products + queue.
 */
export async function saveProduct(draft: ProductDraft, ctx: QueueContext & { id?: string; queue?: boolean; reason?: PrintIntent['reason'] }): Promise<SaveResult> {
  const err = validateDraft(draft);
  if (err) throw new ProductValidationError(err);
  return transact([TL_KEYS.products, TL_KEYS.queue, TL_KEYS.printed], read => {
    const products = read<Product>(TL_KEYS.products);
    const existing = ctx.id ? products.find(p => p.id === ctx.id) : undefined;
    if (ctx.id && !existing) throw new ProductValidationError('notFound');
    const { product, printedChanged, priceChanged } = applyDraft(existing, draft);
    for (const b of product.barcodes) {
      const other = products.find(p => p.id !== product.id && p.status !== 'archived' && p.barcodes?.some(x => x.normalized === b.normalized));
      if (other) throw new ProductValidationError('duplicateBarcode', other.id);
    }
    const nextProducts = existing ? products.map(p => (p.id === product.id ? product : p)) : [...products, product];
    let queue = read<PrintIntent>(TL_KEYS.queue);
    let queued = false;
    if (ctx.queue !== false && printedChanged) {
      const reason = ctx.reason ?? (!existing ? 'new' : priceChanged ? 'priceChanged' : 'contentChanged');
      const plan = planEnqueue(queue, read<PrintedMark>(TL_KEYS.printed), product, reason, ctx);
      queue = plan.queue;
      queued = plan.queued;
    }
    return { writes: { [TL_KEYS.products]: nextProducts, [TL_KEYS.queue]: queue }, result: { product, queued } };
  });
}

export async function setArchived(id: string, archived: boolean): Promise<void> {
  await updateList<Product>(TL_KEYS.products, list => {
    if (!list.some(p => p.id === id)) throw new ProductValidationError('notFound');
    return { list: list.map(p => (p.id === id ? { ...p, status: archived ? 'archived' : 'active', updatedAt: nowIso() } : p)), result: undefined };
  });
}

/** A copy for "Duplicate": barcodes and SKU are left empty (each belongs to one product). */
export function duplicateDraft(p: Product, copyName: string): ProductDraft {
  return {
    name: copyName, labelName: p.labelName, secondLine: p.secondLine, price: p.price, sellingUnit: p.sellingUnit,
    unitPriceBase: p.unitPriceBase, barcodes: [], sku: undefined, labelKind: p.labelKind, shelfLocation: p.shelfLocation,
  };
}

/** Search by name, label name, SKU, barcode or shelf location (case- and accent-insensitive). */
export function searchProducts(list: Product[], query: string): Product[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
  const q = fold(query.trim());
  if (!q) return list;
  return list.filter(p => [p.name, p.labelName, p.sku, p.shelfLocation, ...(p.barcodes ?? []).map(b => b.raw)].some(v => v && fold(v).includes(q)));
}
