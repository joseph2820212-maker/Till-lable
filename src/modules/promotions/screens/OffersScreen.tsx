import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { EmptyState } from '../../../components/EmptyState';
import { AppButton } from '../../../components/AppButton';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { Promotion, ReductionBatch } from '../../../domain/types';
import { formatMoney } from '../../../domain/formatMoney';
import { isLive, listPromotions, listReductions } from '../storage/promotionStore';
import { useLabelContext } from '../../labels/hooks/useLabelContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/** Offers and reductions: what is running, what is scheduled, what ended — and recent reduced-to-clear batches. */
export const OffersScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { language } = useLabelContext();
  const [promos, setPromos] = useState<Promotion[] | null>(null);
  const [reductions, setReductions] = useState<ReductionBatch[]>([]);
  useFocusEffect(useCallback(() => {
    Promise.all([listPromotions(), listReductions()]).then(([p, r]) => { setPromos(p); setReductions(r.slice(0, 20)); }).catch(() => setPromos([]));
  }, []));
  const d = today();
  const state = (p: Promotion) => (p.status === 'ended' || (p.endDate && p.endDate < d) ? 'ended' : isLive(p, d) ? 'live' : 'scheduled');
  const sorted = [...(promos ?? [])].sort((a, b) => ['live', 'scheduled', 'ended'].indexOf(state(a)) - ['live', 'scheduled', 'ended'].indexOf(state(b)));
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('offers.title')} subtitle={t('offers.listSubtitle')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.actions}>
          <AppButton label={t('offers.newTitle')} onPress={() => nav.navigate('OfferEditor', {})} style={{ flex: 1 }} />
          <AppButton label={t('reduce.title')} onPress={() => nav.navigate('ReducedLabel', {})} variant="secondary" style={{ flex: 1 }} />
        </View>
        {promos && promos.length === 0 ? <EmptyState icon="pricetag-outline" title={t('offers.emptyTitle')} body={t('offers.emptyBody')} /> : null}
        {sorted.map(p => (
          <TouchableOpacity key={p.id} style={s.row} onPress={() => nav.navigate('OfferEditor', { promotionId: p.id })} accessibilityRole="button">
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name} numberOfLines={2}>{p.name}</Text>
              <Text style={s.meta}>{[t(`offers.kind.${p.type.kind}`), t('offers.products', { count: p.productIds.length }), p.endDate ? t('offers.until', { date: p.endDate }) : ''].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text style={[s.badge, state(p) === 'live' && s.live]}>{t(`offers.state.${state(p)}`)}</Text>
          </TouchableOpacity>
        ))}
        {reductions.length ? <Text style={s.section}>{t('reduce.recent')}</Text> : null}
        {reductions.map(r => (
          <View key={r.id} style={s.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.name} numberOfLines={1}>{r.productName}</Text>
              <Text style={s.meta}>{t('reduce.summary', { was: formatMoney(r.normalPrice.minor, r.normalPrice.currency, language), now: formatMoney(r.reducedPrice.minor, r.reducedPrice.currency, language), count: r.copies })}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  actions: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  name: { ...typography.cardTitle, color: colors.textDark },
  meta: { ...typography.bodySm, color: colors.textMuted },
  badge: { ...typography.bodySm, color: colors.textMuted, fontWeight: '700' },
  live: { color: colors.successGreen },
  section: { ...typography.sectionLabel, color: colors.textMuted, marginTop: spacing.md },
});
