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
    </>
  );
}
