/**
 * Promotions and reduced-to-clear batches are stored apart from products: the product's normal price is never
 * changed by an offer or a reduction (TL-02, TL-20).
 */
import { TL_KEYS } from '../../../storage/keys';
import { readList, updateList } from '../../../storage/repo';
import { SCHEMA_VERSIONS, type Promotion, type PromotionType, type ReductionBatch } from '../../../domain/types';
import type { Money } from '../../../domain/money';
import { makeId, nowIso } from '../../products/utils/ids';

export type PromotionError = 'nameRequired' | 'noProducts' | 'badPercent' | 'badAmount' | 'badQuantity' | 'conditionRequired' | 'badDates' | 'mixedCurrency';

export function validatePromotion(p: { name: string; productIds: string[]; type: PromotionType; startDate?: string; endDate?: string }, currency: string): PromotionError | null {
  if (!p.name.trim()) return 'nameRequired';
  if (!p.productIds.length) return 'noProducts';
  const money = (m: Money) => m.currency === currency && Number.isSafeInteger(m.minor) && m.minor > 0;
  const t = p.type;
  switch (t.kind) {
    case 'percentOff': if (!Number.isInteger(t.percentHundredths) || t.percentHundredths <= 0 || t.percentHundredths >= 10000) return 'badPercent'; break;
    case 'moneyOff': if (!money(t.amount)) return t.amount.currency !== currency ? 'mixedCurrency' : 'badAmount'; break;
    case 'wasNow': if (!money(t.referencePrice)) return t.referencePrice.currency !== currency ? 'mixedCurrency' : 'badAmount'; break;
    case 'multibuy': if (!Number.isInteger(t.quantity) || t.quantity < 2 || t.quantity > 99) return 'badQuantity'; if (!money(t.totalPrice)) return 'badAmount'; break;
    case 'conditional': if (!t.condition.trim()) return 'conditionRequired'; if (!money(t.conditionalPrice)) return 'badAmount'; break;
  }
  if (p.startDate && p.endDate && p.endDate < p.startDate) return 'badDates';
  return null;
}

export async function listPromotions(): Promise<Promotion[]> {
  return (await readList<Promotion>(TL_KEYS.promotions)).filter(p => p && p.id);
}

export async function savePromotion(input: Omit<Promotion, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt' | 'status'> & { id?: string; status?: Promotion['status'] }): Promise<Promotion> {
  const now = nowIso();
  return updateList<Promotion, Promotion>(TL_KEYS.promotions, list => {
    const existing = input.id ? list.find(p => p.id === input.id) : undefined;
    const promo: Promotion = {
      schemaVersion: SCHEMA_VERSIONS.promotion, id: existing?.id ?? makeId('pro'), name: input.name.trim(), productIds: input.productIds, type: input.type,
      conditions: input.conditions?.trim() || undefined, startDate: input.startDate, endDate: input.endDate, status: input.status ?? 'active',
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    return { list: existing ? list.map(p => (p.id === promo.id ? promo : p)) : [...list, promo], result: promo };
  });
}

export async function endPromotion(id: string): Promise<void> {
  await updateList<Promotion>(TL_KEYS.promotions, list => ({ list: list.map(p => (p.id === id ? { ...p, status: 'ended' as const, updatedAt: nowIso() } : p)), result: undefined }));
}

/** An offer is live on a date when active and within its dates (dates inclusive, local YYYY-MM-DD). */
export function isLive(p: Promotion, today: string): boolean {
  return p.status === 'active' && (!p.startDate || p.startDate <= today) && (!p.endDate || p.endDate >= today);
}

export async function listReductions(): Promise<ReductionBatch[]> {
  return (await readList<ReductionBatch>(TL_KEYS.reductions)).filter(r => r && r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveReduction(r: { productId?: string; productName: string; normalPrice: Money; reducedPrice: Money; copies: number; reason?: string }): Promise<ReductionBatch> {
  if (!r.productName.trim()) throw new RangeError('name required');
  if (r.normalPrice.currency !== r.reducedPrice.currency) throw new RangeError('mixed currency');
  if (!(r.reducedPrice.minor > 0 && r.reducedPrice.minor < r.normalPrice.minor)) throw new RangeError('reduced price must be below the normal price');
  if (!Number.isInteger(r.copies) || r.copies < 1 || r.copies > 999) throw new RangeError('copies must be 1–999');
  const batch: ReductionBatch = { schemaVersion: SCHEMA_VERSIONS.reductionBatch, id: makeId('red'), productId: r.productId, productName: r.productName.trim(), normalPrice: r.normalPrice, reducedPrice: r.reducedPrice, copies: r.copies, reason: r.reason?.trim() || undefined, createdAt: nowIso() };
  await updateList<ReductionBatch>(TL_KEYS.reductions, list => ({ list: [...list, batch].slice(-1000), result: undefined }));
  return batch;
}
