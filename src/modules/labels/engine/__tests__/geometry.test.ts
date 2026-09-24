import { SCHEMA_VERSIONS, type StationeryProfile } from '../../../../domain/types';
import { cellOrigin, labelsPerSheet, mmToPt, PAPER_MM, pageSizeMm, placeLabels, validateStationery, hasBlockingIssue } from '../geometry';
import { PRESETS } from '../presets';

const profile = (o: Partial<StationeryProfile> = {}): StationeryProfile => ({
  schemaVersion: SCHEMA_VERSIONS.stationeryProfile, id: 'p', name: 'Test', paper: 'A4', orientation: 'portrait',
  pageWidthMm: 210, pageHeightMm: 297, rows: 8, columns: 3, labelWidthMm: 63.5, labelHeightMm: 33.9,
  marginTopMm: 12.9, marginLeftMm: 7.25, gapXMm: 2.5, gapYMm: 0, safeInsetMm: 1.5,
  material: 'adhesiveSheet', refeedSafe: false, verification: 'userDefined', isPreset: false, ...o,
});

describe('paper sizes and units (E1, E2)', () => {
  it('A4, US Letter, A5, A6 in mm; landscape swaps; custom uses its own numbers', () => {
    expect(PAPER_MM.Letter).toEqual({ widthMm: 215.9, heightMm: 279.4 });
    expect(pageSizeMm({ paper: 'A4', orientation: 'landscape', pageWidthMm: 297, pageHeightMm: 210 })).toEqual({ widthMm: 297, heightMm: 210 });
    expect(pageSizeMm({ paper: 'custom', orientation: 'portrait', pageWidthMm: 100, pageHeightMm: 150 })).toEqual({ widthMm: 100, heightMm: 150 });
  });
  it('mm → pt once: A4 is 595.28 × 841.89 pt and Letter 612 × 792 pt', () => {
    expect(mmToPt(210)).toBeCloseTo(595.276, 3);
    expect(mmToPt(297)).toBeCloseTo(841.89, 2);
    expect(mmToPt(215.9)).toBeCloseTo(612, 6);
    expect(mmToPt(279.4)).toBeCloseTo(792, 6);
  });
});

describe('positions from one origin, no drift (E2)', () => {
  it('the last label of a 3 × 8 grid is exactly where the formula puts it', () => {
    const p = profile();
    const boxes = placeLabels(p, { count: 24 });
    const last = boxes[23];
    expect(last).toMatchObject({ page: 0, position: 24, row: 7, column: 2 });
    expect(last.xMm).toBeCloseTo(7.25 + 2 * (63.5 + 2.5), 9);
    expect(last.yMm).toBeCloseTo(12.9 + 7 * 33.9, 9);
  });
  it('a 5 × 13 grid (tiny labels) still lands within 0.1 mm at the bottom-right', () => {
    const p = profile({ rows: 13, columns: 5, labelWidthMm: 38.1, labelHeightMm: 21.2, marginTopMm: 10.7, marginLeftMm: 4.7, gapXMm: 2.5, gapYMm: 0 });
    const b = placeLabels(p, { count: 65 })[64];
    expect(Math.abs(b.xMm - cellOrigin(p, 12, 4).xMm)).toBeLessThan(0.1);
    expect(b.yMm + b.heightMm).toBeCloseTo(10.7 + 13 * 21.2, 9);
  });
  it('US Letter grids are first-class', () => {
    const p = profile({ paper: 'Letter', pageWidthMm: 215.9, pageHeightMm: 279.4, rows: 10, columns: 3, labelWidthMm: 66.675, labelHeightMm: 25.4, marginTopMm: 12.7, marginLeftMm: 4.7625, gapXMm: 3.175, gapYMm: 0 });
    expect(hasBlockingIssue(validateStationery(p))).toBe(false);
    expect(placeLabels(p, { count: 30 })).toHaveLength(30);
  });
});

