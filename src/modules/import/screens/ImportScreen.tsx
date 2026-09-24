import React, { useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppButton } from '../../../components/AppButton';
import { AppSwitch } from '../../../components/AppSwitch';
import { ToggleSegment } from '../../../components/ToggleSegment';
import { DropdownField } from '../../../components/DropdownField';
import { AppAlert } from '../../../components/AppAlert';
import { EmptyState } from '../../../components/EmptyState';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { tabTarget } from '../../../navigation/tabs';
import { getCurrencyCode, isCurrencySet } from '../../../utils/currency';
import { base64ToBytes, decodeText } from '../../../utils/base64';
import { detectDelimiter, parseCsv } from '../../products/utils/csvParse';
import { listProducts, countProductsForLimit } from '../../products/storage/productStore';
import { formatMoney } from '../../../domain/formatMoney';
import { moneyFromMinor, toDecimalString, type NumberProfile } from '../../../domain/money';
import type { ImportBatch, Product } from '../../../domain/types';
import { useTier } from '../../billing/useTier';
import { checkLimit, FREE_LIMITS } from '../../billing/limits';
import { useLabelContext } from '../../labels/hooks/useLabelContext';
import { readXlsx, XlsxReadError, type XlsxBook } from '../xlsx';
import { parsePriceChangeFile } from '../priceChangeFile';
import {
  commitImport, countByStatus, fileSha256, findPreviousImport, guessMapping, ImportCommitError, MAPPABLE_FIELDS, planImport,
  suggestNumberProfile, type MappedField, type PlannedRow, type RowStatus,
} from '../importPlan';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PROFILES: Record<'dot' | 'comma', NumberProfile> = { dot: { decimal: '.', grouping: ',' }, comma: { decimal: ',', grouping: '.' } };
const STATUSES: RowStatus[] = ['new', 'changed', 'unchanged', 'conflict', 'invalid'];

interface Loaded { name: string; source: ImportBatch['source']; sha: string; rows: string[][]; numeric?: Set<string>; book?: XlsxBook; fixed?: boolean; previous: ImportBatch | null; encoding?: string }

/**
 * Import products from CSV, Excel (XLSX) or a TillCalc price-change file. Nothing is written until the preview has
 * been shown and "Import" is tapped; the commit re-checks everything and writes all rows or none.
 */
