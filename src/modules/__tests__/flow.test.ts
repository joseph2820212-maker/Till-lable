/**
 * End to end, below the screens: product → changed-only queue → one authoritative PDF job (real sheet engine,
 * embedded fonts) → "Yes, printed" → nothing waits → price change → waits again. Only the native PDF step is stubbed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { moneyFromMinor } from '../../domain/money';
import { saveProduct, listProducts } from '../products/storage/productStore';
import { listWaiting, markPrinted, enqueueSnapshot } from '../queue/storage/queueStore';
import { resolveQueue, generateSheetJob, generateCalibrationJob, optionsFor, sampleLabels } from '../print/printService';
import { getJob, listJobs } from '../print/storage/jobStore';
import { getProfile, saveCalibration } from '../print/storage/stationeryStore';
import { DEFAULT_LABEL_SETTINGS } from '../settings/storage/labelSettings';
import { printFlow, startPreview, marksPrinted } from '../labels/engine/printFlow';

const lastHtml: string[] = [];
jest.mock('../labels/engine/fontsLoader', () => ({ loadLabelFonts: async () => require('../labels/engine/__tests__/fixtures').TEST_FONTS }));
jest.mock('../labels/engine/pdfJob', () => ({
  generateLabelPdf: async (html: string, name: string) => { lastHtml.push(html); return { uri: `file:///docs/pdf-cache/${name}`, sha256: `sha-${html.length}` }; },
}));

const ctx = { language: 'en' as const, defaultKind: 'standardPrice' as const };
beforeEach(() => { (AsyncStorage as any).clear(); lastHtml.length = 0; });

it('a price change travels from the product to one printed PDF and back to the queue only when it changes again', async () => {
  const { product } = await saveProduct({ name: 'Heinz Cream of Tomato Soup', secondLine: '400 g', price: moneyFromMinor(149, 'GBP'), barcodes: [{ raw: '5000157024671' }], labelKind: 'priceBarcode' }, ctx);
  const waiting = await listWaiting();
  expect(waiting).toHaveLength(1);

  const items = resolveQueue(waiting, await listProducts(), 'en', DEFAULT_LABEL_SETTINGS);
  expect(items[0].content?.barcode?.value).toBe('5000157024671');
  const profile = await getProfile('preset_shelf_70x38_a4');
  await saveCalibration(profile.id, 0.5, -0.5);
  const r = await generateSheetJob({ profileId: profile.id, items: items.map(i => ({ content: i.content!, copies: 3, intentId: i.intent.id, options: optionsFor(i.content!, profile, DEFAULT_LABEL_SETTINGS) })), startPosition: 2, displayName: 'Labels (3)', kind: 'queue' });
  if (!r.ok) throw new Error(JSON.stringify(r));
  expect([r.job.labelCount, r.job.pageCount, r.job.startPosition, r.job.lines[0].copies]).toEqual([3, 1, 2, 3]);
  expect(lastHtml[0]).toContain("font-family:'TL Latin'");
  expect(lastHtml[0]).toContain('@page{size:210mm 297mm;margin:0}');
  expect(lastHtml[0]).toContain('class="barcode"');
  expect(await getJob(r.job.id)).toMatchObject({ pdfSha256: r.job.pdfSha256, status: 'generated' });

  // Share first: nothing changes. Then Print → back → "Yes, printed".
  let flow = printFlow(startPreview(r.job.pdfSha256), { type: 'tapShare' });
  expect(marksPrinted(flow)).toBe(false);
  flow = printFlow(printFlow(printFlow(flow, { type: 'tapPrint' }), { type: 'returnedFromPrintDialog' }), { type: 'answerPrinted' });
  expect(marksPrinted(flow)).toBe(true);
  await markPrinted(r.job.lines);
  expect(await listWaiting()).toHaveLength(0);

  await saveProduct({ name: 'Heinz Cream of Tomato Soup', secondLine: '400 g', price: moneyFromMinor(149, 'GBP'), barcodes: [{ raw: '5000157024671' }], labelKind: 'priceBarcode' }, { ...ctx, id: product.id });
  expect(await listWaiting()).toHaveLength(0);
  await saveProduct({ name: 'Heinz Cream of Tomato Soup', secondLine: '400 g', price: moneyFromMinor(159, 'GBP'), barcodes: [{ raw: '5000157024671' }], labelKind: 'priceBarcode' }, { ...ctx, id: product.id });
  expect(await listWaiting()).toHaveLength(1);
});

it('a label that does not fit is refused with its reason and no job is recorded', async () => {
  const content = { kind: 'standardPrice' as const, language: 'en' as const, name: 'Big', price: moneyFromMinor(9999999, 'MXN') };
  const intent = await enqueueSnapshot(content, { purpose: 'normal', copies: 1, title: 'Big' });
  const r = await generateSheetJob({ profileId: 'preset_shelf_70x38_a4', items: [{ content, copies: 1, intentId: intent.id }], displayName: 'x', kind: 'queue' });
  expect(r).toMatchObject({ ok: false, reason: 'labels' });
  expect(await listJobs()).toHaveLength(0);
  const card = await generateSheetJob({ profileId: 'preset_offer_a4', items: [{ content, copies: 1, intentId: intent.id }], displayName: 'x', kind: 'queue' });
  expect(card.ok).toBe(true);
});

it('label tests and calibration pages never touch the queue', async () => {
  await saveProduct({ name: 'Tea', price: moneyFromMinor(99, 'GBP') }, ctx);
  const [c] = sampleLabels('ar', 'AED', 'priceUnitPrice');
  const t = await generateSheetJob({ profileId: 'preset_avery_l7160', items: [{ content: c, copies: 21 }], displayName: 'Label test', kind: 'test' });
  expect(t.ok && t.job.lines).toEqual([]);
  const cal = await generateCalibrationJob('preset_shelf_70x38_a4', 'de');
  expect(cal.ok).toBe(true);
  expect(lastHtml.at(-1)).toContain('Mit 100 % / Tatsächlicher Größe drucken');
  expect(await listWaiting()).toHaveLength(1);
});
