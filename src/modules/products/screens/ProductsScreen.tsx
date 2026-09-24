import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { TabRootHeader } from '../../../components/TabRootHeader';
import { EmptyState } from '../../../components/EmptyState';
import { FilterChip } from '../../../components/FilterChip';
import { AppTextInput } from '../../../components/AppTextInput';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { PrintIntent, Product } from '../../../domain/types';
import { listProducts, searchProducts } from '../storage/productStore';
import { listWaiting } from '../../queue/storage/queueStore';
import { printableName } from '../../../domain/productLabel';
import { formatMoney } from '../../../domain/formatMoney';
import { useLabelContext } from '../../labels/hooks/useLabelContext';

type Filter = 'all' | 'waiting' | 'needsName' | 'archived';

/** Products tab: the catalogue with search, filters and the add / scan / import actions. */
export const ProductsScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { language } = useLabelContext();
  const [all, setAll] = useState<Product[] | null>(null);
  const [waiting, setWaiting] = useState<PrintIntent[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    Promise.all([listProducts({ includeArchived: true }), listWaiting()])
      .then(([p, w]) => { if (live) { setAll(p); setWaiting(w); setError(false); } })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, []));

  const waitingIds = useMemo(() => new Set(waiting.map(w => w.productId).filter(Boolean)), [waiting]);
  const shown = useMemo(() => {
    if (!all) return [];
    let list = all.filter(p => (filter === 'archived' ? p.status === 'archived' : p.status !== 'archived'));
    if (filter === 'waiting') list = list.filter(p => waitingIds.has(p.id));
    if (filter === 'needsName') list = list.filter(p => !printableName(p));
    return searchProducts(list, query).sort((a, b) => a.name.localeCompare(b.name));
  }, [all, filter, query, waitingIds]);
  const activeCount = all?.filter(p => p.status !== 'archived').length ?? 0;

  const renderItem = ({ item }: { item: Product }) => {
    const label = printableName(item);
    return (
      <TouchableOpacity style={s.row} onPress={() => nav.navigate('ProductDetail', { id: item.id })} activeOpacity={0.7} accessibilityRole="button" testID={`product-${item.id}`}>
        <View style={s.rowText}>
          <Text style={s.name} numberOfLines={2}>{item.name}</Text>
          <Text style={s.meta} numberOfLines={1}>{[item.secondLine, item.sku, item.barcodes?.[0]?.raw].filter(Boolean).join(' · ') || t('products.noDetails')}</Text>
          <View style={s.badges}>
            {waitingIds.has(item.id) ? <Text style={[s.badge, s.badgeWait]}>{t('products.badgeWaiting')}</Text> : null}
            {!label ? <Text style={[s.badge, s.badgeWarn]}>{t('products.badgeNeedsName')}</Text> : null}
            {item.status === 'archived' ? <Text style={s.badge}>{t('products.badgeArchived')}</Text> : null}
          </View>
        </View>
        <Text style={s.price}>{formatMoney(item.price.minor, item.price.currency, language)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      <TabRootHeader title={t('nav.products')} subtitle={all ? t('products.count', { count: activeCount }) : t('products.subtitle')} />
      <View style={s.tools}>
        <View style={s.actions}>
          <TouchableOpacity style={s.action} onPress={() => nav.navigate('ProductDetail', {})} accessibilityRole="button" testID="products-add">
            <Ionicons name="add-circle-outline" size={20} color={colors.primaryBlue} /><Text style={s.actionText}>{t('products.add')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.action} onPress={() => nav.navigate('Scan', { mode: 'find' })} accessibilityRole="button" testID="products-scan">
            <Ionicons name="barcode-outline" size={20} color={colors.primaryBlue} /><Text style={s.actionText}>{t('products.scan')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.action} onPress={() => nav.navigate('Import')} accessibilityRole="button" testID="products-import">
            <Ionicons name="document-attach-outline" size={20} color={colors.primaryBlue} /><Text style={s.actionText}>{t('products.import')}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.search}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <AppTextInput style={s.searchInput} value={query} onChangeText={setQuery} placeholder={t('products.searchPlaceholder')} placeholderTextColor={colors.textFaint} returnKeyType="search" accessibilityLabel={t('products.searchPlaceholder')} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {(['all', 'waiting', 'needsName', 'archived'] as Filter[]).map(f => <FilterChip key={f} label={t(`products.filter.${f}`)} active={filter === f} onPress={() => setFilter(f)} />)}
        </ScrollView>
      </View>
      {error ? (
        <View style={s.content}><EmptyState icon="alert-circle-outline" title={t('products.loadErrorTitle')} body={t('products.loadErrorBody')} /></View>
      ) : all && all.length === 0 ? (
        <View style={s.content}><EmptyState icon="pricetags-outline" title={t('products.emptyTitle')} body={t('products.emptyBody')} testID="products-empty" /></View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={p => p.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          ListEmptyComponent={all ? <EmptyState icon="search-outline" title={t('products.noMatchTitle')} body={t('products.noMatchBody')} /> : null}
          initialNumToRender={20}
          windowSize={10}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  tools: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.sm, gap: spacing.sm },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, minHeight: 44, paddingHorizontal: 6 },
  actionText: { ...typography.bodySm, color: colors.primaryBlue, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardWhite, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, ...typography.body, color: colors.textDark, height: 46 },
  chips: { paddingVertical: 2 },
  content: { padding: spacing.screenPadding },
  list: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.cardTitle, color: colors.textDark },
  meta: { ...typography.bodySm, color: colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  badge: { ...typography.bodySm, fontSize: 11, color: colors.textMuted, backgroundColor: colors.inputMuted, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  badgeWait: { color: colors.primaryBlue, backgroundColor: colors.softBlue },
  badgeWarn: { color: colors.warningOrange, backgroundColor: '#FBEFE3' },
  price: { ...typography.moneySmall, color: colors.textDark },
});
