/**
 * Generic, international sheet geometry (docs/gates/G02/ACCEPTANCE.md E1–E4).
 *
 * Every position is computed from one origin — x = left + col × (width + gapX), y = top + row × (height + gapY) —
 * in millimetres, and converted to PDF points once (pt = mm × 72 / 25.4). Nothing here knows about a country,
 * a manufacturer or a language: A4, US Letter, A5, A6 and custom pages are all first-class.
 */
import type { PaperSize, PrinterCalibration, StationeryProfile } from '../../../domain/types';

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;
export const mmToPt = (mm: number): number => (mm * PT_PER_INCH) / MM_PER_INCH;

/** Portrait dimensions of the named paper sizes, in mm (US Letter is 8.5 × 11 in). */
export const PAPER_MM: Record<Exclude<PaperSize, 'custom'>, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  A5: { widthMm: 148, heightMm: 210 },
  A6: { widthMm: 105, heightMm: 148 },
};

/** Tolerance when checking that margins, labels and gaps add up to the page. */
export const ADD_UP_TOLERANCE_MM = 0.2;
/** Most office printers cannot print closer than this to the paper edge; content nearer is warned about. */
export const PRINTER_EDGE_MM = 3;

export type GeometryIssueCode =
  | 'nonPositiveSize'
  | 'invalidCount'
  | 'negativeMargin'
  | 'negativeGap'
  | 'pageSizeMismatch'
  | 'gridTooWide'
  | 'gridTooTall'
  | 'marginsDontAddUpX'
  | 'marginsDontAddUpY'
  | 'safeInsetTooLarge'
  | 'nearPrinterEdge';

export interface GeometryIssue {
  code: GeometryIssueCode;
  /** Blocking issues stop PDF generation; warnings are shown but printing is allowed. */
  severity: 'error' | 'warning';
  field?: keyof StationeryProfile;
  /** Numbers the UI can show in the explanation (e.g. by how many mm the grid overflows). */
  detail?: Record<string, number>;
}

/** Page width/height in mm after orientation. Named sizes use their standard dimensions; custom uses the profile's. */
export function pageSizeMm(p: Pick<StationeryProfile, 'paper' | 'orientation' | 'pageWidthMm' | 'pageHeightMm'>): { widthMm: number; heightMm: number } {
  const base = p.paper === 'custom' ? { widthMm: p.pageWidthMm, heightMm: p.pageHeightMm } : PAPER_MM[p.paper];
  if (p.paper === 'custom') return base;
  return p.orientation === 'landscape' ? { widthMm: base.heightMm, heightMm: base.widthMm } : base;
}

export function gridWidthMm(p: StationeryProfile): number {
  return p.columns * p.labelWidthMm + (p.columns - 1) * p.gapXMm;
}
export function gridHeightMm(p: StationeryProfile): number {
  return p.rows * p.labelHeightMm + (p.rows - 1) * p.gapYMm;
}
export const labelsPerSheet = (p: StationeryProfile): number => p.rows * p.columns;

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** Validate a stationery profile before any PDF is produced (TL-27). Returns every issue found, errors first. */
export function validateStationery(p: StationeryProfile): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  const pos = (v: number) => Number.isFinite(v) && v > 0;
  const nonNeg = (v: number | undefined) => v === undefined || (Number.isFinite(v) && v >= 0);
  for (const f of ['labelWidthMm', 'labelHeightMm'] as const) if (!pos(p[f])) issues.push({ code: 'nonPositiveSize', severity: 'error', field: f });
  if (p.paper === 'custom') for (const f of ['pageWidthMm', 'pageHeightMm'] as const) if (!pos(p[f])) issues.push({ code: 'nonPositiveSize', severity: 'error', field: f });
  for (const f of ['rows', 'columns'] as const) if (!Number.isInteger(p[f]) || p[f] < 1 || p[f] > 200) issues.push({ code: 'invalidCount', severity: 'error', field: f });
  for (const f of ['marginTopMm', 'marginLeftMm', 'marginRightMm', 'marginBottomMm'] as const) if (!nonNeg(p[f])) issues.push({ code: 'negativeMargin', severity: 'error', field: f });
  for (const f of ['gapXMm', 'gapYMm', 'safeInsetMm'] as const) if (!nonNeg(p[f])) issues.push({ code: 'negativeGap', severity: 'error', field: f });
  if (issues.length) return issues;

  const page = pageSizeMm(p);
  if (p.paper !== 'custom') {
    // Stored page numbers must agree with the named size, so a profile cannot say "A4" and carry Letter numbers.
    if (Math.abs(p.pageWidthMm - page.widthMm) > ADD_UP_TOLERANCE_MM || Math.abs(p.pageHeightMm - page.heightMm) > ADD_UP_TOLERANCE_MM) {
      issues.push({ code: 'pageSizeMismatch', severity: 'error', field: 'paper', detail: { expectedWidthMm: page.widthMm, expectedHeightMm: page.heightMm } });
    }
  }
  const right = p.marginLeftMm + gridWidthMm(p);
  const bottom = p.marginTopMm + gridHeightMm(p);
  if (right > page.widthMm + ADD_UP_TOLERANCE_MM) issues.push({ code: 'gridTooWide', severity: 'error', field: 'columns', detail: { overflowMm: round(right - page.widthMm) } });
  if (bottom > page.heightMm + ADD_UP_TOLERANCE_MM) issues.push({ code: 'gridTooTall', severity: 'error', field: 'rows', detail: { overflowMm: round(bottom - page.heightMm) } });
  if (p.marginRightMm !== undefined && Math.abs(right + p.marginRightMm - page.widthMm) > ADD_UP_TOLERANCE_MM) {
    issues.push({ code: 'marginsDontAddUpX', severity: 'error', field: 'marginRightMm', detail: { totalMm: round(right + p.marginRightMm), pageMm: page.widthMm } });
  }
  if (p.marginBottomMm !== undefined && Math.abs(bottom + p.marginBottomMm - page.heightMm) > ADD_UP_TOLERANCE_MM) {
    issues.push({ code: 'marginsDontAddUpY', severity: 'error', field: 'marginBottomMm', detail: { totalMm: round(bottom + p.marginBottomMm), pageMm: page.heightMm } });
  }
  if (p.safeInsetMm * 2 >= Math.min(p.labelWidthMm, p.labelHeightMm)) issues.push({ code: 'safeInsetTooLarge', severity: 'error', field: 'safeInsetMm' });
  const edge = Math.min(p.marginLeftMm, p.marginTopMm, page.widthMm - right, page.heightMm - bottom) + p.safeInsetMm;
  if (issues.every(i => i.severity !== 'error') && edge < PRINTER_EDGE_MM) issues.push({ code: 'nearPrinterEdge', severity: 'warning', detail: { edgeMm: round(edge) } });
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

