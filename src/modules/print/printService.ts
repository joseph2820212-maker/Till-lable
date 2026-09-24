/**
 * The print pipeline: queue items / samples → one sheet HTML (embedded fonts, exact page size, calibration) → ONE
 * PDF file with its SHA-256 → a job record. Preview, print and share all use that same file (handout §24).
 */
import type { LanguageCode, PrintIntent, PrintJobLine, Product, StationeryProfile } from '../../domain/types';
import { renderSheet, type SheetItem } from '../labels/engine/renderSheet';
import { isPromoKind, type LabelContent, type LabelIssue, type RenderOptions } from '../labels/engine/renderLabel';
import { buildFontFaceCss } from '../labels/engine/fonts';
import { loadLabelFonts } from '../labels/engine/fontsLoader';
import { generateLabelPdf } from '../labels/engine/pdfJob';
import { renderTestSheet } from '../labels/engine/testPage';
import { isCardFormat } from '../labels/engine/labelTemplate';
import type { GeometryIssue } from '../labels/engine/geometry';
import { contentFingerprint, productContent, type ContentProblem } from '../labels/content';
import { getCalibration, getProfile } from './storage/stationeryStore';
import { recordJob, type JobInput, type StoredJob } from './storage/jobStore';
import type { LabelSettings } from '../settings/storage/labelSettings';
import { moneyFromMinor } from '../../domain/money';

export interface QueueItem { intent: PrintIntent; content: LabelContent | null; problem?: ContentProblem | 'productMissing' }

/** Resolve each waiting label to what it will print NOW (latest product data; one-off labels print their snapshot). */
export function resolveQueue(intents: PrintIntent[], products: Product[], language: LanguageCode, settings: LabelSettings): QueueItem[] {
  return intents.map(intent => {
    if (intent.snapshot) return { intent, content: intent.snapshot };
    const p = products.find(x => x.id === intent.productId);
    if (!p) return { intent, content: null, problem: 'productMissing' as const };
    const r = productContent(p, { language, kind: (intent.labelKind as LabelSettings['defaultKind']) ?? settings.defaultKind, extraDecimals: settings.unitPriceExtraDecimals });
    return r.ok ? { intent, content: r.content } : { intent, content: null, problem: r.problem };
  });
}

/** Render options for a label on a profile, from the label settings. */
export function optionsFor(content: LabelContent, profile: StationeryProfile, settings: LabelSettings): RenderOptions {
  const card = isCardFormat(profile.labelHeightMm - 2 * profile.safeInsetMm);
  const promo = isPromoKind(content.kind);
  return {
    style: promo ? settings.promoStyle : 'standard',
    ...(card ? { showSku: settings.showSkuOnCards } : {}),
    ...(promo && settings.promoBarcode ? { promoBarcode: true } : {}),
  };
}

export type GenerateResult =
  | { ok: true; job: StoredJob; warnings: { itemIndex: number; issue: LabelIssue }[] }
  | { ok: false; reason: 'geometry'; issues: GeometryIssue[] }
  | { ok: false; reason: 'labels'; issues: { itemIndex: number; issue: LabelIssue }[] }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'pdfFailed'; message: string };

const asciiName = (s: string) => s.normalize('NFD').replace(/[^\x20-\x7E]/g, '').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'Labels';

