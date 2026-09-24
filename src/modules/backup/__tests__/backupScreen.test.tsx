import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('expo-file-system/legacy', () => jest.requireActual('../../../../__mocks__/expo-file-system.ts'));
jest.mock('react-native', () => require('../../../__tests__/helpers/screenStubs').rn);
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('@react-navigation/native-stack', () => ({}));
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));
jest.mock('../../../utils/currency', () => ({ ...require('../../../__tests__/helpers/screenStubs').currency(), initCurrency: async () => {} }));
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../components/BackupPassphraseModal', () => ({ BackupPassphraseModal: (p: any) => (p.visible ? require('react').createElement('PassphraseModal', p) : null) }));
jest.mock('../../../storage/fileUtils', () => ({ writeAndShare: jest.fn(async (name: string, content: string) => { (global as any).__lastBackup = content; return `file:///cache/${name}`; }) }));

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { navState, flush, texts, button } from '../../../__tests__/helpers/screenStubs';
import { AppAlert } from '../../../components/AppAlert';
import { BackupScreen } from '../screens/BackupScreen';
import { TL_KEYS } from '../../../storage/keys';

const render = (el: React.ReactElement) => { let r: any; act(() => { r = TestRenderer.create(el); }); return r; };
const settle = async () => { await act(async () => { await flush(); await flush(); }); };

beforeEach(() => { (AsyncStorage as any).clear(); jest.clearAllMocks(); navState.navigate.mockClear(); });

