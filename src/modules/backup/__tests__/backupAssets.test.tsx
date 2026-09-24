/**
 * Asset-aware backup (source closure item 1): retained print-job PDFs travel inside the encrypted backup and come back
 * byte-identical on another phone, with every pdfUri rewritten to the new phone and all failure modes failing closed.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('expo-file-system/legacy', () => jest.requireActual('../../../../__mocks__/expo-file-system.ts'));
jest.mock('../../../storage/fileUtils', () => ({ writeAndShare: jest.fn(async (name: string, content: string) => { (global as any).__lastBackup = content; return `file:///cache/${name}`; }) }));
jest.mock('react-native', () => {
  const R = require('react');
  const { rn } = require('../../../__tests__/helpers/screenStubs');
  return { ...rn, FlatList: (p: any) => R.createElement('View', null, p.data.length ? p.data.map((item: any, index: number) => R.createElement(R.Fragment, { key: String(index) }, p.renderItem({ item, index }))) : p.ListEmptyComponent) };
});
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../components/EmptyState', () => ({ EmptyState: 'EmptyState' }));
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('@react-navigation/native-stack', () => ({}));
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('../../../components/pdf/AppPdfPreviewScreen', () => ({ AppPdfPreviewScreen: 'PdfPreview' }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));

import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { writeAndShare } from '../../../storage/fileUtils';
import { encryptString } from '../../../backup/backupCrypto';
import { navState, flush } from '../../../__tests__/helpers/screenStubs';
import { BackupError, createBackup, estimateBackupBytes, isSafePdfName, MAX_BACKUP_BYTES, recoverInterruptedRestore, restoreBackup, RESTORE_JOURNAL_KEY } from '../backupFile';
import { getJob } from '../../print/storage/jobStore';
import { PrintPreviewScreen } from '../../print/screens/PrintPreviewScreen';
import { PrintHistoryScreen } from '../../print/screens/PrintHistoryScreen';
import { texts } from '../../../__tests__/helpers/screenStubs';
import { TL_KEYS } from '../../../storage/keys';

const fs = FileSystem as unknown as { documentDirectory: string; writeAsStringAsync: jest.Mock; readAsStringAsync: jest.Mock; getInfoAsync: jest.Mock; deleteAsync: jest.Mock };
const store = AsyncStorage as unknown as { clear: () => void; multiSet: jest.Mock };
const PHONE_A = 'file:///docs/';
const PHONE_B = 'file:///phone-b/docs/';
const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');
const shaOf = (base64: string) => bytesToHex(sha256(new Uint8Array(Buffer.from(base64, 'base64'))));
const PDF_1 = b64('%PDF-1.7\n1 0 obj << /Type /Page /MediaBox [0 0 595.28 841.89] >>\n% Milk 2L £1.45\n%%EOF');
const PDF_2 = b64('%PDF-1.7\n% Offer card A6 — 3 for £5\n%%EOF');
const lastFile = () => (global as any).__lastBackup as string;
const job = (id: string, root: string, name: string, base64: string, extra: object = {}) => ({
  schemaVersion: 1, id, lines: [], stationeryProfileId: 'sys-a4-card-70x38', layoutId: 'sheet', rendererVersion: 'r1',
  pdfUri: `${root}pdf-cache/${name}`, displayName: `Job ${id}`, pdfSha256: shaOf(base64), startPosition: 1, status: 'confirmed',
  createdAt: '2026-09-24T10:00:00Z', labelCount: 4, pageCount: 1, kind: 'queue', ...extra,
});
const allStored = async () => JSON.stringify(await AsyncStorage.multiGet((await AsyncStorage.getAllKeys()) as string[]));
const exists = async (uri: string) => (await FileSystem.getInfoAsync(uri)).exists;
const wipePhone = async (root: string) => { store.clear(); await FileSystem.deleteAsync(root); };

async function seedPhoneA() {
  await wipePhone(PHONE_A);
  await FileSystem.writeAsStringAsync(`${PHONE_A}pdf-cache/Milk_labels_1727172000000.pdf`, PDF_1, { encoding: 'base64' as any });
  await FileSystem.writeAsStringAsync(`${PHONE_A}pdf-cache/Offer_card_1727172000001.pdf`, PDF_2, { encoding: 'base64' as any });
  await AsyncStorage.setItem(TL_KEYS.products, JSON.stringify([{ id: 'P1', name: 'Milk 2L' }]));
  await AsyncStorage.setItem(TL_KEYS.jobs, JSON.stringify([
    job('job1', PHONE_A, 'Milk_labels_1727172000000.pdf', PDF_1),
    job('job2', PHONE_A, 'Offer_card_1727172000001.pdf', PDF_2),
    job('job3', PHONE_A, 'Milk_labels_1727172000000.pdf', PDF_1, { kind: 'reprint' }), // two entries, one file
  ]));
}

function craftV3(data: Record<string, string>, assets: unknown[], pass = 'pw-123456') {
  return JSON.stringify({ format: 'tilllabel', version: 3, enc: encryptString(JSON.stringify({ data, assets }), pass) });
}

const render = (el: React.ReactElement) => { let r: any; act(() => { r = TestRenderer.create(el); }); return r; };
async function previewOf(jobId: string) {
  navState.params = { jobId };
  const r = render(<PrintPreviewScreen />);
  await act(async () => { await flush(); await flush(); await flush(); });
  return r.root.findByType('PdfPreview').props as { sourceUri: string | null; error: string | null };
}

beforeEach(() => { jest.clearAllMocks(); fs.documentDirectory = PHONE_A; });
afterAll(() => { fs.documentDirectory = PHONE_A; });

describe('backup → wipe → restore on another phone → Print history opens the exact PDF', () => {
  it('restores every retained PDF byte-identical, rewrites pdfUri to the new phone and leaves no source path behind', async () => {
    await seedPhoneA();
    const r = await createBackup('pw-123456', '0.1.0');
    expect(r.pdfCount).toBe(2); // job1 and job3 share one file
    const header = JSON.parse(lastFile());
    expect(header.version).toBe(3);
    expect(header.pdfCount).toBe(2);
    expect(lastFile()).not.toContain(PDF_1.slice(0, 24)); // encrypted: no PDF bytes in the clear
    expect(lastFile()).not.toContain('pdf-cache');

    // "Another phone": a different document directory, nothing stored.
    fs.documentDirectory = PHONE_B;
    await wipePhone(PHONE_B);
    await FileSystem.writeAsStringAsync('file:///picked/backup.json', lastFile());
    const out = await restoreBackup('file:///picked/backup.json', 'pw-123456');
    expect(out.pdfCount).toBe(2);

    for (const [id, bytes] of [['job1', PDF_1], ['job2', PDF_2], ['job3', PDF_1]] as const) {
      const j = await getJob(id);
      expect(j!.pdfUri.startsWith(`${PHONE_B}pdf-cache/`)).toBe(true);
      const onDisk = await FileSystem.readAsStringAsync(j!.pdfUri, { encoding: 'base64' as any });
      expect(onDisk).toBe(bytes);
      expect(shaOf(onDisk)).toBe(j!.pdfSha256);
      const preview = await previewOf(id);
      expect(preview.error).toBeNull();
      expect(preview.sourceUri).toBe(j!.pdfUri);
    }
    expect(await allStored()).not.toContain(PHONE_A); // no stale URI from the source phone
    expect(await AsyncStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
    expect(await exists(`${PHONE_B}.tilllabel_restore/`)).toBe(false);
  });

  it('an older data-only backup restores history without the source path; Print preview says the PDF is not on this phone', async () => {
    await wipePhone(PHONE_A);
    const data = { [TL_KEYS.jobs]: JSON.stringify([job('old1', 'file:///some/other/phone/', 'Labels_1.pdf', PDF_1)]) };
    await FileSystem.writeAsStringAsync('file:///picked/v2.json', JSON.stringify({ format: 'tilllabel', version: 2, enc: encryptString(JSON.stringify({ data }), 'pw-123456') }));
    await restoreBackup('file:///picked/v2.json', 'pw-123456');
    expect((await getJob('old1'))!.pdfUri).toBe('');
    expect(await allStored()).not.toContain('some/other/phone');
    const preview = await previewOf('old1');
    expect(preview.error).toBe('print.pdfNotOnPhone');
    expect(preview.sourceUri).toBeNull();
    // …and a later backup of that history is still possible (a job without a retained PDF is not "missing").
    await expect(createBackup('pw-123456', '0.1.0')).resolves.toMatchObject({ pdfCount: 0 });
  });
});

describe('a missing or corrupt retained PDF is handled safely', () => {
  it('one missing PDF: the backup stops, lists the entry and shares nothing until the user decides', async () => {
    await seedPhoneA();
    await FileSystem.deleteAsync(`${PHONE_A}pdf-cache/Offer_card_1727172000001.pdf`);
    const err = await createBackup('pw-123456', '0.1.0').catch(e => e);
    expect(err).toBeInstanceOf(BackupError);
    expect(err.code).toBe('pdfs-unavailable');
    expect(err.unavailable).toEqual([{ jobId: 'job2', label: 'Job job2', reason: 'missing' }]);
    expect(writeAndShare).not.toHaveBeenCalled(); // "Cancel" = nothing written or shared
  });

  it('explicit continue: business data and available PDFs back up; the missing one is marked, counted and restores as unavailable', async () => {
    await seedPhoneA();
    await AsyncStorage.setItem(TL_KEYS.queue, JSON.stringify([{ id: 'q1', copies: 2 }]));
    await AsyncStorage.setItem(TL_KEYS.promotions, JSON.stringify([{ id: 'pr1' }]));
    await AsyncStorage.setItem(TL_KEYS.reductions, JSON.stringify([{ id: 'rd1' }]));
    await AsyncStorage.setItem(TL_KEYS.shop, JSON.stringify({ name: 'Corner Shop' }));
    await FileSystem.deleteAsync(`${PHONE_A}pdf-cache/Offer_card_1727172000001.pdf`);
    const sourceData = Object.fromEntries((await AsyncStorage.multiGet([TL_KEYS.products, TL_KEYS.queue, TL_KEYS.promotions, TL_KEYS.reductions, TL_KEYS.shop])) as [string, string][]);
    const r = await createBackup('pw-123456', '0.1.0', { omitUnavailablePdfs: ['job2'] });
    expect(r).toMatchObject({ pdfCount: 1, omittedPdfCount: 1 });
    expect(JSON.parse(lastFile())).toMatchObject({ pdfCount: 1, omittedPdfCount: 1 }); // stated in the file, never hidden

    fs.documentDirectory = PHONE_B;
    await wipePhone(PHONE_B);
    await FileSystem.writeAsStringAsync('file:///picked/backup.json', lastFile());
    await restoreBackup('file:///picked/backup.json', 'pw-123456');
    for (const [k, v] of Object.entries(sourceData)) expect(await AsyncStorage.getItem(k)).toBe(v); // all non-PDF data
    for (const id of ['job1', 'job3']) { // available PDFs byte-identical
      const j = (await getJob(id))!;
      expect(await FileSystem.readAsStringAsync(j.pdfUri, { encoding: 'base64' as any })).toBe(PDF_1);
    }
    const lost = (await getJob('job2'))!;
    expect(lost).toMatchObject({ pdfUri: '', pdfUnavailable: true, displayName: 'Job job2', labelCount: 4, status: 'confirmed' });
    expect(await allStored()).not.toContain(PHONE_A);
    // Visible in Print history, marked unavailable; the preview cannot print or share it.
    const history = render(<PrintHistoryScreen />);
    await act(async () => { await flush(); await flush(); });
    expect(texts(history)).toContain('Job job2');
    expect(texts(history).filter(x => x === 'history.pdfUnavailable')).toHaveLength(1);
    const preview = await previewOf('job2');
    expect(preview.error).toBe('print.pdfNotOnPhone');
    expect(preview.sourceUri).toBeNull();
  });

  it('a damaged PDF (hash mismatch) follows the same rule: listed as corrupt, never silently included or dropped', async () => {
    await seedPhoneA();
    await FileSystem.writeAsStringAsync(`${PHONE_A}pdf-cache/Milk_labels_1727172000000.pdf`, b64('%PDF tampered'), { encoding: 'base64' as any });
    const err = await createBackup('pw-123456', '0.1.0').catch(e => e);
    expect(err.code).toBe('pdfs-unavailable');
    expect(err.unavailable).toEqual([{ jobId: 'job1', label: 'Job job1', reason: 'corrupt' }, { jobId: 'job3', label: 'Job job3', reason: 'corrupt' }]);
    expect(writeAndShare).not.toHaveBeenCalled();
    const r = await createBackup('pw-123456', '0.1.0', { omitUnavailablePdfs: ['job1', 'job3'] });
    expect(r).toMatchObject({ pdfCount: 1, omittedPdfCount: 2 });
  });

  it('agreeing to omit one PDF never covers another that goes missing: the backup stops again', async () => {
    await seedPhoneA();
    await FileSystem.deleteAsync(`${PHONE_A}pdf-cache/Offer_card_1727172000001.pdf`);
    await FileSystem.deleteAsync(`${PHONE_A}pdf-cache/Milk_labels_1727172000000.pdf`);
    const err = await createBackup('pw-123456', '0.1.0', { omitUnavailablePdfs: ['job2'] }).catch(e => e);
    expect(err.code).toBe('pdfs-unavailable');
    expect(err.unavailable.map((u: any) => u.jobId)).toEqual(['job1', 'job2', 'job3']);
    expect(writeAndShare).not.toHaveBeenCalled();
  });

  it('restore refuses a backup whose PDF bytes do not match, or a job whose PDF is absent — before touching anything', async () => {
    await seedPhoneA();
    const before = await allStored();
    const jobs = JSON.stringify([job('j9', PHONE_A, 'Labels_9.pdf', PDF_1)]);
    const cases = [
      craftV3({ [TL_KEYS.jobs]: jobs }, [{ name: 'Labels_9.pdf', sha256: shaOf(PDF_1), size: 10, base64: PDF_2 }]), // bytes ≠ declared sha
      craftV3({ [TL_KEYS.jobs]: jobs }, [{ name: 'Labels_9.pdf', sha256: shaOf(PDF_2), size: 10, base64: PDF_2 }]), // asset ≠ job's sha
      craftV3({ [TL_KEYS.jobs]: jobs }, []), // job's PDF absent
      craftV3({ [TL_KEYS.jobs]: jobs }, [{ name: 'Labels_9.pdf', sha256: shaOf(PDF_1), size: 10, base64: PDF_1 }, { name: 'Labels_9.pdf', sha256: shaOf(PDF_1), size: 10, base64: PDF_1 }]), // duplicate
    ];
    for (const file of cases) {
      await FileSystem.writeAsStringAsync('file:///picked/bad.json', file);
      await expect(restoreBackup('file:///picked/bad.json', 'pw-123456')).rejects.toMatchObject({ code: 'invalid-format' });
    }
    expect(await allStored()).toBe(before);
    expect(await exists(`${PHONE_A}pdf-cache/Labels_9.pdf`)).toBe(false);
  });
});

describe('interrupted asset restore rolls metadata and files back together', () => {
  async function backupWithCollision() {
    // Backup made on phone A with two PDFs, then phone A moves on: new history, and a DIFFERENT file under one name.
    await seedPhoneA();
    await createBackup('pw-123456', '0.1.0');
    const file = lastFile();
    await FileSystem.writeAsStringAsync(`${PHONE_A}pdf-cache/Milk_labels_1727172000000.pdf`, b64('%PDF current phone copy'), { encoding: 'base64' as any });
    await AsyncStorage.setItem(TL_KEYS.jobs, JSON.stringify([job('now1', PHONE_A, 'Milk_labels_1727172000000.pdf', b64('%PDF current phone copy'))]));
    await FileSystem.deleteAsync(`${PHONE_A}pdf-cache/Offer_card_1727172000001.pdf`);
    await FileSystem.writeAsStringAsync('file:///picked/b.json', file);
    return { jobsBefore: await AsyncStorage.getItem(TL_KEYS.jobs) };
  }

  it('a failure after the PDFs are written restores the replaced PDF and removes the new one', async () => {
    const { jobsBefore } = await backupWithCollision();
    store.multiSet.mockImplementationOnce(async () => { throw new Error('disk full'); });
    await expect(restoreBackup('file:///picked/b.json', 'pw-123456')).rejects.toMatchObject({ code: 'rolled-back' });
    expect(await AsyncStorage.getItem(TL_KEYS.jobs)).toBe(jobsBefore);
    expect(await FileSystem.readAsStringAsync(`${PHONE_A}pdf-cache/Milk_labels_1727172000000.pdf`, { encoding: 'base64' as any })).toBe(b64('%PDF current phone copy'));
    expect(await exists(`${PHONE_A}pdf-cache/Offer_card_1727172000001.pdf`)).toBe(false);
    expect(await AsyncStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
    expect(await exists(`${PHONE_A}.tilllabel_restore/`)).toBe(false);
  });

  it('a crash mid-restore (rollback could not run) is rolled back on the next launch', async () => {
    const { jobsBefore } = await backupWithCollision();
    store.multiSet.mockImplementationOnce(async () => { throw new Error('process killed'); });
    const realDelete = fs.deleteAsync.getMockImplementation()!;
    // The in-process rollback dies too (its first step removes the newly written PDF).
    fs.deleteAsync.mockImplementation(async (uri: string) => { if (String(uri).endsWith('Offer_card_1727172000001.pdf')) throw new Error('process killed'); return realDelete(uri); });
    try {
      await expect(restoreBackup('file:///picked/b.json', 'pw-123456')).rejects.toMatchObject({ code: 'rollback-failed' });
    } finally { fs.deleteAsync.mockImplementation(realDelete); }
    expect(JSON.parse((await AsyncStorage.getItem(RESTORE_JOURNAL_KEY))!).state).toBe('prepared');
    // Next launch:
    expect(await recoverInterruptedRestore()).toBe('rolledBack');
    expect(await AsyncStorage.getItem(TL_KEYS.jobs)).toBe(jobsBefore);
    expect(await FileSystem.readAsStringAsync(`${PHONE_A}pdf-cache/Milk_labels_1727172000000.pdf`, { encoding: 'base64' as any })).toBe(b64('%PDF current phone copy'));
    expect(await exists(`${PHONE_A}pdf-cache/Offer_card_1727172000001.pdf`)).toBe(false);
    expect(await AsyncStorage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
    expect(await exists(`${PHONE_A}.tilllabel_restore/`)).toBe(false);
  });

  it('once committed, a later launch never rolls back', async () => {
    await backupWithCollision();
    await restoreBackup('file:///picked/b.json', 'pw-123456');
    const after = await allStored();
    expect(await recoverInterruptedRestore()).toBe('none');
    expect(await allStored()).toBe(after);
  });
});

describe('hostile paths cannot escape the app-owned PDF directory', () => {
  it.each([
    '../evil.pdf', '../../../../data/data/com.tilllabel.app/shared_prefs/x.pdf', 'sub/dir.pdf', '/abs.pdf', '..%2Fevil.pdf',
    '%2E%2E%2Fevil.pdf', '.tilllabel_restore.pdf', '.hidden.pdf', 'a..pdf', 'evil.pdf/', 'evil.PDF.exe', 'x\\..\\y.pdf', '', 'no-extension',
  ])('refuses %j', async name => {
    expect(isSafePdfName(name)).toBe(false);
    await seedPhoneA();
    const before = await allStored();
    const jobs = JSON.stringify([{ ...job('h1', 'file:///x/', 'placeholder.pdf', PDF_1), pdfUri: `file:///x/pdf-cache/${name}` }]);
    await FileSystem.writeAsStringAsync('file:///picked/h.json', craftV3({ [TL_KEYS.jobs]: jobs }, [{ name, sha256: shaOf(PDF_1), size: 10, base64: PDF_1 }]));
    await expect(restoreBackup('file:///picked/h.json', 'pw-123456')).rejects.toMatchObject({ code: 'invalid-format' });
    expect(await allStored()).toBe(before);
    const written = fs.writeAsStringAsync.mock.calls.map(c => String(c[0])).filter(u => u !== 'file:///picked/h.json' && !u.startsWith(`${PHONE_A}pdf-cache/Milk`) && !u.startsWith(`${PHONE_A}pdf-cache/Offer`));
    expect(written).toEqual([]);
  });
  it('accepts every name the app itself generates', () => {
    for (const n of ['Labels_1727172000000.pdf', 'Calibration_1727172000000.pdf', '-Deals_1727172000000.pdf', '3_labels_1727172000000.pdf', 'Document_1.pdf']) expect(isSafePdfName(n)).toBe(true);
  });
});

describe('the size limit is enforced before a large backup is built in memory', () => {
  it('refuses from the file sizes alone: no PDF is read and nothing is shared', async () => {
    await seedPhoneA();
    const realInfo = fs.getInfoAsync.getMockImplementation()!;
    fs.getInfoAsync.mockImplementation(async (uri: string) => (uri.includes('pdf-cache/') ? { exists: true, isDirectory: false, size: 80 * 1024 * 1024, uri } : realInfo(uri)));
    try {
      await expect(createBackup('pw-123456', '0.1.0')).rejects.toMatchObject({ code: 'too-large' });
      expect(fs.readAsStringAsync.mock.calls.some(c => String(c[0]).includes('pdf-cache/'))).toBe(false);
      expect(writeAndShare).not.toHaveBeenCalled();
    } finally { fs.getInfoAsync.mockImplementation(realInfo); }
  });
  it('the estimate is never below the real file and close to it', async () => {
    await seedPhoneA();
    await createBackup('pw-123456', '0.1.0');
    const dataJson = JSON.stringify(Object.fromEntries((await AsyncStorage.multiGet([TL_KEYS.products, TL_KEYS.jobs])) as [string, string][]));
    const est = estimateBackupBytes(Buffer.byteLength(dataJson), [Buffer.from(PDF_1, 'base64').length, Buffer.from(PDF_2, 'base64').length]);
    expect(est).toBeGreaterThanOrEqual(lastFile().length);
    expect(est - lastFile().length).toBeLessThan(8192);
    expect(estimateBackupBytes(0, [70 * 1024 * 1024])).toBeGreaterThan(MAX_BACKUP_BYTES); // 70 MB of PDFs cannot fit
  });
});
