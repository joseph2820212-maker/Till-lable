import React from 'react';
import type { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { TabStackParamList } from './AppNavigator';
import { CurrencyScreen } from '../modules/more/screens/CurrencyScreen';
import { LanguageScreen } from '../modules/more/screens/LanguageScreen';
import { HelpScreen } from '../modules/more/screens/HelpScreen';
import { LegalScreen } from '../modules/more/screens/LegalScreen';
import { AboutScreen } from '../modules/more/screens/AboutScreen';
import { OfflinePrivateScreen } from '../modules/more/screens/OfflinePrivateScreen';
import { BackupScreen } from '../modules/backup/screens/BackupScreen';
import { LabelSettingsScreen } from '../modules/settings/screens/LabelSettingsScreen';
import { ProductDetailScreen } from '../modules/products/screens/ProductDetailScreen';
import { ScanScreen } from '../modules/products/screens/ScanScreen';
import { QuickLabelScreen } from '../modules/products/screens/QuickLabelScreen';
import { ImportScreen } from '../modules/import/screens/ImportScreen';
import { OffersScreen } from '../modules/promotions/screens/OffersScreen';
import { OfferEditorScreen } from '../modules/promotions/screens/OfferEditorScreen';
import { ReducedLabelScreen } from '../modules/promotions/screens/ReducedLabelScreen';
import { PrintPreviewScreen } from '../modules/print/screens/PrintPreviewScreen';
import { PrintSetupScreen } from '../modules/print/screens/PrintSetupScreen';
import { StationeryEditorScreen } from '../modules/print/screens/StationeryEditorScreen';
import { LabelTestScreen } from '../modules/print/screens/LabelTestScreen';
import { CalibrationScreen } from '../modules/print/screens/CalibrationScreen';
import { PrintHistoryScreen } from '../modules/print/screens/PrintHistoryScreen';

/**
 * Every non-tab screen of the app, registered inside EACH tab's stack. Pushing a
 * screen therefore stays under the bottom tab bar (the bar is never hidden), and
 * each tab keeps its own history. `navigate('X')` resolves in the current tab.
 */
export type AppStack = ReturnType<typeof createNativeStackNavigator<TabStackParamList>>;

export function sharedScreens(Stack: AppStack): React.ReactElement {
  return (
    <>
      <Stack.Screen name="SettingsCurrency" component={CurrencyScreen} />
      <Stack.Screen name="SettingsLanguage" component={LanguageScreen} />
      <Stack.Screen name="SettingsHelp" component={HelpScreen} />
      <Stack.Screen name="SettingsLegal" component={LegalScreen} />
      <Stack.Screen name="SettingsBackup" component={BackupScreen} />
      <Stack.Screen name="SettingsAbout" component={AboutScreen} />
      <Stack.Screen name="SettingsOfflinePrivate" component={OfflinePrivateScreen} />
      <Stack.Screen name="SettingsLabels" component={LabelSettingsScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="Scan" component={ScanScreen} />
      <Stack.Screen name="QuickLabel" component={QuickLabelScreen} />
      <Stack.Screen name="Import" component={ImportScreen} />
      <Stack.Screen name="Offers" component={OffersScreen} />
      <Stack.Screen name="OfferEditor" component={OfferEditorScreen} />
      <Stack.Screen name="ReducedLabel" component={ReducedLabelScreen} />
      <Stack.Screen name="PrintPreview" component={PrintPreviewScreen} />
      <Stack.Screen name="PrintSetup" component={PrintSetupScreen} />
      <Stack.Screen name="StationeryEditor" component={StationeryEditorScreen} />
      <Stack.Screen name="LabelTest" component={LabelTestScreen} />
      <Stack.Screen name="Calibration" component={CalibrationScreen} />
      <Stack.Screen name="PrintHistory" component={PrintHistoryScreen} />
    </>
  );
}
