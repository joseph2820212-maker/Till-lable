/**
 * CSV / XLSX / TillCalc import: map columns, parse prices with a number format the user CONFIRMS (never guessed
 * from one value, V1), preview every row as New / Changed / Unchanged / Conflict / Invalid, then commit in one
 * transaction that re-checks everything against the catalogue as it is at that moment.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { TL_KEYS } from '../../storage/keys';
import { readList, transact } from '../../storage/repo';
import { SCHEMA_VERSIONS, type ImportBatch, type PrintIntent, type Product } from '../../domain/types';
import { isAmbiguousSeparator, parseMoney, type NumberProfile } from '../../domain/money';
import { CATALOGUE_LIMITS, LABEL_NAME_MAX } from '../../domain/productLabel';
import { normalizeBarcode } from '../products/utils/barcode';
import { applyDraft, validateDraft, type ProductDraft } from '../products/storage/productStore';
import { planEnqueue, type PrintedMark, type QueueContext } from '../queue/storage/queueStore';
import { makeId, nowIso } from '../products/utils/ids';

export type MappedField = 'name' | 'labelName' | 'secondLine' | 'price' | 'barcode' | 'sku' | 'shelfLocation' | 'ignore';
export const MAPPABLE_FIELDS: MappedField[] = ['name', 'labelName', 'secondLine', 'price', 'barcode', 'sku', 'shelfLocation', 'ignore'];

const SYNONYMS: Record<Exclude<MappedField, 'ignore'>, RegExp> = {
  labelName: /^(label[\s_-]*name|short[\s_-]*name|shelf[\s_-]*name|nom[\s_-]*court|nombre[\s_-]*corto|kurzname|etiket[\s_-]*ad[ıi]|اسم[\s_]*الملصق)$/i,
  name: /^(name|product|product[\s_-]*name|description|item|item[\s_-]*name|title|nom|produit|libell[eé]|nombre|producto|art[ií]culo|artikel|bezeichnung|produktname|[üu]r[üu]n|[üu]r[üu]n[\s_-]*ad[ıi]|ad[ıi]|اسم|المنتج|اسم[\s_]*المنتج)$/i,
  price: /^(price|selling[\s_-]*price|retail[\s_-]*price|rrp|prix|prix[\s_-]*de[\s_-]*vente|precio|pvp|preis|verkaufspreis|vk|fiyat|sat[ıi][şs][\s_-]*fiyat[ıi]|سعر|السعر|سعر[\s_]*البيع)$/i,
  barcode: /^(barcode|bar[\s_-]*code|ean|ean13|ean[\s_-]*13|upc|gtin|code[\s_-]*barres|c[oó]digo[\s_-]*de[\s_-]*barras|strichcode|barkod|باركود|الباركود)$/i,
  sku: /^(sku|code|item[\s_-]*code|product[\s_-]*code|ref|reference|r[eé]f[eé]rence|referencia|artikelnummer|art[\s_-]*nr|stok[\s_-]*kodu|kod|رمز|الرمز)$/i,
  secondLine: /^(size|pack|pack[\s_-]*size|second[\s_-]*line|format|taille|contenance|tama[ñn]o|formato|gr[öo][ßs]e|inhalt|boyut|ambalaj|الحجم|العبوة)$/i,
  shelfLocation: /^(shelf|location|aisle|bay|rayon|emplacement|estante|ubicaci[oó]n|regal|standort|raf|konum|الرف|الموقع)$/i,
};

export function guessMapping(headers: string[]): MappedField[] {
  const used = new Set<MappedField>();
  return headers.map(h => {
    const k = h.trim();
    for (const f of ['labelName', 'name', 'price', 'barcode', 'sku', 'secondLine', 'shelfLocation'] as const) {
      if (!used.has(f) && SYNONYMS[f].test(k)) { used.add(f); return f; }
    }
    return 'ignore';
  });
}

/** Suggest a number format from the price column; `ambiguous` counts values like "1,234" that could read either way. */
export function suggestNumberProfile(values: string[]): { profile: NumberProfile; ambiguous: number; commaDecimals: number; dotDecimals: number } {
  let comma = 0; let dot = 0; let ambiguous = 0;
  for (const v of values) {
    const s = v.trim();
    if (isAmbiguousSeparator(s)) { ambiguous++; continue; }
    if (/^\d{1,3}(\.\d{3})*,\d{1,3}$|^\d+,\d{1,2}$/.test(s)) comma++;
    else if (/^\d{1,3}(,\d{3})*\.\d{1,3}$|^\d+\.\d{1,2}$/.test(s)) dot++;
  }
  return { profile: comma > dot ? { decimal: ',', grouping: '.' } : { decimal: '.', grouping: ',' }, ambiguous, commaDecimals: comma, dotDecimals: dot };
}

