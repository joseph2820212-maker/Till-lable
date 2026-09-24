import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
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
import { tabTarget } from '../../../navigation/tabs';
import { loadWorkSummary, type WorkSummary } from '../../queue/storage/summary';
import { useLabelContext } from '../../labels/hooks/useLabelContext';

/**
 * Home: what is waiting to print, the everyday label actions (Quick label, Scan, Offers, Reduced to clear)
 * and first-run setup (app language, currency, printed-label language, print setup).
 */
export const HomeScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [summary, setSummary] = useState<WorkSummary | null>(null);
  const { language } = useLabelContext();

  useFocusEffect(useCallback(() => {
    loadWorkSummary().then(setSummary).catch(() => setSummary(null));
  }, []));

  return (
    <View style={s.root}>
      <TabRootHeader title={APP_NAME} subtitle={t('home.tagline')} />
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        <TouchableOpacity style={s.card} testID="home-summary" onPress={() => nav.navigate('Tabs', tabTarget('ToPrint'))} accessibilityRole="button">
          <View style={s.row}>
            <Ionicons name="print-outline" size={20} color={colors.primaryBlue} />
            <Text style={s.cardTitle}>{t('home.waitingTitle')}</Text>
          </View>
          <Text style={s.count}>{summary ? t('home.waitingCounts', { products: summary.waitingProducts, labels: summary.waitingLabels }) : '—'}</Text>
          <Text style={s.muted}>{summary ? t('home.productCount', { count: summary.products }) : t('home.summaryUnavailable')}</Text>
        </TouchableOpacity>

        <View style={s.grid}>
          {([
            ['flash-outline', 'home.quickLabel', () => nav.navigate('QuickLabel'), 'home-quick'],
            ['barcode-outline', 'home.scan', () => nav.navigate('Scan', { mode: 'find' }), 'home-scan'],
            ['pricetag-outline', 'home.offers', () => nav.navigate('Offers'), 'home-offers'],
            ['trending-down-outline', 'home.reduced', () => nav.navigate('ReducedLabel', {}), 'home-reduced'],
          ] as const).map(([icon, key, go, id]) => (
            <TouchableOpacity key={key} style={s.tile} onPress={go} accessibilityRole="button" testID={id}>
              <Ionicons name={icon} size={24} color={colors.primaryBlue} />
              <Text style={s.tileText}>{t(key)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SettingsSection title={t('home.setupTitle')} footer={t('home.setupFooter')}>
          <SettingsRow iconNode={<Ionicons name="language-outline" size={18} color={colors.primaryBlue} />} label={t('settings.language')} subtitle={t('settings.languageValue')} onPress={() => nav.navigate('SettingsLanguage')} />
          <SettingsRow iconNode={<Ionicons name="cash-outline" size={18} color={colors.primaryBlue} />} label={t('settings.currency')} subtitle={isCurrencySet() ? getCurrencyCode() : t('settings.currencyNotSet')} onPress={() => nav.navigate('SettingsCurrency')} />
          <SettingsRow iconNode={<Ionicons name="text-outline" size={18} color={colors.primaryBlue} />} label={t('labelSettings.languageTitle')} subtitle={t(`labelLanguage.${language}`)} onPress={() => nav.navigate('SettingsLabels')} />
          <SettingsRow iconNode={<Ionicons name="print-outline" size={18} color={colors.primaryBlue} />} label={t('printSetup.title')} subtitle={t('printSetup.subtitle')} onPress={() => nav.navigate('PrintSetup')} isLast />
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 84, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8, justifyContent: 'center' },
  tileText: { ...typography.cardTitle, color: colors.textDark },
});
