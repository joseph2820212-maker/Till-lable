/**
 * The changed-only print queue (plan §N, TL-15…19). A label is queued when what it PRINTS changes; if the latest
 * content is exactly what was last printed, nothing is queued. One waiting label per product: a later change
 * refreshes it instead of adding a duplicate. Products and labels are counted separately.
 */
import { TL_KEYS } from '../../../storage/keys';
import { readList, transact, updateList } from '../../../storage/repo';
import { SCHEMA_VERSIONS, type LanguageCode, type PrintIntent, type Product } from '../../../domain/types';
import { contentFingerprint, productContent } from '../../labels/content';
import type { LabelContent } from '../../labels/engine/renderLabel';
import type { ShelfKind } from '../../settings/storage/labelSettings';
import { makeId, nowIso } from '../../products/utils/ids';

export interface QueueContext { language: LanguageCode; defaultKind: ShelfKind; extraDecimals?: 0 | 1 | 2 }

export interface PrintedMark { key: string; fingerprint: string; at: string }

const printedKey = (productId: string, kind: string) => `${productId}|${kind}`;

/** Pure: the queue after a product change. Exported for tests and the importer. */
export function planEnqueue(queue: PrintIntent[], printed: PrintedMark[], product: Product, reason: PrintIntent['reason'], ctx: QueueContext): { queue: PrintIntent[]; queued: boolean } {
  const kind = product.labelKind ?? ctx.defaultKind;
  const r = productContent(product, { language: ctx.language, kind, extraDecimals: ctx.extraDecimals });
  // A product that cannot print yet (e.g. no label name) still gets queued so the list can explain what to fix.
  const fingerprint = r.ok ? contentFingerprint(r.content) : `problem:${r.problem}:${product.revision}`;
  const waiting = queue.find(i => i.status === 'waiting' && i.productId === product.id && i.purpose === 'normal');
  const last = printed.find(m => m.key === printedKey(product.id, kind));
  if (!waiting && last && last.fingerprint === fingerprint) return { queue, queued: false };
  const now = nowIso();
  if (waiting) {
    // The change was undone: the shelf already shows exactly this label, so nothing needs printing.
    if (last && last.fingerprint === fingerprint) return { queue: queue.map(i => (i === waiting ? { ...i, status: 'removed' as const, updatedAt: nowIso() } : i)), queued: false };
    if (waiting.contentFingerprint === fingerprint && waiting.labelKind === kind) return { queue, queued: false };
    return {
      queue: queue.map(i => (i === waiting ? { ...i, contentFingerprint: fingerprint, productRevision: product.revision, labelKind: kind, labelLanguage: ctx.language, reason, title: product.labelName || product.name, updatedAt: now } : i)),
      queued: true,
    };
  }
  const intent: PrintIntent = {
    schemaVersion: SCHEMA_VERSIONS.printIntent, id: makeId('int'), purpose: 'normal', productId: product.id, productRevision: product.revision,
    contentFingerprint: fingerprint, layoutId: kind, labelKind: kind, labelLanguage: ctx.language, copies: 1, reason, status: 'waiting',
    createdAt: now, title: product.labelName || product.name,
  };
  return { queue: [...queue, intent], queued: true };
}

export async function listWaiting(): Promise<PrintIntent[]> {
  return (await readList<PrintIntent>(TL_KEYS.queue)).filter(i => i && i.status === 'waiting');
}

/** Add a one-off label (Quick label, reduced-to-clear, a promotion) with its frozen content. */
export async function enqueueSnapshot(content: LabelContent, opts: { purpose: PrintIntent['purpose']; copies: number; title: string; productId?: string; promotionId?: string; reductionId?: string }): Promise<PrintIntent> {
  if (!Number.isInteger(opts.copies) || opts.copies < 1 || opts.copies > 999) throw new RangeError('copies must be 1–999');
  const intent: PrintIntent = {
    schemaVersion: SCHEMA_VERSIONS.printIntent, id: makeId('int'), purpose: opts.purpose, productId: opts.productId, promotionId: opts.promotionId,
    reductionId: opts.reductionId, contentFingerprint: contentFingerprint(content), layoutId: content.kind, labelKind: content.kind,
    labelLanguage: content.language, copies: opts.copies, reason: 'manual', status: 'waiting', createdAt: nowIso(), snapshot: content, title: opts.title,
  };
  await updateList<PrintIntent>(TL_KEYS.queue, list => ({ list: [...list, intent], result: undefined }));
  return intent;
}

