/**
 * Barcodes are decoded by an independent EAN/UPC decoder written here from the GS1 digit tables (not by the
 * encoder), reading the bar widths out of the SVG the renderer embeds (plan §J). Physical scan-back stays PENDING.
 */
import { encodeBarcode, validateBarcode, moduleWidthFor, barcodeWidthMm, MIN_MODULE_MM } from '../barcode';

/** Bar module runs (1 = bar) along the symbol, read from bwip's SVG. */
function modulesFromSvg(svg: string): number[] {
  const width = Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
  const row = new Array(width).fill(0);
  // bwip draws each bar as a vertical stroked line "Mx y1Lx y2" with stroke-width = bar width.
  const re = /<path[^>]*stroke-width="([\d.]+)"[^>]*d="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const sw = Number(m[1]);
    for (const seg of m[2].matchAll(/M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/g)) {
      const x = Number(seg[1]);
      if (Number(seg[1]) !== Number(seg[3])) continue; // not vertical (text paths are filled, not stroked)
      for (let i = Math.round(x - sw / 2); i < Math.round(x + sw / 2); i++) if (i >= 0 && i < width) row[i] = 1;
    }
  }
  return row;
}

const L_CODES = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
// GS1: R codes are the bitwise complement of L codes; G codes are R codes read backwards.
const R_CODES = L_CODES.map(c => c.split('').map(b => (b === '1' ? '0' : '1')).join(''));
const G_CODES = R_CODES.map(c => c.split('').reverse().join(''));
const FIRST_DIGIT = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function decodeEan13(bits: string): string {
  const s = bits.indexOf('101');
  let p = s + 3;
  let left = '';
  let parity = '';
  for (let i = 0; i < 6; i++) {
    const c = bits.slice(p, p + 7); p += 7;
    const l = L_CODES.indexOf(c); const g = G_CODES.indexOf(c);
    if (l >= 0) { left += l; parity += 'L'; } else if (g >= 0) { left += g; parity += 'G'; } else throw new Error(`bad left code ${c}`);
  }
  if (bits.slice(p, p + 5) !== '01010') throw new Error('no centre guard');
  p += 5;
  let right = '';
  for (let i = 0; i < 6; i++) { const c = bits.slice(p, p + 7); p += 7; const d = R_CODES.indexOf(c); if (d < 0) throw new Error(`bad right code ${c}`); right += d; }
  if (bits.slice(p, p + 3) !== '101') throw new Error('no end guard');
  const first = FIRST_DIGIT.indexOf(parity);
  if (first < 0) throw new Error('bad parity');
  return `${first}${left}${right}`;
}

describe('strict validation: never "fix" a code', () => {
  it('accepts correct EAN-13, EAN-8, UPC-A and Code 128', () => {
    expect(validateBarcode('5012345678900', 'ean13')).toBeNull();
    expect(validateBarcode('96385074', 'ean8')).toBeNull();
    expect(validateBarcode('036000291452', 'upca')).toBeNull();
    expect(validateBarcode('SKU-00123', 'code128')).toBeNull();
  });
  it('rejects a wrong check digit, wrong length or bad characters, keeping leading zeros significant', () => {
    expect(validateBarcode('5012345678901', 'ean13')).toBe('badCheckDigit');
    expect(validateBarcode('501234567890', 'ean13')).toBe('wrongLength');
    expect(validateBarcode('50123456789O0', 'ean13')).toBe('invalidCharacters');
    expect(validateBarcode('0036000291452', 'upca')).toBe('wrongLength');
    expect(validateBarcode('ÜBER', 'code128')).toBe('invalidCharacters');
    expect(() => encodeBarcode('5012345678901', 'ean13')).toThrow(/badCheckDigit/);
  });
});

describe('independent decode of the encoded symbol', () => {
  it.each(['5012345678900', '4006381333931', '0036000291452', '9780201379624'])('EAN-13 %s decodes back to itself', code => {
    const sym = encodeBarcode(code, 'ean13', false);
    expect(decodeEan13(modulesFromSvg(sym.svg).join(''))).toBe(code);
  });
  it('UPC-A 036000291452 decodes as EAN-13 with a leading 0 (same symbol)', () => {
    const sym = encodeBarcode('036000291452', 'upca', false);
    expect(decodeEan13(modulesFromSvg(sym.svg).join(''))).toBe('0036000291452');
  });
});

describe('sizes: shrink only down to the minimum, then refuse', () => {
  it('fits a 70 mm ticket at a scannable module width', () => {
    const sym = encodeBarcode('5012345678900', 'ean13');
    const mod = moduleWidthFor(sym, 40);
    expect(mod).not.toBeNull();
    expect(mod!).toBeGreaterThanOrEqual(MIN_MODULE_MM.ean13);
    expect(barcodeWidthMm(sym, mod!)).toBeLessThanOrEqual(40.0001);
  });
  it('refuses a space too narrow for the minimum module width', () => {
    const sym = encodeBarcode('5012345678900', 'ean13');
    expect(moduleWidthFor(sym, 25)).toBeNull();
  });
});
