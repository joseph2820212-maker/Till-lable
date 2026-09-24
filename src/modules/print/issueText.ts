import type { LabelIssue } from '../labels/engine/renderLabel';
import type { GeometryIssue } from '../labels/engine/geometry';
import type { GenerateResult } from './printService';

type T = (key: string, opts?: Record<string, unknown>) => string;

/** Plain-language reason for a label that cannot print on the chosen stationery. */
export function labelIssueText(t: T, issue: LabelIssue): string {
  if (issue.code === 'priceDoesNotFit') return t('print.issue.priceDoesNotFit');
  if (issue.code === 'tooLong' || issue.code === 'tooWide') return t(`print.issue.${issue.code}.${issue.detail ?? 'name'}`);
  return t(`print.issue.${issue.code}`);
}

export function geometryIssueText(t: T, issue: GeometryIssue): string {
  return t(`print.geometry.${issue.code}`, issue.detail ?? {});
}

/** One message for a failed generation. `titles` names the items (queue order) so the user knows which label. */
export function generateFailureText(t: T, r: Exclude<GenerateResult, { ok: true }>, titles: string[]): string {
  switch (r.reason) {
    case 'empty': return t('print.nothingSelected');
    case 'pdfFailed': return t('print.pdfFailed');
    case 'geometry': return r.issues.length ? r.issues.map(i => geometryIssueText(t, i)).join('\n') : t('print.geometry.generic');
    case 'labels': return r.issues.slice(0, 5).map(i => `${titles[i.itemIndex] ?? '—'}: ${labelIssueText(t, i.issue)}`).join('\n');
  }
}