export const hasBlockingIssue = (issues: GeometryIssue[]): boolean => issues.some(i => i.severity === 'error');

export interface LabelBox {
  /** 0-based sheet (page) index. */
  page: number;
  /** 1-based position on its sheet, reading order row by row. */
  position: number;
  row: number;
  column: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PlacementOptions {
  /** How many labels to place. */
  count: number;
  /** 1-based first position on the FIRST sheet (earlier positions are used / skipped). Later sheets start at 1. */
  startPosition?: number;
  /** Extra positions to leave empty on the first sheet (1-based), e.g. damaged labels. */
  skipPositions?: number[];
  calibration?: Pick<PrinterCalibration, 'offsetXMm' | 'offsetYMm'>;
}

/** The position (mm, before calibration) of one grid cell. */
export function cellOrigin(p: StationeryProfile, row: number, column: number): { xMm: number; yMm: number } {
  return { xMm: p.marginLeftMm + column * (p.labelWidthMm + p.gapXMm), yMm: p.marginTopMm + row * (p.labelHeightMm + p.gapYMm) };
}

/**
 * Lay `count` labels onto as many sheets as needed. Every box is computed from the origin (no accumulated
 * rounding); the calibration offset moves every box equally. Throws on an invalid profile or options.
 */
export function placeLabels(p: StationeryProfile, opts: PlacementOptions): LabelBox[] {
  if (hasBlockingIssue(validateStationery(p))) throw new RangeError('invalid stationery profile');
  const per = labelsPerSheet(p);
  const start = opts.startPosition ?? 1;
  if (!Number.isInteger(opts.count) || opts.count < 0) throw new RangeError('count must be a non-negative integer');
  if (!Number.isInteger(start) || start < 1 || start > per) throw new RangeError(`startPosition must be between 1 and ${per}`);
  const skip = new Set(opts.skipPositions ?? []);
  const dx = opts.calibration?.offsetXMm ?? 0;
  const dy = opts.calibration?.offsetYMm ?? 0;
  const boxes: LabelBox[] = [];
  let page = 0;
  let pos = start;
  while (boxes.length < opts.count) {
    if (pos > per) { page += 1; pos = 1; }
    if (page === 0 && skip.has(pos)) { pos += 1; continue; }
    const row = Math.floor((pos - 1) / p.columns);
    const column = (pos - 1) % p.columns;
    const o = cellOrigin(p, row, column);
    boxes.push({ page, position: pos, row, column, xMm: o.xMm + dx, yMm: o.yMm + dy, widthMm: p.labelWidthMm, heightMm: p.labelHeightMm });
    pos += 1;
  }
  return boxes;
}
