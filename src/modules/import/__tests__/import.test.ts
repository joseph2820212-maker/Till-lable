import AsyncStorage from '@react-native-async-storage/async-storage';
import { zipSync, strToU8 } from 'fflate';
import { readXlsx, XlsxReadError, columnIndex } from '../xlsx';
import { commitImport, countByStatus, guessMapping, ImportCommitError, planImport, suggestNumberProfile, type ImportSettings } from '../importPlan';
import { buildPriceChangeFile, parsePriceChangeFile } from '../priceChangeFile';
import { parseCsv } from '../../products/utils/csvParse';
import { listProducts, saveProduct } from '../../products/storage/productStore';
import { listWaiting } from '../../queue/storage/queueStore';
import { moneyFromMinor } from '../../../domain/money';

const ctx = { language: 'en' as const, defaultKind: 'standardPrice' as const };
beforeEach(() => (AsyncStorage as any).clear());

function makeXlsx(sheetXml: string, shared: string[] = []): Uint8Array {
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="Prices" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="x"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8(`<sst>${shared.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`),
  });
}

describe('bounded XLSX reader', () => {
  it('reads shared strings, inline strings, numbers and cached formula values (never evaluates formulas)', () => {
    const book = readXlsx(makeXlsx(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
      + '<row r="2"><c r="A2" t="inlineStr"><is><t>Crème &amp; fraîche</t></is></c><c r="B2"><v>2.89</v></c></row>'
      + '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="C3"><f>SUM(1,2)</f><v>3</v></c></row>',
      ['Name', 'Price', 'Tea'],
    ));
    expect(book.sheetNames).toEqual(['Prices']);
    expect(book.rows()).toEqual([['Name', 'Price'], ['Crème & fraîche', '2.89'], ['Tea', '', '3']]);
    expect(columnIndex('AB')).toBe(27);
  });
  it('refuses a zip bomb, a non-xlsx file and a workbook without sheets', () => {
    const bomb = zipSync({ 'xl/workbook.xml': strToU8('<workbook/>'), 'xl/worksheets/sheet1.xml': new Uint8Array(41 * 1024 * 1024) }, { level: 9 });
    expect(() => readXlsx(bomb)).toThrow(XlsxReadError);
    expect(() => readXlsx(strToU8('name,price\nTea,1'))).toThrow(/notXlsx/);
    expect(() => readXlsx(zipSync({ 'xl/workbook.xml': strToU8('<workbook><sheets/></workbook>') }))).toThrow(/noSheet/);
  });
});

