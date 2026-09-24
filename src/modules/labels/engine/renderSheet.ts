/**
 * Labels + stationery → one complete HTML document for expo-print (docs/gates/G02/ACCEPTANCE.md E1–E7).
 *
 * The page size is exact (`@page { size; margin: 0 }`, width/height handed to the printer in points), every label
 * box is absolutely positioned in mm from the geometry engine, and the calibration offset moves the whole grid.
 * Cutting guides are drawn for paper, card and promo-card stock; adhesive sheets get none (they are pre-cut).
 */
import type { PrinterCalibration, StationeryProfile } from '../../../domain/types';
import { hasBlockingIssue, labelsPerSheet, mmToPt, pageSizeMm, placeLabels, validateStationery, type GeometryIssue, type LabelBox } from './geometry';
import { LABEL_CSS, renderLabel, type LabelContent, type LabelIssue, type LabelStyle, type RenderOptions } from './renderLabel';

export const RENDERER_VERSION = 'tl-labels-2';

export interface SheetItem { content: LabelContent; copies: number; style?: LabelStyle; options?: RenderOptions }

export interface SheetRequest {
  profile: StationeryProfile;
  items: SheetItem[];
  startPosition?: number;
  skipPositions?: number[];
  calibration?: Pick<PrinterCalibration, 'offsetXMm' | 'offsetYMm'>;
  /** @font-face CSS from buildFontFaceCss (omit only in tests that do not need glyphs). */
  fontCss?: string;
}

export interface Placement { page: number; position: number; itemIndex: number; copy: number }

export type SheetResult =
  | { ok: true; html: string; pageWidthPt: number; pageHeightPt: number; pageCount: number; labelCount: number; placements: Placement[]; warnings: { itemIndex: number; issue: LabelIssue }[]; geometryWarnings: GeometryIssue[]; rendererVersion: string }
  | { ok: false; geometryIssues: GeometryIssue[]; labelIssues: { itemIndex: number; issue: LabelIssue }[] };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function cutGuides(boxes: LabelBox[]): string {
  // Thin dashed outlines on the label edges, drawn above the labels; the safe inset keeps content clear of the cut.
  return boxes.map(b => `<div class="cut" style="left:${r3(b.xMm)}mm;top:${r3(b.yMm)}mm;width:${r3(b.widthMm)}mm;height:${r3(b.heightMm)}mm"></div>`).join('');
}

export function renderSheet(req: SheetRequest): SheetResult {
  const geometryIssues = validateStationery(req.profile);
  if (hasBlockingIssue(geometryIssues)) return { ok: false, geometryIssues, labelIssues: [] };
  for (const it of req.items) if (!Number.isInteger(it.copies) || it.copies < 1 || it.copies > 10000) return { ok: false, geometryIssues: [], labelIssues: [{ itemIndex: req.items.indexOf(it), issue: { code: 'missingField', severity: 'error', detail: 'copies' } }] };

  const p = req.profile;
  const box = { widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm };
  // Sizes are fixed per {format + layout} (labelTemplate.ts), so every label of a layout on a sheet already matches.
  const rendered = req.items.map(it => renderLabel(it.content, box, { ...it.options, ...(it.style ? { style: it.style } : {}) }));
  const labelIssues = rendered.flatMap((r, itemIndex) => r.issues.filter(i => i.severity === 'error').map(issue => ({ itemIndex, issue })));
  if (labelIssues.length) return { ok: false, geometryIssues: [], labelIssues };
  const warnings = rendered.flatMap((r, itemIndex) => r.issues.filter(i => i.severity === 'warning').map(issue => ({ itemIndex, issue })));

  const sequence: { itemIndex: number; copy: number }[] = [];
  req.items.forEach((it, itemIndex) => { for (let copy = 1; copy <= it.copies; copy++) sequence.push({ itemIndex, copy }); });
  const boxes = placeLabels(p, { count: sequence.length, startPosition: req.startPosition, skipPositions: req.skipPositions, calibration: req.calibration });

  const page = pageSizeMm(p);
  const pageCount = boxes.length ? boxes[boxes.length - 1].page + 1 : 1;
  const guides = p.material === 'plainPaper' || p.material === 'card' || p.material === 'promoCard';
  const placements: Placement[] = [];
  const pages: string[] = [];
  for (let pg = 0; pg < pageCount; pg++) {
    const onPage = boxes.map((b, i) => ({ b, s: sequence[i] })).filter(x => x.b.page === pg);
    const labels = onPage.map(({ b, s }) => {
      placements.push({ page: pg, position: b.position, itemIndex: s.itemIndex, copy: s.copy });
      return `<div class="slot" style="left:${r3(b.xMm)}mm;top:${r3(b.yMm)}mm;width:${r3(b.widthMm)}mm;height:${r3(b.heightMm)}mm">${rendered[s.itemIndex].html}</div>`;
    }).join('');
    pages.push(`<section class="page">${labels}${guides ? cutGuides(onPage.map(x => x.b)) : ''}</section>`);
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="tl-renderer" content="${RENDERER_VERSION}"/>
<style>
${req.fontCss ?? ''}
@page{size:${r3(page.widthMm)}mm ${r3(page.heightMm)}mm;margin:0}
html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;width:${r3(page.widthMm)}mm;height:${r3(page.heightMm)}mm;overflow:hidden;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.slot{position:absolute;overflow:hidden}
.cut{position:absolute;box-sizing:border-box;border:0.15mm dashed #9a9a9a;z-index:2;pointer-events:none}
${LABEL_CSS}
</style></head><body>${pages.join('')}</body></html>`;

  return {
    ok: true, html, pageWidthPt: r3(mmToPt(page.widthMm)), pageHeightPt: r3(mmToPt(page.heightMm)), pageCount,
    labelCount: sequence.length, placements, warnings, geometryWarnings: geometryIssues, rendererVersion: RENDERER_VERSION,
  };
}

/** Positions still free on a sheet after a start position (for the placement map). */
export const freePositions = (p: StationeryProfile, startPosition = 1): number => labelsPerSheet(p) - startPosition + 1;
