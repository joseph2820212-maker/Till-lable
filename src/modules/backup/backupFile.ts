/**
 * backupFile.ts — TillLabel backup & restore, asset-aware (plan G7, REUSE_MANIFEST §5 / V9).
 *
 * A backup is the restorable AsyncStorage keys PLUS the retained print-job PDFs that Print history reopens, in one
 * passphrase-encrypted file (AES-256-GCM + scrypt, see backupCrypto). Only the Till Note asset-transaction DESIGN is
 * reused (stage → journal → commit → verify → roll back), not its code wholesale; TillLabel has no SecureStore
 * credentials to carry, so the journal is a file plus a small AsyncStorage marker.
 *
 * Backup : collects each job's PDF (explicitly from the jobs list, never by scanning values), estimates the final file
 *          size from file sizes BEFORE reading any bytes and refuses above MAX_BACKUP_BYTES, then fails closed if a
 *          retained PDF is missing or its SHA-256 no longer matches the job record.
 * Restore: validates everything first (size cap, JSON, version, KDF caps, key allowlist, asset names, asset SHA-256,
 *          job ↔ asset match). Then it stages the PDFs and writes a journal (store snapshot + file plan), writes the
 *          PDFs into the app-owned pdf-cache directory with read-back verification, replaces the store with the job
 *          pdfUri values rewritten to this phone's paths, and marks the journal committed. Any failure — or a crash
 *          detected on the next launch — rolls metadata AND files back together.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { withStorageKeyLock } from '../../utils/storageSafety';
import { writeAndShare } from '../../storage/fileUtils';
import { base64ToBytes } from '../../utils/base64';
import { encryptString, decryptString, type EncryptedBlob } from '../../backup/backupCrypto';
import { TL_KEYS, BACKUP_NAMESPACES } from '../../storage/keys';
import { documentRoot, isSafePdfName, PDF_DIR, retainedPdfDir, retainedPdfName, RETAINED_PDF_LOCK as RESTORE_LOCK } from '../print/storage/retainedPdfs';

export const BACKUP_FORMAT = 'tilllabel';
/** v3 = data + retained PDFs. v2 (encrypted, data only) and v1 (plaintext) still restore. */
export const BACKUP_VERSION = 3;
/** Small AsyncStorage marker for an in-flight restore; the full journal lives in RESTORE_TX_DIR. */
export const RESTORE_JOURNAL_KEY = 'backup:restoreJournal';
export const LAST_BACKUP_KEY = 'backup:lastCreatedAt';
/** One cap for both sides: an estimated backup above it is never built, and a file above it is never read. */
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
/** Reserved: the restore transaction's own files. Never a restore target. */
export const RESTORE_TX_DIR = '.tilllabel_restore/';
const JOURNAL_FILE = 'journal.json';

interface BackupAsset { name: string; sha256: string; size: number; base64: string }

interface BackupPayload {
  format?: string;
  version?: number;
  createdAt?: string;
  appVersion?: string;
  entityCounts?: Record<string, number>;
  pdfCount?: number;
  /** History entries in the file whose PDF is not included (missing/damaged when backed up, or never retained). */
  omittedPdfCount?: number;
  checksum?: number;
  data?: Record<string, string>;
  enc?: EncryptedBlob;
}

// ─── What a backup contains ───────────────────────────────────────────────────
// Allowlist by namespace: a hostile file can only ever write keys the app owns.
const RESTORABLE_NAMESPACES = new Set<string>(BACKUP_NAMESPACES);
// Device-local / transient keys never leave the device and are never restored.
const EXCLUDED_PREFIXES = ['drafts:', 'billing:', 'tilllabel:', 'backup:', 'app:', 'journal:'];
const EXCLUDED_KEYS = new Set<string>();

function isSafeKeyShape(k: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*:[A-Za-z0-9_.:-]+$/.test(k);
}
export function isBackupKey(k: string): boolean {
  if (!isSafeKeyShape(k)) return false;
  if (EXCLUDED_KEYS.has(k)) return false;
  if (EXCLUDED_PREFIXES.some(p => k.startsWith(p))) return false;
  if (/:corrupt:\d+/.test(k)) return false;
  return RESTORABLE_NAMESPACES.has(k.slice(0, k.indexOf(':')));
}

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  return hash;
}

export function getBackupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `TillLabel_Backup_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.json`;
}