describe('start position, skipped positions, calibration, multiple sheets (E4)', () => {
  it('starting at label 7 leaves 1–6 empty; overflow continues on sheet 2 from position 1', () => {
    const boxes = placeLabels(profile(), { count: 20, startPosition: 7 });
    expect(boxes[0].position).toBe(7);
    expect(boxes.filter(b => b.page === 0)).toHaveLength(18);
    expect(boxes[18]).toMatchObject({ page: 1, position: 1 });
  });
  it('skipped positions are left empty on the first sheet only', () => {
    const boxes = placeLabels(profile(), { count: 3, startPosition: 1, skipPositions: [2, 3] });
    expect(boxes.map(b => b.position)).toEqual([1, 4, 5]);
  });
  it('a calibration offset moves every box by exactly the same amount', () => {
    const a = placeLabels(profile(), { count: 24 });
    const b = placeLabels(profile(), { count: 24, calibration: { offsetXMm: 0.5, offsetYMm: -1 } });
    a.forEach((box, i) => { expect(b[i].xMm - box.xMm).toBeCloseTo(0.5, 9); expect(b[i].yMm - box.yMm).toBeCloseTo(-1, 9); });
  });
  it('rejects a bad start position or count', () => {
    expect(() => placeLabels(profile(), { count: 1, startPosition: 25 })).toThrow();
    expect(() => placeLabels(profile(), { count: -1 })).toThrow();
  });
});

describe('validation before any PDF (E3, TL-27)', () => {
  const codes = (p: StationeryProfile) => validateStationery(p).map(i => i.code);
  it('rejects impossible profiles with a reason per rule', () => {
    expect(codes(profile({ labelWidthMm: 0 }))).toContain('nonPositiveSize');
    expect(codes(profile({ rows: 0 }))).toContain('invalidCount');
    expect(codes(profile({ rows: 2.5 }))).toContain('invalidCount');
    expect(codes(profile({ marginTopMm: -1 }))).toContain('negativeMargin');
    expect(codes(profile({ columns: 4 }))).toContain('gridTooWide');
    expect(codes(profile({ rows: 9 }))).toContain('gridTooTall');
    expect(codes(profile({ marginRightMm: 20 }))).toContain('marginsDontAddUpX');
    expect(codes(profile({ marginBottomMm: 2 }))).toContain('marginsDontAddUpY');
    expect(codes(profile({ safeInsetMm: 17 }))).toContain('safeInsetTooLarge');
    expect(codes(profile({ paper: 'A4', pageWidthMm: 215.9, pageHeightMm: 279.4 }))).toContain('pageSizeMismatch');
  });
  it('the overflow amount is reported so the UI can explain it', () => {
    const issue = validateStationery(profile({ columns: 4 })).find(i => i.code === 'gridTooWide');
    expect(issue?.detail?.overflowMm).toBeCloseTo(7.25 + 4 * 63.5 + 3 * 2.5 - 210, 3);
  });
  it('content too close to the paper edge is a warning, not a block', () => {
    const issues = validateStationery(profile({ marginLeftMm: 0.5, safeInsetMm: 0.5 }));
    expect(issues.find(i => i.code === 'nearPrinterEdge')?.severity).toBe('warning');
    expect(hasBlockingIssue(issues)).toBe(false);
  });
});

describe('initial presets', () => {
  it('every preset is valid, adds up to its page, and is honest about verification', () => {
    for (const p of PRESETS) {
      expect({ id: p.id, issues: validateStationery(p).filter(i => i.severity === 'error') }).toEqual({ id: p.id, issues: [] });
      expect(p.isPreset).toBe(true);
      expect(['userDefined', 'unverified']).toContain(p.verification);
      if (p.manufacturerCode) expect(p.verification).toBe('unverified');
    }
  });
  it('includes the priority 70 × 38 mm shelf ticket on A4 and US Letter, L7160, L7159, L7163 and offer cards', () => {
    const ids = PRESETS.map(p => p.id);
    expect(ids).toEqual(expect.arrayContaining(['preset_shelf_70x38_a4', 'preset_shelf_70x38_letter', 'preset_avery_l7160', 'preset_avery_l7159', 'preset_avery_l7163', 'preset_offer_a6_on_a4', 'preset_offer_a5_on_a4', 'preset_offer_a4']));
    expect(labelsPerSheet(PRESETS.find(p => p.id === 'preset_avery_l7160')!)).toBe(21);
    expect(labelsPerSheet(PRESETS.find(p => p.id === 'preset_avery_l7159')!)).toBe(24);
    expect(labelsPerSheet(PRESETS.find(p => p.id === 'preset_avery_l7163')!)).toBe(14);
    expect(PRESETS.find(p => p.id === 'preset_avery_l7160')!.refeedSafe).toBe(false);
  });
});