/** Queue a product's normal label on request (e.g. "Add to To print"), even if unchanged. */
export async function enqueueProductManually(product: Product, ctx: QueueContext, copies = 1): Promise<void> {
  await transact([TL_KEYS.queue, TL_KEYS.printed], read => {
    const queue = read<PrintIntent>(TL_KEYS.queue);
    const printed = read<PrintedMark>(TL_KEYS.printed).filter(m => m.key !== printedKey(product.id, product.labelKind ?? ctx.defaultKind));
    const plan = planEnqueue(queue, printed, product, 'manual', ctx);
    const next = plan.queue.map(i => (i.status === 'waiting' && i.productId === product.id && i.purpose === 'normal' ? { ...i, copies: Math.max(i.copies, copies) } : i));
    return { writes: { [TL_KEYS.queue]: next }, result: undefined };
  });
}

export async function setCopies(intentId: string, copies: number): Promise<void> {
  if (!Number.isInteger(copies) || copies < 1 || copies > 999) throw new RangeError('copies must be 1–999');
  await updateList<PrintIntent>(TL_KEYS.queue, list => ({ list: list.map(i => (i.id === intentId ? { ...i, copies, updatedAt: nowIso() } : i)), result: undefined }));
}

export async function removeIntents(ids: string[]): Promise<void> {
  await updateList<PrintIntent>(TL_KEYS.queue, list => ({ list: list.map(i => (ids.includes(i.id) ? { ...i, status: 'removed' as const, updatedAt: nowIso() } : i)), result: undefined }));
}

/**
 * The user confirmed these labels printed ("Yes, printed" after a real print attempt): mark them printed and record
 * what was printed so an unchanged product is not queued again.
 */
export async function markPrinted(lines: { intentId: string; contentFingerprint: string }[]): Promise<void> {
  await transact([TL_KEYS.queue, TL_KEYS.printed], read => {
    const queue = read<PrintIntent>(TL_KEYS.queue);
    let printed = read<PrintedMark>(TL_KEYS.printed);
    const at = nowIso();
    const next = queue.map(i => {
      const line = lines.find(l => l.intentId === i.id);
      if (!line || i.status !== 'waiting') return i;
      // Record what is now on the shelf.
      if (i.productId && i.purpose === 'normal') {
        const key = printedKey(i.productId, i.labelKind);
        printed = [...printed.filter(m => m.key !== key), { key, fingerprint: line.contentFingerprint, at }];
      }
      // A label that changed after this PDF was made (e.g. a newer price) is NOT the one that printed: it keeps waiting.
      if (i.contentFingerprint !== line.contentFingerprint) return i;
      return { ...i, status: 'printed' as const, updatedAt: at };
    });
    // Keep the queue small: drop printed / removed intents older than the newest 500.
    const live = next.filter(i => i.status === 'waiting');
    const done = next.filter(i => i.status !== 'waiting').slice(-500);
    return { writes: { [TL_KEYS.queue]: [...done, ...live], [TL_KEYS.printed]: printed }, result: undefined };
  });
}

/**
 * A PDF was generated for these labels: each waiting label now stands for exactly the content in that PDF. A later
 * product change refreshes the fingerprint again, so confirming an OLD job can never clear a NEWER label.
 */
export async function syncPrintedContent(lines: { intentId: string; contentFingerprint: string }[]): Promise<void> {
  if (!lines.length) return;
  await updateList<PrintIntent>(TL_KEYS.queue, list => ({
    list: list.map(i => {
      const line = lines.find(l => l.intentId === i.id);
      return line && i.status === 'waiting' && i.contentFingerprint !== line.contentFingerprint ? { ...i, contentFingerprint: line.contentFingerprint, updatedAt: nowIso() } : i;
    }),
    result: undefined,
  }));
}

/** Take a promotion's waiting labels out of To print (offer edited or ended). */
export async function removePromotionLabels(promotionId: string): Promise<void> {
  await updateList<PrintIntent>(TL_KEYS.queue, list => ({
    list: list.map(i => (i.status === 'waiting' && i.promotionId === promotionId ? { ...i, status: 'removed' as const, updatedAt: nowIso() } : i)),
    result: undefined,
  }));
}
