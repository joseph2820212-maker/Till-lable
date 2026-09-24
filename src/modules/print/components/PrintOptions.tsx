import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { DropdownField } from '../../../components/DropdownField';
import type { StationeryProfile } from '../../../domain/types';
import { labelsPerSheet } from '../../labels/engine/geometry';
import { listAllProfiles } from '../storage/stationeryStore';

/** Stationery choice + start position (skip labels already used on a part-used sheet). */
export const PrintOptions: React.FC<{
  profileId: string; onProfile: (id: string) => void; start: number; onStart: (n: number) => void; filter?: (p: StationeryProfile) => boolean;
}> = ({ profileId, onProfile, start, onStart, filter }) => {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<StationeryProfile[]>([]);
  useEffect(() => { listAllProfiles().then(ps => setProfiles(filter ? ps.filter(filter) : ps)).catch(() => undefined); }, [filter]);
  const current = profiles.find(p => p.id === profileId) ?? profiles[0];
  const per = current ? labelsPerSheet(current) : 1;
  useEffect(() => { if (current && current.id !== profileId) onProfile(current.id); }, [current, profileId, onProfile]);
  useEffect(() => { if (start > per) onStart(1); }, [per, start, onStart]);
  return (
    <View style={s.wrap}>
      <DropdownField label={t('print.stationery')} value={current?.id ?? ''} options={profiles.map(p => p.id)} getLabel={id => profiles.find(p => p.id === id)?.name ?? id} onSelect={onProfile} />
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{t('print.startAt')}</Text>
          <Text style={s.hint}>{t('print.startAtHint', { count: per })}</Text>
        </View>
        <View style={s.stepper}>
          <TouchableOpacity style={s.step} onPress={() => onStart(Math.max(1, start - 1))} accessibilityRole="button" accessibilityLabel={t('quick.fewer')}><Text style={s.stepText}>−</Text></TouchableOpacity>
          <Text style={s.value} testID="print-start">{start}</Text>
          <TouchableOpacity style={s.step} onPress={() => onStart(Math.min(per, start + 1))} accessibilityRole="button" accessibilityLabel={t('quick.more')}><Text style={s.stepText}>+</Text></TouchableOpacity>
        </View>
      </View>
      {current && !current.refeedSafe ? <Text style={s.warn}>{t('print.refeedWarning')}</Text> : null}
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { ...typography.body, color: colors.textDark, fontWeight: '600' },
  hint: { ...typography.bodySm, color: colors.textMuted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.inputMuted, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, fontWeight: '700', color: colors.primaryBlue },
  value: { ...typography.cardTitle, minWidth: 32, textAlign: 'center', color: colors.textDark, fontVariant: ['tabular-nums'] },
  warn: { ...typography.bodySm, color: colors.warningOrange },
});
