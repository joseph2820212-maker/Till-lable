/**
 * One authoritative PDF per print job (docs/gates/G02/ACCEPTANCE.md E6): the same file is previewed, printed
 * and shared, and its SHA-256 is recorded so a later "reprint original" can prove it is byte-identical.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { printHtmlToPdfFile } from '../../../utils/pdfFile';

export interface GeneratedPdf { uri: string; sha256: string }

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (table.indexOf(clean[i]) << 18) | (table.indexOf(clean[i + 1]) << 12) | ((table.indexOf(clean[i + 2]) & 63) << 6) | (table.indexOf(clean[i + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (clean[i + 2] !== undefined) out[o++] = (n >> 8) & 255;
    if (clean[i + 3] !== undefined) out[o++] = n & 255;
  }
  return out.slice(0, o);
}

export async function sha256OfFile(uri: string): Promise<string> {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return bytesToHex(sha256(base64ToBytes(b64)));
}

/** Render the sheet HTML to a PDF of the exact page size and fingerprint it. */
export async function generateLabelPdf(html: string, fileName: string, pageWidthPt: number, pageHeightPt: number): Promise<GeneratedPdf> {
  const uri = await printHtmlToPdfFile(html, fileName, { width: pageWidthPt, height: pageHeightPt }, { temporary: false });
  return { uri, sha256: await sha256OfFile(uri) };
}

export const __test = { base64ToBytes };
