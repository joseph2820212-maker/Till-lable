import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { useTier } from '../../billing/useTier';
import { canUseFeature } from '../../billing/limits';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { StationeryProfile } from '../../../domain/types';
import { labelsPerSheet } from '../../labels/engine/geometry';
import { listAllProfiles } from '../storage/stationeryStore';
import { useLabelSettings } from '../../settings/storage/labelSettings';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** More → Print setup: Stationery profiles · Label test · Printer calibration (owner handout §17), plus history. */
export const PrintSetupScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const tier = useTier();
  const settings = useLabelSettings();
  const [profiles, setProfiles] = useState<StationeryProfile[]>([]);
  const [limit, setLimit] = useState(false);
  useFocusEffect(useCallback(() => { listAllProfiles().then(setProfiles).catch(() => undefined); }, []));
  const addCustom = () => (canUseFeature(tier, 'customStationery') ? nav.navigate('StationeryEditor', {}) : setLimit(true));
  const icon = (name: string) => <Ionicons name={name as never} size={18} color={colors.primaryBlue} />;
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('printSetup.title')} subtitle={t('printSetup.subtitle')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <SettingsSection title={t('printSetup.stationery')} footer={t('printSetup.stationeryFooter')}>
          {profiles.map((p, i) => (
            <SettingsRow key={p.id} iconNode={icon(p.material === 'adhesiveSheet' ? 'albums-outline' : p.material === 'promoCard' ? 'megaphone-outline' : 'grid-outline')}
              label={p.name} subtitle={[t('printSetup.perSheet', { count: labelsPerSheet(p) }), p.isPreset ? t(`printSetup.verification.${p.verification}`) : t('printSetup.custom'), p.id === settings.defaultProfileId ? t('printSetup.default') : ''].filter(Boolean).join(' · ')}
              onPress={() => nav.navigate('StationeryEditor', { profileId: p.id })} isLast={false} testID={`profile-${i}`} />
          ))}
          <SettingsRow iconNode={icon('add-circle-outline')} label={t('printSetup.addCustom')} subtitle={tier === 'pro' ? undefined : t('printSetup.proOnly')} onPress={addCustom} isLast />
        </SettingsSection>
        <SettingsSection title={t('printSetup.tools')}>
          <SettingsRow iconNode={icon('flask-outline')} label={t('printSetup.labelTest')} subtitle={t('printSetup.labelTestSub')} onPress={() => nav.navigate('LabelTest')} />
          <SettingsRow iconNode={icon('resize-outline')} label={t('printSetup.calibration')} subtitle={t('printSetup.calibrationSub')} onPress={() => nav.navigate('Calibration', {})} />
          <SettingsRow iconNode={icon('time-outline')} label={t('printSetup.history')} subtitle={t('printSetup.historySub')} onPress={() => nav.navigate('PrintHistory')} />
          <SettingsRow iconNode={icon('options-outline')} label={t('labelSettings.title')} subtitle={t('labelSettings.subtitle')} onPress={() => nav.navigate('SettingsLabels')} isLast />
        </SettingsSection>
        <Text style={s.note}>{t('printSetup.paperNote')}</Text>
      </ScrollView>
      <FreeLimitSheet reason={limit ? 'proFeature' : null} onClose={() => setLimit(false)} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  note: { ...typography.bodySm, color: colors.textMuted },
});
