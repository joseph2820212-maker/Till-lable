import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppTextInput } from '../../../components/AppTextInput';
import { AppAlert } from '../../../components/AppAlert';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { useTier } from '../../billing/useTier';
import { canUseFeature } from '../../billing/limits';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { tabTarget } from '../../../navigation/tabs';
import type { Product } from '../../../domain/types';
import { parseTypedPrice, priceToInput } from '../../../domain/typedPrice';
import { applyPercentOff } from '../../../domain/pricing';
import { formatMoney } from '../../../domain/formatMoney';
import { LABEL_NAME_MAX, printableName } from '../../../domain/productLabel';
import { getCurrencyCode, isCurrencySet } from '../../../utils/currency';
import { getProduct } from '../../products/storage/productStore';
import { saveReduction } from '../storage/promotionStore';
import { enqueueSnapshot } from '../../queue/storage/queueStore';
import { reductionContent } from '../../labels/content';
import { useLabelContext } from '../../labels/hooks/useLabelContext';
import { ProductPicker } from '../components/ProductPicker';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ReducedLabel'>;

/**
 * Reduced to clear (Pro): a batch of reduced labels for short-dated or damaged stock. Stored apart from the product —
 * the product's normal price never changes (TL-20).
 */
export const ReducedLabelScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const tier = useTier();
  const { language } = useLabelContext();
  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [normal, setNormal] = useState('');
  const [reduced, setReduced] = useState('');
  const [copies, setCopies] = useState(1);
  const [reason, setReason] = useState('');
  const [picker, setPicker] = useState(false);
  const [limit, setLimit] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const choose = async (id?: string) => {
    if (!id) return;
    const p = await getProduct(id);
    if (!p) return;
    setProduct(p); setName(printableName(p) ?? ''); setNormal(priceToInput(p.price));
  };
  useEffect(() => { choose(params?.productId).catch(() => undefined); }, [params?.productId]);

  const currency = product?.price.currency ?? (isCurrencySet() ? getCurrencyCode() : '');
  const n = currency ? parseTypedPrice(normal, currency) : null;
  const r = currency ? parseTypedPrice(reduced, currency) : null;
  const valid = !!name.trim() && [...name.trim()].length <= LABEL_NAME_MAX && n?.ok && r?.ok && r.money.minor < n.money.minor;

  const quick = (pct: number) => { if (n?.ok) setReduced(priceToInput(applyPercentOff(n.money, pct * 100))); };
  const add = async () => {
    if (!canUseFeature(tier, 'reducedToClear')) { setLimit(true); return; }
    if (!valid || !n?.ok || !r?.ok || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const batch = await saveReduction({ productId: product?.id, productName: name.trim(), normalPrice: n.money, reducedPrice: r.money, copies, reason });
      await enqueueSnapshot(reductionContent(batch, { language }, product ?? undefined), { purpose: 'reduction', copies, title: name.trim(), productId: product?.id, reductionId: batch.id });
      AppAlert.alert(t('reduce.addedTitle'), t('reduce.addedBody', { count: copies }), [
        { text: t('common.ok'), style: 'cancel', onPress: () => nav.goBack() },
        { text: t('quick.goToPrint'), onPress: () => nav.navigate('Tabs', tabTarget('ToPrint')) },
      ]);
    } catch { AppAlert.error(t('reduce.failed')); } finally { setBusy(false); inFlight.current = false; }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('reduce.title')} subtitle={tier === 'pro' ? t('reduce.subtitle') : t('offers.proSubtitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={s.card} onPress={() => setPicker(true)} accessibilityRole="button">
          <Text style={s.label}>{t('reduce.product')}</Text>
          <Text style={s.value}>{product ? product.labelName || product.name : t('reduce.chooseOrType')}</Text>
        </TouchableOpacity>
        <View style={s.card}>
          <Text style={s.label}>{t('productEdit.labelName')}</Text>
          <AppTextInput style={s.input} value={name} onChangeText={v => setName([...v].slice(0, LABEL_NAME_MAX).join(''))} placeholder={t('quick.namePh')} placeholderTextColor={colors.textFaint} />
          <Text style={s.label}>{t('reduce.normalPrice')}</Text>
          <AppTextInput style={s.input} value={normal} onChangeText={setNormal} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} />
          <Text style={s.label}>{t('reduce.reducedPrice')}</Text>
          <AppTextInput style={s.input} value={reduced} onChangeText={setReduced} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} testID="reduce-price" />
          <View style={s.quick}>{[25, 50, 75].map(p => <TouchableOpacity key={p} style={s.chip} onPress={() => quick(p)} accessibilityRole="button"><Text style={s.chipText}>{t('reduce.percentOff', { percent: p })}</Text></TouchableOpacity>)}</View>
          {n?.ok && r?.ok ? <Text style={r.money.minor < n.money.minor ? s.note : s.err}>{r.money.minor < n.money.minor ? t('reduce.prints', { was: formatMoney(n.money.minor, currency, language), now: formatMoney(r.money.minor, currency, language) }) : t('reduce.mustBeLower')}</Text> : null}
        </View>
        <View style={s.rowField}>
          <Text style={s.rowLabel}>{t('quick.copies')}</Text>
          <TouchableOpacity style={s.step} onPress={() => setCopies(c => Math.max(1, c - 1))} accessibilityRole="button" accessibilityLabel={t('quick.fewer')}><Text style={s.stepText}>−</Text></TouchableOpacity>
          <Text style={s.copies}>{copies}</Text>
          <TouchableOpacity style={s.step} onPress={() => setCopies(c => Math.min(999, c + 1))} accessibilityRole="button" accessibilityLabel={t('quick.more')}><Text style={s.stepText}>+</Text></TouchableOpacity>
        </View>
        <View style={s.card}>
          <Text style={s.label}>{t('reduce.reason')}</Text>
          <AppTextInput style={s.input} value={reason} onChangeText={setReason} placeholder={t('reduce.reasonPh')} placeholderTextColor={colors.textFaint} />
        </View>
        <Text style={s.note}>{t('reduce.normalKept')}</Text>
        <AppButton label={t('quick.addToQueue', { count: copies })} onPress={add} disabled={!valid || busy} loading={busy} />
      </AppKeyboardScrollView>
      <ProductPicker visible={picker} multi={false} selected={product ? [product.id] : []} onClose={() => setPicker(false)} onChange={ids => choose(ids[0])} />
      <FreeLimitSheet reason={limit ? 'proFeature' : null} onClose={() => setLimit(false)} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  label: { ...typography.sectionLabel, color: colors.textMuted },
  value: { ...typography.body, color: colors.textDark },
  input: { ...typography.body, color: colors.textDark, borderBottomWidth: 1.5, borderBottomColor: colors.border, paddingVertical: 8, minHeight: 44 },
  note: { ...typography.bodySm, color: colors.textMuted },
  err: { ...typography.bodySm, color: colors.dangerRed },
  quick: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: 18, backgroundColor: colors.softBlue },
  chipText: { ...typography.bodySm, color: colors.primaryBlue, fontWeight: '700' },
  rowField: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  rowLabel: { ...typography.body, color: colors.textDark, fontWeight: '600', flex: 1 },
  step: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.inputMuted, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, fontWeight: '700', color: colors.primaryBlue },
  copies: { ...typography.cardTitle, minWidth: 36, textAlign: 'center', color: colors.textDark, fontVariant: ['tabular-nums'] },
});