describe('BackupScreen', () => {
  it('create: passphrase sheet → encrypted file shared → last-backup line updates; restore: pick → preview → confirm → passphrase → data replaced', async () => {
    await AsyncStorage.setItem(TL_KEYS.products, JSON.stringify([{ id: 'P1', name: 'Milk 1L' }]));
    await AsyncStorage.setItem('settings:shop', '{"name":"Corner Shop"}');
    const success = jest.spyOn(AppAlert, 'success').mockImplementation((_t, _m, buttons) => { buttons?.[0]?.onPress?.(); });
    const alert = jest.spyOn(AppAlert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find(b => b.style === 'destructive')?.onPress?.(); });
    const r = render(<BackupScreen />);
    await settle();
    expect(texts(r)).toContain('backup.never');
    const createRow = r.root.findAllByType('TouchableOpacity').find((x: any) => x.props.accessibilityLabel === 'backup.createNow');
    act(() => { createRow.props.onPress(); });
    const sheet = r.root.findByType('PassphraseModal');
    expect(sheet.props.mode).toBe('create');
    await act(async () => { await sheet.props.onConfirm('my backup pass'); });
    await settle();
    expect(success).toHaveBeenCalledWith('backup.createdTitle', expect.stringContaining('TillLabel_Backup_'));
    expect(texts(r).some(x => x.startsWith('backup.lastBackup'))).toBe(true);
    const file = (global as any).__lastBackup as string;

    // Now restore that file over a changed store.
    await AsyncStorage.setItem('settings:shop', '{"name":"Changed"}');
    (DocumentPicker as any).__setNextPick({ canceled: false, assets: [{ uri: 'file:///picked.json', name: 'TillLabel_Backup_x.json', size: file.length }] });
    await FileSystem.writeAsStringAsync('file:///picked.json', file);
    const pickRow = r.root.findAllByType('TouchableOpacity').find((x: any) => x.props.accessibilityLabel === 'backup.chooseFile');
    await act(async () => { await pickRow.props.onPress(); });
    await settle();
    expect(texts(r)).toContain('backup.previewTitle');
    expect(texts(r)).toContain('1'); // one price list in the preview
    act(() => { button(r, 'backup.restoreAction').props.onPress(); });
    expect(alert).toHaveBeenCalledWith('backup.restoreTitle', 'backup.restoreConfirm', expect.any(Array));
    const enter = r.root.findByType('PassphraseModal');
    expect(enter.props.mode).toBe('enter');
    await act(async () => { await enter.props.onConfirm('wrong'); });
    await settle();
    expect(r.root.findByType('PassphraseModal').props.error).toBe('backup.errors.wrong-passphrase');
    await act(async () => { await r.root.findByType('PassphraseModal').props.onConfirm('my backup pass'); });
    await settle();
    expect(await AsyncStorage.getItem('settings:shop')).toBe('{"name":"Corner Shop"}');
    expect(navState.navigate).toHaveBeenCalledWith('Tabs', { screen: 'HomeTab', params: { screen: 'Home', params: undefined } });
    success.mockRestore(); alert.mockRestore();
  });
  it('a foreign file is refused at pick time with a clear message', async () => {
    const err = jest.spyOn(AppAlert, 'error').mockImplementation(() => {});
    const r = render(<BackupScreen />);
    await settle();
    (DocumentPicker as any).__setNextPick({ canceled: false, assets: [{ uri: 'file:///x.json', name: 'x.json', size: 10 }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce('{"format":"tillnote","version":2}');
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, size: 10 });
    const pickRow = r.root.findAllByType('TouchableOpacity').find((x: any) => x.props.accessibilityLabel === 'backup.chooseFile');
    await act(async () => { await pickRow.props.onPress(); });
    expect(err).toHaveBeenCalledWith('backup.errors.wrong-format');
    err.mockRestore();
  });
  it('a missing history PDF asks first: Cancel writes nothing; "Back up without missing PDF(s)" backs up and says how many were left out', async () => {
    await FileSystem.writeAsStringAsync('file:///docs/pdf-cache/Kept_1.pdf', 'JVBERi0xLjcgS2VwdA==', { encoding: 'base64' as any });
    const sha = (b: string) => require('@noble/hashes/utils.js').bytesToHex(require('@noble/hashes/sha2.js').sha256(new Uint8Array(Buffer.from(b, 'base64'))));
    await AsyncStorage.setItem(TL_KEYS.jobs, JSON.stringify([
      { id: 'jKept', displayName: 'Milk labels', pdfUri: 'file:///docs/pdf-cache/Kept_1.pdf', pdfSha256: sha('JVBERi0xLjcgS2VwdA==') },
      { id: 'jGone', displayName: 'Old offer cards', pdfUri: 'file:///docs/pdf-cache/Gone_1.pdf', pdfSha256: 'a'.repeat(64) },
    ]));
    const { writeAndShare } = require('../../../storage/fileUtils');
    const success = jest.spyOn(AppAlert, 'success').mockImplementation(() => {});
    let choice: 'cancel' | 'continue' = 'cancel';
    const alert = jest.spyOn(AppAlert, 'alert').mockImplementation((_t, _m, buttons) => {
      (choice === 'cancel' ? buttons?.find(b => b.style === 'cancel') : buttons?.find(b => b.text === 'backup.continueWithoutPdfs'))?.onPress?.();
    });
    const r = render(<BackupScreen />);
    await settle();
    const createRow = r.root.findAllByType('TouchableOpacity').find((x: any) => x.props.accessibilityLabel === 'backup.createNow');
    act(() => { createRow.props.onPress(); });
    await act(async () => { await r.root.findByType('PassphraseModal').props.onConfirm('my backup pass'); });
    await settle();
    expect(alert).toHaveBeenCalledWith('backup.pdfsUnavailableTitle', expect.stringContaining('backup.pdfsUnavailableBody|count=1'), expect.any(Array));
    expect(alert.mock.calls[0][1]).toContain('Old offer cards');
    expect(alert.mock.calls[0][2]!.map(b => b.text)).toEqual(['common.cancel', 'backup.continueWithoutPdfs']);
    expect(writeAndShare).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();

    choice = 'continue';
    await act(async () => { await r.root.findByType('PassphraseModal').props.onConfirm('my backup pass'); });
    await settle(); await settle();
    expect(writeAndShare).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith('backup.createdTitle', expect.stringContaining('backup.createdBodyOmitted'));
    expect(success.mock.calls[0][1]).toContain('count=1');
    success.mockRestore(); alert.mockRestore();
  });
});
