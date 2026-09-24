/**
 * Retained-PDF lifecycle (source closure, final item 2): pruning Print history past its limit deletes a PDF only when
 * no surviving job uses it; a reconciliation pass removes leftovers; a failed delete never harms history.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-file-system/legacy', () => jest.requireActual('../../../../__mocks__/expo-file-system.ts'));

import * as FileSystem from 'expo-file-system/legacy';
import { TL_KEYS } from '../../../storage/keys';
import { listJobs, MAX_JOBS, reconcileJobPdfs, recordJob } from '../storage/jobStore';
import { RECONCILE_MIN_AGE_MS } from '../storage/retainedPdfs';

const fs = FileSystem as unknown as { deleteAsync: jest.Mock; __setModificationTime: (uri: string, s: number) => void };
const DIR = 'file:///docs/pdf-cache/';
const exists = async (name: string) => (await FileSystem.getInfoAsync(`${DIR}${name}`)).exists;
const put = async (name: string, ageMs = 0) => {
  await FileSystem.writeAsStringAsync(`${DIR}${name}`, 'JVBERi0=');
  fs.__setModificationTime(`${DIR}${name}`, (Date.now() - ageMs) / 1000);
};
const stored = (i: number, name: string) => ({ id: `job${i}`, pdfUri: `${DIR}${name}`, pdfSha256: 'x', displayName: `Job ${i}`, createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(), lines: [], kind: 'queue', status: 'confirmed', labelCount: 1, pageCount: 1 });
const input = (name: string) => ({ lines: [], stationeryProfileId: 's', rendererVersion: 'r', pdfUri: `${DIR}${name}`, pdfSha256: 'y', displayName: name, startPosition: 1, labelCount: 1, pageCount: 1, kind: 'queue' as const });

/** A full history: job0 owns Only0.pdf; job1 and job150 share Shared.pdf; everyone else has their own file. */
async function seedFullHistory() {
  (AsyncStorage as any).clear();
  await FileSystem.deleteAsync('file:///docs/');
  const jobs = [];
  for (let i = 0; i < MAX_JOBS; i++) {
    const name = i === 0 ? 'Only0.pdf' : i === 1 || i === 150 ? 'Shared.pdf' : `Job_${i}.pdf`;
    if (i !== 150) await put(name);
    jobs.push(stored(i, name));
  }
  await AsyncStorage.setItem(TL_KEYS.jobs, JSON.stringify(jobs));
}

beforeEach(() => { jest.clearAllMocks(); });

describe('pruning Print history past its limit', () => {
  it('deletes a pruned job\'s PDF when nothing else uses it, and never a PDF a surviving job still uses', async () => {
    await seedFullHistory();
    await put('New_1.pdf');
    await recordJob(input('New_1.pdf')); // prunes job0
    expect((await listJobs()).length).toBe(MAX_JOBS);
    expect(await exists('Only0.pdf')).toBe(false);
    expect(await exists('New_1.pdf')).toBe(true);
    await put('New_2.pdf');
    await recordJob(input('New_2.pdf')); // prunes job1, whose file job150 still uses
    expect(await exists('Shared.pdf')).toBe(true);
    expect((await listJobs()).some(j => j.id === 'job150')).toBe(true);
    expect(await exists('Job_2.pdf')).toBe(true); // untouched survivors
  });

  it('a failed delete does not affect the history write; reconciliation removes the file later', async () => {
    await seedFullHistory();
    const real = fs.deleteAsync.getMockImplementation()!;
    fs.deleteAsync.mockImplementation(async () => { throw new Error('EBUSY'); });
    let job;
    try {
      await put('New_1.pdf');
      job = await recordJob(input('New_1.pdf'));
    } finally { fs.deleteAsync.mockImplementation(real); }
    const jobs = await listJobs();
    expect(jobs.length).toBe(MAX_JOBS);
    expect(jobs.some(j => j.id === job.id)).toBe(true);
    expect(jobs.some(j => j.id === 'job0')).toBe(false);
    expect(await exists('Only0.pdf')).toBe(true); // left behind…
    fs.__setModificationTime(`${DIR}Only0.pdf`, (Date.now() - RECONCILE_MIN_AGE_MS - 1000) / 1000);
    expect((await reconcileJobPdfs()).deleted).toBe(1); // …and retried
    expect(await exists('Only0.pdf')).toBe(false);
    expect(await exists('Shared.pdf')).toBe(true);
  });
});

