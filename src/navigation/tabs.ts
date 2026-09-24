import type { NavigatorScreenParams } from '@react-navigation/native';
import type { TabStackParamList } from './AppNavigator';
import type { TabParamList } from './TabNavigator';

export type TabRoot = 'Home' | 'Products' | 'ToPrint' | 'More';
export const TAB_OF: Record<TabRoot, keyof TabParamList> = { Home: 'HomeTab', Products: 'ProductsTab', ToPrint: 'ToPrintTab', More: 'MoreTab' };

/** Params for `navigate('Tabs', …)` that land on a tab's ROOT screen (with optional params). */
export function tabTarget<R extends TabRoot>(root: R, params?: TabStackParamList[R]): NavigatorScreenParams<TabParamList> {
  const inner = { screen: root, params } as NavigatorScreenParams<TabStackParamList>;
  return { screen: TAB_OF[root], params: inner } as unknown as NavigatorScreenParams<TabParamList>;
}
