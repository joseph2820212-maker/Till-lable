import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppButton } from '../../../components/AppButton';
import { ToggleSegment } from '../../../components/ToggleSegment';
import { AppAlert } from '../../../components/AppAlert';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { getCurrencyCode, isCurrencySet } from '../../../utils/currency';
import { labelsPerSheet } from '../../labels/engine/geometry';
import { useLabelContext } from '../../labels/hooks/useLabelContext';
import type { ShelfKind } from '../../settings/storage/labelSettings';
import { PrintOptions } from '../components/PrintOptions';
import { getProfile } from '../storage/stationeryStore';
import { generateSheetJob, optionsFor, sampleLabels } from '../printService';
import { generateFailureText } from '../issueText';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const KINDS: ShelfKind[] = ['standardPrice', 'priceUnitPrice', 'priceBarcode'];

/** Label test: fill one sheet with sample labels in YOUR label language and currency to check printer and stationery. */
export const LabelTestScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { language, settings } = useLabelContext();
  const [kind, setKind] = useState<ShelfKind>('standardPrice');
  const [profileId, setProfileId] = useState(settings.defaultProfileId);
  const [start, setStart] = useState(1);
  const [busy, setBusy] = useState(false);
  const currency = isCurrencySet() ? getCurrencyCode() : '';

  const create = async () => {
    if (!currency || busy) return;
    setBusy(true);
    try {
      const profile = await getProfile(profileId);
      const [content] = sampleLabels(language, currency, kind);
      const copies = labelsPerSheet(profile) - start + 1;
      const r = await generateSheetJob({ profileId: profile.id, items: [{ content, copies, options: optionsFor(content, profile, settings) }], startPosition: start, displayName: t('labelTest.jobName'), kind: 'test' });
      if (r.ok) nav.navigate('PrintPreview', { jobId: r.job.id });
      else AppAlert.alert(t('print.cannotPrintTitle'), generateFailureText(t, r, [t('labelTest.sample')]));
    } finally { setBusy(false); }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('printSetup.labelTest')} subtitle={t('labelTest.subtitle')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <TouchableOpacity style={s.card} onPress={() => nav.navigate('SettingsLabels')} accessibilityRole="button">
          <Text style={s.label}>{t('labelTest.printedAs')}</Text>
          <Text style={s.value}>{t('labelTest.languageCurrency', { language: t(`labelLanguage.${language}`), currency: currency || t('settings.currencyNotSet') })}</Text>
          <Text style={s.note}>{t('labelTest.changeInSettings')}</Text>
        </TouchableOpacity>
        {!currency ? <TouchableOpacity style={s.warn} onPress={() => nav.navigate('SettingsCurrency')}><Text style={s.warnText}>{t('productEdit.chooseCurrencyFirst')}</Text></TouchableOpacity> : null}
        <Text style={s.label}>{t('labelTest.type')}</Text>
        <ToggleSegment options={KINDS.map(k => t(`labelKind.${k}`))} selected={t(`labelKind.${kind}`)} onSelect={v => setKind(KINDS.find(k => t(`labelKind.${k}`) === v) ?? 'standardPrice')} />
        <PrintOptions profileId={profileId} onProfile={setProfileId} start={start} onStart={setStart} />
        <AppButton label={t('labelTest.create')} onPress={create} loading={busy} disabled={busy || !currency} />
        <AppButton label={t('printSetup.calibration')} onPress={() => nav.navigate('Calibration', { profileId })} variant="secondary" />
        <Text style={s.note}>{t('labelTest.note')}</Text>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  label: { ...typography.sectionLabel, color: colors.textMuted },
  value: { ...typography.cardTitle, color: colors.textDark },
  note: { ...typography.bodySm, color: colors.textMuted },
  warn: { backgroundColor: '#FBEFE3', borderRadius: 12, padding: 12 },
  warnText: { ...typography.bodySm, color: '#8A4B12' },
});