function countList(raw: string | undefined): number {
  if (!raw) return 0;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.length : 0; } catch { return 0; }
}

export function entityCountsFor(data: Record<string, string>): Record<string, number> {
  return {
    products: countList(data[TL_KEYS.products]),
    promotions: countList(data[TL_KEYS.promotions]),
    reductions: countList(data[TL_KEYS.reductions]),
    waitingLabels: countList(data[TL_KEYS.queue]),
    printJobs: countList(data[TL_KEYS.jobs]),
  };
}

// ─── Paths ────────────────────────────────────────────────────────────────────
const pdfDir = retainedPdfDir;
const txDir = () => `${documentRoot()}${RESTORE_TX_DIR}`;
const journalUri = () => `${txDir()}${JOURNAL_FILE}`;
export { isSafePdfName, PDF_DIR };

function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
const b64Len = (bytes: number) => Math.ceil(bytes / 3) * 4;

/**
 * Estimated size of the final backup file for `dataJsonBytes` of store data and PDFs of these byte sizes, without
 * reading any PDF. Mirrors the real layout: JSON{data, assets[base64]} → UTF-8 → AES-GCM (+16) → base64 → header.
 */
export function estimateBackupBytes(dataJsonBytes: number, pdfSizes: number[]): number {
  const PER_ASSET_JSON = 200; // name, sha256, size, quotes and commas
  const plaintext = dataJsonBytes + pdfSizes.reduce((sum, size) => sum + b64Len(size) + PER_ASSET_JSON, 0) + 64;
  return b64Len(plaintext + 16) + 4096;
}

function sha256Hex(base64: string): string {
  return bytesToHex(sha256(base64ToBytes(base64)));
}

interface StoredJobLike { id?: string; pdfUri?: string; pdfSha256?: string; displayName?: string; pdfUnavailable?: boolean }

function parseJobs(raw: string | undefined): StoredJobLike[] | null {
  if (raw === undefined) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch { return null; }
}

// ─── Create ───────────────────────────────────────────────────────────────────
export type BackupErrorCode = 'too-large' | 'pdfs-unavailable' | 'unreadable-history';
/** A history entry whose retained PDF cannot be included: the file is gone, or its bytes no longer match. */
export interface UnavailablePdf { jobId: string; label: string; reason: 'missing' | 'corrupt' }
export class BackupError extends Error {
  readonly code: BackupErrorCode;
  /** For 'pdfs-unavailable': every affected history entry. Nothing was written or shared. */
  readonly unavailable: UnavailablePdf[];
  constructor(code: BackupErrorCode, message: string, unavailable: UnavailablePdf[] = []) { super(message); this.code = code; this.unavailable = unavailable; this.name = 'BackupError'; }
}

export interface BackupOptions {
  /**
   * Job ids the user explicitly agreed to back up WITHOUT their PDF (after a 'pdfs-unavailable' refusal). Only these
   * entries lose their PDF; any other missing or damaged PDF refuses the backup again, so nothing is ever omitted
   * silently.
   */
  omitUnavailablePdfs?: string[];
}

export interface BackupSummary { dateLabel: string; fileName: string; uri: string; entityCounts: Record<string, number>; pdfCount: number; omittedPdfCount: number }

interface PdfPlan { name: string; uri: string; sha: string; size: number; jobs: { id: string; label: string }[] }

const jobKey = (job: StoredJobLike, index: number) => (typeof job.id === 'string' && job.id ? job.id : `#${index}`);

/** Stat every referenced retained PDF (no bytes read). Missing files and unverifiable entries are reported, not thrown. */
async function planRetainedPdfs(jobs: StoredJobLike[]): Promise<{ plan: PdfPlan[]; problems: UnavailablePdf[] }> {
  const byName = new Map<string, PdfPlan>();
  const problems: UnavailablePdf[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!job || !job.pdfUri) continue; // no retained PDF (already unavailable, or restored from an older backup)
    const id = jobKey(job, i);
    const label = job.displayName || id;
    const name = retainedPdfName(job.pdfUri) as string; // non-retained paths were cleared by the caller
    if (typeof job.pdfSha256 !== 'string') { problems.push({ jobId: id, label, reason: 'corrupt' }); continue; }
    const seen = byName.get(name);
    if (seen) {
      if (seen.sha === job.pdfSha256) seen.jobs.push({ id, label });
      else problems.push({ jobId: id, label, reason: 'corrupt' });
      continue;
    }
    const info = await FileSystem.getInfoAsync(job.pdfUri);
    if (!info.exists || info.isDirectory) { problems.push({ jobId: id, label, reason: 'missing' }); continue; }
    const size = (info as { size?: number }).size;
    byName.set(name, { name, uri: job.pdfUri, sha: job.pdfSha256, size: typeof size === 'number' && size >= 0 ? size : 0, jobs: [{ id, label }] });
  }
  return { plan: [...byName.values()], problems };
}

