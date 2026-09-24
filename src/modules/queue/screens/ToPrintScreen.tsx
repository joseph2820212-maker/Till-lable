import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { TabRootHeader } from '../../../components/TabRootHeader';
import { EmptyState } from '../../../components/EmptyState';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { PrintIntent, Product } from '../../../domain/types';
import { formatMoney } from '../../../domain/formatMoney';
import { loadWorkSummary, type WorkSummary } from '../storage/summary';
import { listWaiting, removeIntents, setCopies } from '../storage/queueStore';
import { listProducts } from '../../products/storage/productStore';
import { resolveQueue, generateSheetJob, optionsFor, type QueueItem } from '../../print/printService';
import { getProfile } from '../../print/storage/stationeryStore';
import { generateFailureText } from '../../print/issueText';
import { PrintOptions } from '../../print/components/PrintOptions';
import { useLabelContext } from '../../labels/hooks/useLabelContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * To print: labels whose printed content changed (changed-only queue), one-off labels, offers and reductions.
 * Choose which to print, the stationery and where to start on the sheet; the next screen is the exact PDF.
 * Nothing is marked printed until the user confirms after a real print attempt.
 */
export const ToPrintScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { language, settings } = useLabelContext();
  const [summary, setSummary] = useState<WorkSummary | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [profileId, setProfileId] = useState(settings.defaultProfileId);
  const [start, setStart] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, waiting, ps] = await Promise.all([loadWorkSummary(), listWaiting(), listProducts({ includeArchived: true })]);
    setSummary(s);
    setProducts(ps);
    setItems(resolveQueue(waiting.filter(i => Number.isInteger(i.copies) && i.copies > 0 && i.id), ps, language, settings));
  }, [language, settings]);

  useFocusEffect(useCallback(() => { load().catch(() => setSummary(null)); }, [load]));

  const selected = useMemo(() => items.filter(i => !deselected.has(i.intent.id) && i.content), [items, deselected]);
  const labelCount = selected.reduce((n, i) => n + i.intent.copies, 0);
  const subtitle = summary ? t('home.waitingCounts', { products: summary.waitingProducts, labels: summary.waitingLabels }) : undefined;

  const toggle = (id: string) => setDeselected(d => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const changeCopies = async (intent: PrintIntent, delta: number) => {
    const next = Math.max(1, Math.min(999, intent.copies + delta));
    if (next === intent.copies) return;
    await setCopies(intent.id, next);
    await load();
  };
  const remove = (intent: PrintIntent) => {
    AppAlert.alert(t('queue.removeTitle'), t('queue.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('queue.remove'), style: 'destructive', onPress: async () => { await removeIntents([intent.id]); await load(); } },
    ]);
  };

  const printSelected = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      const profile = await getProfile(profileId);
      const sheetItems = selected.map(i => ({ content: i.content!, copies: i.intent.copies, intentId: i.intent.id, options: optionsFor(i.content!, profile, settings) }));
      const r = await generateSheetJob({ profileId: profile.id, items: sheetItems, startPosition: start, displayName: t('queue.jobName', { count: labelCount }), kind: 'queue' });
      if (r.ok) nav.navigate('PrintPreview', { jobId: r.job.id });
      else AppAlert.alert(t('print.cannotPrintTitle'), generateFailureText(t, r, selected.map(i => i.intent.title ?? '')));
    } finally { setBusy(false); }
  };

  const reasonText = (i: PrintIntent) => t(`queue.reason.${i.reason}`);
  const empty = !summary || summary.waitingLabels === 0;

  return (
    <View style={s.root}>
      <TabRootHeader title={t('nav.toPrint')} subtitle={subtitle} />
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        {empty ? (
          <EmptyState icon="print-outline" title={t('queue.emptyTitle')} body={t('queue.emptyBody')} testID="queue-empty" />
        ) : (
          <View style={s.list} testID="queue-waiting">
            <View style={s.listHead}>
              <Text style={s.section}>{t('queue.selected', { count: selected.length, labels: labelCount })}</Text>
              <TouchableOpacity onPress={() => setDeselected(deselected.size ? new Set() : new Set(items.map(i => i.intent.id)))} accessibilityRole="button"><Text style={s.link}>{deselected.size ? t('queue.selectAll') : t('queue.selectNone')}</Text></TouchableOpacity>
            </View>
            {items.map(item => {
              const on = !deselected.has(item.intent.id) && !!item.content;
              const product = products.find(p => p.id === item.intent.productId);
              return (
                <View key={item.intent.id} style={[s.row, !item.content && s.rowProblem]}>
                  <TouchableOpacity onPress={() => item.content && toggle(item.intent.id)} style={s.check} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={item.intent.title}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={item.content ? colors.primaryBlue : colors.textFaint} />
                  </TouchableOpacity>
                  <View style={s.rowText}>
                    <Text style={s.name} numberOfLines={2}>{item.content?.name ?? item.intent.title ?? product?.name ?? '—'}</Text>
                    <Text style={s.meta} numberOfLines={1}>{[t(`labelKind.${item.intent.labelKind}`), reasonText(item.intent)].join(' · ')}</Text>
                    {item.problem ? (
                      <TouchableOpacity onPress={() => product && nav.navigate('ProductDetail', { id: product.id })} accessibilityRole="button"><Text style={s.problem}>{t(`queue.problem.${item.problem}`)}</Text></TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={s.right}>
                    {item.content ? <Text style={s.price}>{formatMoney(item.content.price.minor, item.content.price.currency, language)}</Text> : null}
                    <View style={s.stepper}>
                      <TouchableOpacity style={s.step} onPress={() => changeCopies(item.intent, -1)} accessibilityRole="button" accessibilityLabel={t('quick.fewer')}><Text style={s.stepText}>−</Text></TouchableOpacity>
                      <Text style={s.copies}>{item.intent.copies}</Text>
                      <TouchableOpacity style={s.step} onPress={() => changeCopies(item.intent, 1)} accessibilityRole="button" accessibilityLabel={t('quick.more')}><Text style={s.stepText}>+</Text></TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => remove(item.intent)} accessibilityRole="button" accessibilityLabel={t('queue.remove')}><Text style={s.removeLink}>{t('queue.remove')}</Text></TouchableOpacity>
                  </View>
                </View>
              );
            })}
            <PrintOptions profileId={profileId} onProfile={setProfileId} start={start} onStart={setStart} />
            <AppButton label={t('queue.previewPrint', { count: labelCount })} onPress={printSelected} disabled={!selected.length || busy} loading={busy} />
            <Text style={s.note}>{t('queue.printNote')}</Text>
          </View>
        )}
        <View style={s.shortcuts}>
          <AppButton label={t('home.quickLabel')} onPress={() => nav.navigate('QuickLabel')} variant="secondary" />
          <AppButton label={t('printSetup.history')} onPress={() => nav.navigate('PrintHistory')} variant="ghost" />
        </View>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  list: { gap: spacing.sm },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { ...typography.sectionLabel, color: colors.textMuted, flex: 1 },
  link: { ...typography.bodySm, color: colors.primaryBlue, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 10 },
  rowProblem: { borderColor: colors.warningOrange },
  check: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.cardTitle, color: colors.textDark },
  meta: { ...typography.bodySm, color: colors.textMuted },
  problem: { ...typography.bodySm, color: colors.warningOrange, fontWeight: '600' },
  right: { alignItems: 'flex-end', gap: 4 },
  price: { ...typography.moneySmall, color: colors.textDark },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  step: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.inputMuted, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontWeight: '700', color: colors.primaryBlue },
  copies: { ...typography.body, minWidth: 26, textAlign: 'center', color: colors.textDark, fontWeight: '700', fontVariant: ['tabular-nums'] },
  removeLink: { ...typography.bodySm, color: colors.dangerRed },
  note: { ...typography.bodySm, color: colors.textMuted },
  shortcuts: { gap: spacing.sm, marginTop: spacing.md },
});