export const ImportScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const tier = useTier();
  const { ctx, language } = useLabelContext();
  const currency = isCurrencySet() ? getCurrencyCode() : '';
  const [file, setFile] = useState<Loaded | null>(null);
  const [sheet, setSheet] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<MappedField[]>([]);
  const [profileKey, setProfileKey] = useState<'dot' | 'comma'>('dot');
  const [profileConfirmed, setProfileConfirmed] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [queueOnImport, setQueueOnImport] = useState(true);
  const [step, setStep] = useState<'pick' | 'map' | 'preview'>('pick');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [filter, setFilter] = useState<RowStatus>('new');

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/json', 'application/octet-stream', '*/*'] });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setBusy(true);
    try {
      const info = await FileSystem.getInfoAsync(asset.uri);
      const size = (info as { size?: number }).size ?? asset.size ?? 0;
      if (size > MAX_FILE_BYTES) { AppAlert.error(t('importer.errors.tooLarge')); return; }
      const bytes = base64ToBytes(await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
      const sha = fileSha256(bytes);
      const previous = await findPreviousImport(sha);
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
      setProducts(await listProducts({ includeArchived: true }));
      if (isZip) {
        const book = readXlsx(bytes);
        const sheet = book.sheet(0);
        setFile({ name: asset.name, source: 'xlsx', sha, rows: sheet.rows, numeric: sheet.numericCells, book, previous });
        startMapping(sheet.rows);
        return;
      }
      const { text, encoding } = decodeText(bytes);
      if (/^\s*\{/.test(text)) {
        const r = parsePriceChangeFile(text);
        if (!r.ok) { AppAlert.error(t(`importer.priceChange.${r.error}`)); return; }
        if (!currency || r.file.currency !== currency) { AppAlert.error(t('importer.errors.currencyMismatch', { file: r.file.currency, shop: currency || '—' })); return; }
        const rows = [['name', 'secondLine', 'price', 'barcode', 'sku'], ...r.file.items.map(i => [i.name, i.size ?? '', String(i.priceMinor), i.barcode ?? '', i.sku ?? ''])];
        // TillCalc prices are exact minor units: map them as whole numbers in a 0-decimal view.
        setFile({ name: asset.name, source: 'tillcalc', sha, rows: rows.map((r2, i) => (i === 0 ? r2 : [r2[0], r2[1], minorToDecimal(Number(r2[2]), currency), r2[3], r2[4]])), fixed: true, previous });
        setMapping(['name', 'secondLine', 'price', 'barcode', 'sku']); setHasHeader(true); setProfileKey('dot'); setProfileConfirmed(true); setStep('preview');
        return;
      }
      const rows = parseCsv(text, detectDelimiter(text));
      if (!rows.length) { AppAlert.error(t('importer.errors.empty')); return; }
      setFile({ name: asset.name, source: 'csv', sha, rows, previous, encoding });
      startMapping(rows);
    } catch (e) {
      AppAlert.error(e instanceof XlsxReadError ? t(`importer.errors.xlsx.${e.code}`) : t('importer.errors.read'));
    } finally { setBusy(false); }
  };

  const startMapping = (rows: string[][]) => {
    const m = guessMapping(rows[0] ?? []);
    setMapping(m);
    setHasHeader(m.some(f => f !== 'ignore'));
    const priceCol = m.indexOf('price');
    const suggestion = suggestNumberProfile(priceCol >= 0 ? rows.slice(1).map(r => r[priceCol] ?? '') : []);
    setProfileKey(suggestion.profile.decimal === ',' ? 'comma' : 'dot');
    setProfileConfirmed(false);
    setStep('map');
  };

  const rows = file?.rows ?? [];
  const settings = { mapping, hasHeader, profile: PROFILES[profileKey], currency, numericCells: file?.numeric };
  const plan: PlannedRow[] = useMemo(() => (file && step === 'preview' && currency ? planImport(rows, settings, products) : []), [file, step, rows, mapping, hasHeader, profileKey, currency, products]);
  const counts = countByStatus(plan);
  const priceCol = mapping.indexOf('price');
  const ambiguous = priceCol >= 0 ? suggestNumberProfile(rows.slice(hasHeader ? 1 : 0).map(r => r[priceCol] ?? '')).ambiguous : 0;
  const canPreview = mapping.includes('name') && mapping.includes('price') && profileConfirmed && !!currency;

  const commit = async () => {
    if (!file || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const used = await countProductsForLimit();
      const allowance = checkLimit(tier, 'products', used).remaining;
      const r = await commitImport({ rows, settings, expected: counts, ctx, queueOnImport, source: file.source, fileName: file.name, fileSha256: file.sha, newProductAllowance: allowance });
      AppAlert.alert(t('importer.doneTitle'), t('importer.doneBody', { created: r.created, updated: r.updated, queued: r.queued }), [
        { text: t('common.ok'), onPress: () => nav.goBack() },
        ...(r.queued ? [{ text: t('quick.goToPrint'), onPress: () => nav.navigate('Tabs', tabTarget('ToPrint')) }] : []),
      ]);
    } catch (e) {
      if (e instanceof ImportCommitError) AppAlert.error(t(`importer.errors.${e.code}`, { count: e.detail ?? 0, limit: FREE_LIMITS.products }));
      else AppAlert.error(t('importer.errors.commit'));
    } finally { setBusy(false); inFlight.current = false; }
  };

  const header = <ScreenHeader title={t('importer.title')} subtitle={file?.name ?? t('importer.subtitle')} onBack={() => (step === 'preview' && !file?.fixed ? setStep('map') : step === 'map' ? setStep('pick') : nav.goBack())} />;

  if (step === 'pick' || !file) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
        {header}
        <ScrollView contentContainerStyle={s.content}>
          {!currency ? <TouchableOpacity style={s.warn} onPress={() => nav.navigate('SettingsCurrency')}><Text style={s.warnText}>{t('productEdit.chooseCurrencyFirst')}</Text></TouchableOpacity> : null}
          <View style={s.card}>
            <Ionicons name="document-attach-outline" size={28} color={colors.primaryBlue} />
            <Text style={s.cardTitle}>{t('importer.pickTitle')}</Text>
            <Text style={s.body}>{t('importer.pickBody')}</Text>
            <Text style={s.body}>{t('importer.tillcalcBody')}</Text>
            <AppButton label={t('importer.pick')} onPress={pick} loading={busy} disabled={busy || !currency} />
          </View>
          <Text style={s.note}>{t('importer.safetyNote')}</Text>
        </ScrollView>
      </View>
    );
  }

  if (step === 'map') {
    const headers = hasHeader ? rows[0] ?? [] : (rows[0] ?? []).map((_, i) => t('importer.column', { n: i + 1 }));
    const sample = rows[hasHeader ? 1 : 0] ?? [];
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
        {header}
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {file.previous ? <View style={s.warn}><Text style={s.warnText}>{t('importer.alreadyImported')}</Text></View> : null}
          {file.encoding === 'windows-1252' ? <Text style={s.note}>{t('importer.encodingNote')}</Text> : null}
          {file.book && file.book.sheetNames.length > 1 ? (
            <DropdownField label={t('importer.sheet')} value={file.book.sheetNames[sheet]} options={file.book.sheetNames} onSelect={v => { const i = file.book!.sheetNames.indexOf(v); setSheet(i); const sh = file.book!.sheet(i); setFile({ ...file, rows: sh.rows, numeric: sh.numericCells }); startMapping(sh.rows); }} />
          ) : null}
          <View style={s.rowField}><Text style={s.rowLabel}>{t('importer.firstRowHeaders')}</Text><AppSwitch value={hasHeader} onValueChange={setHasHeader} /></View>
          <Text style={s.section}>{t('importer.mapTitle')}</Text>
          {headers.map((h, i) => (
            <View key={i} style={s.mapRow}>
              <Text style={s.mapHeader} numberOfLines={1}>{h || t('importer.column', { n: i + 1 })}</Text>
              <Text style={s.mapSample} numberOfLines={1}>{sample[i] ?? ''}</Text>
              <DropdownField value={mapping[i] ?? 'ignore'} options={MAPPABLE_FIELDS} getLabel={v => t(`importer.field.${v}`)} onSelect={v => setMapping(m => { const next = [...m]; while (next.length <= i) next.push('ignore'); const f = v as MappedField; if (f !== 'ignore') for (let j = 0; j < next.length; j++) if (next[j] === f) next[j] = 'ignore'; next[i] = f; return next; })} />
            </View>
          ))}
          {!mapping.includes('name') || !mapping.includes('price') ? <Text style={s.err}>{t('importer.needNameAndPrice')}</Text> : null}
          <Text style={s.section}>{t('importer.numberFormat')}</Text>
          <ToggleSegment options={[t('importer.formatDot'), t('importer.formatComma')]} selected={profileKey === 'dot' ? t('importer.formatDot') : t('importer.formatComma')} onSelect={v => { setProfileKey(v === t('importer.formatComma') ? 'comma' : 'dot'); setProfileConfirmed(true); }} />
          {ambiguous ? <Text style={s.warnSmall}>{t('importer.ambiguous', { count: ambiguous })}</Text> : null}
          {!profileConfirmed ? (
            <AppButton label={t('importer.confirmFormat', { format: profileKey === 'dot' ? t('importer.formatDot') : t('importer.formatComma') })} onPress={() => setProfileConfirmed(true)} variant="secondary" />
          ) : <Text style={s.note}>{t('importer.formatConfirmed')}</Text>}
          <Text style={s.note}>{t('importer.currencyNote', { currency: currency || '—' })}</Text>
          <AppButton label={t('importer.preview')} onPress={() => setStep('preview')} disabled={!canPreview} />
        </ScrollView>
      </View>
    );
  }

  const shown = plan.filter(r => r.status === filter).slice(0, 200);
  const fmt = (m?: number) => (m == null ? '—' : formatMoney(m, currency, language));
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      {header}
      <ScrollView contentContainerStyle={s.content}>
        {file.previous ? <View style={s.warn}><Text style={s.warnText}>{t('importer.alreadyImported')}</Text></View> : null}
        <View style={s.counts}>
          {STATUSES.map(st => (
            <TouchableOpacity key={st} style={[s.countBox, filter === st && s.countActive]} onPress={() => setFilter(st)} accessibilityRole="button">
              <Text style={[s.countNum, filter === st && s.countNumActive]}>{counts[st]}</Text>
              <Text style={[s.countLabel, filter === st && s.countNumActive]} numberOfLines={1}>{t(`importer.status.${st}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {shown.length === 0 ? <EmptyState icon="list-outline" title={t('importer.noRows')} body={t(`importer.statusHelp.${filter}`)} /> : shown.map(r => (
          <View key={r.row} style={s.planRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.planName} numberOfLines={2}>{r.name || t('importer.rowN', { n: r.row })}</Text>
              <Text style={s.planMeta}>{r.reason ? t(`importer.reason.${r.reason}`, { row: r.row }) : t('importer.rowN', { n: r.row })}</Text>
            </View>
            <Text style={s.planPrice}>{r.status === 'changed' ? `${fmt(r.oldPriceMinor)} → ${fmt(r.priceMinor)}` : fmt(r.priceMinor)}</Text>
          </View>
        ))}
        {plan.filter(r => r.status === filter).length > 200 ? <Text style={s.note}>{t('importer.moreRows', { count: plan.filter(r => r.status === filter).length - 200 })}</Text> : null}
        <View style={s.rowField}><View style={{ flex: 1 }}><Text style={s.rowLabel}>{t('importer.queueOnImport')}</Text><Text style={s.note}>{t('importer.queueOnImportHint')}</Text></View><AppSwitch value={queueOnImport} onValueChange={setQueueOnImport} /></View>
        <AppButton label={t('importer.importN', { count: counts.new + counts.changed })} onPress={commit} loading={busy} disabled={busy || counts.new + counts.changed === 0} />
        <Text style={s.note}>{t('importer.skipNote')}</Text>
      </ScrollView>
    </View>
  );
};

/** TillCalc sends exact minor units; show them as a "."-decimal string for the shared import path. */
const minorToDecimal = (minor: number, currency: string): string => toDecimalString(moneyFromMinor(minor, currency));

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10, alignItems: 'stretch' },
  cardTitle: { ...typography.cardTitle, color: colors.textDark },
  body: { ...typography.bodySm, color: colors.textMuted, lineHeight: 19 },
  note: { ...typography.bodySm, color: colors.textMuted },
  section: { ...typography.sectionLabel, color: colors.textMuted, marginTop: spacing.sm },
  warn: { backgroundColor: '#FBEFE3', borderRadius: 12, padding: 12 },
  warnText: { ...typography.bodySm, color: '#8A4B12' },
  warnSmall: { ...typography.bodySm, color: colors.warningOrange },
  err: { ...typography.bodySm, color: colors.dangerRed },
  rowField: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  rowLabel: { ...typography.body, color: colors.textDark, fontWeight: '600', flex: 1 },
  mapRow: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  mapHeader: { ...typography.cardTitle, color: colors.textDark },
  mapSample: { ...typography.bodySm, color: colors.textFaint },
  counts: { flexDirection: 'row', gap: 6 },
  countBox: { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, alignItems: 'center' },
  countActive: { backgroundColor: colors.primaryBlue, borderColor: colors.primaryBlue },
  countNum: { ...typography.cardTitle, color: colors.textDark, fontVariant: ['tabular-nums'] },
  countNumActive: { color: '#fff' },
  countLabel: { ...typography.bodySm, fontSize: 10, color: colors.textMuted },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10 },
  planName: { ...typography.body, color: colors.textDark, fontWeight: '600' },
  planMeta: { ...typography.bodySm, color: colors.textMuted },
  planPrice: { ...typography.bodySm, color: colors.textDark, fontWeight: '700' },
});