/**
 * Snapshot the restorable keys and the retained PDFs, and share one encrypted file. Passphrase is mandatory.
 * A missing or damaged history PDF refuses the backup with 'pdfs-unavailable' (listing every affected entry) unless
 * the user explicitly agreed to omit exactly those entries' PDFs via `options.omitUnavailablePdfs`.
 */
export async function createBackup(passphrase: string, appVersion: string, options: BackupOptions = {}): Promise<BackupSummary> {
  if (!passphrase) throw new Error('A passphrase is required.');
  const agreed = new Set(options.omitUnavailablePdfs ?? []);
  return withStorageKeyLock(RESTORE_LOCK, async () => {
    const pairs = await AsyncStorage.multiGet((await AsyncStorage.getAllKeys()) as string[]);
    const data: Record<string, string> = {};
    for (const [k, v] of pairs) if (v !== null && isBackupKey(k)) data[k] = v;
    const parsedJobs = parseJobs(data[TL_KEYS.jobs]);
    if (!parsedJobs) throw new BackupError('unreadable-history', 'Print history could not be read.');
    // A PDF outside app storage (generation fell back to a temporary file) was never retained: record kept, path not.
    const jobs = parsedJobs.map(job => (job && job.pdfUri && !retainedPdfName(job.pdfUri) ? { ...job, pdfUri: '', pdfUnavailable: true } : job));
    const { plan, problems } = await planRetainedPdfs(jobs);

    // Size gate BEFORE any PDF is read into memory.
    const dataJsonBytes = utf8Length(JSON.stringify(data));
    if (estimateBackupBytes(dataJsonBytes, plan.map(p => p.size)) > MAX_BACKUP_BYTES) {
      throw new BackupError('too-large', 'The backup would be larger than the limit.');
    }

    const assets: BackupAsset[] = [];
    let assetBytes = 0;
    for (const p of plan) {
      let base64: string | null = null;
      try { base64 = await FileSystem.readAsStringAsync(p.uri, { encoding: FileSystem.EncodingType.Base64 }); }
      catch { for (const j of p.jobs) problems.push({ jobId: j.id, label: j.label, reason: 'missing' }); continue; }
      if (sha256Hex(base64) !== p.sha) { for (const j of p.jobs) problems.push({ jobId: j.id, label: j.label, reason: 'corrupt' }); continue; }
      assetBytes += base64.length;
      // The real size can differ from the stat (or the stat was missing): keep the cap honest while reading.
      if (b64Len(dataJsonBytes + assetBytes) > MAX_BACKUP_BYTES) throw new BackupError('too-large', 'The backup would be larger than the limit.');
      assets.push({ name: p.name, sha256: p.sha, size: base64ToBytes(base64).length, base64 });
    }

    // Never omit anything the user has not explicitly agreed to omit.
    if (problems.some(pr => !agreed.has(pr.jobId))) {
      throw new BackupError('pdfs-unavailable', `${problems.length} print-history PDF(s) cannot be included.`, problems);
    }
    const omitted = new Set(problems.map(pr => pr.jobId));
    const portableJobs = jobs.map((job, i) => (job && omitted.has(jobKey(job, i)) ? { ...job, pdfUri: '', pdfUnavailable: true } : job));
    if (data[TL_KEYS.jobs] !== undefined) data[TL_KEYS.jobs] = JSON.stringify(portableJobs);
    const omittedPdfCount = portableJobs.filter(j => j && !j.pdfUri).length;

    const createdAt = new Date().toISOString();
    const entityCounts = entityCountsFor(data);
    const enc = encryptString(JSON.stringify({ data, assets }), passphrase);
    const payload = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, appVersion, entityCounts, pdfCount: assets.length, omittedPdfCount, enc });
    const fileName = getBackupFileName();
    const uri = await writeAndShare(fileName, payload);
    await AsyncStorage.setItem(LAST_BACKUP_KEY, createdAt).catch(() => {});
    return { dateLabel: new Date(createdAt).toLocaleString(), fileName, uri, entityCounts, pdfCount: assets.length, omittedPdfCount };
  });
}

