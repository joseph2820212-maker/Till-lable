import React from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { RadioRow } from '../../../components/RadioRow';
import { AppSwitch } from '../../../components/AppSwitch';
import { ToggleSegment } from '../../../components/ToggleSegment';
import { AppAlert } from '../../../components/AppAlert';
import type { LanguageCode } from '../../../domain/types';
import { saveLabelSettings, useLabelSettings, type LabelSettings, type ShelfKind } from '../storage/labelSettings';

const LANGS: LanguageCode[] = ['en', 'ar', 'tr', 'fr', 'es', 'de'];
const KINDS: ShelfKind[] = ['standardPrice', 'priceUnitPrice', 'priceBarcode'];

/**
 * Label settings (More → Label settings): the PRINTED-label language (independent of the app language and the
 * currency), the default label type, the offer style and the card options.
 */
export const LabelSettingsScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigation();
  const s0 = useLabelSettings();
  const save = async (patch: Partial<LabelSettings>) => {
    try { await saveLabelSettings(patch); } catch { AppAlert.error(t('labelSettings.saveFailed')); }
  };
  const appLang = (LANGS.find(l => (i18n.language || 'en').startsWith(l)) ?? 'en') as LanguageCode;
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('labelSettings.title')} subtitle={t('labelSettings.subtitle')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.section}>{t('labelSettings.languageTitle')}</Text>
        <Text style={s.note}>{t('labelSettings.languageBody')}</Text>
        <RadioRow label={t('labelSettings.sameAsApp', { language: t(`labelLanguage.${appLang}`) })} selected={s0.labelLanguage === null} onSelect={() => save({ labelLanguage: null })} />
        {LANGS.map(l => <RadioRow key={l} label={t(`labelLanguage.${l}`)} subtitle={t(`labelLanguage.sample.${l}`)} selected={s0.labelLanguage === l} onSelect={() => save({ labelLanguage: l })} />)}

        <Text style={s.section}>{t('labelSettings.defaultKind')}</Text>
        <ToggleSegment options={KINDS.map(k => t(`labelKind.${k}`))} selected={t(`labelKind.${s0.defaultKind}`)} onSelect={v => save({ defaultKind: KINDS.find(k => t(`labelKind.${k}`) === v) ?? 'standardPrice' })} />

        <Text style={s.section}>{t('labelSettings.offerStyle')}</Text>
        <ToggleSegment options={[t('labelSettings.styleYellow'), t('labelSettings.styleInk')]} selected={s0.promoStyle === 'promo' ? t('labelSettings.styleYellow') : t('labelSettings.styleInk')} onSelect={v => save({ promoStyle: v === t('labelSettings.styleInk') ? 'inkSaving' : 'promo' })} />
        <Text style={s.note}>{t('labelSettings.offerStyleHint')}</Text>

        <View style={s.row}><View style={{ flex: 1 }}><Text style={s.rowLabel}>{t('labelSettings.skuOnCards')}</Text><Text style={s.note}>{t('labelSettings.skuOnCardsHint')}</Text></View><AppSwitch value={s0.showSkuOnCards} onValueChange={v => save({ showSkuOnCards: v })} /></View>
        <View style={s.row}><View style={{ flex: 1 }}><Text style={s.rowLabel}>{t('labelSettings.promoBarcode')}</Text><Text style={s.note}>{t('labelSettings.promoBarcodeHint')}</Text></View><AppSwitch value={s0.promoBarcode} onValueChange={v => save({ promoBarcode: v })} /></View>

        <Text style={s.section}>{t('labelSettings.unitDecimals')}</Text>
        <ToggleSegment options={['0', '+1', '+2']} selected={s0.unitPriceExtraDecimals === 0 ? '0' : `+${s0.unitPriceExtraDecimals}`} onSelect={v => save({ unitPriceExtraDecimals: (v === '0' ? 0 : Number(v.slice(1))) as 0 | 1 | 2 })} />
        <Text style={s.note}>{t('labelSettings.unitDecimalsHint')}</Text>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  section: { ...typography.sectionLabel, color: colors.textMuted, marginTop: spacing.md },
  note: { ...typography.bodySm, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  rowLabel: { ...typography.body, color: colors.textDark, fontWeight: '600' },
});
