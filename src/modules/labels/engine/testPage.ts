/**
 * Calibration / test page (docs/PRINTER_STATIONERY_MATRIX.md: paper evidence). Prints every label outline, a
 * crosshair at each label centre, its position number, millimetre rulers along the top and left edges, a 100 mm
 * reference line to check SCALE, and the "Actual size" instruction. Offsets are applied like a real job, so a shop
 * can measure the first and last labels and tell a uniform offset from scaling or drift (calibration.ts).
 */
import type { LanguageCode, PrinterCalibration, StationeryProfile } from '../../../domain/types';
import { hasBlockingIssue, labelsPerSheet, mmToPt, pageSizeMm, placeLabels, validateStationery } from './geometry';
import { escapeHtml } from '../../../utils/htmlEscape';
import { CALIBRATION_TEXT } from './calibration';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** Length of the scale reference line. */
export const REFERENCE_LINE_MM = 100;

export function renderTestSheet(profile: StationeryProfile, calibration?: Pick<PrinterCalibration, 'offsetXMm' | 'offsetYMm'>, fontCss = '', lang: LanguageCode = 'en'): { html: string; pageWidthPt: number; pageHeightPt: number } | null {
  if (hasBlockingIssue(validateStationery(profile))) return null;
  const page = pageSizeMm(profile);
  const boxes = placeLabels(profile, { count: labelsPerSheet(profile), calibration });
  const T = CALIBRATION_TEXT[lang];
  const ticks: string[] = [];
  for (let mm = 0; mm <= page.widthMm; mm += 1) ticks.push(`<div class="tx" style="left:${mm}mm;height:${mm % 10 === 0 ? 4 : mm % 5 === 0 ? 2.5 : 1.5}mm"></div>${mm % 10 === 0 && mm > 0 ? `<div class="tl" style="left:${mm + 0.4}mm">${mm}</div>` : ''}`);
  for (let mm = 0; mm <= page.heightMm; mm += 1) ticks.push(`<div class="ty" style="top:${mm}mm;width:${mm % 10 === 0 ? 4 : mm % 5 === 0 ? 2.5 : 1.5}mm"></div>${mm % 10 === 0 && mm > 0 ? `<div class="tl" style="top:${mm + 0.4}mm;left:4.5mm">${mm}</div>` : ''}`);
  const labels = boxes.map(b => `<div class="box" style="left:${r3(b.xMm)}mm;top:${r3(b.yMm)}mm;width:${r3(b.widthMm)}mm;height:${r3(b.heightMm)}mm">`
    + `<div class="safe" style="inset:${profile.safeInsetMm}mm"></div><div class="h"></div><div class="v"></div><div class="n">${b.position}</div></div>`).join('');

  // The reference panel sits in the bottom margin when there is room, otherwise over the middle of the page.
  const bottomMargin = page.heightMm - Math.max(...boxes.map(b => b.yMm + b.heightMm));
  const panelH = 14;
  const panelTop = bottomMargin >= panelH + 0.5 ? page.heightMm - panelH - 0.3 : (page.heightMm - panelH) / 2;
  const left = Math.max(12, (page.widthMm - REFERENCE_LINE_MM) / 2);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const reference = `<div class="ref" dir="${dir}" style="top:${r3(panelTop)}mm;left:${r3(left - 2)}mm;width:${REFERENCE_LINE_MM + 4}mm;height:${panelH}mm">`
    + `<div class="refline" style="left:2mm;width:${REFERENCE_LINE_MM}mm"></div>`
    + `<div class="refend" style="left:2mm"></div><div class="refend" style="left:${REFERENCE_LINE_MM + 2}mm"></div>`
    + `<div class="reft warn">${escapeHtml(T.actualSize)}</div><div class="reft">${escapeHtml(`${REFERENCE_LINE_MM} mm — ${T.measureLine}`)}</div>`
    + `<div class="reft small">${escapeHtml(T.uniform)}</div><div class="reft small">${escapeHtml(T.drift)}</div></div>`;
  const info = `${escapeHtml(profile.name)} · ${profile.rows} × ${profile.columns} · ${profile.labelWidthMm} × ${profile.labelHeightMm} mm · offset X ${calibration?.offsetXMm ?? 0} mm, Y ${calibration?.offsetYMm ?? 0} mm`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${fontCss}
@page{size:${r3(page.widthMm)}mm ${r3(page.heightMm)}mm;margin:0}html,body{margin:0;padding:0}
.page{position:relative;width:${r3(page.widthMm)}mm;height:${r3(page.heightMm)}mm;overflow:hidden;font-family:'TL Latin','TL Arabic',sans-serif;font-size:6pt}
.tx{position:absolute;top:0;width:0;border-left:0.1mm solid #000}.ty{position:absolute;left:0;height:0;border-top:0.1mm solid #000}
.tl{position:absolute;top:4.3mm;font-size:5pt}
.box{position:absolute;box-sizing:border-box;border:0.2mm solid #000}.safe{position:absolute;border:0.1mm dotted #777}
.box .h{position:absolute;left:calc(50% - 3mm);top:50%;width:6mm;border-top:0.15mm solid #000}.box .v{position:absolute;top:calc(50% - 3mm);left:50%;height:6mm;border-left:0.15mm solid #000}
.box .n{position:absolute;right:1mm;top:0.8mm;font-size:6pt}
.ref{position:absolute;box-sizing:border-box;background:#fff;z-index:3;padding-top:3mm}
.refline{position:absolute;top:1.2mm;border-top:0.3mm solid #000}
.refend{position:absolute;top:0;height:2.6mm;border-left:0.3mm solid #000}
.reft{font-size:6.5pt;line-height:1.2;padding:0 2mm;text-align:center}.reft.warn{font-weight:700;font-size:7pt}.reft.small{font-size:5.5pt}
.info{position:absolute;left:12mm;top:7mm;font-size:5pt;z-index:4}
</style></head><body><section class="page">${ticks.join('')}${labels}${reference}<div class="info">${info}</div></section></body></html>`;
  return { html, pageWidthPt: r3(mmToPt(page.widthMm)), pageHeightPt: r3(mmToPt(page.heightMm)) };
}
