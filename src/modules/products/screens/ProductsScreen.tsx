import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { TabRootHeader } from '../../../components/TabRootHeader';
import { EmptyState } from '../../../components/EmptyState';

/** Products tab root. The catalogue (add, scan, import, search) arrives in G3. */
export const ProductsScreen: React.FC = () => {
  const { t } = useTranslation();
  return (
    <View style={s.root}>
      <TabRootHeader title={t('nav.products')} subtitle={t('products.subtitle')} />
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        <EmptyState icon="pricetags-outline" title={t('products.emptyTitle')} body={t('products.emptyBody')} testID="products-empty" />
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
});
