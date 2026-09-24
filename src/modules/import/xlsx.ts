/**
 * A bounded XLSX reader (validation V4): fflate unzip with hard caps, then a small XML scan of the shared strings
 * and ONE worksheet. Only cached cell values are read — formulas are never evaluated, macros and external links are
 * ignored. Any cap exceeded → the whole file is refused (never a partial silent read).
 */
import { unzipSync, strFromU8 } from 'fflate';

export const XLSX_LIMITS = { compressedBytes: 10 * 1024 * 1024, uncompressedBytes: 40 * 1024 * 1024, entries: 400, rows: 20000, columns: 60, cellChars: 2000 } as const;

export type XlsxError = 'tooLarge' | 'notXlsx' | 'noSheet' | 'tooManyRows' | 'tooManyColumns' | 'corrupt';
export class XlsxReadError extends Error { constructor(public readonly code: XlsxError) { super(code); this.name = 'XlsxReadError'; } }

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');

/** Column letters → zero-based index ("A" → 0, "AB" → 27). */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const parts = [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => decode(x[1]));
    out.push(parts.join(''));
  }
  return out;
}

export interface XlsxBook { sheetNames: string[]; rows(sheetIndex?: number): string[][] }

export function readXlsx(bytes: Uint8Array): XlsxBook {
  if (bytes.length > XLSX_LIMITS.compressedBytes) throw new XlsxReadError('tooLarge');
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new XlsxReadError('notXlsx');
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: f => {
        count++;
        if (count > XLSX_LIMITS.entries) throw new XlsxReadError('tooLarge');
        total += f.originalSize;
        if (total > XLSX_LIMITS.uncompressedBytes || f.originalSize > XLSX_LIMITS.uncompressedBytes) throw new XlsxReadError('tooLarge');
        return f.name === 'xl/workbook.xml' || f.name === 'xl/sharedStrings.xml' || f.name === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name);
      },
    });
  } catch (e) {
    if (e instanceof XlsxReadError) throw e;
    throw new XlsxReadError('corrupt');
  }
  const wb = files['xl/workbook.xml'];
  if (!wb) throw new XlsxReadError('notXlsx');
  const wbXml = strFromU8(wb);
  const rels = files['xl/_rels/workbook.xml.rels'] ? strFromU8(files['xl/_rels/workbook.xml.rels']) : '';
  const sheets = [...wbXml.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)].map(m => ({ name: decode(m[1]), rid: m[2] }));
  const targetOf = (rid: string) => {
    const r = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]*)"`).exec(rels) ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]*)"[^>]*Id="${rid}"`).exec(rels);
    if (!r) return null;
    const tgt = r[1].replace(/^\/?xl\//, '');
    return `xl/${tgt}`;
  };
  const shared = files['xl/sharedStrings.xml'] ? readSharedStrings(strFromU8(files['xl/sharedStrings.xml'])) : [];
  const sheetFiles = sheets.map((s, i) => targetOf(s.rid) ?? `xl/worksheets/sheet${i + 1}.xml`);
  if (!sheets.length) throw new XlsxReadError('noSheet');
  return {
    sheetNames: sheets.map(s => s.name),
    rows(sheetIndex = 0) {
      const file = files[sheetFiles[sheetIndex]];
      if (!file) throw new XlsxReadError('noSheet');
      const xml = strFromU8(file);
      const rows: string[][] = [];
      const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
      let rm: RegExpExecArray | null;
      while ((rm = rowRe.exec(xml))) {
        if (rows.length >= XLSX_LIMITS.rows) throw new XlsxReadError('tooManyRows');
        const cells: string[] = [];
        const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cm: RegExpExecArray | null;
        while ((cm = cellRe.exec(rm[1]))) {
          const attrs = cm[1];
          const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
          const col = ref ? columnIndex(ref) : cells.length;
          if (col >= XLSX_LIMITS.columns) throw new XlsxReadError('tooManyColumns');
          const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
          const inner = cm[2] ?? '';
          let value = '';
          if (type === 'inlineStr') value = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => decode(x[1])).join('');
          else {
            const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
            if (v !== undefined) value = type === 's' ? shared[Number(v)] ?? '' : decode(v);
          }
          while (cells.length < col) cells.push('');
          cells[col] = value.slice(0, XLSX_LIMITS.cellChars);
        }
        rows.push(cells);
      }
      return rows.filter(r => r.some(c => c.trim() !== ''));
    },
  };
}
