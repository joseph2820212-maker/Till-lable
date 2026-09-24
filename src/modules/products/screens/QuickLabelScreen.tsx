import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppTextInput } from '../../../components/AppTextInput';
import { AppSwitch } from '../../../components/AppSwitch';
import { AppAlert } from '../../../components/AppAlert';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { tabTarget } from '../../../navigation/tabs';
import { LABEL_NAME_MAX, labelNameCounter } from '../../../domain/productLabel';
import { parseTypedPrice } from '../../../domain/typedPrice';
import { formatMoney } from '../../../domain/formatMoney';
import { getCurrencyCode, isCurrencySet } from '../../../utils/currency';
import { enqueueSnapshot } from '../../queue/storage/queueStore';
import { countProductsForLimit, saveProduct } from '../storage/productStore';
import { setCopies, listWaiting } from '../../queue/storage/queueStore';
import { useTier } from '../../billing/useTier';
import { checkLimit } from '../../billing/limits';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { useLabelContext } from '../../labels/hooks/useLabelContext';
import { labelFit } from '../../labels/labelFit';
import type { LabelContent } from '../../labels/engine/renderLabel';

/** Device-only draft (never in a backup): an interrupted Quick label comes back as it was. */
export const QUICK_DRAFT_KEY = 'drafts:quickLabel';
interface Draft { name: string; second: string; price: string; copies: number; save: boolean }
const EMPTY: Draft = { name: '', second: '', price: '', copies: 1, save: false };