// ─── Restore: validation ──────────────────────────────────────────────────────
export type RestoreErrorCode = 'too-large' | 'invalid-json' | 'invalid-format' | 'wrong-format' | 'unsupported-version' | 'passphrase-required' | 'wrong-passphrase' | 'checksum-mismatch' | 'empty-backup' | 'rolled-back' | 'rollback-failed';
export class RestoreError extends Error {
  readonly code: RestoreErrorCode;
  constructor(code: RestoreErrorCode, message: string) { super(message); this.code = code; this.name = 'RestoreError'; }
}

async function assertSizeOk(fileUri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists && typeof (info as { size?: number }).size === 'number' && (info as { size?: number }).size! > MAX_BACKUP_BYTES) throw new RestoreError('too-large', 'Backup file is too large to restore.');
  } catch (e) { if (e instanceof RestoreError) throw e; }
}

export interface BackupInspection { encrypted: boolean; version: number; createdAt?: string; appVersion?: string; entityCounts: Record<string, number>; pdfCount: number; omittedPdfCount: number }

/** Header only, so the screen can preview counts and decide whether to ask for the passphrase. */
export async function inspectBackup(fileUri: string): Promise<BackupInspection> {
  await assertSizeOk(fileUri);
  const raw = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' as FileSystem.EncodingType });
  let parsed: BackupPayload;
  try { parsed = JSON.parse(String(raw)); } catch { throw new RestoreError('invalid-json', 'Backup file contains invalid JSON.'); }
  if (!parsed || typeof parsed !== 'object') throw new RestoreError('invalid-format', 'Backup file is not an object.');
  if (parsed.format && parsed.format !== BACKUP_FORMAT) throw new RestoreError('wrong-format', 'This file is not a TillLabel backup.');
  const version = typeof parsed.version === 'number' ? parsed.version : 0;
  return { encrypted: version >= 2 && !!parsed.enc, version, createdAt: parsed.createdAt, appVersion: parsed.appVersion, entityCounts: parsed.entityCounts ?? {}, pdfCount: typeof parsed.pdfCount === 'number' ? parsed.pdfCount : 0, omittedPdfCount: typeof parsed.omittedPdfCount === 'number' ? parsed.omittedPdfCount : 0 };
}

interface PlannedPdf { name: string; targetUri: string; base64: string; sha256: string }

/**
 * Validate the PDFs and rewrite every job's pdfUri to this phone. Nothing touches disk here.
 * v3: every job PDF must be present, safely named and byte-identical to its recorded SHA-256, or the file is refused.
 * v1/v2 (no PDFs): job records keep their history but lose the source phone's path (pdfUri = '').
 */
function planPdfRestore(data: Record<string, string>, rawAssets: unknown, version: number): { data: Record<string, string>; writes: PlannedPdf[] } {
  const bad = (why: string) => new RestoreError('invalid-format', why);
  const assets = new Map<string, { sha256: string; base64: string }>();
  if (version >= 3) {
    if (!Array.isArray(rawAssets)) throw bad('Missing PDF list.');
    for (const a of rawAssets as Partial<BackupAsset>[]) {
      if (!a || !isSafePdfName(a.name)) throw bad('Unsafe PDF name in backup.');
      if (typeof a.base64 !== 'string' || typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256)) throw bad('Malformed PDF entry.');
      if (assets.has(a.name)) throw bad('Duplicate PDF in backup.');
      if (sha256Hex(a.base64) !== a.sha256) throw bad('A PDF in the backup is corrupted.');
      assets.set(a.name, { sha256: a.sha256, base64: a.base64 });
    }
  }
  const jobs = parseJobs(data[TL_KEYS.jobs]);
  if (!jobs) throw bad('Print history in the backup is malformed.');
  const dir = pdfDir();
  const writes = new Map<string, PlannedPdf>();
  const rewritten = jobs.map(job => {
    if (!job || typeof job !== 'object') return job;
    if (!job.pdfUri) return job.pdfUnavailable ? job : { ...job, pdfUri: '', pdfUnavailable: true };
    if (version < 3) return { ...job, pdfUri: '', pdfUnavailable: true };
    const src = String(job.pdfUri);
    const name = src.slice(src.lastIndexOf('/') + 1);
    const asset = isSafePdfName(name) ? assets.get(name) : undefined;
    if (!asset || asset.sha256 !== job.pdfSha256) throw bad('A print-history PDF is missing from the backup.');
    const targetUri = `${dir}${name}`;
    writes.set(name, { name, targetUri, base64: asset.base64, sha256: asset.sha256 });
    return { ...job, pdfUri: targetUri };
  });
  // Assets no job refers to are ignored: a backup can only put PDFs where history points.
  const next = { ...data };
  if (data[TL_KEYS.jobs] !== undefined) next[TL_KEYS.jobs] = JSON.stringify(rewritten);
  return { data: next, writes: [...writes.values()] };
}