describe('import planning', () => {
  const csv = 'Product,Barcode,Price,Size\nHeinz Tomato Soup,5000157024671,1.49,400 g\nTea,,0.99,\nNo price,,,\nDup A,4000417025005,1.00,\nDup B,4000417025005,2.00,\n';
  const settings = (over: Partial<ImportSettings> = {}): ImportSettings => ({ mapping: guessMapping(parseCsv(csv)[0]), hasHeader: true, profile: { decimal: '.', grouping: ',' }, currency: 'GBP', ...over });

  it('guesses columns in six languages', () => {
    expect(guessMapping(['Nom', 'Prix', 'Code-barres', 'Taille'])).toEqual(['name', 'price', 'barcode', 'secondLine']);
    expect(guessMapping(['Ürün adı', 'Fiyat', 'Barkod'])).toEqual(['name', 'price', 'barcode']);
    expect(guessMapping(['اسم المنتج', 'السعر', 'الباركود'])).toEqual(['name', 'price', 'barcode']);
    expect(guessMapping(['Bezeichnung', 'Preis', 'Artikelnummer', 'Kurzname'])).toEqual(['name', 'price', 'sku', 'labelName']);
  });
  it('never guesses "1,234": ambiguous values are counted so the user must confirm the format', () => {
    expect(suggestNumberProfile(['1,234', '2,50', '3,99']).ambiguous).toBe(1);
    expect(suggestNumberProfile(['2,50', '3,99']).profile.decimal).toBe(',');
    expect(suggestNumberProfile(['2.50', '1,299.00']).profile.decimal).toBe('.');
  });
  it('classifies rows: new / invalid / conflict, and the same file again as unchanged', async () => {
    const rows = parseCsv(csv);
    const plan = planImport(rows, settings(), []);
    expect(countByStatus(plan)).toEqual({ new: 2, changed: 0, unchanged: 0, conflict: 2, invalid: 1 });
    expect(plan.find(r => r.name === 'No price')?.reason).toBe('missingPrice');
    const r = await commitImport({ rows, settings: settings(), expected: countByStatus(plan), ctx, queueOnImport: true, source: 'csv', fileName: 'a.csv', fileSha256: 'x', newProductAllowance: 200 });
    expect(r).toEqual({ created: 2, updated: 0, queued: 2 });
    expect(await listWaiting()).toHaveLength(2);
    const again = planImport(rows, settings(), await listProducts());
    expect(countByStatus(again)).toMatchObject({ new: 0, unchanged: 2 });
  });
  it('a price change matched by barcode updates the product and re-queues its label; the full name is kept', async () => {
    await saveProduct({ name: 'Heinz Cream of Tomato Soup Family Pack With A Very Long Name Indeed', labelName: 'Heinz Tomato Soup', price: moneyFromMinor(149, 'GBP'), barcodes: [{ raw: '5000157024671' }] }, ctx);
    const rows = parseCsv('Name,Barcode,Price\nHeinz Cream of Tomato Soup Family Pack With A Very Long Name Indeed,5000157024671,1.59\n');
    const s = settings({ mapping: guessMapping(rows[0]) });
    const plan = planImport(rows, s, await listProducts());
    expect(plan[0]).toMatchObject({ status: 'changed', oldPriceMinor: 149, priceMinor: 159 });
    await commitImport({ rows, settings: s, expected: countByStatus(plan), ctx, queueOnImport: true, source: 'csv', fileName: 'b.csv', fileSha256: 'y', newProductAllowance: 0 });
    const [p] = await listProducts();
    expect([p.price.minor, p.labelName, p.name.length > 40]).toEqual([159, 'Heinz Tomato Soup', true]);
  });
  it('comma-decimal files parse exactly with the confirmed profile', () => {
    const rows = parseCsv('Nom;Prix\n'.replace(';', ',') + '"Crème",2,89\n');
    const plan = planImport([['Nom', 'Prix'], ['Crème', '2,89']], { mapping: ['name', 'price'], hasHeader: true, profile: { decimal: ',', grouping: '.' }, currency: 'EUR' }, []);
    expect(plan[0]).toMatchObject({ status: 'new', priceMinor: 289 });
    expect(rows.length).toBeGreaterThan(0);
  });
  it('refuses to commit if the catalogue changed since the preview, or if new products exceed the Free allowance', async () => {
    const rows = parseCsv(csv);
    const plan = planImport(rows, settings(), []);
    await saveProduct({ name: 'Tea', price: moneyFromMinor(99, 'GBP'), barcodes: [{ raw: '5000157024671' }] }, ctx);
    await expect(commitImport({ rows, settings: settings(), expected: countByStatus(plan), ctx, queueOnImport: false, source: 'csv', fileName: 'a', fileSha256: 'x', newProductAllowance: 200 })).rejects.toMatchObject({ code: 'changedSincePreview' });
    (AsyncStorage as any).clear();
    await expect(commitImport({ rows, settings: settings(), expected: countByStatus(plan), ctx, queueOnImport: false, source: 'csv', fileName: 'a', fileSha256: 'x', newProductAllowance: 1 })).rejects.toBeInstanceOf(ImportCommitError);
    expect(await listProducts()).toHaveLength(0);
  });
});

describe('tillfamily.price-change v1', () => {
  const file = () => buildPriceChangeFile({ source: { app: 'TillCalc', batchId: 'b1', batchRevision: 3 }, createdAt: '2026-09-24T10:00:00Z', currency: 'GBP', items: [{ sourceId: 'i1', name: 'Tea', priceMinor: 129, barcode: '5000157024671' }] });
  it('round-trips with its checksum', () => {
    expect(parsePriceChangeFile(JSON.stringify(file()))).toMatchObject({ ok: true });
  });
  it('refuses edits, costs, wrong format or version', () => {
    const edited = { ...file(), items: [{ sourceId: 'i1', name: 'Tea', priceMinor: 1, barcode: '5000157024671' }] };
    expect(parsePriceChangeFile(JSON.stringify(edited))).toEqual({ ok: false, error: 'checksumMismatch' });
    const cost = { ...file(), items: [{ sourceId: 'i1', name: 'Tea', priceMinor: 129, packCost: 50 }] };
    expect(parsePriceChangeFile(JSON.stringify(cost))).toEqual({ ok: false, error: 'containsCosts' });
    expect(parsePriceChangeFile(JSON.stringify({ ...file(), version: 2 }))).toEqual({ ok: false, error: 'unsupportedVersion' });
    expect(parsePriceChangeFile('{"format":"other"}')).toEqual({ ok: false, error: 'wrongFormat' });
    expect(parsePriceChangeFile('nope')).toEqual({ ok: false, error: 'notJson' });
  });
});
