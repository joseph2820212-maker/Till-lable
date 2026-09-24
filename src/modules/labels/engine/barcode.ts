/**
 * Offline barcode rendering (docs/DEPENDENCY_DECISIONS.md: bwip-js/generic, MIT, no native module, no network).
 *
 * The encoder never "fixes" a value: a wrong check digit or a wrong length is rejected (plan §J). Bars are
 * always left-to-right SVG, wrapped by the renderer in an LTR container so an Arabic label can never mirror
 * them (L3). Sizes follow the symbology's minimum module width; a barcode that cannot fit at that width is
 * reported as not fitting instead of being shrunk into something unscannable.
 */
import { toSVG } from 'bwip-js/generic';
import type { BarcodeFormat } from '../../../domain/types';

/** Minimum module (narrow bar) width in mm. EAN/UPC nominal is 0.33 mm; 80 % magnification is the practical minimum. */
export const MIN_MODULE_MM: Record<BarcodeFormat, number> = { ean13: 0.264, ean8: 0.264, upca: 0.264, code128: 0.25 };
/** Quiet zones in modules (left, right) required around the symbol. */
const QUIET: Record<BarcodeFormat, [number, number]> = { ean13: [11, 7], ean8: [7, 7], upca: [9, 9], code128: [10, 10] };

export type BarcodeError = 'invalidCharacters' | 'wrongLength' | 'badCheckDigit' | 'tooLong' | 'encoderError';

export interface BarcodeSymbol {
  format: BarcodeFormat;
  value: string;
  svg: string;
  /** Symbol width in modules, excluding quiet zones. */
  modules: number;
  quietModules: [number, number];
}

function checkDigitGs1(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[digits.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

/** Validate without changing the value. EAN/UPC must include their check digit. */
export function validateBarcode(value: string, format: BarcodeFormat): BarcodeError | null {
  if (format === 'code128') {
    if (!/^[\x20-\x7E]+$/.test(value)) return 'invalidCharacters';
    return value.length > 48 ? 'tooLong' : null;
  }
  if (!/^\d+$/.test(value)) return 'invalidCharacters';
  const len = { ean13: 13, ean8: 8, upca: 12 }[format];
  if (value.length !== len) return 'wrongLength';
  return checkDigitGs1(value.slice(0, -1)) === Number(value.slice(-1)) ? null : 'badCheckDigit';
}

const BCID: Record<BarcodeFormat, string> = { ean13: 'ean13', ean8: 'ean8', upca: 'upca', code128: 'code128' };

/**
 * Encode to SVG. `includeText` prints the human-readable digits beneath the bars as vector paths (no font
 * needed). Throws a tagged Error when the value is invalid.
 */
export function encodeBarcode(value: string, format: BarcodeFormat, includeText = true): BarcodeSymbol {
  const err = validateBarcode(value, format);
  if (err) throw Object.assign(new Error(`barcode ${format} ${err}`), { code: err });
  let svg: string;
  try {
    svg = toSVG({ bcid: BCID[format], text: value, includetext: includeText, textxalign: 'center', scale: 1, height: 10 });
  } catch (e) {
    throw Object.assign(new Error(`barcode encoder: ${(e as Error).message}`), { code: 'encoderError' as BarcodeError });
  }
  const vb = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  const modules = vb ? Number(vb[1]) : 0;
  return { format, value, svg, modules, quietModules: QUIET[format] };
}

/** Width in mm the symbol needs (with quiet zones) at a module width. */
export function barcodeWidthMm(sym: BarcodeSymbol, moduleMm: number): number {
  return (sym.modules + sym.quietModules[0] + sym.quietModules[1]) * moduleMm;
}

/**
 * Largest module width (capped at the nominal 0.33 mm) that fits `availableWidthMm`, or null if even the
 * minimum module width does not fit — the caller must then offer a larger label, never shrink further.
 */
export function moduleWidthFor(sym: BarcodeSymbol, availableWidthMm: number): number | null {
  const total = sym.modules + sym.quietModules[0] + sym.quietModules[1];
  const fitted = Math.min(0.33, availableWidthMm / total);
  return fitted + 1e-9 >= MIN_MODULE_MM[sym.format] ? fitted : null;
}
