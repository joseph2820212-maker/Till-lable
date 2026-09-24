import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppTextInput } from '../../../components/AppTextInput';
import { DropdownField } from '../../../components/DropdownField';
import { AppAlert } from '../../../components/AppAlert';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { LanguageCode, StationeryProfile } from '../../../domain/types';
import { classifyCalibration, type CalibrationVerdict } from '../../labels/engine/calibration';
import { getCalibration, listAllProfiles, saveCalibration, clampOffset } from '../storage/stationeryStore';
import { generateCalibrationJob } from '../printService';
import { generateFailureText } from '../issueText';
import { useLabelSettings } from '../../settings/storage/labelSettings';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Calibration'>;
const num = (v: string) => Number(v.replace(',', '.').replace('−', '-'));

/**
 * Printer calibration (handout §18): print the calibration page at Actual size, measure the 100 mm line and the
 * first and last crosshairs, and the app says whether it is a uniform offset (fixed with X / Y in 0.5 mm steps),
 * scaling, or drift (which an offset cannot fix).
 */
export const CalibrationScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const settings = useLabelSettings();
  const [profiles, setProfiles] = useState<StationeryProfile[]>([]);
  const [profileId, setProfileId] = useState(params?.profileId ?? settings.defaultProfileId);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [m, setM] = useState({ line: '100', fx: '0', fy: '0', lx: '0', ly: '0' });
  const [verdict, setVerdict] = useState<CalibrationVerdict | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    listAllProfiles().then(setProfiles).catch(() => undefined);
    getCalibration(profileId).then(c => setOffset({ x: c?.offsetXMm ?? 0, y: c?.offsetYMm ?? 0 })).catch(() => undefined);
  }, [profileId]));

  const printPage = async () => {
    setBusy(true);
    try {
      const lang = (['en', 'ar', 'tr', 'fr', 'es', 'de'].find(l => (i18n.language || 'en').startsWith(l)) ?? 'en') as LanguageCode;
      const r = await generateCalibrationJob(profileId, lang);
      if (r.ok) nav.navigate('PrintPreview', { jobId: r.job.id });
      else AppAlert.alert(t('print.cannotPrintTitle'), generateFailureText(t, r, []));
    } finally { setBusy(false); }
  };
  const check = () => {
    const vals = [m.line, m.fx, m.fy, m.lx, m.ly].map(num);
    if (vals.some(v => !Number.isFinite(v)) || !(vals[0] > 0)) { AppAlert.error(t('calibration.badNumbers')); return; }
    setVerdict(classifyCalibration({ referenceLineMm: vals[0], first: { dxMm: vals[1], dyMm: vals[2] }, last: { dxMm: vals[3], dyMm: vals[4] } }));
  };
  const saveOffset = async (x: number, y: number) => {
    const c = await saveCalibration(profileId, x, y);
    setOffset({ x: c.offsetXMm, y: c.offsetYMm });
    // The measurement was of the OLD offset: clear it so the same correction can never be applied twice.
    setVerdict(null);
    AppAlert.success(t('calibration.saved', { x: c.offsetXMm, y: c.offsetYMm }));
  };
  const field = (k: keyof typeof m, label: string) => (
    <View style={s.numRow} key={k}>
      <Text style={s.numLabel}>{label}</Text>
      <AppTextInput style={s.numInput} value={m[k]} onChangeText={v => setM(x => ({ ...x, [k]: v }))} keyboardType="numbers-and-punctuation" accessibilityLabel={label} />
    </View>
  );
  const nudge = (axis: 'x' | 'y', d: number) => saveOffset(axis === 'x' ? clampOffset(offset.x + d) : offset.x, axis === 'y' ? clampOffset(offset.y + d) : offset.y);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('printSetup.calibration')} subtitle={t('calibration.subtitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <DropdownField label={t('print.stationery')} value={profileId} options={profiles.map(p => p.id)} getLabel={id => profiles.find(p => p.id === id)?.name ?? id} onSelect={id => { setProfileId(id); setVerdict(null); }} />
        <View style={s.card}>
          <Text style={s.step}>{t('calibration.step1')}</Text>
          <Text style={s.note}>{t('calibration.actualSize')}</Text>
          <AppButton label={t('calibration.printPage')} onPress={printPage} loading={busy} disabled={busy} />
        </View>
        <View style={s.card}>
          <Text style={s.step}>{t('calibration.step2')}</Text>
          <Text style={s.note}>{t('calibration.measureHint')}</Text>
          {field('line', t('calibration.line'))}
          {field('fx', t('calibration.firstX'))}
          {field('fy', t('calibration.firstY'))}
          {field('lx', t('calibration.lastX'))}
          {field('ly', t('calibration.lastY'))}
          <AppButton label={t('calibration.check')} onPress={check} variant="secondary" />
          {verdict ? (
            <View style={[s.verdict, verdict.kind === 'aligned' || verdict.kind === 'uniformOffset' ? s.good : s.bad]} testID="calibration-verdict">
              <Text style={s.verdictTitle}>{t(`calibration.verdict.${verdict.kind}.title`)}</Text>
              <Text style={s.note}>{t(`calibration.verdict.${verdict.kind}.body`, verdict as unknown as Record<string, unknown>)}</Text>
              {verdict.kind === 'uniformOffset' ? <AppButton label={t('calibration.apply', { x: clampOffset(offset.x + verdict.offsetXMm), y: clampOffset(offset.y + verdict.offsetYMm) })} onPress={() => saveOffset(offset.x + verdict.offsetXMm, offset.y + verdict.offsetYMm)} /> : null}
            </View>
          ) : null}
        </View>
        <View style={s.card}>
          <Text style={s.step}>{t('calibration.current')}</Text>
          {(['x', 'y'] as const).map(axis => (
            <View key={axis} style={s.numRow}>
              <Text style={s.numLabel}>{t(`calibration.offset.${axis}`)}</Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => nudge(axis, -0.5)} accessibilityRole="button" accessibilityLabel={t('calibration.minus')}><Text style={s.stepText}>−</Text></TouchableOpacity>
              <Text style={s.offset}>{`${offset[axis] > 0 ? '+' : ''}${offset[axis].toFixed(1)} mm`}</Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => nudge(axis, 0.5)} accessibilityRole="button" accessibilityLabel={t('calibration.plus')}><Text style={s.stepText}>+</Text></TouchableOpacity>
            </View>
          ))}
          <Text style={s.note}>{t('calibration.direction')}</Text>
        </View>
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  step: { ...typography.cardTitle, color: colors.textDark },
  note: { ...typography.bodySm, color: colors.textMuted },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numLabel: { ...typography.body, color: colors.textDark, flex: 1 },
  numInput: { ...typography.body, color: colors.textDark, width: 84, textAlign: 'right', borderBottomWidth: 1.5, borderBottomColor: colors.border, minHeight: 44, fontVariant: ['tabular-nums'] },
  verdict: { borderRadius: 12, padding: 10, gap: 6, borderWidth: 1.5 },
  good: { borderColor: colors.successGreen },
  bad: { borderColor: colors.warningOrange },
  verdictTitle: { ...typography.body, fontWeight: '700', color: colors.textDark },
  stepBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.inputMuted, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontWeight: '700', color: colors.primaryBlue },
  offset: { ...typography.body, minWidth: 76, textAlign: 'center', fontWeight: '700', color: colors.textDark, fontVariant: ['tabular-nums'] },
});
