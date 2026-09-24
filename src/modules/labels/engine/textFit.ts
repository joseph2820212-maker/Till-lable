/**
 * Deterministic text measuring and fitting for labels (docs/gates/G02/ACCEPTANCE.md L8).
 *
 * Widths come from the real advance widths of the embedded fonts (fontMetrics.generated.ts), so line breaks
 * and sizes are decided here, not by the device's WebView. Arabic contextual shaping changes glyph widths a
 * little, so Arabic runs carry a safety factor. Kerning is ignored and covered by the general safety factor.
 */
import { FONT_METRICS } from './fontMetrics.generated';

export const PT_PER_MM = 72 / 25.4;
const SAFETY = 1.04;
const ARABIC_SAFETY = 1.1;
const FALLBACK_EM = 0.6;

const isArabic = (cp: number) => (cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0xfb50 && cp <= 0xfeff);

/** Width of `text` in em units (1 em = the font size). */
export function measureEm(text: string, weight: 'regular' | 'bold'): number {
  const latin = FONT_METRICS[weight === 'bold' ? 'latinBold' : 'latinRegular'];
  const arabic = FONT_METRICS[weight === 'bold' ? 'arabicBold' : 'arabicRegular'];
  let units = 0;
  let arabicUnits = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (isArabic(cp)) arabicUnits += arabic[cp] ?? FALLBACK_EM * 1000;
    else units += latin[cp] ?? arabic[cp] ?? FALLBACK_EM * 1000;
  }
  return (units * SAFETY + arabicUnits * ARABIC_SAFETY) / 1000;
}

export const measureMm = (text: string, sizePt: number, weight: 'regular' | 'bold'): number => (measureEm(text, weight) * sizePt) / PT_PER_MM;

/** Greedy word wrap into lines no wider than `widthMm`. Words longer than a line are split by character. */
export function wrapLines(text: string, widthMm: number, sizePt: number, weight: 'regular' | 'bold'): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const fits = (s: string) => measureMm(s, sizePt, weight) <= widthMm;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) { line = candidate; continue; }
    if (line) lines.push(line);
    if (fits(word)) { line = word; continue; }
    // Split an over-long word (German compounds, long SKUs) by character.
    let part = '';
    for (const ch of word) {
      if (fits(part + ch)) part += ch;
      else { if (part) lines.push(part); part = ch; }
    }
    line = part;
  }
  if (line) lines.push(line);
  return lines;
}

export interface FitResult {
  sizePt: number;
  lines: string[];
  /** True when even at the minimum size the text needs more than `maxLines` (it will be clamped with an ellipsis). */
  overflow: boolean;
}

/**
 * Largest size between `maxPt` and `minPt` (0.5 pt steps) at which `text` fits in `maxLines` lines of `widthMm`.
 * If nothing fits, returns the minimum size, the first `maxLines` lines (the last one ends in "…") and overflow=true.
 */
export function fitText(text: string, widthMm: number, opts: { maxPt: number; minPt: number; maxLines: number; weight: 'regular' | 'bold' }): FitResult {
  if (!text.trim()) return { sizePt: opts.maxPt, lines: [], overflow: false };
  for (let size = opts.maxPt; size >= opts.minPt - 1e-9; size -= 0.5) {
    const lines = wrapLines(text, widthMm, size, opts.weight);
    if (lines.length <= opts.maxLines) return { sizePt: size, lines, overflow: false };
  }
  const lines = wrapLines(text, widthMm, opts.minPt, opts.weight).slice(0, opts.maxLines);
  const last = lines[lines.length - 1] ?? '';
  let clipped = last;
  while (clipped && measureMm(`${clipped}…`, opts.minPt, opts.weight) > widthMm) clipped = [...clipped].slice(0, -1).join('');
  lines[lines.length - 1] = `${clipped.trimEnd()}…`;
  return { sizePt: opts.minPt, lines, overflow: true };
}

/**
 * Size for a single-line field that must never wrap or shrink below `minPt` (prices, unit prices).
 * Returns null when it cannot fit at `minPt` — the caller must block the layout (TL-26), never clip a price.
 */
export function fitSingleLine(text: string, widthMm: number, opts: { maxPt: number; minPt: number; weight: 'regular' | 'bold' }): number | null {
  for (let size = opts.maxPt; size >= opts.minPt - 1e-9; size -= 0.5) if (measureMm(text, size, opts.weight) <= widthMm) return size;
  return null;
}
