import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { PickerSheet } from '../../../components/PickerSheet';
import { AppTextInput } from '../../../components/AppTextInput';
import type { Product } from '../../../domain/types';
import { listProducts, searchProducts } from '../../products/storage/productStore';

/** Search-and-tick product picker in the family bottom sheet. */
export const ProductPicker: React.FC<{ visible: boolean; selected: string[]; multi?: boolean; onClose: () => void; onChange: (ids: string[]) => void }> = ({ visible, selected, multi = true, onClose, onChange }) => {
  const { t } = useTranslation();
  const [all, setAll] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { if (visible) listProducts().then(setAll).catch(() => undefined); }, [visible]);
  const shown = useMemo(() => searchProducts(all, q).slice(0, 100), [all, q]);
  const toggle = (id: string) => {
    if (!multi) { onChange([id]); onClose(); return; }
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  return (
    <PickerSheet visible={visible} onClose={onClose} title={t('offers.pickProducts')}>
      <View style={s.search}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <AppTextInput style={s.input} value={q} onChangeText={setQ} placeholder={t('products.searchPlaceholder')} placeholderTextColor={colors.textFaint} />
      </View>
      <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
        {shown.length === 0 ? <Text style={s.empty}>{t('products.noMatchTitle')}</Text> : shown.map(p => (
          <TouchableOpacity key={p.id} style={s.row} onPress={() => toggle(p.id)} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(p.id) }}>
            <Ionicons name={selected.includes(p.id) ? 'checkbox' : 'square-outline'} size={22} color={colors.primaryBlue} />
            <Text style={s.name} numberOfLines={2}>{p.labelName || p.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </PickerSheet>
  );
};

const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardWhite, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, height: 46, marginVertical: 8 },
  input: { flex: 1, ...typography.body, color: colors.textDark, height: 46 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { ...typography.body, color: colors.textDark, flex: 1 },
  empty: { ...typography.bodySm, color: colors.textMuted, padding: 12, textAlign: 'center' },
});
