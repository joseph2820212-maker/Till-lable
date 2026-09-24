/**
 * `tillfamily.price-change` v1 (docs/FILE_FORMAT_V1.md): the file TillCalc sends to TillLabel with approved selling
 * prices. It carries prices only — never costs or margins — and a SHA-256 checksum over its canonical items so a
 * damaged or edited file is refused. Content is JSON with a format marker; the extension (.tillprice) is a hint only.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const PRICE_CHANGE_FORMAT = 'tillfamily.price-change';
export const PRICE_CHANGE_VERSION = 1;
export const PRICE_CHANGE_MAX_ITEMS = 20000;

export interface PriceChangeItem {
  /** Stable id in the sending app (for conflict reporting only). */
  sourceId: string;
  name: string;
  /** Selling price in minor units of `currency`. */
  priceMinor: number;
  barcode?: string;
  sku?: string;
  /** Optional pack / size text. */
  size?: string;
}

export interface PriceChangeFile {
  format: typeof PRICE_CHANGE_FORMAT;
  version: 1;
  source: { app: string; appVersion?: string; batchId: string; batchRevision: number };
  createdAt: string;
  currency: string;
  items: PriceChangeItem[];
  checksum: string;
}

export type PriceChangeError = 'notJson' | 'wrongFormat' | 'unsupportedVersion' | 'badCurrency' | 'tooManyItems' | 'badItem' | 'checksumMismatch' | 'containsCosts';

const canonicalItems = (items: PriceChangeItem[]) => JSON.stringify(items.map(i => [i.sourceId, i.name, i.priceMinor, i.barcode ?? '', i.sku ?? '', i.size ?? '']));
export const priceChangeChecksum = (f: Pick<PriceChangeFile, 'currency' | 'source' | 'items'>) => bytesToHex(sha256(utf8ToBytes(`${f.currency}|${f.source.batchId}|${f.source.batchRevision}|${canonicalItems(f.items)}`)));

const COST_KEYS = /cost|margin|markup|supplier_price|buyprice|purchase/i;

export function parsePriceChangeFile(text: string): { ok: true; file: PriceChangeFile } | { ok: false; error: PriceChangeError } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'notJson' }; }
  const f = raw as Partial<PriceChangeFile> & Record<string, unknown>;
  if (!f || typeof f !== 'object' || f.format !== PRICE_CHANGE_FORMAT) return { ok: false, error: 'wrongFormat' };
  if (f.version !== PRICE_CHANGE_VERSION) return { ok: false, error: 'unsupportedVersion' };
  if (typeof f.currency !== 'string' || !/^[A-Z]{3}$/.test(f.currency)) return { ok: false, error: 'badCurrency' };
  if (!Array.isArray(f.items)) return { ok: false, error: 'badItem' };
  if (f.items.length > PRICE_CHANGE_MAX_ITEMS) return { ok: false, error: 'tooManyItems' };
  if (!f.source || typeof f.source.batchId !== 'string' || !Number.isInteger(f.source.batchRevision)) return { ok: false, error: 'wrongFormat' };
  for (const it of f.items as unknown[]) {
    const i = it as Record<string, unknown>;
    if (!i || typeof i !== 'object') return { ok: false, error: 'badItem' };
    if (Object.keys(i).some(k => COST_KEYS.test(k))) return { ok: false, error: 'containsCosts' };
    if (typeof i.sourceId !== 'string' || typeof i.name !== 'string' || !i.name.trim() || !Number.isSafeInteger(i.priceMinor) || (i.priceMinor as number) <= 0) return { ok: false, error: 'badItem' };
    for (const k of ['barcode', 'sku', 'size']) if (i[k] !== undefined && typeof i[k] !== 'string') return { ok: false, error: 'badItem' };
  }
  if (Object.keys(f).some(k => COST_KEYS.test(k))) return { ok: false, error: 'containsCosts' };
  const file = f as PriceChangeFile;
  if (typeof file.checksum !== 'string' || file.checksum !== priceChangeChecksum(file)) return { ok: false, error: 'checksumMismatch' };
  return { ok: true, file };
}

/** Build a file (used by tests and documented for the TillCalc exporter). */
export function buildPriceChangeFile(input: Omit<PriceChangeFile, 'format' | 'version' | 'checksum'>): PriceChangeFile {
  return { format: PRICE_CHANGE_FORMAT, version: 1, ...input, checksum: priceChangeChecksum(input) };
}
