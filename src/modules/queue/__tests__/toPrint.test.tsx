import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => require('../../../__tests__/helpers/screenStubs').rn);
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));
jest.mock('../../../components/HeaderTopBleed', () => ({ HeaderTopBleed: 'HeaderTopBleed' }));

import { flush, texts } from '../../../__tests__/helpers/screenStubs';
import { ToPrintScreen } from '../screens/ToPrintScreen';
import { loadWorkSummary } from '../storage/summary';
import { TL_KEYS } from '../../../storage/keys';

const render = async () => { let r: any; await act(async () => { r = TestRenderer.create(<ToPrintScreen />); await flush(); await flush(); }); return r; };

beforeEach(() => (AsyncStorage as any).clear());

describe('work summary', () => {
  it('counts products and label copies separately and ignores printed or malformed intents', async () => {
    await AsyncStorage.setItem(TL_KEYS.products, JSON.stringify([{ id: 'A' }, { id: 'B' }, { id: 'C' }]));
    await AsyncStorage.setItem(TL_KEYS.queue, JSON.stringify([
      { productId: 'A', copies: 3, status: 'waiting' },
      { productId: 'A', copies: 1, status: 'waiting' },
      { productId: 'B', copies: 2, status: 'waiting' },
      { productId: 'C', copies: 5, status: 'printed' },
      { productId: 'B', copies: -4, status: 'waiting' },
      null,
    ]));
    expect(await loadWorkSummary()).toEqual({ products: 3, waitingProducts: 2, waitingLabels: 6 });
  });
  it('is all zeros on a fresh install', async () => {
    expect(await loadWorkSummary()).toEqual({ products: 0, waitingProducts: 0, waitingLabels: 0 });
  });
});

describe('ToPrintScreen', () => {
  it('shows the empty state only when nothing is waiting', async () => {
    const r = await render();
    expect(r.root.findAllByProps({ testID: 'queue-empty' }).length).toBeGreaterThan(0);
    expect(r.root.findAllByProps({ testID: 'queue-waiting' })).toHaveLength(0);
  });
  it('never says "nothing waiting" while labels are waiting', async () => {
    await AsyncStorage.setItem(TL_KEYS.queue, JSON.stringify([{ productId: 'A', copies: 3, status: 'waiting' }]));
    const r = await render();
    expect(r.root.findAllByProps({ testID: 'queue-empty' })).toHaveLength(0);
    expect(texts(r)).toContain('home.waitingCounts|products=1,labels=3');
  });
});
