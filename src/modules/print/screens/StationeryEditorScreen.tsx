import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
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
import { AppAlert } from '../../../components/AppAlert';
import { LabelRow } from '../../../components/LabelRow';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { useTier } from '../../billing/useTier';
import { canUseFeature } from '../../billing/limits';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { SCHEMA_VERSIONS, type Material, type PaperSize, type StationeryProfile } from '../../../domain/types';
import { PAPER_MM, labelsPerSheet, validateStationery } from '../../labels/engine/geometry';
import { layoutCompatibility } from '../../labels/engine/labelTemplate';
import { geometryIssueText } from '../issueText';
import { deleteCustomProfile, getProfile, saveCustomProfile, StationeryInvalidError } from '../storage/stationeryStore';
import { saveLabelSettings, useLabelSettings } from '../../settings/storage/labelSettings';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'StationeryEditor'>;
const NUM_FIELDS = ['rows', 'columns', 'labelWidthMm', 'labelHeightMm', 'marginTopMm', 'marginLeftMm', 'gapXMm', 'gapYMm', 'safeInsetMm', 'pageWidthMm', 'pageHeightMm'] as const;
type NumField = (typeof NUM_FIELDS)[number];
const PAPERS: PaperSize[] = ['A4', 'Letter', 'custom'];
const MATERIALS: Material[] = ['card', 'plainPaper', 'adhesiveSheet', 'promoCard'];

const BLANK: Omit<StationeryProfile, 'id' | 'schemaVersion' | 'isPreset' | 'verification'> = {
  name: '', paper: 'A4', orientation: 'portrait', pageWidthMm: 210, pageHeightMm: 297, rows: 7, columns: 2, labelWidthMm: 70, labelHeightMm: 38,
  marginTopMm: 15.5, marginLeftMm: 35, gapXMm: 0, gapYMm: 0, safeInsetMm: 2.5, material: 'card', refeedSafe: true,
};