// ─── Restore: transaction ─────────────────────────────────────────────────────
interface TxFile { targetUri: string; stagedUri: string; backupUri: string | null; existed: boolean }
interface TxJournal { version: 2; snapshot: [string, string][]; files: TxFile[] }
interface TxMarker { version: 2; state: 'prepared' | 'committed'; checksum: number }

async function writeFileVerified(uri: string, content: string, encoding: FileSystem.EncodingType): Promise<void> {
  await FileSystem.writeAsStringAsync(uri, content, { encoding });
  const readBack = await FileSystem.readAsStringAsync(uri, { encoding });
  if (readBack !== content) throw new Error(`Verified write failed for ${uri}.`);
}

async function removeTxDir(): Promise<void> {
  await FileSystem.deleteAsync(txDir(), { idempotent: true }).catch(() => {});
}

async function setMarker(state: TxMarker['state'], checksum: number): Promise<void> {
  const raw = JSON.stringify({ version: 2, state, checksum } satisfies TxMarker);
  await AsyncStorage.setItem(RESTORE_JOURNAL_KEY, raw);
  if ((await AsyncStorage.getItem(RESTORE_JOURNAL_KEY)) !== raw) throw new Error('Restore marker could not be verified.');
}

/** Stage every PDF and back up any file it will replace, then persist the journal and the marker. */
async function prepareTransaction(snapshot: [string, string][], writes: PlannedPdf[]): Promise<{ journal: TxJournal; checksum: number }> {
  await removeTxDir();
  await FileSystem.makeDirectoryAsync(txDir(), { intermediates: true });
  const files: TxFile[] = [];
  for (let i = 0; i < writes.length; i++) {
    const { targetUri, base64 } = writes[i];
    const info = await FileSystem.getInfoAsync(targetUri);
    if (info.exists && info.isDirectory) throw new Error(`Restore target is a directory: ${targetUri}`);
    const stagedUri = `${txDir()}staged-${i}.pdf`;
    let backupUri: string | null = null;
    if (info.exists) {
      backupUri = `${txDir()}original-${i}.pdf`;
      await writeFileVerified(backupUri, await FileSystem.readAsStringAsync(targetUri, { encoding: FileSystem.EncodingType.Base64 }), FileSystem.EncodingType.Base64);
    }
    await writeFileVerified(stagedUri, base64, FileSystem.EncodingType.Base64);
    files.push({ targetUri, stagedUri, backupUri, existed: !!info.exists });
  }
  const journal: TxJournal = { version: 2, snapshot, files };
  const raw = JSON.stringify(journal);
  await writeFileVerified(journalUri(), raw, FileSystem.EncodingType.UTF8);
  const checksum = djb2(raw);
  await setMarker('prepared', checksum);
  return { journal, checksum };
}

async function rollbackTransaction(journal: TxJournal): Promise<void> {
  for (const f of journal.files) {
    if (f.existed) {
      if (!f.backupUri) throw new Error(`No rollback copy for ${f.targetUri}.`);
      await writeFileVerified(f.targetUri, await FileSystem.readAsStringAsync(f.backupUri, { encoding: FileSystem.EncodingType.Base64 }), FileSystem.EncodingType.Base64);
    } else {
      await FileSystem.deleteAsync(f.targetUri, { idempotent: true });
      if ((await FileSystem.getInfoAsync(f.targetUri)).exists) throw new Error(`Rollback could not remove ${f.targetUri}.`);
    }
  }
  const keys = ((await AsyncStorage.getAllKeys()) as string[]).filter(k => k !== RESTORE_JOURNAL_KEY);
  if (keys.length) await AsyncStorage.multiRemove(keys);
  if (journal.snapshot.length) await AsyncStorage.multiSet(journal.snapshot);
}

