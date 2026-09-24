/**
 * Initial stationery presets (owner decision, 24 Sep 2026). Presets are conveniences on top of the generic
 * engine: any shop, in any country, can enter its own sheet as a custom profile. Status stays honest:
 * design dimensions are ours; manufacturer numbers are "unverified" until checked against the manufacturer's
 * template, and nothing here claims a physical (paper) pass — see docs/PRINTER_STATIONERY_MATRIX.md.
 */
import { SCHEMA_VERSIONS, type StationeryProfile } from '../../../domain/types';
import { PAPER_MM } from './geometry';

const base = { schemaVersion: SCHEMA_VERSIONS.stationeryProfile, orientation: 'portrait' as const, isPreset: true };

/** Centre a rows × columns grid of labels on a page, returning the margins. */
function centred(pageW: number, pageH: number, rows: number, cols: number, w: number, h: number, gapX = 0, gapY = 0) {
  const gw = cols * w + (cols - 1) * gapX;
  const gh = rows * h + (rows - 1) * gapY;
  const left = Math.round(((pageW - gw) / 2) * 100) / 100;
  const top = Math.round(((pageH - gh) / 2) * 100) / 100;
  return { marginLeftMm: left, marginTopMm: top, marginRightMm: Math.round((pageW - gw - left) * 100) / 100, marginBottomMm: Math.round((pageH - gh - top) * 100) / 100 };
}

const A4 = PAPER_MM.A4;
const LETTER = PAPER_MM.Letter;

export const PRESETS: StationeryProfile[] = [
  {
    ...base, id: 'preset_shelf_70x38_a4', name: 'Shelf-edge ticket 70 × 38 mm (A4 card, cutting guides)',
    paper: 'A4', pageWidthMm: A4.widthMm, pageHeightMm: A4.heightMm, rows: 7, columns: 2, labelWidthMm: 70, labelHeightMm: 38,
    ...centred(A4.widthMm, A4.heightMm, 7, 2, 70, 38), gapXMm: 0, gapYMm: 0, safeInsetMm: 2,
    material: 'card', refeedSafe: true, verification: 'userDefined', verificationSource: 'TillLabel design dimension (owner priority format)',
  },
  {
    ...base, id: 'preset_shelf_70x38_letter', name: 'Shelf-edge ticket 70 × 38 mm (US Letter card, cutting guides)',
    paper: 'Letter', pageWidthMm: LETTER.widthMm, pageHeightMm: LETTER.heightMm, rows: 7, columns: 2, labelWidthMm: 70, labelHeightMm: 38,
    ...centred(LETTER.widthMm, LETTER.heightMm, 7, 2, 70, 38), gapXMm: 0, gapYMm: 0, safeInsetMm: 2,
    material: 'card', refeedSafe: true, verification: 'userDefined', verificationSource: 'TillLabel design dimension',
  },
  {
    ...base, id: 'preset_avery_l7160', name: 'Avery L7160 (21 per A4, 63.5 × 38.1 mm)', manufacturerCode: 'L7160',
    paper: 'A4', pageWidthMm: A4.widthMm, pageHeightMm: A4.heightMm, rows: 7, columns: 3, labelWidthMm: 63.5, labelHeightMm: 38.1,
    ...centred(A4.widthMm, A4.heightMm, 7, 3, 63.5, 38.1, 2.5, 0), gapXMm: 2.5, gapYMm: 0, safeInsetMm: 1.5, cornerRadiusMm: 1.5,
    material: 'adhesiveSheet', refeedSafe: false, verification: 'unverified',
    verificationSource: 'Commonly published size and count; margins centred; not yet checked against the manufacturer template',
  },
  {
    ...base, id: 'preset_avery_l7159', name: 'Avery L7159 (24 per A4, 63.5 × 33.9 mm)', manufacturerCode: 'L7159',
    paper: 'A4', pageWidthMm: A4.widthMm, pageHeightMm: A4.heightMm, rows: 8, columns: 3, labelWidthMm: 63.5, labelHeightMm: 33.9,
    ...centred(A4.widthMm, A4.heightMm, 8, 3, 63.5, 33.9, 2.5, 0), gapXMm: 2.5, gapYMm: 0, safeInsetMm: 1.5, cornerRadiusMm: 1.5,
    material: 'adhesiveSheet', refeedSafe: false, verification: 'unverified',
    verificationSource: 'Commonly published size and count; margins centred; not yet checked against the manufacturer template',
  },
  {
    ...base, id: 'preset_avery_l7163', name: 'Avery L7163 (14 per A4, 99.1 × 38.1 mm)', manufacturerCode: 'L7163',
    paper: 'A4', pageWidthMm: A4.widthMm, pageHeightMm: A4.heightMm, rows: 7, columns: 2, labelWidthMm: 99.1, labelHeightMm: 38.1,
    ...centred(A4.widthMm, A4.heightMm, 7, 2, 99.1, 38.1, 2.5, 0), gapXMm: 2.5, gapYMm: 0, safeInsetMm: 1.5, cornerRadiusMm: 1.5,
    material: 'adhesiveSheet', refeedSafe: false, verification: 'unverified',
    verificationSource: 'Commonly published size and count; margins centred; not yet checked against the manufacturer template',
  },
  {
    ...base, id: 'preset_offer_a6_on_a4', name: 'Offer cards A6 (4 per A4, cutting guides)',
    paper: 'A4', pageWidthMm: A4.widthMm, pageHeightMm: A4.heightMm, rows: 2, columns: 2, labelWidthMm: 105, labelHeightMm: 148,
    ...centred(A4.widthMm, A4.heightMm, 2, 2, 105, 148), gapXMm: 0, gapYMm: 0, safeInsetMm: 6,
    material: 'promoCard', refeedSafe: true, verification: 'userDefined', verificationSource: 'ISO 216 A6 imposed on A4',
  },
  {
    ...base, id: 'preset_offer_a5_on_a4', name: 'Offer cards A5 (2 per A4 landscape, cutting guides)', orientation: 'landscape',
    paper: 'A4', pageWidthMm: A4.heightMm, pageHeightMm: A4.widthMm, rows: 1, columns: 2, labelWidthMm: 148, labelHeightMm: 210,
    ...centred(A4.heightMm, A4.widthMm, 1, 2, 148, 210), gapXMm: 0, gapYMm: 0, safeInsetMm: 8,
    material: 'promoCard', refeedSafe: true, verification: 'userDefined', verificationSource: 'ISO 216 A5 imposed on A4 landscape',
  },
  {
    ...base, id: 'preset_offer_a4', name: 'Offer card A4 (1 per sheet)',
    paper: 'A4', pageWidthMm: A4.widthMm, pageHeightMm: A4.heightMm, rows: 1, columns: 1, labelWidthMm: 210, labelHeightMm: 297,
    marginLeftMm: 0, marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, gapXMm: 0, gapYMm: 0, safeInsetMm: 10,
    material: 'promoCard', refeedSafe: true, verification: 'userDefined', verificationSource: 'ISO 216 A4',
  },
];

export const presetById = (id: string): StationeryProfile | undefined => PRESETS.find(p => p.id === id);