/** A one-off label: type it, choose copies, add to To print. Optionally keep it as a product. */
export const QuickLabelScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { language, ctx, settings } = useLabelContext();
  const tier = useTier();
  const [d, setD] = useState<Draft>(EMPTY);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const loaded = useRef(false);
  const currency = isCurrencySet() ? getCurrencyCode() : '';

  useEffect(() => {
    AsyncStorage.getItem(QUICK_DRAFT_KEY).then(raw => {
      if (raw) { try { const v = JSON.parse(raw); if (v && typeof v === 'object') { setD({ ...EMPTY, ...v }); setRestored(!!(v.name || v.price)); } } catch { /* ignore */ } }
      loaded.current = true;
    }).catch(() => { loaded.current = true; });
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(QUICK_DRAFT_KEY, JSON.stringify(d)).catch(() => undefined);
  }, [d]);

  const counter = labelNameCounter(d.name.trim());
  const price = currency ? parseTypedPrice(d.price, currency) : null;
  const fit = labelFit(settings.defaultProfileId, { name: d.name.trim(), secondLine: d.second.trim() });
  const canAdd = !!d.name.trim() && !counter.over && !!price?.ok && d.copies >= 1;

  const add = async () => {
    if (!canAdd || !price?.ok || busy) return;
    setBusy(true);
    try {
      if (d.save) {
        if (!checkLimit(tier, 'products', await countProductsForLimit()).allowed) { setLimitOpen(true); return; }
        const r = await saveProduct({ name: d.name, secondLine: d.second, price: price.money }, { ...ctx, reason: 'manual' });
        const intent = (await listWaiting()).find(i => i.productId === r.product.id);
        if (intent && d.copies > 1) await setCopies(intent.id, d.copies);
      } else {
        const content: LabelContent = { kind: 'standardPrice', language, name: d.name.trim(), price: price.money };
        if (d.second.trim()) content.secondLine = d.second.trim();
        await enqueueSnapshot(content, { purpose: 'normal', copies: d.copies, title: d.name.trim() });
      }
      await AsyncStorage.removeItem(QUICK_DRAFT_KEY).catch(() => undefined);
      setD(EMPTY);
      setRestored(false);
      AppAlert.alert(t('quick.addedTitle'), t('quick.addedBody', { count: d.copies }), [
        { text: t('quick.another'), style: 'cancel' },
        { text: t('quick.goToPrint'), onPress: () => nav.navigate('Tabs', tabTarget('ToPrint')) },
      ]);
    } catch {
      AppAlert.error(t('quick.failed'));
    } finally { setBusy(false); }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('quick.title')} subtitle={t('quick.subtitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView style={s.body} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {restored ? <Text style={s.note}>{t('quick.restored')}</Text> : null}
        {!currency ? (
          <TouchableOpacity style={s.warn} onPress={() => nav.navigate('SettingsCurrency')} accessibilityRole="button"><Text style={s.warnText}>{t('productEdit.chooseCurrencyFirst')}</Text></TouchableOpacity>
        ) : null}
        <View style={s.field}>
          <View style={s.head}><Text style={s.label}>{t('productEdit.labelName')}</Text><Text style={[s.counter, counter.used > LABEL_NAME_MAX - 5 && s.counterWarn]}>{t('productEdit.counter', { used: counter.used, max: LABEL_NAME_MAX })}</Text></View>
          <AppTextInput style={s.input} value={d.name} onChangeText={v => setD(x => ({ ...x, name: [...v].slice(0, LABEL_NAME_MAX).join('') }))} placeholder={t('quick.namePh')} placeholderTextColor={colors.textFaint} testID="quick-name" />
          {d.name.trim() && !fit.name ? <Text style={s.warnSmall}>{t('productEdit.nameTooWide')}</Text> : null}
        </View>
        <View style={s.field}>
          <View style={s.head}><Text style={s.label}>{t('productEdit.secondLine')}</Text>{d.second.trim() ? <Text style={[s.meta, !fit.secondLine && s.warnSmall]}>{fit.secondLine ? t('productEdit.fitsTickets') : t('productEdit.tooWideTickets')}</Text> : null}</View>
          <AppTextInput style={s.input} value={d.second} onChangeText={v => setD(x => ({ ...x, second: v }))} placeholder={t('productEdit.secondLinePh')} placeholderTextColor={colors.textFaint} />
        </View>
        <View style={s.field}>
          <View style={s.head}><Text style={s.label}>{t('productEdit.price')}</Text><Text style={s.meta}>{currency || '—'}</Text></View>
          <AppTextInput style={s.input} value={d.price} onChangeText={v => setD(x => ({ ...x, price: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} testID="quick-price" />
          {price?.ok ? <Text style={s.meta}>{t('productEdit.printsAs', { price: formatMoney(price.money.minor, currency, language) })}</Text> : d.price && price && !price.ok ? <Text style={s.err}>{t(`productEdit.errors.price.${price.error}`)}</Text> : null}
        </View>
        <View style={s.rowField}>
          <Text style={s.rowLabel}>{t('quick.copies')}</Text>
          <View style={s.stepper}>
            <TouchableOpacity style={s.step} onPress={() => setD(x => ({ ...x, copies: Math.max(1, x.copies - 1) }))} accessibilityRole="button" accessibilityLabel={t('quick.fewer')}><Text style={s.stepText}>−</Text></TouchableOpacity>
            <Text style={s.copies} testID="quick-copies">{d.copies}</Text>
            <TouchableOpacity style={s.step} onPress={() => setD(x => ({ ...x, copies: Math.min(999, x.copies + 1) }))} accessibilityRole="button" accessibilityLabel={t('quick.more')}><Text style={s.stepText}>+</Text></TouchableOpacity>
          </View>
        </View>
        <View style={s.rowField}>
          <View style={{ flex: 1 }}><Text style={s.rowLabel}>{t('quick.saveAsProduct')}</Text><Text style={s.meta}>{t('quick.saveAsProductHint')}</Text></View>
          <AppSwitch value={d.save} onValueChange={v => setD(x => ({ ...x, save: v }))} />
        </View>
        <Text style={s.note}>{t('quick.languageNote', { language: t(`labelLanguage.${language}`) })}</Text>
        <AppButton label={t('quick.addToQueue', { count: d.copies })} onPress={add} disabled={!canAdd || busy} loading={busy} />
      </AppKeyboardScrollView>
      <FreeLimitSheet reason={limitOpen ? 'products' : null} onClose={() => setLimitOpen(false)} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  field: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { ...typography.sectionLabel, color: colors.textMuted },
  meta: { ...typography.bodySm, color: colors.textFaint },
  counter: { ...typography.bodySm, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  counterWarn: { color: colors.warningOrange },
  input: { ...typography.body, color: colors.textDark, borderBottomWidth: 1.5, borderBottomColor: colors.border, paddingVertical: 8, minHeight: 44 },
  err: { ...typography.bodySm, color: colors.dangerRed },
  warnSmall: { ...typography.bodySm, color: colors.warningOrange },
  rowField: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  rowLabel: { ...typography.body, color: colors.textDark, fontWeight: '600', flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.inputMuted, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, fontWeight: '700', color: colors.primaryBlue },
  copies: { ...typography.cardTitle, minWidth: 36, textAlign: 'center', color: colors.textDark, fontVariant: ['tabular-nums'] },
  note: { ...typography.bodySm, color: colors.textMuted },
  warn: { backgroundColor: '#FBEFE3', borderRadius: 12, padding: 12 },
  warnText: { ...typography.bodySm, color: '#8A4B12' },
});