describe('reconciling the retained-PDF directory', () => {
  beforeEach(async () => {
    (AsyncStorage as any).clear();
    await FileSystem.deleteAsync('file:///docs/');
    await FileSystem.deleteAsync('file:///cache/');
  });
  const OLD = RECONCILE_MIN_AGE_MS + 60_000;

  it('removes only old, unreferenced, safely named PDFs directly in the app-owned directory', async () => {
    await put('Referenced.pdf', OLD);
    await put('Orphan.pdf', OLD);
    await put('Fresh_orphan.pdf', 1000); // may belong to a job being recorded right now
    await put('notes.txt', OLD);
    await FileSystem.writeAsStringAsync(`${DIR}sub/Nested.pdf`, 'x');
    await FileSystem.writeAsStringAsync('file:///cache/pdf-cache/Preview.pdf', 'x'); // someone else's directory
    await FileSystem.writeAsStringAsync('file:///docs/Other.pdf', 'x');
    await AsyncStorage.setItem(TL_KEYS.jobs, JSON.stringify([stored(1, 'Referenced.pdf')]));
    const r = await reconcileJobPdfs();
    expect(r.deleted).toBe(1);
    expect(await exists('Orphan.pdf')).toBe(false);
    for (const n of ['Referenced.pdf', 'Fresh_orphan.pdf', 'notes.txt']) expect(await exists(n)).toBe(true);
    expect((await FileSystem.getInfoAsync(`${DIR}sub/Nested.pdf`)).exists).toBe(true);
    expect((await FileSystem.getInfoAsync('file:///cache/pdf-cache/Preview.pdf')).exists).toBe(true);
    expect((await FileSystem.getInfoAsync('file:///docs/Other.pdf')).exists).toBe(true);
  });

  it('a job path from an older app location still protects its file (matched by name)', async () => {
    await put('Moved.pdf', OLD);
    await AsyncStorage.setItem(TL_KEYS.jobs, JSON.stringify([{ ...stored(1, 'x.pdf'), pdfUri: 'file:///var/mobile/Containers/OLD-UUID/Documents/pdf-cache/Moved.pdf' }]));
    expect((await reconcileJobPdfs()).deleted).toBe(0);
    expect(await exists('Moved.pdf')).toBe(true);
  });

  it('an unreadable or corrupt history deletes nothing (it must never look like "no references")', async () => {
    await put('A.pdf', OLD);
    await put('B.pdf', OLD);
    await AsyncStorage.setItem(TL_KEYS.jobs, '{not json');
    expect((await reconcileJobPdfs()).deleted).toBe(0);
    await AsyncStorage.setItem(TL_KEYS.jobs, '{"an":"object"}');
    expect((await reconcileJobPdfs()).deleted).toBe(0);
    expect(await exists('A.pdf')).toBe(true);
    expect(await exists('B.pdf')).toBe(true);
  });

  it('a delete that fails is counted and the rest continue; it never throws', async () => {
    await put('X.pdf', OLD);
    await put('Y.pdf', OLD);
    await AsyncStorage.setItem(TL_KEYS.jobs, '[]');
    const real = fs.deleteAsync.getMockImplementation()!;
    fs.deleteAsync.mockImplementation(async (uri: string) => { if (uri.endsWith('X.pdf')) throw new Error('EBUSY'); return real(uri); });
    try {
      const r = await reconcileJobPdfs();
      expect(r).toMatchObject({ deleted: 1, failed: 1 });
    } finally { fs.deleteAsync.mockImplementation(real); }
    expect(await exists('X.pdf')).toBe(true);
    expect(await exists('Y.pdf')).toBe(false);
  });
});
