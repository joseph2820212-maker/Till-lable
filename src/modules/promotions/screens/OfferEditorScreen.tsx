import React, { useEffect, useMemo, useState, useRef } from 'react';
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
import { ToggleSegment } from '../../../components/ToggleSegment';
import { DatePickerField } from '../../../components/DatePickerField';
import { AppAlert } from '../../../components/AppAlert';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { useTier } from '../../billing/useTier';
import { canUseFeature, type ProFeature } from '../../billing/limits';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { tabTarget } from '../../../navigation/tabs';
import type { Product, Promotion, PromotionType } from '../../../domain/types';
import { parseTypedPrice, priceToInput } from '../../../domain/typedPrice';
import { formatMoney } from '../../../domain/formatMoney';
import { formatPercentText } from '../../labels/engine/labelStrings';
import { listProducts } from '../../products/storage/productStore';
import { endPromotion, listPromotions, savePromotion, validatePromotion } from '../storage/promotionStore';
import { promotionContent } from '../../labels/content';
import { enqueueSnapshot, removePromotionLabels } from '../../queue/storage/queueStore';
import { useLabelContext } from '../../labels/hooks/useLabelContext';
import { ProductPicker } from '../components/ProductPicker';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'OfferEditor'>;
type Kind = PromotionType['kind'];
const KINDS: Kind[] = ['wasNow', 'percentOff', 'moneyOff', 'multibuy', 'conditional'];
const FEATURE: Record<Kind, ProFeature> = { wasNow: 'wasNow', percentOff: 'percentOff', moneyOff: 'moneyOff', multibuy: 'multibuy', conditional: 'wasNow' };

/**
 * An offer (Pro): was/now, % off, money off, multibuy or member price, on one or more products, with optional dates.
 * The product's normal price is never changed. Offer labels go to To print, where any ticket or card format can be
 * chosen; each prints only where it fits at its fixed size.
 */