async function readJournal(checksum: number | null): Promise<TxJournal | null> {
  let raw: string;
  try { raw = await FileSystem.readAsStringAsync(journalUri(), { encoding: FileSystem.EncodingType.UTF8 }); } catch { return null; }
  if (checksum !== null && djb2(raw) !== checksum) return null;
  try {
    const j = JSON.parse(raw) as TxJournal;
    return j && j.version === 2 && Array.isArray(j.snapshot) && Array.isArray(j.files) ? j : null;
  } catch { return null; }
}

export type RecoveryResult = 'none' | 'rolledBack' | 'completed' | 'unrecoverable';

async function recoverInner(): Promise<RecoveryResult> {
  const rawMarker = await AsyncStorage.getItem(RESTORE_JOURNAL_KEY);
  if (!rawMarker) { await removeTxDir(); return 'none'; }
  let marker: TxMarker | null = null;
  try { const m = JSON.parse(rawMarker) as TxMarker; if (m && m.version === 2 && (m.state === 'prepared' || m.state === 'committed')) marker = m; } catch { /* unreadable marker */ }
  if (marker?.state === 'committed') {
    // The new data is complete; only the cleanup was interrupted. Never replay a rollback over it.
    await removeTxDir();
    await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY);
    return 'completed';
  }
  // Prepared (or an unreadable marker): the store may be half-written, so roll back from the journal.
  const journal = await readJournal(marker ? marker.checksum : null);
  if (!journal) {
    await removeTxDir();
    await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY);
    return marker ? 'unrecoverable' : 'none';
  }
  try { await rollbackTransaction(journal); }
  catch { throw new RestoreError('rollback-failed', 'An interrupted restore could not be rolled back.'); }
  await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY);
  await removeTxDir();
  return 'rolledBack';
}

/** Called at app bootstrap: a restore interrupted before commit is rolled back (store AND files). */
export async function recoverInterruptedRestore(): Promise<RecoveryResult> {
  return withStorageKeyLock(RESTORE_LOCK, recoverInner);
}

export async function restoreBackup(fileUri: string, passphrase?: string): Promise<{ restoredKeys: number; entityCounts: Record<string, number>; pdfCount: number }> {
  return withStorageKeyLock(RESTORE_LOCK, async () => {
    await recoverInner();
    return restoreInner(fileUri, passphrase);
  });
}

