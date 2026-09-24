/**
 * Stationery profiles: the built-in presets plus the shop's own sheets (custom profiles are Pro). Calibration is
 * stored per printer + stationery profile (PrinterCalibration) and applied to every job on that profile.
 */
import { TL_KEYS } from '../../../storage/keys';
import { readList, updateList } from '../../../storage/repo';
import { SCHEMA_VERSIONS, type PrinterCalibration, type StationeryProfile } from '../../../domain/types';
import { PRESETS, presetById } from '../../labels/engine/presets';
import { hasBlockingIssue, validateStationery, type GeometryIssue } from '../../labels/engine/geometry';
import { makeId, nowIso } from '../../products/utils/ids';

export async function listCustomProfiles(): Promise<StationeryProfile[]> {
  return (await readList<StationeryProfile>(TL_KEYS.stationery)).filter(p => p && p.id && !p.isPreset);
}

export async function listAllProfiles(): Promise<StationeryProfile[]> {
  return [...PRESETS, ...(await listCustomProfiles())];
}

export async function getProfile(id: string): Promise<StationeryProfile> {
  return presetById(id) ?? (await listCustomProfiles()).find(p => p.id === id) ?? PRESETS[0];
}

export class StationeryInvalidError extends Error {
  constructor(public readonly issues: GeometryIssue[]) { super('stationery profile is not printable'); this.name = 'StationeryInvalidError'; }
}

/** Save a custom profile after validation. Presets cannot be edited (a copy is saved instead). */
export async function saveCustomProfile(p: Omit<StationeryProfile, 'schemaVersion' | 'id' | 'isPreset' | 'verification'> & { id?: string }): Promise<StationeryProfile> {
  const profile: StationeryProfile = { ...p, schemaVersion: SCHEMA_VERSIONS.stationeryProfile, id: p.id && !presetById(p.id) ? p.id : makeId('stn'), isPreset: false, verification: 'userDefined' };
  const issues = validateStationery(profile);
  if (hasBlockingIssue(issues)) throw new StationeryInvalidError(issues);
  await updateList<StationeryProfile>(TL_KEYS.stationery, list => ({ list: [...list.filter(x => x.id !== profile.id), profile], result: undefined }));
  return profile;
}

export async function deleteCustomProfile(id: string): Promise<void> {
  await updateList<StationeryProfile>(TL_KEYS.stationery, list => ({ list: list.filter(x => x.id !== id), result: undefined }));
}

export async function getCalibration(profileId: string): Promise<PrinterCalibration | null> {
  return (await readList<PrinterCalibration>(TL_KEYS.calibration)).find(c => c.stationeryProfileId === profileId) ?? null;
}

/** Offsets are kept within ±10 mm in 0.5 mm steps. */
export const clampOffset = (mm: number) => Math.max(-10, Math.min(10, Math.round(mm * 2) / 2));

export async function saveCalibration(profileId: string, offsetXMm: number, offsetYMm: number, printerName = ''): Promise<PrinterCalibration> {
  const cal: PrinterCalibration = {
    schemaVersion: SCHEMA_VERSIONS.printerCalibration, id: `cal_${profileId}`, printerName, stationeryProfileId: profileId,
    offsetXMm: clampOffset(offsetXMm), offsetYMm: clampOffset(offsetYMm), needsRecheck: false, updatedAt: nowIso(),
  };
  await updateList<PrinterCalibration>(TL_KEYS.calibration, list => ({ list: [...list.filter(c => c.stationeryProfileId !== profileId), cal], result: undefined }));
  return cal;
}
