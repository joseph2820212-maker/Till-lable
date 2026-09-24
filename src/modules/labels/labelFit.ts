/**
 * Live fit hints for the product screens: measured with the embedded fonts at the fixed size of the default
 * stationery's standard layout (never by counting characters). Informational only — the renderer is the authority.
 */
import { PRESETS, presetById } from './engine/presets';
import { templateFor } from './engine/labelTemplate';
import { measureMm, wrapLines } from './engine/textFit';

export function labelFit(profileId: string, text: { name: string; secondLine?: string }): { name: boolean; secondLine: boolean } {
  const p = presetById(profileId) ?? PRESETS[0];
  let t;
  try { t = templateFor({ widthMm: p.labelWidthMm, heightMm: p.labelHeightMm, safeInsetMm: p.safeInsetMm }, 'standard'); } catch { return { name: true, secondLine: true }; }
  const name = !text.name || wrapLines(text.name, t.widthMm, t.namePt, 'bold').length <= t.nameLines;
  const secondLine = !text.secondLine || measureMm(text.secondLine, t.secondPt, 'regular') <= t.widthMm;
  return { name, secondLine };
}