async function restoreInner(fileUri: string, passphrase?: string): Promise<{ restoredKeys: number; entityCounts: Record<string, number>; pdfCount: number }> {
  await assertSizeOk(fileUri);
  const raw = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' as FileSystem.EncodingType });
  let parsed: BackupPayload;
  try { parsed = JSON.parse(String(raw)); } catch { throw new RestoreError('invalid-json', 'Backup file contains invalid JSON.'); }
  if (!parsed || typeof parsed !== 'object') throw new RestoreError('invalid-format', 'Backup file is not an object.');
  if (parsed.format && parsed.format !== BACKUP_FORMAT) throw new RestoreError('wrong-format', 'This file is not a TillLabel backup.');
  if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) throw new RestoreError('unsupported-version', `Unsupported backup version: ${parsed.version ?? 'unknown'}.`);

  let rawAssets: unknown;
  if (parsed.version >= 2) {
    if (!parsed.enc) throw new RestoreError('invalid-format', 'Missing encryption header.');
    if (!passphrase) throw new RestoreError('passphrase-required', 'This backup is encrypted.');
    let decrypted: string;
    try { decrypted = decryptString(parsed.enc, passphrase); } catch { throw new RestoreError('wrong-passphrase', 'Incorrect passphrase, or the file was altered.'); }
    try {
      const inner = JSON.parse(decrypted) as { data?: Record<string, string>; assets?: unknown };
      parsed.data = inner.data;
      rawAssets = inner.assets;
    } catch { throw new RestoreError('invalid-format', 'Decrypted content is malformed.'); }
  } else if (parsed.checksum !== undefined && parsed.checksum !== djb2(JSON.stringify(parsed.data))) {
    throw new RestoreError('checksum-mismatch', 'Backup file is corrupted.');
  }

  if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) throw new RestoreError('invalid-format', 'Missing data object.');
  const allowed: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (typeof v !== 'string') throw new RestoreError('invalid-format', `Value for "${k}" is not a string.`);
    if (isBackupKey(k)) allowed[k] = v; // allowlist: drop everything else silently
  }
  if (Object.keys(allowed).length === 0) throw new RestoreError('empty-backup', 'Backup file contains no restorable data.');
  const { data, writes } = planPdfRestore(allowed, rawAssets, parsed.version);
  const pairs = Object.entries(data) as [string, string][];

  // Snapshot the current store; the journal carries it plus the file plan.
  const existingKeys = ((await AsyncStorage.getAllKeys()) as string[]).filter(k => k !== RESTORE_JOURNAL_KEY);
  const snapshot = ((await AsyncStorage.multiGet(existingKeys)) as [string, string | null][]).filter((p): p is [string, string] => p[1] !== null);
  const oldJobs = parseJobs(snapshot.find(([k]) => k === TL_KEYS.jobs)?.[1]) ?? [];

  let tx: { journal: TxJournal; checksum: number };
  try { tx = await prepareTransaction(snapshot, writes); }
  catch {
    // Nothing live was touched yet: drop the staging area and report a clean failure.
    await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY).catch(() => {});
    await removeTxDir();
    throw new RestoreError('rolled-back', 'Restore could not be prepared. Your data is unchanged.');
  }

  const incoming = new Set(pairs.map(([k]) => k));
  // Stale keys: restorable namespaces present now but absent from the file. Device-local keys are kept.
  const stale = existingKeys.filter(k => !incoming.has(k) && isBackupKey(k));
  try {
    await FileSystem.makeDirectoryAsync(pdfDir(), { intermediates: true });
    for (let i = 0; i < tx.journal.files.length; i++) {
      const f = tx.journal.files[i];
      const bytes = await FileSystem.readAsStringAsync(f.stagedUri, { encoding: FileSystem.EncodingType.Base64 });
      if (sha256Hex(bytes) !== writes[i].sha256) throw new Error('Staged PDF changed on disk.');
      await writeFileVerified(f.targetUri, bytes, FileSystem.EncodingType.Base64);
    }
    await AsyncStorage.multiSet(pairs);
    if (stale.length) await AsyncStorage.multiRemove(stale);
    await setMarker('committed', tx.checksum);
  } catch {
    try {
      await rollbackTransaction(tx.journal);
      await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY);
      await removeTxDir();
    } catch {
      throw new RestoreError('rollback-failed', 'Restore failed and rollback also failed. Restart the app and try again.');
    }
    throw new RestoreError('rolled-back', 'Restore failed. Your previous data has been recovered.');
  }
  await AsyncStorage.removeItem(RESTORE_JOURNAL_KEY).catch(() => {});
  await removeTxDir();
  // Best effort: PDFs of the replaced history are now unreachable; remove them so they do not pile up.
  const keep = new Set(writes.map(w => w.targetUri));
  for (const job of oldJobs) {
    const name = retainedPdfName(job?.pdfUri);
    if (name && !keep.has(`${pdfDir()}${name}`)) await FileSystem.deleteAsync(`${pdfDir()}${name}`, { idempotent: true }).catch(() => {});
  }
  return { restoredKeys: pairs.length, entityCounts: entityCountsFor(data), pdfCount: writes.length };
}

/** Counts JSON arrays across the store and reports unparsable ones (Check data). */
export async function checkStorageIntegrity(): Promise<{ ok: boolean; totalRecords: number; parseErrors: number }> {
  const pairs = await AsyncStorage.multiGet((await AsyncStorage.getAllKeys()) as string[]);
  let parseErrors = 0, totalRecords = 0;
  for (const [, v] of pairs) {
    if (!v || !v.trimStart().startsWith('[')) continue;
    try { const a = JSON.parse(v); if (Array.isArray(a)) totalRecords += a.length; else parseErrors++; } catch { parseErrors++; }
  }
  return { ok: parseErrors === 0, totalRecords, parseErrors };
}

export async function loadLastBackupAt(): Promise<string | null> {
  try { return await AsyncStorage.getItem(LAST_BACKUP_KEY); } catch { return null; }
}
