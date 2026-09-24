import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppTextInput } from '../../../components/AppTextInput';
import { ToggleSegment } from '../../../components/ToggleSegment';
import { AppAlert } from '../../../components/AppAlert';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { useTier } from '../../billing/useTier';
import { checkLimit } from '../../billing/limits';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { Product, SellingUnit, UnitPriceBase } from '../../../domain/types';
import { CATALOGUE_LIMITS, LABEL_NAME_MAX, labelNameCounter } from '../../../domain/productLabel';
import { parseTypedPrice, priceToInput } from '../../../domain/typedPrice';
import { unitBasesFor, unitPrice } from '../../../domain/pricing';
import { formatMoney } from '../../../domain/formatMoney';
import { getCurrencyCode, isCurrencySet } from '../../../utils/currency';
import { countProductsForLimit, duplicateDraft, getProduct, ProductValidationError, saveProduct, setArchived, type ProductDraft } from '../storage/productStore';
import { enqueueProductManually } from '../../queue/storage/queueStore';
import { takePendingScan } from '../utils/scanBus';
import type { BarcodeSymbology } from '../utils/barcode';
import { validateBarcode } from '../../labels/engine/barcode';
import { useLabelContext } from '../../labels/hooks/useLabelContext';
import { labelFit } from '../../labels/labelFit';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ProductDetail'>;
type UnitKind = SellingUnit['kind'];
const UNIT_KINDS: UnitKind[] = ['each', 'pack', 'weight', 'volume', 'length'];
const KINDS: NonNullable<Product['labelKind']>[] = ['standardPrice', 'priceUnitPrice', 'priceBarcode'];

