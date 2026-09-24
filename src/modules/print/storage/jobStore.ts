/**
 * Print jobs (TL-18, TL-21): an immutable record of each generated PDF — what was on it, which stationery, the
 * start position, the file and its SHA-256. The job's status only moves forward after the user answers the
 * post-print question; sharing never changes it.
 */
import { TL_KEYS } from '../../../storage/keys';
import { readList, updateList } from '../../../storage/repo';
import { SCHEMA_VERSIONS, type PrintJob, type PrintJobLine } from '../../../domain/types';
import { makeId, nowIso } from '../../products/utils/ids';
import { deletePrunedJobPdfs, reconcileRetainedPdfs } from './retainedPdfs';
import { readStorageList } from '../../../utils/storageSafety';

export interface JobInput {
  lines: PrintJobLine[];
  stationeryProfileId: string;
  rendererVersion: string;
  pdfUri: string;
  pdfSha256: string;
  displayName: string;
  startPosition: number;
  labelCount: number;
  pageCount: number;
  /** Test sheets and label tests are recorded but never touch the queue. */
  kind: 'queue' | 'test' | 'calibration' | 'reprint';
}

export type StoredJob = PrintJob & { labelCount: number; pageCount: number; kind: JobInput['kind'] };

export const MAX_JOBS = 300;

export async function listJobs(): Promise<StoredJob[]> {
  return (await readList<StoredJob>(TL_KEYS.jobs)).filter(j => j && j.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getJob(id: string): Promise<StoredJob | null> {
  return (await readList<StoredJob>(TL_KEYS.jobs)).find(j => j.id === id) ?? null;
}

export async function recordJob(input: JobInput): Promise<StoredJob> {
  const job: StoredJob = {
    schemaVersion: SCHEMA_VERSIONS.printJob, id: makeId('job'), lines: input.lines, stationeryProfileId: input.stationeryProfileId,
    layoutId: 'sheet', rendererVersion: input.rendererVersion, pdfUri: input.pdfUri, displayName: input.displayName, pdfSha256: input.pdfSha256,
    startPosition: input.startPosition, status: 'generated', createdAt: nowIso(), labelCount: input.labelCount, pageCount: input.pageCount, kind: input.kind,
  };
  const { pruned, kept } = await updateList<StoredJob, { pruned: StoredJob[]; kept: StoredJob[] }>(TL_KEYS.jobs, list => {
    const next = [...list, job];
    const cut = Math.max(0, next.length - MAX_JOBS);
    return { list: next.slice(cut), result: { pruned: next.slice(0, cut), kept: next.slice(cut) } };
  });
  // After the history write: remove PDFs only pruned jobs used. Best effort; reconcileJobPdfs() retries leftovers.
  if (pruned.length) await deletePrunedJobPdfs(pruned, kept);
  return job;
}

/** Delete retained PDFs that no history entry refers to (e.g. a cleanup that failed earlier). Never throws. */
export function reconcileJobPdfs(now?: number) {
  // Strict: a corrupt or unreadable history must never look like "no references" (that would delete every PDF).
  return reconcileRetainedPdfs(() => readStorageList<StoredJob>(TL_KEYS.jobs, { strict: true }), now);
}

export async function setJobStatus(id: string, status: PrintJob['status']): Promise<void> {
  await updateList<StoredJob>(TL_KEYS.jobs, list => ({
    list: list.map(j => (j.id === id ? { ...j, status, ...(status === 'confirmed' ? { confirmedAt: nowIso() } : {}) } : j)),
    result: undefined,
  }));
}
