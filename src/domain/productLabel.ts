/**
 * Catalogue data vs printable label data (owner G2 correction handout, 24 Sep 2026, §2–§4, §26).
 *
 * The catalogue keeps source data intact: the full product name, SKU, barcode and price are stored exactly as
 * imported or typed, bounded only by generous storage limits that protect the device (never by a label's size).
 * The ONE printable field with a character counter is the label name ("38 / 40"). Pack size, SKU, conditions and
 * prices are measured per label format at its fixed type sizes (labels/engine/labelTemplate.ts).
 */
import type { Product } from './types';
import { LABEL_NAME_MAX } from '../modules/labels/engine/labelTemplate';

export { LABEL_NAME_MAX };

/** Storage bounds only (hostile-import protection). These never shorten real data: longer input is refused at import. */
export const CATALOGUE_LIMITS = {
  productName: 250,
  secondLine: 120,
  sku: 64,
  condition: 160,
} as const;

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const length = (s: string) => [...s].length;

/**
 * The name a label prints: the label name when set, otherwise the full name if it is within the label-name counter.
 * Returns null when the user must write a label name (the full name is never cut automatically).
 */
export function printableName(p: Pick<Product, 'name' | 'labelName'>): string | null {
  const label = p.labelName ? collapse(p.labelName) : '';
  if (label) return length(label) <= LABEL_NAME_MAX ? label : null;
  const full = collapse(p.name);
  return length(full) <= LABEL_NAME_MAX ? full : null;
}

/**
 * A SAFE label-name suggestion for an imported name: only lossless tidying (collapsed spaces). If the tidied full
 * name is still over the counter, there is no safe suggestion and the screen asks the user to write one — the app
 * never invents abbreviations or silently drops words.
 */
export function suggestLabelName(fullName: string): string | null {
  const tidy = collapse(fullName);
  return tidy && length(tidy) <= LABEL_NAME_MAX ? tidy : null;
}

/** The counter shown on the printable label-name field, e.g. { used: 38, max: 40 }. */
export function labelNameCounter(value: string): { used: number; max: number; over: boolean } {
  const used = length(value);
  return { used, max: LABEL_NAME_MAX, over: used > LABEL_NAME_MAX };
}