function unitFrom(kind: UnitKind, qty: string): SellingUnit | null {
  if (kind === 'each') return { kind: 'each' };
  const n = Number(qty.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  switch (kind) {
    case 'pack': return Number.isInteger(n) ? { kind: 'pack', count: n } : null;
    case 'weight': return { kind: 'weight', grams: Math.round(n) };
    case 'volume': return { kind: 'volume', millilitres: Math.round(n) };
    case 'length': return { kind: 'length', millimetres: Math.round(n) };
  }
  return null;
}
const qtyOf = (u?: SellingUnit) => (!u || u.kind === 'each' ? '' : String(u.kind === 'pack' ? u.count : u.kind === 'weight' ? u.grams : u.kind === 'volume' ? u.millilitres : u.millimetres));

/** Add / edit a product. The full product name is kept; the printable label name has the 40-character counter. */
export const ProductDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const id = params?.id;
  const tier = useTier();
  const { language, ctx, settings } = useLabelContext();
  const [loaded, setLoaded] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [labelName, setLabelName] = useState('');
  const [secondLine, setSecondLine] = useState('');
  const [priceText, setPriceText] = useState('');
  const [unitKind, setUnitKind] = useState<UnitKind>('each');
  const [qty, setQty] = useState('');
  const [base, setBase] = useState<UnitPriceBase | undefined>();
  const [barcode, setBarcode] = useState(params?.barcode ?? '');
  const [symbology, setSymbology] = useState<BarcodeSymbology>((params?.symbology as BarcodeSymbology) ?? 'unknown');
  const [sku, setSku] = useState('');
  const [shelf, setShelf] = useState('');
  const [kind, setKind] = useState<NonNullable<Product['labelKind']>>(settings.defaultKind);
  const [busy, setBusy] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Set before the first await, so a quick double tap can never save the product twice.
  const inFlight = useRef(false);

  const currency = loaded?.price.currency ?? (isCurrencySet() ? getCurrencyCode() : '');

  useEffect(() => {
    if (!id) return;
    getProduct(id).then(p => {
      if (!p) return;
      setLoaded(p); setName(p.name); setLabelName(p.labelName ?? ''); setSecondLine(p.secondLine ?? ''); setPriceText(priceToInput(p.price));
      setUnitKind(p.sellingUnit?.kind ?? 'each'); setQty(qtyOf(p.sellingUnit)); setBase(p.unitPriceBase); setBarcode(p.barcodes?.[0]?.raw ?? '');
      setSku(p.sku ?? ''); setShelf(p.shelfLocation ?? ''); setKind(p.labelKind ?? settings.defaultKind);
    }).catch(() => undefined);
  }, [id, settings.defaultKind]);

  useFocusEffect(useCallback(() => {
    const scan = takePendingScan('product');
    if (scan) { setBarcode(scan.code); setSymbology(scan.symbology as BarcodeSymbology); }
  }, []));

  const counter = labelNameCounter(labelName.trim());
  const fullCounter = labelNameCounter(name.trim());
  const needsLabelName = !labelName.trim() && fullCounter.used > LABEL_NAME_MAX;
  const printedName = labelName.trim() || (fullCounter.over ? '' : name.trim());
  const fit = useMemo(() => labelFit(settings.defaultProfileId, { name: printedName, secondLine: secondLine.trim() }), [settings.defaultProfileId, printedName, secondLine]);
  const bases = unitBasesFor(unitFrom(unitKind, qty) ?? { kind: 'each' });
  const parsedPrice = currency ? parseTypedPrice(priceText, currency) : null;
  const unitPreview = parsedPrice?.ok && base ? unitPrice(parsedPrice.money, unitFrom(unitKind, qty) ?? { kind: 'each' }, base, settings.unitPriceExtraDecimals) : null;
  const barcodeProblem = barcode.trim() && /^\d+$/.test(barcode.trim()) && [8, 12, 13].includes(barcode.trim().length)
    ? validateBarcode(barcode.trim().length === 12 ? `0${barcode.trim()}` : barcode.trim(), barcode.trim().length === 8 ? 'ean8' : 'ean13')
    : null;

  const buildDraft = (): ProductDraft | null => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t('productEdit.errors.nameRequired');
    if (counter.over) e.labelName = t('productEdit.errors.labelNameTooLong', { max: LABEL_NAME_MAX });
    if (!currency) e.price = t('productEdit.errors.noCurrency');
    else if (!parsedPrice?.ok) e.price = t(`productEdit.errors.price.${parsedPrice && !parsedPrice.ok ? parsedPrice.error : 'invalid'}`);
    const unit = unitFrom(unitKind, qty);
    if (!unit) e.qty = t('productEdit.errors.qty');
    if (barcodeProblem) e.barcode = t('productEdit.errors.barcode');
    if (kind === 'priceBarcode' && !barcode.trim()) e.barcode = t('productEdit.errors.barcodeNeeded');
    if (kind === 'priceUnitPrice' && !base) e.base = t('productEdit.errors.baseNeeded');
    setErrors(e);
    if (Object.keys(e).length || !parsedPrice?.ok || !unit) return null;
    return {
      name, labelName, secondLine, price: parsedPrice.money, sellingUnit: unit, unitPriceBase: base && unitBasesFor(unit).includes(base) ? base : undefined,
      // The first barcode is edited here; any others (e.g. from an import) are kept as they are.
      barcodes: [...(barcode.trim() ? [{ raw: barcode.trim(), symbology }] : []), ...(loaded?.barcodes ?? []).slice(1).map(b => ({ raw: b.raw }))],
      sku, labelKind: kind, shelfLocation: shelf,
    };
  };

  const save = async () => {
    const draft = buildDraft();
    if (!draft || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (!id && !checkLimit(tier, 'products', await countProductsForLimit()).allowed) { setLimitOpen(true); return; }
      const r = await saveProduct(draft, { ...ctx, id });
      AppAlert.success(r.queued ? t('productEdit.savedQueued') : t('productEdit.saved'));
      nav.goBack();
    } catch (err) {
      if (err instanceof ProductValidationError) AppAlert.error(t(`productEdit.errors.store.${err.code}`));
      else AppAlert.error(t('productEdit.errors.saveFailed'));
    } finally { setBusy(false); inFlight.current = false; }
  };

  const duplicate = async () => {
    if (!loaded || inFlight.current) return;
    inFlight.current = true;
    try {
      if (!checkLimit(tier, 'products', await countProductsForLimit()).allowed) { setLimitOpen(true); return; }
      const r = await saveProduct(duplicateDraft(loaded, t('productEdit.copyName', { name: loaded.name }).slice(0, CATALOGUE_LIMITS.productName)), ctx);
      nav.replace('ProductDetail', { id: r.product.id });
    } catch { AppAlert.error(t('productEdit.errors.saveFailed')); } finally { inFlight.current = false; }
  };
  const toggleArchive = async () => {
    if (!loaded) return;
    await setArchived(loaded.id, loaded.status !== 'archived');
    nav.goBack();
  };
  const addToQueue = async () => {
    if (!loaded) return;
    await enqueueProductManually(loaded, ctx);
    AppAlert.success(t('productEdit.addedToQueue'));
  };

  const input = (value: string, onChange: (v: string) => void, opts: { placeholder?: string; keyboard?: 'default' | 'decimal-pad' | 'number-pad'; maxLength?: number; testID?: string; multiline?: boolean } = {}) => (
    <AppTextInput style={s.input} value={value} onChangeText={onChange} placeholder={opts.placeholder} placeholderTextColor={colors.textFaint} keyboardType={opts.keyboard ?? 'default'} maxLength={opts.maxLength} testID={opts.testID} multiline={opts.multiline} />
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={id ? t('productEdit.editTitle') : t('productEdit.addTitle')} subtitle={t('productEdit.subtitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView style={s.body} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {!currency ? (
          <TouchableOpacity style={s.warn} onPress={() => nav.navigate('SettingsCurrency')} accessibilityRole="button">
            <Text style={s.warnText}>{t('productEdit.chooseCurrencyFirst')}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={s.field}>
          <View style={s.fieldHead}><Text style={s.label}>{t('productEdit.productName')}</Text><Text style={s.meta}>{t('productEdit.keptInFull')}</Text></View>
          {input(name, setName, { placeholder: t('productEdit.productNamePh'), maxLength: CATALOGUE_LIMITS.productName, testID: 'pe-name', multiline: true })}
          {errors.name ? <Text style={s.err}>{errors.name}</Text> : null}
        </View>

        <View style={s.field}>
          <View style={s.fieldHead}>
            <Text style={s.label}>{t('productEdit.labelName')}</Text>
            <Text style={[s.counter, counter.used > LABEL_NAME_MAX - 5 && s.counterWarn, counter.over && s.counterOver]} testID="pe-counter">{t('productEdit.counter', { used: counter.used, max: LABEL_NAME_MAX })}</Text>
          </View>
          {input(labelName, v => setLabelName([...v].slice(0, LABEL_NAME_MAX).join('')), { placeholder: needsLabelName ? t('productEdit.labelNameRequiredPh') : t('productEdit.labelNamePh'), testID: 'pe-label-name' })}
          <Text style={[s.hint, needsLabelName && s.hintWarn]}>{needsLabelName ? t('productEdit.labelNameNeeded', { max: LABEL_NAME_MAX }) : t('productEdit.labelNameHint')}</Text>
          {printedName && !fit.name ? <Text style={s.hintWarn}>{t('productEdit.nameTooWide')}</Text> : null}
          {errors.labelName ? <Text style={s.err}>{errors.labelName}</Text> : null}
        </View>

        <View style={s.field}>
          <View style={s.fieldHead}><Text style={s.label}>{t('productEdit.secondLine')}</Text>{secondLine.trim() ? <Text style={[s.meta, !fit.secondLine && s.hintWarn]}>{fit.secondLine ? t('productEdit.fitsTickets') : t('productEdit.tooWideTickets')}</Text> : null}</View>
          {input(secondLine, setSecondLine, { placeholder: t('productEdit.secondLinePh'), maxLength: CATALOGUE_LIMITS.secondLine })}
        </View>

        <View style={s.field}>
          <View style={s.fieldHead}><Text style={s.label}>{t('productEdit.price')}</Text><Text style={s.meta}>{currency || '—'}</Text></View>
          {input(priceText, setPriceText, { placeholder: '0.00', keyboard: 'decimal-pad', testID: 'pe-price' })}
          {parsedPrice?.ok ? <Text style={s.hint}>{t('productEdit.printsAs', { price: formatMoney(parsedPrice.money.minor, currency, language) })}</Text> : null}
          {errors.price ? <Text style={s.err}>{errors.price}</Text> : null}
        </View>

        <Text style={s.label}>{t('productEdit.soldAs')}</Text>
        <ToggleSegment options={UNIT_KINDS.map(k => t(`productEdit.unit.${k}`))} selected={t(`productEdit.unit.${unitKind}`)} onSelect={v => { const k = UNIT_KINDS.find(x => t(`productEdit.unit.${x}`) === v) ?? 'each'; setUnitKind(k); setBase(undefined); }} />
        {unitKind !== 'each' ? (
          <View style={s.field}>
            <View style={s.fieldHead}><Text style={s.label}>{t(`productEdit.qty.${unitKind}`)}</Text></View>
            {input(qty, setQty, { keyboard: 'number-pad', placeholder: unitKind === 'pack' ? '6' : '500' })}
            {errors.qty ? <Text style={s.err}>{errors.qty}</Text> : null}
          </View>
        ) : null}
        {bases.length ? (
          <>
            <Text style={s.label}>{t('productEdit.unitPriceBase')}</Text>
            <ToggleSegment options={[t('productEdit.noUnitPrice'), ...bases.map(b => t(`productEdit.base.${b}`))]} selected={base ? t(`productEdit.base.${base}`) : t('productEdit.noUnitPrice')} onSelect={v => setBase(bases.find(b => t(`productEdit.base.${b}`) === v))} />
            {unitPreview ? <Text style={s.hint}>{t('productEdit.unitPricePreview', { price: formatMoney(unitPreview.minor, currency, language, settings.unitPriceExtraDecimals) })}</Text> : null}
          </>
        ) : null}
        {errors.base ? <Text style={s.err}>{bases.length ? errors.base : t('productEdit.errors.unitNeedsSoldAs')}</Text> : null}

        <View style={s.field}>
          <View style={s.fieldHead}><Text style={s.label}>{t('productEdit.barcode')}</Text><Text style={s.meta}>{barcode.trim() ? (barcodeProblem ? t('productEdit.barcodeCheckFails') : t('productEdit.barcodeOk')) : ''}</Text></View>
          <View style={s.inline}>
            <View style={{ flex: 1 }}>{input(barcode, v => { setBarcode(v); setSymbology('unknown'); }, { keyboard: 'number-pad', placeholder: t('productEdit.barcodePh'), testID: 'pe-barcode' })}</View>
            <TouchableOpacity style={s.scanBtn} onPress={() => nav.navigate('Scan', { mode: 'attach' })} accessibilityRole="button" accessibilityLabel={t('productEdit.scanBarcode')}>
              <Ionicons name="barcode-outline" size={22} color={colors.primaryBlue} />
            </TouchableOpacity>
          </View>
          {errors.barcode ? <Text style={s.err}>{errors.barcode}</Text> : null}
        </View>

        <View style={s.field}>
          <View style={s.fieldHead}><Text style={s.label}>{t('productEdit.sku')}</Text><Text style={s.meta}>{t('productEdit.skuHint')}</Text></View>
          {input(sku, setSku, { maxLength: CATALOGUE_LIMITS.sku })}
        </View>
        <View style={s.field}>
          <View style={s.fieldHead}><Text style={s.label}>{t('productEdit.shelf')}</Text></View>
          {input(shelf, setShelf, { placeholder: t('productEdit.shelfPh') })}
        </View>

        <Text style={s.label}>{t('productEdit.labelType')}</Text>
        <ToggleSegment options={KINDS.map(k => t(`labelKind.${k}`))} selected={t(`labelKind.${kind}`)} onSelect={v => setKind(KINDS.find(k => t(`labelKind.${k}`) === v) ?? 'standardPrice')} />

        <AppButton label={t('common.save')} onPress={save} loading={busy} disabled={busy} style={{ marginTop: spacing.md }} />

        {loaded ? (
          <SettingsSection title={t('productEdit.moreActions')}>
            <SettingsRow iconNode={<Ionicons name="print-outline" size={18} color={colors.primaryBlue} />} label={t('productEdit.addToQueue')} onPress={addToQueue} />
            <SettingsRow iconNode={<Ionicons name="pricetag-outline" size={18} color={colors.primaryBlue} />} label={t('productEdit.createOffer')} onPress={() => nav.navigate('OfferEditor', { productId: loaded.id })} />
            <SettingsRow iconNode={<Ionicons name="trending-down-outline" size={18} color={colors.primaryBlue} />} label={t('productEdit.reduce')} onPress={() => nav.navigate('ReducedLabel', { productId: loaded.id })} />
            <SettingsRow iconNode={<Ionicons name="copy-outline" size={18} color={colors.primaryBlue} />} label={t('productEdit.duplicate')} onPress={duplicate} />
            <SettingsRow iconNode={<Ionicons name="archive-outline" size={18} color={colors.primaryBlue} />} label={loaded.status === 'archived' ? t('productEdit.restore') : t('productEdit.archive')} subtitle={t('productEdit.archiveHint')} onPress={toggleArchive} isLast />
          </SettingsSection>
        ) : null}
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
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { ...typography.sectionLabel, color: colors.textMuted },
  meta: { ...typography.bodySm, color: colors.textFaint, flexShrink: 1, textAlign: 'right' },
  counter: { ...typography.bodySm, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  counterWarn: { color: colors.warningOrange },
  counterOver: { color: colors.dangerRed },
  input: { ...typography.body, color: colors.textDark, borderBottomWidth: 1.5, borderBottomColor: colors.border, paddingVertical: 8, minHeight: 44 },
  hint: { ...typography.bodySm, color: colors.textMuted },
  hintWarn: { ...typography.bodySm, color: colors.warningOrange },
  err: { ...typography.bodySm, color: colors.dangerRed },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardWhite },
  warn: { backgroundColor: '#FBEFE3', borderRadius: 12, padding: 12 },
  warnText: { ...typography.bodySm, color: '#8A4B12' },
});
