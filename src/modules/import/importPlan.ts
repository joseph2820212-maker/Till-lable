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
import { exponentFor, isAmbiguousSeparator, moneyFromMinor, parseMoney, type MoneyParse, type NumberProfile } from '../../domain/money';
import { normalizeArabicNumerals } from '../../utils/locale';
import { symbolForCode } from '../../utils/currency';
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
  /** Internal: identity used to find the same product twice in one file. */
  matchKey?: string;
}

export interface ImportSettings {
  mapping: MappedField[];
  hasHeader: boolean;
  profile: NumberProfile;
  currency: string;
  /** XLSX number cells ("row:col" in the raw rows): always "."-decimal, whatever the confirmed text format. */
  numericCells?: ReadonlySet<string>;
}

/**
 * A price cell reduced to its number: surrounding spaces and the shop currency's own symbol or ISO code are removed.
 * Anything else — another currency, a minus sign, brackets, words — makes the cell unreadable rather than guessed.
 */
export function cleanPriceCell(text: string, currency: string): string | null {
  let s = normalizeArabicNumerals(text).replace(/[\s\u00A0\u202F]/g, '');
  const symbols = [currency, symbolForCode(currency)].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const sym of symbols) {
    if (s.startsWith(sym)) { s = s.slice(sym.length); break; }
    if (s.endsWith(sym)) { s = s.slice(0, -sym.length); break; }
  }
  return /^[\d.,'٫٬]+$/.test(s) ? s : null;
}

/** An XLSX number cell ("." decimal, possibly float noise like 2.9899999999999998), rounded to the currency. */
export function parseSpreadsheetNumber(text: string, currency: string): MoneyParse {
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || !/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(text)) return { ok: false, error: 'invalid' };
  const exp = exponentFor(currency);
  const minor = Math.round(n * 10 ** exp);
  if (!Number.isSafeInteger(minor)) return { ok: false, error: 'overflow' };
  return { ok: true, money: moneyFromMinor(minor, currency) };
}

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

  const planned = data.map((r, idx) => {
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
    const cleaned = cleanPriceCell(priceText, s.currency);
    const priceCol = s.mapping.indexOf('price');
    const price = cleaned === null ? null : s.numericCells?.has(`${idx + (s.hasHeader ? 1 : 0)}:${priceCol}`) ? parseSpreadsheetNumber(cleaned, s.currency) : parseMoney(cleaned, s.currency, s.profile);
    if (!price || !price.ok || price.money.minor <= 0) return { ...out, reason: 'badPrice' };
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
    const identity = barcode ? `b:${barcode}` : sku ? `s:${sku.toLowerCase()}` : `n:${fold(name)}`;
    if (!match) return { ...out, status: 'new' as const, draft, matchKey: identity };
    const next = applyDraft(match, draft);
    return { ...out, status: next.printedChanged ? 'changed' as const : 'unchanged' as const, productId: match.id, draft, oldPriceMinor: match.price.minor, matchKey: `p:${match.id}` };
  });
  // The same product twice in one file (same SKU, same name without codes, or two rows matching one product) would
  // create duplicates or let the last row silently win: every such row becomes a conflict instead.
  const seen = new Map<string, number>();
  for (const r of planned) if (r.matchKey) seen.set(r.matchKey, (seen.get(r.matchKey) ?? 0) + 1);
  return planned.map(r => {
    const { matchKey, ...rest } = r as PlannedRow & { matchKey?: string };
    return matchKey && (seen.get(matchKey) ?? 0) > 1 ? { ...rest, status: 'conflict' as const, reason: 'duplicateInFile' as const, draft: undefined } : rest;
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
