/** Regression tests for the independent code review of the app build (one test per confirmed finding). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { zipSync, strToU8 } from 'fflate';
import { moneyFromMinor } from '../../domain/money';
import { saveProduct, findByBarcode, listProducts } from '../products/storage/productStore';
import { listWaiting, markPrinted, syncPrintedContent, enqueueSnapshot, removePromotionLabels } from '../queue/storage/queueStore';
import { decodeText } from '../../utils/base64';
import { detectDelimiter, parseCsv } from '../products/utils/csvParse';
import { countByStatus, guessMapping, planImport } from '../import/importPlan';
import { readXlsx } from '../import/xlsx';
import { promotionContent } from '../labels/content';
import { resolveQueue } from '../print/printService';
import { DEFAULT_LABEL_SETTINGS } from '../settings/storage/labelSettings';
import type { Promotion } from '../../domain/types';

const ctx = { language: 'en' as const, defaultKind: 'standardPrice' as const };
const gbp = (m: number) => moneyFromMinor(m, 'GBP');
beforeEach(() => (AsyncStorage as any).clear());

describe('queue', () => {
  it('confirming an OLD job never clears a label whose price changed after that PDF was made', async () => {
    const { product } = await saveProduct({ name: 'Tea', price: gbp(100) }, ctx);
    const [first] = await listWaiting();
    const oldLines = [{ intentId: first.id, contentFingerprint: 'fp-old-pdf' }];
    await syncPrintedContent(oldLines); // the PDF at £1.00 was generated
    await saveProduct({ name: 'Tea', price: gbp(120) }, { ...ctx, id: product.id }); // then the price changed
    await markPrinted(oldLines); // "Yes, printed" on the old PDF
    const w = await listWaiting();
    expect(w).toHaveLength(1);
    expect(w[0].reason).toBe('priceChanged');
  });
  it('undoing a change removes the waiting label (the shelf already shows it)', async () => {
    const { product } = await saveProduct({ name: 'Tea', price: gbp(100) }, ctx);
    const [i] = await listWaiting();
    await markPrinted([{ intentId: i.id, contentFingerprint: i.contentFingerprint }]);
    await saveProduct({ name: 'Tea', price: gbp(120) }, { ...ctx, id: product.id });
    expect(await listWaiting()).toHaveLength(1);
    await saveProduct({ name: 'Tea', price: gbp(100) }, { ...ctx, id: product.id });
    expect(await listWaiting()).toHaveLength(0);
  });
});

describe('import', () => {
  it('a Windows-1252 CSV ("£" = 0xA3) is decoded correctly and the price is not changed', () => {
    const bytes = new Uint8Array([...strToU8('Name,Price\nTea,'), 0xa3, ...strToU8('1.50\n')]);
    const { text, encoding } = decodeText(bytes);
    expect(encoding).toBe('windows-1252');
    const rows = parseCsv(text);
    const plan = planImport(rows, { mapping: ['name', 'price'], hasHeader: true, profile: { decimal: '.', grouping: ',' }, currency: 'GBP' }, []);
    expect(plan[0]).toMatchObject({ status: 'new', priceMinor: 150 });
  });
  it('minus signs, brackets and other currencies are refused, never turned into a positive price', () => {
    const plan = planImport([['n', 'p'], ['A', '−1.50'], ['B', '(1.50)'], ['C', '€1.50'], ['D', '£ 1.50'], ['E', '1.50 GBP']], { mapping: ['name', 'price'], hasHeader: true, profile: { decimal: '.', grouping: ',' }, currency: 'GBP' }, []);
    expect(plan.map(r => r.status)).toEqual(['invalid', 'invalid', 'invalid', 'new', 'new']);
  });
  it('semicolon CSVs from European Excel are split on ";"', () => {
    const text = 'Nom;Prix\nLait;1,20\n"Crème; fraîche";2,89\n';
    expect(detectDelimiter(text)).toBe(';');
    const rows = parseCsv(text, ';');
    expect(rows[2]).toEqual(['Crème; fraîche', '2,89']);
    expect(guessMapping(rows[0])).toEqual(['name', 'price']);
  });
  it('the same product twice in one file is a conflict (SKU, name without codes, or one matched product)', async () => {
    const s = { mapping: ['name', 'sku', 'price'] as const, hasHeader: true, profile: { decimal: '.' as const, grouping: ',' as const }, currency: 'GBP' };
    const plan = planImport([['n', 's', 'p'], ['Tea', 'T1', '1'], ['Tea bags', 'T1', '2'], ['Milk', '', '1'], ['Milk', '', '2'], ['Bread', '', '1']], { ...s, mapping: [...s.mapping] }, []);
    expect(countByStatus(plan)).toMatchObject({ conflict: 4, new: 1 });
    await saveProduct({ name: 'Jam', sku: 'J1', price: gbp(100) }, ctx);
    const plan2 = planImport([['n', 's', 'p'], ['Jam', 'J1', '1'], ['Jam jar', 'J1', '2']], { ...s, mapping: [...s.mapping] }, await listProducts());
    expect(plan2.every(r => r.status === 'conflict')).toBe(true);
  });
  it('XLSX number cells are read with "." whatever text format was confirmed, and float noise is rounded', () => {
    const xlsx = zipSync({
      'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nom</t></is></c><c r="B1" t="inlineStr"><is><t>Prix</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Lait</t></is></c><c r="B2"><v>4.49</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Miel</t></is></c><c r="B3"><f>A1</f><v>2.9899999999999998</v></c></row></sheetData></worksheet>'),
    });
    const sheet = readXlsx(xlsx).sheet(0);
    const plan = planImport(sheet.rows, { mapping: ['name', 'price'], hasHeader: true, profile: { decimal: ',', grouping: '.' }, currency: 'EUR', numericCells: sheet.numericCells }, []);
    expect(plan.map(r => r.priceMinor)).toEqual([449, 299]);
  });
});

describe('catalogue', () => {
  it('a UPC-E product still matches scans after it is edited (unchanged code keeps its expanded form)', async () => {
    const { product } = await saveProduct({ name: 'Soda', price: gbp(100), barcodes: [{ raw: '01234565', symbology: 'upc_e' }] }, ctx);
    expect(await findByBarcode('01234565', 'upc_e')).not.toBeNull();
    await saveProduct({ name: 'Soda', price: gbp(110), barcodes: [{ raw: '01234565' }] }, { ...ctx, id: product.id });
    expect(await findByBarcode('01234565', 'upc_e')).not.toBeNull();
  });
  it('extra barcodes are kept when the first one is edited', async () => {
    const { product } = await saveProduct({ name: 'Soap', price: gbp(100), barcodes: [{ raw: '5000157024671' }, { raw: '4000417025005' }] }, ctx);
    const r = await saveProduct({ name: 'Soap', price: gbp(100), barcodes: [{ raw: '5000157024671' }, ...product.barcodes.slice(1).map(b => ({ raw: b.raw }))] }, { ...ctx, id: product.id });
    expect(r.product.barcodes.map(b => b.raw)).toEqual(['5000157024671', '4000417025005']);
  });
});

describe('offers', () => {
  const promo = (type: Promotion['type'], extra: Partial<Promotion> = {}): Promotion => ({ schemaVersion: 1, id: 'O1', name: 'x', productIds: ['p'], type, status: 'active', createdAt: '', updatedAt: '', ...extra });
  it('refuses false price claims: "was" not higher, multibuy not cheaper, member price not lower', async () => {
    const { product } = await saveProduct({ name: 'Tea', price: gbp(200) }, ctx);
    expect(promotionContent(promo({ kind: 'wasNow', referencePrice: gbp(100) }), product, { language: 'en' })).toEqual({ ok: false, problem: 'badPromotion' });
    expect(promotionContent(promo({ kind: 'multibuy', quantity: 3, totalPrice: gbp(600) }), product, { language: 'en' })).toEqual({ ok: false, problem: 'badPromotion' });
    expect(promotionContent(promo({ kind: 'conditional', condition: 'Card', conditionalPrice: gbp(200) }), product, { language: 'en' })).toEqual({ ok: false, problem: 'badPromotion' });
    expect(promotionContent(promo({ kind: 'wasNow', referencePrice: gbp(250) }), product, { language: 'en' }).ok).toBe(true);
  });
  it('queued offer labels follow a later price change, show "ended" when the offer ends, and can be removed', async () => {
    const { product } = await saveProduct({ name: 'Tea', price: gbp(200) }, ctx);
    const p = promo({ kind: 'percentOff', percentHundredths: 2500 }, { productIds: [product.id] });
    const first = promotionContent(p, product, { language: 'en' });
    if (!first.ok) throw new Error('offer');
    await enqueueSnapshot(first.content, { purpose: 'promotion', copies: 1, title: 'Tea', productId: product.id, promotionId: 'O1' });
    const { product: later } = await saveProduct({ name: 'Tea', price: gbp(400) }, { ...ctx, id: product.id });
    const waiting = (await listWaiting()).filter(i => i.promotionId);
    expect(resolveQueue(waiting, [later], 'en', DEFAULT_LABEL_SETTINGS, [p])[0].content?.price.minor).toBe(300);
    expect(resolveQueue(waiting, [later], 'en', DEFAULT_LABEL_SETTINGS, [{ ...p, status: 'ended' }])[0].problem).toBe('promotionEnded');
    await removePromotionLabels('O1');
    expect((await listWaiting()).filter(i => i.promotionId)).toHaveLength(0);
  });
});
