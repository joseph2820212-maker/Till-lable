import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { TabRootHeader } from '../../../components/TabRootHeader';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import { APP_NAME } from '../../../appMeta';
import { getCurrencyCode, isCurrencySet } from '../../../utils/currency';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { loadWorkSummary, type WorkSummary } from '../../queue/storage/summary';

/**
 * Home: what is waiting to print, and first-run setup. Label actions (Quick
 * label, Reduced label, Create offer, Scan / reprint) are added in the gates
 * that implement them; no button appears before it works.
 */
export const HomeScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [summary, setSummary] = useState<WorkSummary | null>(null);

  useFocusEffect(useCallback(() => {
    loadWorkSummary().then(setSummary).catch(() => setSummary(null));
  }, []));

  return (
    <View style={s.root}>
      <TabRootHeader title={APP_NAME} subtitle={t('home.tagline')} />
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        <View style={s.card} testID="home-summary">
          <View style={s.row}>
            <Ionicons name="print-outline" size={20} color={colors.primaryBlue} />
            <Text style={s.cardTitle}>{t('home.waitingTitle')}</Text>
          </View>
          <Text style={s.count}>{summary ? t('home.waitingCounts', { products: summary.waitingProducts, labels: summary.waitingLabels }) : '—'}</Text>
          <Text style={s.muted}>{summary ? t('home.productCount', { count: summary.products }) : t('home.summaryUnavailable')}</Text>
        </View>

        <SettingsSection title={t('home.setupTitle')} footer={t('home.setupFooter')}>
          <SettingsRow iconNode={<Ionicons name="language-outline" size={18} color={colors.primaryBlue} />} label={t('settings.language')} subtitle={t('settings.languageValue')} onPress={() => nav.navigate('SettingsLanguage')} />
          <SettingsRow iconNode={<Ionicons name="cash-outline" size={18} color={colors.primaryBlue} />} label={t('settings.currency')} subtitle={isCurrencySet() ? getCurrencyCode() : t('settings.currencyNotSet')} onPress={() => nav.navigate('SettingsCurrency')} isLast />
        </SettingsSection>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { ...typography.cardTitle, color: colors.textDark, flex: 1 },
  count: { ...typography.sectionTitle, color: colors.textDark },
  muted: { ...typography.bodySm, color: colors.textMuted },
});
