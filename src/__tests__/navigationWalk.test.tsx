/**
 * Gate 5 — navigation walk. Every route registered in AppNavigator is rendered
 * with realistic params, in each of the six languages, with REAL i18next
 * resources. A screen fails the walk if it throws, shows a raw translation
 * key, or still says "coming soon". Heavy native-backed components are
 * stubbed; everything that decides what text appears is real.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const mockPass = (name: string) => ({ children, ...props }: any) => require('react').createElement(name, props, children);
jest.mock('react-native', () => ({
  StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1, absoluteFill: {}, absoluteFillObject: {}, flatten: (s: any) => s },
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', TextInput: 'TextInput', Pressable: 'Pressable',
  StatusBar: 'StatusBar', Modal: 'Modal', FlatList: 'FlatList', SectionList: 'SectionList', ActivityIndicator: 'ActivityIndicator', Image: 'Image', Switch: 'Switch', KeyboardAvoidingView: 'KeyboardAvoidingView', SafeAreaView: 'SafeAreaView',
  I18nManager: { isRTL: false, forceRTL: () => {}, allowRTL: () => {} }, Platform: { OS: 'android', select: (o: any) => o.android ?? o.default },
  Dimensions: { get: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }), addEventListener: () => ({ remove() {} }) }, useWindowDimensions: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
  Share: { share: async () => ({ action: 'sharedAction' }) }, Alert: { alert: () => {} }, Linking: { openURL: async () => {}, canOpenURL: async () => true, openSettings: async () => {} }, Keyboard: { dismiss: () => {}, addListener: () => ({ remove() {} }) },
  Animated: { Value: class { setValue() {} interpolate() { return 0; } }, timing: () => ({ start: (cb?: () => void) => cb?.() }), spring: () => ({ start: (cb?: () => void) => cb?.() }), View: 'Animated.View', Text: 'Animated.Text', createAnimatedComponent: (c: any) => c },
  PixelRatio: { get: () => 2, roundToNearestPixel: (n: number) => n }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }, NativeModules: {},
}));
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setParams: jest.fn() };
let mockParams: any = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav, useRoute: () => ({ params: mockParams }), useIsFocused: () => true,
  useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(() => cb(), [cb]); },
  NavigationContainer: mockPass('NavigationContainer'),
}));
jest.mock('@react-navigation/native-stack', () => ({ createNativeStackNavigator: () => ({ Navigator: mockPass('Navigator'), Screen: mockPass('Screen') }) }));
jest.mock('@react-navigation/bottom-tabs', () => ({ createBottomTabNavigator: () => ({ Navigator: mockPass('TabNavigator'), Screen: mockPass('TabScreen') }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: 'SafeAreaView', SafeAreaProvider: mockPass('SafeAreaProvider') }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v, isRTL: false, rowDir: 'row' }));
jest.mock('../theme/useResponsive', () => ({ useResponsive: () => ({ width: 390, height: 844, isTablet: false }) }));
jest.mock('../hooks/useKeyboardHeight', () => ({ useKeyboardHeight: () => 0 }));
jest.mock('../i18n', () => {
  const m = require('i18next'); const inst = m.default ?? m;
  return { __esModule: true, default: inst, SUPPORTED_LANGUAGES: ['en', 'ar', 'tr', 'fr', 'es', 'de'], changeLanguage: async () => ({ status: 'applied' }), loadSavedLanguage: async () => 'en', saveLanguage: async () => {}, initializeLanguage: async () => ({}), retryLanguageTransition: async () => true, rollbackLanguageTransition: async () => true };
});
jest.mock('../modules/billing/BillingProvider', () => ({ useBilling: () => ({ status: 'unknown', entitlement: { isPremium: false, packages: [], source: 'unknown' }, purchase: async () => ({ success: false, cancelled: true }), restore: async () => ({ success: false }), refresh: async () => {} }), BillingProvider: (p: any) => p.children }));
// Native-backed / sheet components render as plain nodes; their logic is covered by their own tests.
jest.mock('../components/DropdownField', () => ({ DropdownField: 'DropdownField' }));
jest.mock('../components/ToggleSegment', () => ({ ToggleSegment: 'ToggleSegment' }));
jest.mock('../components/AppSwitch', () => ({ AppSwitch: 'AppSwitch' }));
jest.mock('../components/CheckboxRow', () => ({ CheckboxRow: 'CheckboxRow' }));
jest.mock('../components/DatePickerField', () => ({ DatePickerField: 'DatePickerField' }));
jest.mock('../components/OtherInputModal', () => ({ OtherInputModal: 'OtherInputModal' }));
jest.mock('../components/HeaderTopBleed', () => ({ HeaderTopBleed: 'HeaderTopBleed' }));
jest.mock('../components/DemoBackArrow', () => ({ DemoBackArrow: 'DemoBackArrow' }));
jest.mock('../components/InputField', () => ({ InputField: 'InputField' }));
jest.mock('../components/AppTextInput', () => ({ AppTextInput: 'AppTextInput' }));
jest.mock('../components/PickerSheet', () => ({ PickerSheet: mockPass('PickerSheet'), PickerRow: 'PickerRow' }));
jest.mock('../components/RadioRow', () => ({ RadioRow: mockPass('RadioRow') }));
jest.mock('../components/AppKeyboardScrollView', () => ({ AppKeyboardScrollView: mockPass('AppKeyboardScrollView') }));
jest.mock('../components/AppKeyboardBottomSheet', () => ({ AppKeyboardBottomSheet: ({ visible, children, footer }: any) => (visible ? require('react').createElement('BottomSheet', null, children, footer) : null) }));
jest.mock('../components/pdf/AppPdfPreviewScreen', () => ({ AppPdfPreviewScreen: 'AppPdfPreviewScreen' }));
jest.mock('../components/BackupPassphraseModal', () => ({ BackupPassphraseModal: () => null }));
jest.mock('../utils/pdfFile', () => ({ printHtmlToPdfFile: async () => 'file:///x.pdf', pruneTemporaryPreviewPdfs: async () => {}, safePdfFileName: (s: string) => s }));

import en from '../locales/en.json';
import ar from '../locales/ar.json';
import tr from '../locales/tr.json';
import fr from '../locales/fr.json';
import es from '../locales/es.json';
import de from '../locales/de.json';
import { TL_KEYS } from '../storage/keys';

const LANGS = ['en', 'ar', 'tr', 'fr', 'es', 'de'] as const;
const RAW_KEY = /^[a-z][a-zA-Z]+\.[a-zA-Z0-9_.]+$/;
const KEY_WITH_VARS = /^[a-z][a-zA-Z]+\.[a-zA-Z0-9_.]+\|/;

async function seed() {
  (AsyncStorage as any).clear();
  const price = { minor: 145, currency: 'GBP', exponent: 2 };
  await AsyncStorage.setItem(TL_KEYS.products, JSON.stringify([
    { schemaVersion: 1, id: 'P1', name: 'Semi-skimmed milk 2L', secondLine: '2 litre', price, sellingUnit: { kind: 'volume', millilitres: 2000 }, unitPriceBase: 'per_litre', barcodes: [{ raw: '5000157024671', normalized: '5000157024671', format: 'ean13' }], sku: 'MILK-2', revision: 'r1', status: 'active', isSample: false, createdAt: '2026-09-24T10:00:00Z', updatedAt: '2026-09-24T10:00:00Z' },
    { schemaVersion: 1, id: 'P2', name: 'Fairy Platinum Plus All In One Dishwasher Tablets Lemon 42 Pack', price: { minor: 1100, currency: 'GBP', exponent: 2 }, sellingUnit: { kind: 'each' }, barcodes: [], revision: 'r1', status: 'active', isSample: false, createdAt: '2026-09-24T10:00:00Z', updatedAt: '2026-09-24T10:00:00Z' },
  ]));
  await AsyncStorage.setItem(TL_KEYS.queue, JSON.stringify([
    { schemaVersion: 1, id: 'Q1', purpose: 'normal', productId: 'P1', contentFingerprint: 'x', layoutId: 'standardPrice', labelKind: 'standardPrice', labelLanguage: 'en', copies: 3, reason: 'priceChanged', status: 'waiting', createdAt: '2026-09-24T10:00:00Z', title: 'Semi-skimmed milk 2L' },
    { schemaVersion: 1, id: 'Q2', purpose: 'normal', productId: 'P2', contentFingerprint: 'y', layoutId: 'standardPrice', labelKind: 'standardPrice', labelLanguage: 'en', copies: 1, reason: 'new', status: 'waiting', createdAt: '2026-09-24T10:00:00Z', title: 'Fairy' },
  ]));
  await AsyncStorage.setItem(TL_KEYS.jobs, JSON.stringify([{ schemaVersion: 1, id: 'J1', lines: [], stationeryProfileId: 'preset_shelf_70x38_a4', layoutId: 'sheet', rendererVersion: 'tl-labels-2', pdfUri: 'file:///mock/output.pdf', displayName: 'Labels (3)', pdfSha256: 'abc', startPosition: 1, status: 'generated', createdAt: '2026-09-24T10:00:00Z', labelCount: 3, pageCount: 1, kind: 'queue' }]));
  await AsyncStorage.setItem(TL_KEYS.promotions, JSON.stringify([{ schemaVersion: 1, id: 'O1', name: 'Milk deal', productIds: ['P1'], type: { kind: 'percentOff', percentHundredths: 2500 }, endDate: '2026-10-31', status: 'active', createdAt: '2026-09-24T10:00:00Z', updatedAt: '2026-09-24T10:00:00Z' }]));
}

const S = {
  Home: () => require('../modules/home/screens/HomeScreen').HomeScreen,
  Products: () => require('../modules/products/screens/ProductsScreen').ProductsScreen,
  ToPrint: () => require('../modules/queue/screens/ToPrintScreen').ToPrintScreen,
  More: () => require('../modules/more/screens/MoreScreen').MoreScreen,
  SettingsCurrency: () => require('../modules/more/screens/CurrencyScreen').CurrencyScreen,
  SettingsLanguage: () => require('../modules/more/screens/LanguageScreen').LanguageScreen,
  SettingsHelp: () => require('../modules/more/screens/HelpScreen').HelpScreen,
  SettingsLegal: () => require('../modules/more/screens/LegalScreen').LegalScreen,
  SettingsBackup: () => require('../modules/backup/screens/BackupScreen').BackupScreen,
  SettingsAbout: () => require('../modules/more/screens/AboutScreen').AboutScreen,
  SettingsOfflinePrivate: () => require('../modules/more/screens/OfflinePrivateScreen').OfflinePrivateScreen,
  SettingsLabels: () => require('../modules/settings/screens/LabelSettingsScreen').LabelSettingsScreen,
  ProductDetail: () => require('../modules/products/screens/ProductDetailScreen').ProductDetailScreen,
  Scan: () => require('../modules/products/screens/ScanScreen').ScanScreen,
  QuickLabel: () => require('../modules/products/screens/QuickLabelScreen').QuickLabelScreen,
  Import: () => require('../modules/import/screens/ImportScreen').ImportScreen,
  Offers: () => require('../modules/promotions/screens/OffersScreen').OffersScreen,
  OfferEditor: () => require('../modules/promotions/screens/OfferEditorScreen').OfferEditorScreen,
  ReducedLabel: () => require('../modules/promotions/screens/ReducedLabelScreen').ReducedLabelScreen,
  PrintPreview: () => require('../modules/print/screens/PrintPreviewScreen').PrintPreviewScreen,
  PrintSetup: () => require('../modules/print/screens/PrintSetupScreen').PrintSetupScreen,
  StationeryEditor: () => require('../modules/print/screens/StationeryEditorScreen').StationeryEditorScreen,
  LabelTest: () => require('../modules/print/screens/LabelTestScreen').LabelTestScreen,
  Calibration: () => require('../modules/print/screens/CalibrationScreen').CalibrationScreen,
  PrintHistory: () => require('../modules/print/screens/PrintHistoryScreen').PrintHistoryScreen,
};
const PARAMS: () => Record<keyof typeof S, any> = () => ({
  Home: undefined, Products: undefined, ToPrint: undefined, More: undefined,
  SettingsCurrency: undefined, SettingsLanguage: undefined, SettingsHelp: { tab: 'faq', chapter: 'support' }, SettingsLegal: { doc: 'privacy' },
  SettingsBackup: undefined, SettingsAbout: undefined, SettingsOfflinePrivate: undefined,
  SettingsLabels: undefined, ProductDetail: { id: 'P2' }, Scan: { mode: 'find' }, QuickLabel: undefined, Import: undefined,
  Offers: undefined, OfferEditor: { promotionId: 'O1' }, ReducedLabel: { productId: 'P1' }, PrintPreview: { jobId: 'J1' },
  PrintSetup: undefined, StationeryEditor: { profileId: 'preset_avery_l7160' }, LabelTest: undefined, Calibration: {}, PrintHistory: undefined,
});

const allTexts = (r: any): string[] => r.root.findAllByType('Text').flatMap((t: any) => {
  const c = t.props.children;
  const arr = Array.isArray(c) ? c : [c];
  return arr.filter((x: any) => typeof x === 'string' || typeof x === 'number').map(String);
});
const flush = () => new Promise(res => setTimeout(res, 0));

beforeAll(async () => {
  await i18next.use(initReactI18next).init({ lng: 'en', fallbackLng: false, resources: { en: { translation: en }, ar: { translation: ar }, tr: { translation: tr }, fr: { translation: fr }, es: { translation: es }, de: { translation: de } }, interpolation: { escapeValue: false }, returnNull: false });
  await seed();
});

describe('navigation walk — every registered route renders in every language', () => {
  const routes = Object.keys(S) as (keyof typeof S)[];
  it('covers every route registered in the shared per-tab stacks plus the four tab roots', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../navigation/sharedScreens.tsx'), 'utf8');
    const registered = [...src.matchAll(/<Stack\.Screen name="([A-Za-z]+)"/g)].map(m => m[1]).filter(n => n !== 'Tabs');
    const missing = registered.filter(n => !(n in S));
    expect(missing).toEqual([]);
    // + Home / Products / ToPrint / More
    expect(routes.length).toBe(registered.length + 4);
  });
  for (const lang of LANGS) {
    it(`${lang}: no throw, no raw key, no "coming soon" on any of ${routes.length} screens`, async () => {
      await i18next.changeLanguage(lang);
      const failures: string[] = [];
      const params = PARAMS();
      for (const name of routes) {
        mockParams = params[name];
        let renderer: any;
        try {
          const Screen = S[name]();
          await act(async () => { renderer = TestRenderer.create(React.createElement(Screen)); await flush(); await flush(); });
          const texts = allTexts(renderer);
          const raw = texts.filter(t => (RAW_KEY.test(t) || KEY_WITH_VARS.test(t)) && !/^[a-z]+\.[a-z]+$/.test(t) === true && t.split('.').length > 1 && !/\d/.test(t.split('.')[0]));
          if (raw.length) failures.push(`${name} [${lang}] raw keys: ${[...new Set(raw)].slice(0, 5).join(', ')}`);
          if (texts.some(t => /coming soon/i.test(t) || /comingSoon/.test(t))) failures.push(`${name} [${lang}] still says coming soon`);
          // Evidence: `TL_RENDER_OUT=<dir> npx jest navigationWalk` writes each screen's visible text per language.
          if (process.env.TL_RENDER_OUT && (lang === 'en' || lang === 'ar')) {
            const fsm = require('fs'); const pth = require('path');
            fsm.mkdirSync(process.env.TL_RENDER_OUT, { recursive: true });
            fsm.writeFileSync(pth.join(process.env.TL_RENDER_OUT, `${name}.${lang}.txt`), texts.join('\n') + '\n');
          }
        } catch (e) {
          failures.push(`${name} [${lang}] threw: ${(e as Error).message.split('\n')[0]}`);
        } finally { renderer?.unmount?.(); }
      }
      expect(failures).toEqual([]);
    });
  }
});
