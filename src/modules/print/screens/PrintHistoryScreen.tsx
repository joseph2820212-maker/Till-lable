import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { EmptyState } from '../../../components/EmptyState';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { listJobs, type StoredJob } from '../storage/jobStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Print history: every generated PDF, newest first. Opening one shows the ORIGINAL file (byte-identical, SHA-256 kept). */
export const PrintHistoryScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const [jobs, setJobs] = useState<StoredJob[] | null>(null);
  useFocusEffect(useCallback(() => { listJobs().then(setJobs).catch(() => setJobs([])); }, []));
  const date = (iso: string) => { const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0'); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('printSetup.history')} subtitle={t('history.subtitle')} onBack={() => nav.goBack()} />
      <FlatList
        data={jobs ?? []}
        keyExtractor={j => j.id}
        contentContainerStyle={s.content}
        ListEmptyComponent={jobs ? <EmptyState icon="time-outline" title={t('history.emptyTitle')} body={t('history.emptyBody')} /> : null}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => nav.navigate('PrintPreview', { jobId: item.id })} accessibilityRole="button">
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name} numberOfLines={1}>{item.displayName}</Text>
              <Text style={s.meta}>{`${date(item.createdAt)} · ${t(`history.kind.${item.kind}`)} · ${t('history.labels', { count: item.labelCount })}`}</Text>
              {!item.pdfUri || item.pdfUnavailable ? <Text style={s.unavailable}>{t('history.pdfUnavailable')}</Text> : null}
            </View>
            <Text style={[s.status, item.status === 'confirmed' && s.ok]}>{t(`history.status.${item.status}`)}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  name: { ...typography.cardTitle, color: colors.textDark },
  meta: { ...typography.bodySm, color: colors.textMuted },
  status: { ...typography.bodySm, color: colors.textMuted, fontWeight: '700' },
  ok: { color: colors.successGreen },
  unavailable: { ...typography.bodySm, color: colors.warningOrange, fontWeight: '600' },
});
