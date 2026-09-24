import AsyncStorage from '@react-native-async-storage/async-storage';
import { moneyFromMinor } from '../../domain/money';
import { TL_KEYS } from '../../storage/keys';
import { findByBarcode, listProducts, ProductValidationError, saveProduct, searchProducts, setArchived, countProductsForLimit } from '../products/storage/productStore';
import { enqueueSnapshot, listWaiting, markPrinted, removeIntents, setCopies, enqueueProductManually } from '../queue/storage/queueStore';
import { loadWorkSummary } from '../queue/storage/summary';
import { contentFingerprint, productContent, promotionContent, printableBarcode } from '../labels/content';
import { getCalibration, listAllProfiles, saveCalibration, saveCustomProfile, StationeryInvalidError } from '../print/storage/stationeryStore';
import { listJobs, recordJob, setJobStatus } from '../print/storage/jobStore';
import { isLive, saveReduction, validatePromotion } from '../promotions/storage/promotionStore';
import { PRESETS } from '../labels/engine/presets';
import type { Promotion } from '../../domain/types';

const ctx = { language: 'en' as const, defaultKind: 'standardPrice' as const };
const gbp = (m: number) => moneyFromMinor(m, 'GBP');
const draft = (over: Record<string, unknown> = {}) => ({ name: 'Heinz Cream of Tomato Soup', secondLine: '400 g', price: gbp(149), barcodes: [{ raw: '5000157024671' }], sku: 'HNZ-1', ...over });

beforeEach(() => (AsyncStorage as any).clear());

describe('catalogue', () => {
  it('keeps the full product name; only the label name is limited to 40', async () => {
    const long = 'Fairy Platinum Plus All In One Dishwasher Tablets Lemon 42 Pack';
    const { product } = await saveProduct(draft({ name: long, labelName: 'Fairy Platinum+ Lemon 42', barcodes: [] }), ctx);
    expect(product.name).toBe(long);
    await expect(saveProduct(draft({ labelName: 'x'.repeat(41), barcodes: [] }), ctx)).rejects.toMatchObject({ code: 'labelNameTooLong' });
  });
  it('refuses a second product with the same barcode (UPC-A and EAN-13 forms are the same product)', async () => {
    await saveProduct(draft({ barcodes: [{ raw: '036000291452' }] }), ctx);
    await expect(saveProduct(draft({ name: 'Other', barcodes: [{ raw: '0036000291452' }] }), ctx)).rejects.toBeInstanceOf(ProductValidationError);
    expect((await findByBarcode('036000291452'))?.name).toBe('Heinz Cream of Tomato Soup');
  });
  it('no price digit cap and no zero price', async () => {
    await expect(saveProduct(draft({ price: gbp(99999999), barcodes: [] }), ctx)).resolves.toBeTruthy();
    await expect(saveProduct(draft({ price: gbp(0), barcodes: [] }), ctx)).rejects.toMatchObject({ code: 'priceRequired' });
  });
  it('archive hides but never deletes; archived still count toward the Free limit', async () => {
    const { product } = await saveProduct(draft(), ctx);
    await setArchived(product.id, true);
    expect(await listProducts()).toHaveLength(0);
    expect(await listProducts({ includeArchived: true })).toHaveLength(1);
    expect(await countProductsForLimit()).toBe(1);
  });
  it('search by name, SKU, barcode, accent-insensitive', async () => {
    await saveProduct(draft({ name: 'Crème fraîche', barcodes: [], sku: 'CF-20' }), ctx);
    const all = await listProducts();
    expect(searchProducts(all, 'creme')).toHaveLength(1);
    expect(searchProducts(all, 'cf-2')).toHaveLength(1);
    expect(searchProducts(all, 'zzz')).toHaveLength(0);
  });
});

