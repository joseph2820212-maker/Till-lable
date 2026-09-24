import React from 'react';
import { NavigationContainer, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabNavigator, TabParamList } from './TabNavigator';
import type { LegalDocId } from '../modules/more/content/legalContent';

/**
 * Every screen that lives inside a tab's stack (the tab roots + all shared screens).
 * The full planned route list is in docs/SCREEN_REGISTER.md; routes are added here
 * only in the gate that implements them.
 */
export type TabStackParamList = {
  // Tab roots
  Home: undefined;
  Products: undefined;
  ToPrint: undefined;
  More: undefined;
  // Settings / information
  SettingsCurrency: undefined;
  SettingsLanguage: undefined;
  SettingsHelp: { tab?: 'guide' | 'faq'; chapter?: string } | undefined;
  SettingsLegal: { doc: LegalDocId };
  SettingsBackup: undefined;
  SettingsAbout: undefined;
  SettingsOfflinePrivate: undefined;
  SettingsLabels: undefined;
  // Catalogue
  ProductDetail: { id?: string; barcode?: string; symbology?: string } | undefined;
  Scan: { mode: 'find' | 'attach' };
  QuickLabel: undefined;
  Import: undefined;
  // Offers and reductions
  Offers: undefined;
  OfferEditor: { promotionId?: string; productId?: string } | undefined;
  ReducedLabel: { productId?: string } | undefined;
  // Printing
  PrintPreview: { jobId: string };
  PrintSetup: undefined;
  StationeryEditor: { profileId?: string; copyFrom?: string } | undefined;
  LabelTest: undefined;
  Calibration: { profileId?: string } | undefined;
  PrintHistory: undefined;
};

/** The root navigator holds only the tab navigator; every screen name resolves inside the current tab's stack. */
export type RootStackParamList = TabStackParamList & { Tabs: NavigatorScreenParams<TabParamList> | undefined };

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root: a single "Tabs" route. All feature screens live in the per-tab stacks
 * (see TabNavigator / sharedScreens) so the bottom navigation is always visible.
 */
export const AppNavigator: React.FC = () => (
  <NavigationContainer>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
    </Stack.Navigator>
  </NavigationContainer>
);
