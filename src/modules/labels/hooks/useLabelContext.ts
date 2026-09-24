import { useTranslation } from 'react-i18next';
import { resolveLabelLanguage, useLabelSettings, type LabelSettings } from '../../settings/storage/labelSettings';
import type { QueueContext } from '../../queue/storage/queueStore';
import type { LanguageCode } from '../../../domain/types';

/** The printed-label language and queue context for screens (label language is independent of the app language). */
export function useLabelContext(): { settings: LabelSettings; language: LanguageCode; ctx: QueueContext } {
  const { i18n } = useTranslation();
  const settings = useLabelSettings();
  const language = resolveLabelLanguage(settings, i18n?.language || 'en');
  return { settings, language, ctx: { language, defaultKind: settings.defaultKind, extraDecimals: settings.unitPriceExtraDecimals } };
}