/** A stationery profile: presets are read-only (use, calibrate, copy); custom sheets are edited with live validation (Pro). */
export const StationeryEditorScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const tier = useTier();
  const settings = useLabelSettings();
  const [preset, setPreset] = useState<StationeryProfile | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [text, setText] = useState<Record<NumField, string>>(() => Object.fromEntries(NUM_FIELDS.map(f => [f, String(BLANK[f])])) as Record<NumField, string>);
  const [editId, setEditId] = useState<string | undefined>();
  const [limit, setLimit] = useState(false);

  useEffect(() => {
    const id = params?.profileId ?? params?.copyFrom;
    if (!id) return;
    getProfile(id).then(p => {
      if (params?.profileId && p.isPreset) { setPreset(p); return; }
      const base = { ...p, name: params?.copyFrom ? t('stationery.copyName', { name: p.name }) : p.name };
      setForm(base);
      setText(Object.fromEntries(NUM_FIELDS.map(f => [f, String(base[f])])) as Record<NumField, string>);
      setEditId(params?.copyFrom ? undefined : p.id);
    }).catch(() => undefined);
  }, [params?.profileId, params?.copyFrom, t]);

  const candidate: StationeryProfile = useMemo(() => {
    const nums = Object.fromEntries(NUM_FIELDS.map(f => [f, Number(text[f].replace(',', '.'))])) as Record<NumField, number>;
    const page = form.paper === 'custom' ? { widthMm: nums.pageWidthMm, heightMm: nums.pageHeightMm } : form.orientation === 'landscape' ? { widthMm: PAPER_MM[form.paper as 'A4'].heightMm, heightMm: PAPER_MM[form.paper as 'A4'].widthMm } : PAPER_MM[form.paper as 'A4'];
    return { ...form, ...nums, pageWidthMm: page.widthMm, pageHeightMm: page.heightMm, marginRightMm: undefined, marginBottomMm: undefined, schemaVersion: SCHEMA_VERSIONS.stationeryProfile, id: editId ?? 'draft', isPreset: false, verification: 'userDefined', refeedSafe: form.material !== 'adhesiveSheet' };
  }, [form, text, editId]);
  const issues = validateStationery(candidate);
  const errors = issues.filter(i => i.severity === 'error');
  const compat = errors.length ? null : (() => { try { return layoutCompatibility({ widthMm: candidate.labelWidthMm, heightMm: candidate.labelHeightMm, safeInsetMm: candidate.safeInsetMm }); } catch { return null; } })();

  const makeDefault = async (id: string) => { await saveLabelSettings({ defaultProfileId: id }); AppAlert.success(t('stationery.defaultSet')); };

  if (preset) {
    const p = preset;
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
        <ScreenHeader title={p.name} subtitle={t(`printSetup.verification.${p.verification}`)} onBack={() => nav.goBack()} />
        <AppKeyboardScrollView contentContainerStyle={s.content}>
          <View style={s.card}>
            <LabelRow label={t('stationery.page')} value={`${p.paper} · ${t(`stationery.orientation.${p.orientation}`)} · ${p.pageWidthMm} × ${p.pageHeightMm} mm`} />
            <LabelRow label={t('stationery.grid')} value={t('stationery.gridValue', { rows: p.rows, columns: p.columns, count: labelsPerSheet(p) })} />
            <LabelRow label={t('stationery.labelSize')} value={`${p.labelWidthMm} × ${p.labelHeightMm} mm`} />
            <LabelRow label={t('stationery.margins')} value={`${p.marginTopMm} / ${p.marginLeftMm} mm`} />
            <LabelRow label={t('stationery.gaps')} value={`${p.gapXMm} / ${p.gapYMm} mm`} />
            <LabelRow label={t('stationery.safeInset')} value={`${p.safeInsetMm} mm`} />
            <LabelRow label={t('stationery.material')} value={t(`stationery.materialValue.${p.material}`)} />
          </View>
          {p.verificationSource ? <Text style={s.note}>{t('stationery.source', { source: p.verificationSource })}</Text> : null}
          <Text style={s.note}>{t('stationery.unverifiedNote')}</Text>
          <AppButton label={p.id === settings.defaultProfileId ? t('stationery.isDefault') : t('stationery.useDefault')} onPress={() => makeDefault(p.id)} disabled={p.id === settings.defaultProfileId} />
          <AppButton label={t('printSetup.calibration')} onPress={() => nav.navigate('Calibration', { profileId: p.id })} variant="secondary" />
          <AppButton label={t('stationery.copyToEdit')} onPress={() => (canUseFeature(tier, 'customStationery') ? nav.replace('StationeryEditor', { copyFrom: p.id }) : setLimit(true))} variant="outline" />
        </AppKeyboardScrollView>
        <FreeLimitSheet reason={limit ? 'proFeature' : null} onClose={() => setLimit(false)} />
      </View>
    );
  }

  const save = async () => {
    if (!canUseFeature(tier, 'customStationery')) { setLimit(true); return; }
    if (!form.name.trim()) { AppAlert.error(t('stationery.nameRequired')); return; }
    try {
      const saved = await saveCustomProfile({ ...candidate, id: editId, name: form.name.trim() });
      setEditId(saved.id);
      AppAlert.success(t('stationery.saved'));
      nav.goBack();
    } catch (e) {
      AppAlert.error(e instanceof StationeryInvalidError ? e.issues.map(i => geometryIssueText(t, i)).join('\n') : t('stationery.saveFailed'));
    }
  };
  const remove = () => editId && AppAlert.alert(t('stationery.deleteTitle'), t('stationery.deleteBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('stationery.delete'), style: 'destructive', onPress: async () => { await deleteCustomProfile(editId); if (settings.defaultProfileId === editId) await saveLabelSettings({ defaultProfileId: 'preset_shelf_70x38_a4' }); nav.goBack(); } },
  ]);
  const num = (f: NumField, label: string) => (
    <View style={s.numRow} key={f}>
      <Text style={s.numLabel}>{label}</Text>
      <AppTextInput style={s.numInput} value={text[f]} onChangeText={v => setText(x => ({ ...x, [f]: v }))} keyboardType="decimal-pad" accessibilityLabel={label} />
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={editId ? t('stationery.editTitle') : t('stationery.newTitle')} subtitle={t('stationery.subtitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.label}>{t('stationery.name')}</Text>
          <AppTextInput style={s.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder={t('stationery.namePh')} placeholderTextColor={colors.textFaint} />
        </View>
        <Text style={s.label}>{t('stationery.paper')}</Text>
        <ToggleSegment options={PAPERS.map(p => t(`stationery.paperValue.${p}`))} selected={t(`stationery.paperValue.${form.paper}`)} onSelect={v => setForm(f => ({ ...f, paper: PAPERS.find(p => t(`stationery.paperValue.${p}`) === v) ?? 'A4' }))} />
        {form.paper !== 'custom' ? <ToggleSegment options={[t('stationery.orientation.portrait'), t('stationery.orientation.landscape')]} selected={t(`stationery.orientation.${form.orientation}`)} onSelect={v => setForm(f => ({ ...f, orientation: v === t('stationery.orientation.landscape') ? 'landscape' : 'portrait' }))} /> : null}
        <View style={s.card}>
          {form.paper === 'custom' ? [num('pageWidthMm', t('stationery.pageWidth')), num('pageHeightMm', t('stationery.pageHeight'))] : null}
          {num('rows', t('stationery.rows'))}
          {num('columns', t('stationery.columns'))}
          {num('labelWidthMm', t('stationery.labelWidth'))}
          {num('labelHeightMm', t('stationery.labelHeight'))}
          {num('marginTopMm', t('stationery.marginTop'))}
          {num('marginLeftMm', t('stationery.marginLeft'))}
          {num('gapXMm', t('stationery.gapX'))}
          {num('gapYMm', t('stationery.gapY'))}
          {num('safeInsetMm', t('stationery.safeInset'))}
        </View>
        <Text style={s.label}>{t('stationery.material')}</Text>
        <ToggleSegment options={MATERIALS.map(m => t(`stationery.materialValue.${m}`))} selected={t(`stationery.materialValue.${form.material}`)} onSelect={v => setForm(f => ({ ...f, material: MATERIALS.find(m => t(`stationery.materialValue.${m}`) === v) ?? 'card' }))} />
        <View style={[s.card, errors.length ? s.bad : s.good]}>
          {errors.length ? issues.filter(i => i.severity === 'error').map((i, k) => <Text key={k} style={s.err}>{geometryIssueText(t, i)}</Text>) : (
            <>
              <Text style={s.ok}>{t('stationery.valid', { count: labelsPerSheet(candidate) })}</Text>
              {issues.filter(i => i.severity === 'warning').map((i, k) => <Text key={k} style={s.warn}>{geometryIssueText(t, i)}</Text>)}
              {compat ? <Text style={s.note}>{t('stationery.layouts', { list: (Object.keys(compat) as (keyof typeof compat)[]).filter(k => compat[k].ok).map(k => t(`layout.${k}`)).join(', ') || '—' })}</Text> : <Text style={s.warn}>{t('stationery.tooSmall')}</Text>}
            </>
          )}
        </View>
        <AppButton label={t('common.save')} onPress={save} disabled={errors.length > 0} />
        {editId ? <AppButton label={editId === settings.defaultProfileId ? t('stationery.isDefault') : t('stationery.useDefault')} onPress={() => makeDefault(editId)} variant="secondary" disabled={editId === settings.defaultProfileId} /> : null}
        {editId ? <AppButton label={t('stationery.delete')} onPress={remove} variant="dangerLink" /> : null}
        <Text style={s.note}>{t('stationery.measureNote')}</Text>
      </AppKeyboardScrollView>
      <FreeLimitSheet reason={limit ? 'proFeature' : null} onClose={() => setLimit(false)} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  good: { borderColor: colors.successGreen },
  bad: { borderColor: colors.dangerRed },
  label: { ...typography.sectionLabel, color: colors.textMuted },
  input: { ...typography.body, color: colors.textDark, borderBottomWidth: 1.5, borderBottomColor: colors.border, paddingVertical: 8, minHeight: 44 },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  numLabel: { ...typography.body, color: colors.textDark, flex: 1 },
  numInput: { ...typography.body, color: colors.textDark, width: 96, textAlign: 'right', borderBottomWidth: 1.5, borderBottomColor: colors.border, minHeight: 44, fontVariant: ['tabular-nums'] },
  note: { ...typography.bodySm, color: colors.textMuted },
  err: { ...typography.bodySm, color: colors.dangerRed },
  warn: { ...typography.bodySm, color: colors.warningOrange },
  ok: { ...typography.body, color: colors.successGreen, fontWeight: '700' },
});