describe('changed-only queue', () => {
  it('a new product is queued once; saving it unchanged queues nothing', async () => {
    const { product, queued } = await saveProduct(draft(), ctx);
    expect(queued).toBe(true);
    const again = await saveProduct(draft(), { ...ctx, id: product.id });
    expect(again.queued).toBe(false);
    expect(await listWaiting()).toHaveLength(1);
  });
  it('a price change refreshes the waiting label instead of adding a second one', async () => {
    const { product } = await saveProduct(draft(), ctx);
    await setCopies((await listWaiting())[0].id, 3);
    await saveProduct(draft({ price: gbp(159) }), { ...ctx, id: product.id });
    const w = await listWaiting();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ copies: 3, reason: 'priceChanged' });
  });
  it('after printing, the same content is not queued again; a real change is', async () => {
    const { product } = await saveProduct(draft(), ctx);
    const [i] = await listWaiting();
    await markPrinted([{ intentId: i.id, contentFingerprint: i.contentFingerprint }]);
    expect(await listWaiting()).toHaveLength(0);
    await saveProduct(draft({ secondLine: '400 g' }), { ...ctx, id: product.id });
    expect(await listWaiting()).toHaveLength(0);
    await saveProduct(draft({ price: gbp(169) }), { ...ctx, id: product.id });
    expect(await listWaiting()).toHaveLength(1);
  });
  it('products and labels are counted separately', async () => {
    await saveProduct(draft(), ctx);
    await enqueueSnapshot({ kind: 'standardPrice', language: 'en', name: 'Tea', price: gbp(99) }, { purpose: 'normal', copies: 5, title: 'Tea' });
    const s = await loadWorkSummary();
    expect([s.waitingLabels, s.waitingProducts]).toEqual([6, 2]);
  });
  it('manual add queues an unchanged product; remove takes it out', async () => {
    const { product } = await saveProduct(draft(), ctx);
    const [i] = await listWaiting();
    await markPrinted([{ intentId: i.id, contentFingerprint: i.contentFingerprint }]);
    await enqueueProductManually(product, ctx, 2);
    const w = await listWaiting();
    expect(w).toHaveLength(1);
    await removeIntents([w[0].id]);
    expect(await listWaiting()).toHaveLength(0);
  });
  it('a failed write rolls every key back (no half-saved product without its label)', async () => {
    await saveProduct(draft(), ctx);
    const before = await AsyncStorage.getItem(TL_KEYS.products);
    const original = AsyncStorage.setItem;
    let calls = 0;
    (AsyncStorage as any).setItem = async (k: string, v: string) => { calls++; if (calls === 2) throw new Error('disk full'); return original(k, v); };
    try {
      await expect(saveProduct(draft({ name: 'New', barcodes: [] }), ctx)).rejects.toThrow('disk full');
    } finally { (AsyncStorage as any).setItem = original; }
    expect(await AsyncStorage.getItem(TL_KEYS.products)).toBe(before);
  });
});

