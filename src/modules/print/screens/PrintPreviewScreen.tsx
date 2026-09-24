import React, { useEffect, useReducer, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { AppPdfPreviewScreen } from '../../../components/pdf/AppPdfPreviewScreen';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { getJob, setJobStatus, type StoredJob } from '../storage/jobStore';
import { getProfile } from '../storage/stationeryStore';
import { markPrinted } from '../../queue/storage/queueStore';
import { marksPrinted, printFlow, showsConfirmationQuestion, startPreview, type PrintFlowEvent, type PrintFlowState } from '../../labels/engine/printFlow';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'PrintPreview'>;

/**
 * The exact PDF that prints (handout §23–§24). Print opens the system dialog; only after the app is back does it ask
 * "Did the labels print correctly?" (Yes, printed / Keep waiting / Print again). Share PDF never asks and never
 * marks anything printed. Preview, print and share all use this one file.
 */
export const PrintPreviewScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const [job, setJob] = useState<StoredJob | null>(null);
  const [profileName, setProfileName] = useState('');
  const [missing, setMissing] = useState(false);
  const [flow, dispatch] = useReducer((st: PrintFlowState, e: PrintFlowEvent) => printFlow(st, e), startPreview(''));
  const [working, setWorking] = useState(false);

  useEffect(() => {
    getJob(params.jobId).then(async j => {
      if (!j) { setMissing(true); return; }
      setJob(j);
      setProfileName((await getProfile(j.stationeryProfileId)).name);
    }).catch(() => setMissing(true));
  }, [params.jobId]);

  const print = async () => {
    if (!job || working) return;
    setWorking(true);
    dispatch({ type: 'tapPrint' });
    try {
      await Print.printAsync({ uri: job.pdfUri });
      await setJobStatus(job.id, 'sentToPrinter');
    } catch {
      // A cancelled or failed dialog still returns here; the question lets the user say what happened.
    } finally {
      dispatch({ type: 'returnedFromPrintDialog' });
      setWorking(false);
    }
  };
  const share = async () => {
    if (!job) return;
    dispatch({ type: 'tapShare' });
    try {
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(job.pdfUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: job.displayName });
      else AppAlert.error(t('print.shareUnavailable'));
    } catch { AppAlert.error(t('print.shareFailed')); }
  };
  const answer = async (a: 'printed' | 'wait' | 'again') => {
    if (!job) return;
    if (a === 'again') { dispatch({ type: 'answerPrintAgain' }); await print(); return; }
    if (a === 'wait') {
      dispatch({ type: 'answerKeepWaiting' });
      AppAlert.success(t('print.keptWaiting'));
      nav.goBack();
      return;
    }
    const next = printFlow(flow, { type: 'answerPrinted' });
    if (!marksPrinted(next)) return;
    dispatch({ type: 'answerPrinted' });
    try {
      if (job.kind === 'queue' && job.lines.length) await markPrinted(job.lines);
      await setJobStatus(job.id, 'confirmed');
      AppAlert.success(t('print.confirmed', { count: job.labelCount }));
      nav.goBack();
    } catch { AppAlert.error(t('print.confirmFailed')); }
  };

  const banner = job ? (
    <View style={s.banner}>
      <Text style={s.facts}>{t('print.facts', { pages: job.pageCount, labels: job.labelCount, start: job.startPosition })}</Text>
      <Text style={s.factsSub} numberOfLines={1}>{profileName}</Text>
      {showsConfirmationQuestion(flow) ? (
        <View style={s.ask} testID="print-ask">
          <Text style={s.askTitle}>{t('print.askTitle')}</Text>
          <View style={s.actions}>
            <AppButton label={t('print.yesPrinted')} onPress={() => answer('printed')} style={s.btn} />
            <AppButton label={t('print.keepWaiting')} onPress={() => answer('wait')} variant="secondary" style={s.btn} />
          </View>
          <AppButton label={t('print.printAgain')} onPress={() => answer('again')} variant="outline" />
        </View>
      ) : (
        <View style={s.actions}>
          <AppButton label={t('print.print')} onPress={print} loading={working} disabled={working} style={s.btn} />
          <AppButton label={t('print.sharePdf')} onPress={share} variant="secondary" style={s.btn} />
        </View>
      )}
      <Text style={s.note}>{job.kind === 'queue' ? t('print.shareNote') : t('print.testNote')}</Text>
    </View>
  ) : null;

  return (
    <AppPdfPreviewScreen
      title={job?.displayName ?? t('print.previewTitle')}
      sourceUri={job?.pdfUri ?? null}
      onBack={() => nav.goBack()}
      error={missing ? t('print.jobMissing') : null}
      banner={banner}
    />
  );
};

const s = StyleSheet.create({
  banner: { backgroundColor: colors.background, padding: 12, gap: 8 },
  facts: { ...typography.body, color: colors.textDark, fontWeight: '700' },
  factsSub: { ...typography.bodySm, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1 },
  ask: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.warningOrange, borderRadius: 14, padding: 12, gap: 8 },
  askTitle: { ...typography.cardTitle, color: colors.textDark },
  note: { ...typography.bodySm, color: colors.textMuted },
});