/** Build the job PDF for these items on a stationery profile. Nothing is marked printed here. */
export async function generateSheetJob(args: {
  profileId: string; items: (SheetItem & { intentId?: string })[]; startPosition?: number; displayName: string; kind: JobInput['kind'];
}): Promise<GenerateResult> {
  const items = args.items.filter(i => i.copies > 0);
  if (!items.length) return { ok: false, reason: 'empty' };
  const profile = await getProfile(args.profileId);
  const calibration = await getCalibration(profile.id);
  let fontCss = '';
  try { fontCss = buildFontFaceCss(await loadLabelFonts()); } catch (e) { return { ok: false, reason: 'pdfFailed', message: (e as Error).message }; }
  const sheet = renderSheet({ profile, items, startPosition: args.startPosition ?? 1, calibration: calibration ?? undefined, fontCss });
  if (!sheet.ok) return sheet.geometryIssues.length ? { ok: false, reason: 'geometry', issues: sheet.geometryIssues } : { ok: false, reason: 'labels', issues: sheet.labelIssues };
  let pdf;
  try {
    pdf = await generateLabelPdf(sheet.html, `${asciiName(args.displayName)}_${Date.now()}.pdf`, sheet.pageWidthPt, sheet.pageHeightPt);
  } catch (e) {
    return { ok: false, reason: 'pdfFailed', message: (e as Error).message };
  }
  const lines: PrintJobLine[] = items.filter(i => i.intentId).map(i => ({ intentId: i.intentId as string, contentFingerprint: contentFingerprint(i.content), copies: i.copies, confirmedCopies: 0 }));
  const job = await recordJob({
    lines, stationeryProfileId: profile.id, rendererVersion: sheet.rendererVersion, pdfUri: pdf.uri, pdfSha256: pdf.sha256, displayName: args.displayName,
    startPosition: args.startPosition ?? 1, labelCount: sheet.labelCount, pageCount: sheet.pageCount, kind: args.kind,
  });
  return { ok: true, job, warnings: sheet.warnings };
}

/** The calibration page for a profile (never touches the queue). */
export async function generateCalibrationJob(profileId: string, appLanguage: LanguageCode): Promise<GenerateResult> {
  const profile = await getProfile(profileId);
  const calibration = await getCalibration(profile.id);
  let fontCss = '';
  try { fontCss = buildFontFaceCss(await loadLabelFonts()); } catch (e) { return { ok: false, reason: 'pdfFailed', message: (e as Error).message }; }
  const page = renderTestSheet(profile, calibration ?? undefined, fontCss, appLanguage);
  if (!page) return { ok: false, reason: 'geometry', issues: [] };
  try {
    const pdf = await generateLabelPdf(page.html, `Calibration_${Date.now()}.pdf`, page.pageWidthPt, page.pageHeightPt);
    const job = await recordJob({ lines: [], stationeryProfileId: profile.id, rendererVersion: 'calibration', pdfUri: pdf.uri, pdfSha256: pdf.sha256, displayName: profile.name, startPosition: 1, labelCount: 0, pageCount: 1, kind: 'calibration' });
    return { ok: true, job, warnings: [] };
  } catch (e) {
    return { ok: false, reason: 'pdfFailed', message: (e as Error).message };
  }
}

/** Sample labels for the Label test, in the printed-label language and the shop currency. */
export function sampleLabels(language: LanguageCode, currency: string, kind: 'standardPrice' | 'priceUnitPrice' | 'priceBarcode'): LabelContent[] {
  const NAMES: Record<LanguageCode, [string, string]> = {
    en: ['Semi-skimmed milk', '2 litre bottle'], ar: ['حليب قليل الدسم', 'عبوة 2 لتر'], tr: ['Yarım yağlı süt', '2 litre şişe'],
    fr: ['Lait demi-écrémé', 'Bouteille de 2 l'], es: ['Leche semidesnatada', 'Botella de 2 l'], de: ['Fettarme Milch', '2-Liter-Flasche'],
  };
  const [name, second] = NAMES[language];
  const price = moneyFromMinor(currency === 'JPY' ? 289 : 289, currency);
  const c: LabelContent = { kind, language, name, secondLine: second, price, sku: 'TEST-001' };
  if (kind === 'priceUnitPrice') c.unitPrice = { amount: moneyFromMinor(145, currency), base: 'per_litre' };
  if (kind === 'priceBarcode') c.barcode = { value: '5000157024671', format: 'ean13' };
  return [c];
}