export type RowStatus = 'new' | 'changed' | 'unchanged' | 'conflict' | 'invalid';
export type RowReason =
  | 'missingName' | 'missingPrice' | 'badPrice' | 'nameTooLong' | 'labelNameTooLong' | 'fieldTooLong'
  | 'duplicateInFile' | 'matchesTwoProducts' | 'barcodeBelongsToOther';

export interface PlannedRow {
  row: number;
  status: RowStatus;
  reason?: RowReason;
  name: string;
  priceMinor?: number;
  oldPriceMinor?: number;
  productId?: string;
  draft?: ProductDraft;
}

export interface ImportSettings { mapping: MappedField[]; hasHeader: boolean; profile: NumberProfile; currency: string }

const cell = (r: string[], mapping: MappedField[], f: MappedField) => { const i = mapping.indexOf(f); return i >= 0 ? (r[i] ?? '').trim() : ''; };

/** Pure: classify every data row against the catalogue. */
export function planImport(rows: string[][], s: ImportSettings, products: Product[]): PlannedRow[] {
  const data = s.hasHeader ? rows.slice(1) : rows;
  const active = products.filter(p => p.status !== 'archived');
  const byBarcode = new Map<string, Product>();
  const bySku = new Map<string, Product>();
  const fold = (x: string) => x.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const byName = new Map<string, Product[]>();
  for (const p of active) byName.set(fold(p.name), [...(byName.get(fold(p.name)) ?? []), p]);
  for (const p of active) {
    for (const b of p.barcodes ?? []) byBarcode.set(b.normalized, p);
    if (p.sku) bySku.set(p.sku.trim().toLowerCase(), p);
  }
  const seenBarcodes = new Map<string, number>();
  data.forEach(r => { const b = normalizeBarcode(cell(r, s.mapping, 'barcode')); if (b) seenBarcodes.set(b, (seenBarcodes.get(b) ?? 0) + 1); });

  return data.map((r, idx) => {
    const row = idx + (s.hasHeader ? 2 : 1);
    const name = cell(r, s.mapping, 'name');
    const labelName = cell(r, s.mapping, 'labelName');
    const priceText = cell(r, s.mapping, 'price');
    const barcodeRaw = cell(r, s.mapping, 'barcode');
    const sku = cell(r, s.mapping, 'sku');
    const out: PlannedRow = { row, status: 'invalid', name: name || labelName };
    if (!name) return { ...out, reason: 'missingName' };
    if ([...name].length > CATALOGUE_LIMITS.productName) return { ...out, reason: 'nameTooLong' };
    if (labelName && [...labelName].length > LABEL_NAME_MAX) return { ...out, reason: 'labelNameTooLong' };
    if (!priceText) return { ...out, reason: 'missingPrice' };
    const price = parseMoney(priceText.replace(/[^\d.,\s٠-٩'٫٬-]/g, ''), s.currency, s.profile);
    if (!price.ok || price.money.minor <= 0) return { ...out, reason: 'badPrice' };
    out.priceMinor = price.money.minor;
    const barcode = normalizeBarcode(barcodeRaw);
    if (barcode && (seenBarcodes.get(barcode) ?? 0) > 1) return { ...out, status: 'conflict', reason: 'duplicateInFile' };
    const byCode = barcode ? byBarcode.get(barcode) : undefined;
    const bySkuMatch = sku ? bySku.get(sku.toLowerCase()) : undefined;
    if (byCode && bySkuMatch && byCode.id !== bySkuMatch.id) return { ...out, status: 'conflict', reason: 'matchesTwoProducts' };
    // Rows with no barcode and no SKU match by exact name (never fuzzy); two products with that name is a conflict.
    let byNameMatch: Product | undefined;
    if (!barcode && !sku) {
      const same = byName.get(fold(name)) ?? [];
      if (same.length > 1) return { ...out, status: 'conflict', reason: 'matchesTwoProducts' };
      byNameMatch = same[0];
    }
    const match = byCode ?? bySkuMatch ?? byNameMatch;
    if (!byCode && bySkuMatch && barcode && byBarcode.has(barcode)) return { ...out, status: 'conflict', reason: 'barcodeBelongsToOther' };
    const draft: ProductDraft = match
      ? {
        name, labelName: labelName || match.labelName, secondLine: cell(r, s.mapping, 'secondLine') || match.secondLine, price: price.money,
        sellingUnit: match.sellingUnit, unitPriceBase: match.unitPriceBase,
        barcodes: barcodeRaw ? [{ raw: barcodeRaw }, ...match.barcodes.filter(b => b.normalized !== barcode).map(b => ({ raw: b.raw }))] : match.barcodes.map(b => ({ raw: b.raw })),
        sku: sku || match.sku, labelKind: match.labelKind, shelfLocation: cell(r, s.mapping, 'shelfLocation') || match.shelfLocation,
      }
      : { name, labelName: labelName || undefined, secondLine: cell(r, s.mapping, 'secondLine') || undefined, price: price.money, barcodes: barcodeRaw ? [{ raw: barcodeRaw }] : [], sku: sku || undefined, shelfLocation: cell(r, s.mapping, 'shelfLocation') || undefined };
    const err = validateDraft(draft);
    if (err) return { ...out, reason: err === 'labelNameTooLong' ? 'labelNameTooLong' : 'fieldTooLong' };
    if (!match) return { ...out, status: 'new', draft };
    const next = applyDraft(match, draft);
    return { ...out, status: next.printedChanged ? 'changed' : 'unchanged', productId: match.id, draft, oldPriceMinor: match.price.minor };
  });
}

export function countByStatus(plan: PlannedRow[]): Record<RowStatus, number> {
  const c: Record<RowStatus, number> = { new: 0, changed: 0, unchanged: 0, conflict: 0, invalid: 0 };
  for (const r of plan) c[r.status]++;
  return c;
}

export const fileSha256 = (bytes: Uint8Array) => bytesToHex(sha256(bytes));

export async function findPreviousImport(sha: string): Promise<ImportBatch | null> {
  return (await readList<ImportBatch>(TL_KEYS.importBatches)).find(b => b.fileSha256 === sha && b.state === 'committed') ?? null;
}

export class ImportCommitError extends Error {
  constructor(public readonly code: 'changedSincePreview' | 'overLimit' | 'nothingToImport', public readonly detail?: number) { super(code); this.name = 'ImportCommitError'; }
}

/**
 * Commit new and changed rows in ONE transaction (products + queue + batch record). The plan is rebuilt from the
 * same rows against the catalogue as it is now; if the counts moved since the preview, nothing is written.
 */
export async function commitImport(args: {
  rows: string[][]; settings: ImportSettings; expected: Record<RowStatus, number>; ctx: QueueContext; queueOnImport: boolean;
  source: ImportBatch['source']; fileName: string; fileSha256: string; newProductAllowance: number;
}): Promise<{ created: number; updated: number; queued: number }> {
  return transact([TL_KEYS.products, TL_KEYS.queue, TL_KEYS.printed, TL_KEYS.importBatches], read => {
    let products = read<Product>(TL_KEYS.products);
    const plan = planImport(args.rows, args.settings, products);
    const counts = countByStatus(plan);
    if ((Object.keys(counts) as RowStatus[]).some(k => counts[k] !== args.expected[k])) throw new ImportCommitError('changedSincePreview');
    if (counts.new + counts.changed === 0) throw new ImportCommitError('nothingToImport');
    if (counts.new > args.newProductAllowance) throw new ImportCommitError('overLimit', args.newProductAllowance);
    let queue = read<PrintIntent>(TL_KEYS.queue);
    const printed = read<PrintedMark>(TL_KEYS.printed);
    let created = 0; let updated = 0; let queued = 0;
    for (const r of plan) {
      if ((r.status !== 'new' && r.status !== 'changed') || !r.draft) continue;
      const existing = r.productId ? products.find(p => p.id === r.productId) : undefined;
      const { product, priceChanged } = applyDraft(existing, r.draft);
      products = existing ? products.map(p => (p.id === product.id ? product : p)) : [...products, product];
      if (existing) updated++; else created++;
      if (args.queueOnImport) {
        const plan2 = planEnqueue(queue, printed, product, existing ? (priceChanged ? 'priceChanged' : 'contentChanged') : 'import', args.ctx);
        queue = plan2.queue;
        if (plan2.queued) queued++;
      }
    }
    const batch: ImportBatch = {
      schemaVersion: SCHEMA_VERSIONS.importBatch, id: makeId('imp'), source: args.source, fileName: args.fileName, fileSha256: args.fileSha256,
      counts, queueOnImport: args.queueOnImport, committedAt: nowIso(), state: 'committed',
    };
    const batches = [...read<ImportBatch>(TL_KEYS.importBatches), batch].slice(-200);
    return { writes: { [TL_KEYS.products]: products, [TL_KEYS.queue]: queue, [TL_KEYS.importBatches]: batches }, result: { created, updated, queued } };
  });
}
