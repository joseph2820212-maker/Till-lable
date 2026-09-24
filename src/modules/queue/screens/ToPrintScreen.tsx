import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { TabRootHeader } from '../../../components/TabRootHeader';
import { EmptyState } from '../../../components/EmptyState';
import { loadWorkSummary, type WorkSummary } from '../storage/summary';

/**
 * To print tab root. Shows the empty state only when nothing is waiting; otherwise the
 * product and label counts. The changed-only queue list, preview and printing arrive in G2/G5.
 */
export const ToPrintScreen: React.FC = () => {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<WorkSummary | null>(null);
  useFocusEffect(useCallback(() => {
    loadWorkSummary().then(setSummary).catch(() => setSummary(null));
  }, []));
  const subtitle = summary ? t('home.waitingCounts', { products: summary.waitingProducts, labels: summary.waitingLabels }) : undefined;
  return (
    <View style={s.root}>
      <TabRootHeader title={t('nav.toPrint')} subtitle={subtitle} />
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        {summary && summary.waitingLabels > 0 ? (
          <View style={s.card} testID="queue-waiting">
            <Text style={s.cardTitle}>{t('home.waitingTitle')}</Text>
            <Text style={s.count}>{t('home.waitingCounts', { products: summary.waitingProducts, labels: summary.waitingLabels })}</Text>
          </View>
        ) : (
          <EmptyState icon="print-outline" title={t('queue.emptyTitle')} body={t('queue.emptyBody')} testID="queue-empty" />
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 6 },
  cardTitle: { ...typography.cardTitle, color: colors.textDark },
  count: { ...typography.sectionTitle, color: colors.textDark },
});
