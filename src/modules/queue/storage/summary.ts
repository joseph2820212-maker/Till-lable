import { readStorageList } from '../../../utils/storageSafety';
import { TL_KEYS } from '../../../storage/keys';

export interface WorkSummary {
  products: number;
  /** Products with at least one label waiting. */
  waitingProducts: number;
  /** Label copies waiting (the number of physical labels). */
  waitingLabels: number;
}

/** Counts for Home and To print. Products and labels are reported separately so "40 products" is never read as "70 labels". */
export async function loadWorkSummary(): Promise<WorkSummary> {
  const [products, intents] = await Promise.all([
    readStorageList<unknown>(TL_KEYS.products),
    readStorageList<{ productId?: string; copies?: number; status?: string }>(TL_KEYS.queue),
  ]);
  const waiting = intents.filter(i => i && i.status === 'waiting');
  return {
    products: products.length,
    waitingProducts: new Set(waiting.map(i => i.productId ?? '')).size,
    waitingLabels: waiting.reduce((n, i) => n + (Number.isInteger(i.copies) && (i.copies as number) > 0 ? (i.copies as number) : 0), 0),
  };
}