describe('label content', () => {
  it('a product without a printable name is reported, not cut', async () => {
    const { product } = await saveProduct(draft({ name: 'x'.repeat(60), barcodes: [] }), ctx);
    expect(productContent(product, { language: 'en' })).toEqual({ ok: false, problem: 'noLabelName' });
  });
  it('barcode label uses the stored barcode exactly; unit price is computed exactly', async () => {
    const { product } = await saveProduct(draft({ sellingUnit: { kind: 'weight', grams: 400 }, unitPriceBase: 'per_kg', labelKind: 'priceBarcode' }), ctx);
    expect(printableBarcode(product)).toEqual({ value: '5000157024671', format: 'ean13' });
    const r = productContent(product, { language: 'en' });
    expect(r.ok && r.content.barcode?.value).toBe('5000157024671');
    const u = productContent(product, { language: 'en', kind: 'priceUnitPrice' });
    expect(u.ok && u.content.unitPrice?.amount.minor).toBe(373); // 149 × 1000 / 400 = 372.5 → 373
  });
  it('fingerprint changes with what prints and not with key order', () => {
    const a = { kind: 'standardPrice' as const, language: 'en' as const, name: 'Tea', price: gbp(99) };
    expect(contentFingerprint(a)).toBe(contentFingerprint({ price: gbp(99), name: 'Tea', language: 'en', kind: 'standardPrice' }));
    expect(contentFingerprint(a)).not.toBe(contentFingerprint({ ...a, price: gbp(98) }));
  });
  it('promotions compute the offer price exactly and never touch the product price', async () => {
    const { product } = await saveProduct(draft({ price: gbp(599), barcodes: [] }), ctx);
    const promo = (type: Promotion['type']): Promotion => ({ schemaVersion: 1, id: 'p', name: 'x', productIds: [product.id], type, status: 'active', createdAt: '', updatedAt: '', endDate: '2026-10-31' });
    const pct = promotionContent(promo({ kind: 'percentOff', percentHundredths: 2500 }), product, { language: 'en' });
    expect(pct.ok && [pct.content.price.minor, pct.content.validUntil]).toEqual([449, '2026-10-31']);
    const off = promotionContent(promo({ kind: 'moneyOff', amount: gbp(100) }), product, { language: 'en' });
    expect(off.ok && off.content.price.minor).toBe(499);
    expect(promotionContent(promo({ kind: 'moneyOff', amount: gbp(900) }), product, { language: 'en' })).toEqual({ ok: false, problem: 'badPromotion' });
    expect((await listProducts())[0].price.minor).toBe(599);
  });
  it('promotion validation', () => {
    const base = { name: 'Offer', productIds: ['a'] };
    expect(validatePromotion({ ...base, type: { kind: 'percentOff', percentHundredths: 0 } }, 'GBP')).toBe('badPercent');
    expect(validatePromotion({ ...base, type: { kind: 'multibuy', quantity: 1, totalPrice: gbp(500) } }, 'GBP')).toBe('badQuantity');
    expect(validatePromotion({ ...base, type: { kind: 'wasNow', referencePrice: moneyFromMinor(500, 'EUR') } }, 'GBP')).toBe('mixedCurrency');
    expect(validatePromotion({ ...base, type: { kind: 'conditional', condition: ' ', conditionalPrice: gbp(100) } }, 'GBP')).toBe('conditionRequired');
    expect(validatePromotion({ ...base, type: { kind: 'percentOff', percentHundredths: 2000 }, startDate: '2026-10-10', endDate: '2026-10-01' }, 'GBP')).toBe('badDates');
    expect(isLive({ status: 'active', startDate: '2026-10-01', endDate: '2026-10-31' } as Promotion, '2026-11-01')).toBe(false);
  });
  it('reductions must be below the normal price', async () => {
    await expect(saveReduction({ productName: 'Bread', normalPrice: gbp(150), reducedPrice: gbp(150), copies: 1 })).rejects.toThrow();
    await expect(saveReduction({ productName: 'Bread', normalPrice: gbp(150), reducedPrice: gbp(50), copies: 3 })).resolves.toMatchObject({ copies: 3 });
  });
});

describe('stationery, calibration, jobs', () => {
  it('custom profiles are validated; presets always listed', async () => {
    const bad = { ...PRESETS[0], id: undefined, name: 'Too many', rows: 20 };
    await expect(saveCustomProfile(bad as any)).rejects.toBeInstanceOf(StationeryInvalidError);
    const ok = await saveCustomProfile({ ...PRESETS[0], id: undefined, name: 'My tickets' } as any);
    expect(ok.isPreset).toBe(false);
    expect((await listAllProfiles()).length).toBe(PRESETS.length + 1);
  });
  it('calibration offsets snap to 0.5 mm and stay within ±10 mm', async () => {
    const c = await saveCalibration('preset_shelf_70x38_a4', 1.26, -14);
    expect([c.offsetXMm, c.offsetYMm]).toEqual([1.5, -10]);
    expect((await getCalibration('preset_shelf_70x38_a4'))?.offsetXMm).toBe(1.5);
  });
  it('jobs are recorded newest first and move status only when told', async () => {
    const j = await recordJob({ lines: [], stationeryProfileId: 'p', rendererVersion: 'r', pdfUri: 'file:///a.pdf', pdfSha256: 'abc', displayName: 'Labels', startPosition: 1, labelCount: 3, pageCount: 1, kind: 'queue' });
    expect((await listJobs())[0].status).toBe('generated');
    await setJobStatus(j.id, 'confirmed');
    expect((await listJobs())[0]).toMatchObject({ status: 'confirmed' });
  });
});