export const OfferEditorScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const tier = useTier();
  const { language } = useLabelContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [id, setId] = useState<string | undefined>(params?.promotionId);
  const [name, setName] = useState('');
  const [productIds, setProductIds] = useState<string[]>(params?.productId ? [params.productId] : []);
  const [kind, setKind] = useState<Kind>('percentOff');
  const [value, setValue] = useState('');
  const [qty, setQty] = useState('3');
  const [condition, setCondition] = useState('');
  const [conditions, setConditions] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<Promotion['status']>('active');
  const [picker, setPicker] = useState(false);
  const [limit, setLimit] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    listProducts().then(setProducts).catch(() => undefined);
    if (!params?.promotionId) return;
    listPromotions().then(all => {
      const p = all.find(x => x.id === params.promotionId);
      if (!p) return;
      setId(p.id); setName(p.name); setProductIds(p.productIds); setKind(p.type.kind); setConditions(p.conditions ?? ''); setStartDate(p.startDate ?? ''); setEndDate(p.endDate ?? ''); setStatus(p.status);
      const tt = p.type;
      if (tt.kind === 'percentOff') setValue(String(tt.percentHundredths / 100));
      if (tt.kind === 'moneyOff') setValue(priceToInput(tt.amount));
      if (tt.kind === 'wasNow') setValue(priceToInput(tt.referencePrice));
      if (tt.kind === 'multibuy') { setQty(String(tt.quantity)); setValue(priceToInput(tt.totalPrice)); }
      if (tt.kind === 'conditional') { setCondition(tt.condition); setValue(priceToInput(tt.conditionalPrice)); }
    }).catch(() => undefined);
  }, [params?.promotionId]);

  const chosen = products.filter(p => productIds.includes(p.id));
  const currency = chosen[0]?.price.currency ?? '';
  const mixedCurrency = chosen.some(p => p.price.currency !== currency);

  const type: PromotionType | null = useMemo(() => {
    if (!currency) return null;
    if (kind === 'percentOff') { const n = Number(value.replace(',', '.')); return Number.isFinite(n) ? { kind, percentHundredths: Math.round(n * 100) } : null; }
    const m = parseTypedPrice(value, currency);
    if (!m.ok) return null;
    if (kind === 'moneyOff') return { kind, amount: m.money };
    if (kind === 'wasNow') return { kind, referencePrice: m.money };
    if (kind === 'multibuy') return { kind, quantity: Number(qty), totalPrice: m.money };
    return { kind: 'conditional', condition, conditionalPrice: m.money };
  }, [kind, value, qty, condition, currency]);

  const draft = type ? { name: name.trim() || (chosen[0] ? t('offers.defaultName', { product: chosen[0].labelName || chosen[0].name }) : ''), productIds, type, conditions, startDate: startDate || undefined, endDate: endDate || undefined } : null;
  const error = !chosen.length ? 'noProducts' : mixedCurrency ? 'mixedCurrency' : !draft ? 'badAmount' : validatePromotion(draft, currency);
  const previews = draft && !error ? chosen.map(p => ({ p, r: promotionContent({ ...draft, schemaVersion: 1, id: 'x', status: 'active', createdAt: '', updatedAt: '' }, p, { language }) })) : [];

  const fm = (m: { minor: number; currency: string }) => formatMoney(m.minor, m.currency, language);
  /** What the label claims, e.g. "Was £5.99 → £4.49" or "3 for £5.00" (never just the unchanged price). */
  const previewText = (c: import('../../labels/engine/renderLabel').LabelContent) =>
    c.kind === 'wasNow' && c.was ? t('offers.previewWasNow', { was: fm(c.was), now: fm(c.price) })
      : c.kind === 'multibuy' && c.multibuy ? t('offers.previewMultibuy', { quantity: c.multibuy.quantity, total: fm(c.multibuy.total), each: fm(c.price) })
        : t('offers.previewNow', { price: fm(c.price) });

  const save = async (andQueue: boolean) => {
    if (!canUseFeature(tier, FEATURE[kind])) { setLimit(true); return; }
    if (inFlight.current) return;
    if (error || !draft) { AppAlert.error(t(`offers.errors.${error ?? 'badAmount'}`)); return; }
    inFlight.current = true;
    setBusy(true);
    try {
      const promo = await savePromotion({ ...draft, id, status });
      setId(promo.id);
      if (andQueue) {
        // Re-queuing an edited offer replaces its earlier labels instead of adding a second set.
        await removePromotionLabels(promo.id);
        let added = 0;
        for (const { p, r } of previews) {
          if (!r.ok) continue;
          await enqueueSnapshot(r.content, { purpose: 'promotion', copies: 1, title: `${p.labelName || p.name} · ${promo.name}`, productId: p.id, promotionId: promo.id });
          added++;
        }
        AppAlert.alert(t('offers.queuedTitle'), t('offers.queuedBody', { count: added }), [
          { text: t('common.ok'), style: 'cancel', onPress: () => nav.goBack() },
          { text: t('quick.goToPrint'), onPress: () => nav.navigate('Tabs', tabTarget('ToPrint')) },
        ]);
      } else { AppAlert.success(t('offers.saved')); nav.goBack(); }
    } catch { AppAlert.error(t('offers.errors.saveFailed')); } finally { setBusy(false); inFlight.current = false; }
  };
  const end = async () => { if (!id) return; await endPromotion(id); await removePromotionLabels(id); nav.goBack(); };

  const valueLabel = kind === 'percentOff' ? t('offers.percent') : kind === 'moneyOff' ? t('offers.amountOff') : kind === 'wasNow' ? t('offers.wasPrice') : kind === 'multibuy' ? t('offers.multibuyTotal') : t('offers.memberPrice');
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={id ? t('offers.editTitle') : t('offers.newTitle')} subtitle={tier === 'pro' ? t('offers.subtitle') : t('offers.proSubtitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>{t('offers.type')}</Text>
        <ToggleSegment options={KINDS.map(k => t(`offers.kind.${k}`))} selected={t(`offers.kind.${kind}`)} onSelect={v => { setKind(KINDS.find(k => t(`offers.kind.${k}`) === v) ?? 'percentOff'); setValue(''); }} />
        <TouchableOpacity style={s.card} onPress={() => setPicker(true)} accessibilityRole="button">
          <Text style={s.label}>{t('offers.products', { count: chosen.length })}</Text>
          <Text style={s.value} numberOfLines={3}>{chosen.length ? chosen.map(p => p.labelName || p.name).join(', ') : t('offers.chooseProducts')}</Text>
        </TouchableOpacity>
        <View style={s.card}>
          <Text style={s.label}>{valueLabel}</Text>
          <AppTextInput style={s.input} value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder={kind === 'percentOff' ? '25' : '0.00'} placeholderTextColor={colors.textFaint} testID="offer-value" />
          {kind === 'multibuy' ? (<><Text style={s.label}>{t('offers.quantity')}</Text><AppTextInput style={s.input} value={qty} onChangeText={setQty} keyboardType="number-pad" /></>) : null}
          {kind === 'conditional' ? (<><Text style={s.label}>{t('offers.condition')}</Text><AppTextInput style={s.input} value={condition} onChangeText={setCondition} placeholder={t('offers.conditionPh')} placeholderTextColor={colors.textFaint} /></>) : null}
          {kind === 'percentOff' && type?.kind === 'percentOff' && type.percentHundredths > 0 && type.percentHundredths < 10000 ? <Text style={s.note}>{t('offers.prints', { text: formatPercentText(type.percentHundredths, language) })}</Text> : null}
        </View>
        <View style={s.card}>
          <Text style={s.label}>{t('offers.name')}</Text>
          <AppTextInput style={s.input} value={name} onChangeText={setName} placeholder={draft?.name || t('offers.namePh')} placeholderTextColor={colors.textFaint} />
          {kind !== 'conditional' ? (<><Text style={s.label}>{t('offers.conditions')}</Text><AppTextInput style={s.input} value={conditions} onChangeText={setConditions} placeholder={t('offers.conditionsPh')} placeholderTextColor={colors.textFaint} /></>) : null}
        </View>
        <DatePickerField label={t('offers.start')} value={startDate} onChange={setStartDate} placeholder={t('offers.noDate')} />
        <DatePickerField label={t('offers.end')} value={endDate} onChange={setEndDate} placeholder={t('offers.noDate')} />
        <Text style={s.note}>{t('offers.datesNote')}</Text>

        {previews.length ? (
          <View style={s.card}>
            <Text style={s.label}>{t('offers.preview')}</Text>
            {previews.map(({ p, r }) => (
              <View key={p.id} style={s.previewRow}>
                <Text style={s.previewName} numberOfLines={1}>{p.labelName || p.name}</Text>
                <Text style={r.ok ? s.previewPrice : s.err}>{r.ok ? previewText(r.content) : t(`offers.problem.${r.problem}`)}</Text>
              </View>
            ))}
            <Text style={s.note}>{t('offers.normalKept')}</Text>
          </View>
        ) : error ? <Text style={s.err}>{t(`offers.errors.${error}`)}</Text> : null}

        <AppButton label={t('offers.saveAndQueue')} onPress={() => save(true)} loading={busy} disabled={busy} />
        <AppButton label={t('offers.saveOnly')} onPress={() => save(false)} variant="secondary" disabled={busy} />
        {id && status === 'active' ? <AppButton label={t('offers.end')} onPress={end} variant="dangerLink" /> : null}
      </AppKeyboardScrollView>
      <ProductPicker visible={picker} selected={productIds} onClose={() => setPicker(false)} onChange={setProductIds} />
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
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  previewName: { ...typography.body, color: colors.textDark, flex: 1 },
  previewPrice: { ...typography.body, color: colors.textDark, fontWeight: '700' },
});
