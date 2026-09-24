/**
 * Retained print-job PDFs: the app-owned directory, safe names, and cleanup of files no job refers to any more.
 * Shared by Print history (pruning) and backup/restore, which also holds RETAINED_PDF_LOCK while it reads or writes
 * files here, so a cleanup can never delete a file a backup or restore is working with.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { withStorageKeyLock } from '../../../utils/storageSafety';

/** Where job PDFs live (utils/pdfFile.ts, temporary:false) and where restored PDFs are written. */
export const PDF_DIR = 'pdf-cache/';
/** One lock for every whole-directory operation on retained PDFs (backup, restore, reconciliation). */
export const RETAINED_PDF_LOCK = 'backup:restore';
/** A file younger than this may belong to a job that is being recorded right now; reconciliation leaves it alone. */
export const RECONCILE_MIN_AGE_MS = 10 * 60 * 1000;
/** A retained PDF name: plain ASCII, no separators, no dot-segments, no percent escapes (V14 names are ASCII). */
const SAFE_PDF_NAME = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.pdf$/;
const MAX_PDF_NAME = 160;

export function documentRoot(): string {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Device document storage is unavailable.');
  return root.endsWith('/') ? root : `${root}/`;
}
export const retainedPdfDir = () => `${documentRoot()}${PDF_DIR}`;

/** True only for a plain file name that cannot leave pdf-cache or alias the reserved transaction directory. */
export function isSafePdfName(name: unknown): name is string {
  if (typeof name !== 'string' || !name || name.length > MAX_PDF_NAME) return false;
  if (!SAFE_PDF_NAME.test(name)) return false;
  // No separators, no leading dot, no empty or dot-only segments: it can only ever name a file directly in pdf-cache.
  return !name.split('.').some(seg => seg === '');
}

/** The pdf-cache file name of a job PDF on THIS phone, or null if the URI is anywhere else. */
export function retainedPdfName(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri) return null;
  let dir: string;
  try { dir = retainedPdfDir(); } catch { return null; }
  if (!uri.startsWith(dir)) return null;
  const name = uri.slice(dir.length);
  return isSafePdfName(name) ? name : null;
}

interface JobRef { pdfUri?: string }

/**
 * For KEEPING files: the pdf-cache file name a job refers to, matched by name wherever the stored absolute path
 * points (iOS moves the app container between updates, so an older absolute path must still protect its file).
 * Deliberately lenient — it can only ever keep a file, never delete one.
 */
function referencedName(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri) return null;
  const at = uri.lastIndexOf(`/${PDF_DIR}`);
  if (at < 0) return null;
  const name = uri.slice(at + PDF_DIR.length + 1);
  return isSafePdfName(name) ? name : null;
}

/**
 * After jobs were pruned from history: delete each pruned job's retained PDF unless a surviving job still refers to
 * the same file. Best effort — a failure is left for reconcileRetainedPdfs() to retry and never throws.
 */
export async function deletePrunedJobPdfs(pruned: JobRef[], survivors: JobRef[]): Promise<{ deleted: number; failed: number }> {
  const keep = new Set(survivors.map(j => referencedName(j?.pdfUri)).filter((n): n is string => !!n));
  const drop = new Set(pruned.map(j => retainedPdfName(j?.pdfUri)).filter((n): n is string => !!n && !keep.has(n)));
  let deleted = 0, failed = 0;
  if (!drop.size) return { deleted, failed };
  try {
    await withStorageKeyLock(RETAINED_PDF_LOCK, async () => {
      for (const name of drop) {
        try { await FileSystem.deleteAsync(`${retainedPdfDir()}${name}`, { idempotent: true }); deleted++; }
        catch { failed++; }
      }
    });
  } catch { failed = drop.size - deleted; }
  return { deleted, failed };
}

/**
 * Remove files in the app-owned PDF directory that no job refers to. Only safe .pdf names directly in that directory
 * are considered, and only files older than RECONCILE_MIN_AGE_MS (a PDF is written just before its job is recorded).
 * `readJobs` is called inside the lock so the reference set is current; it must read STRICTLY (throw on a corrupt or
 * unreadable list) — if it throws, nothing is deleted. Best effort; never throws.
 */
export async function reconcileRetainedPdfs(readJobs: () => Promise<JobRef[]>, now = Date.now()): Promise<{ deleted: number; failed: number; kept: number }> {
  const result = { deleted: 0, failed: 0, kept: 0 };
  try {
    await withStorageKeyLock(RETAINED_PDF_LOCK, async () => {
      const dir = retainedPdfDir();
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) return;
      const referenced = new Set((await readJobs()).map(j => referencedName(j?.pdfUri)).filter((n): n is string => !!n));
      for (const entry of await FileSystem.readDirectoryAsync(dir)) {
        if (!isSafePdfName(entry) || referenced.has(entry)) { result.kept++; continue; }
        const uri = `${dir}${entry}`;
        try {
          const info = await FileSystem.getInfoAsync(uri) as { exists: boolean; isDirectory?: boolean; modificationTime?: number };
          const ageMs = typeof info.modificationTime === 'number' ? now - info.modificationTime * 1000 : -1;
          if (!info.exists || info.isDirectory || ageMs < RECONCILE_MIN_AGE_MS) { result.kept++; continue; }
          await FileSystem.deleteAsync(uri, { idempotent: true });
          result.deleted++;
        } catch { result.failed++; }
      }
    });
  } catch { /* the reference list could not be read: delete nothing */ }
  return result;
}
