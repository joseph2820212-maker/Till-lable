jest.mock('expo-file-system/legacy', () => ({ EncodingType: { UTF8: 'utf8', Base64: 'base64' }, readAsStringAsync: jest.fn() }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: (m: unknown) => ({ downloadAsync: async () => {}, localUri: `file:///asset/${String(m)}`, uri: '' }) } }));
import * as FileSystem from 'expo-file-system/legacy';
import { loadLabelFonts } from '../fontsLoader';
import { buildFontFaceCss, fontStack } from '../fonts';

describe('label fonts', () => {
  it('loads all four bundled fonts once and caches them', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('AAAA');
    const a = await loadLabelFonts();
    const b = await loadLabelFonts();
    expect(Object.keys(a).sort()).toEqual(['arabicBold', 'arabicRegular', 'latinBold', 'latinRegular']);
    expect(a).toBe(b);
  });
  it('builds @font-face rules for Latin and Arabic in regular and bold', () => {
    const css = buildFontFaceCss({ latinRegular: 'L4', latinBold: 'L7', arabicRegular: 'A4', arabicBold: 'A7' });
    expect((css.match(/@font-face/g) ?? []).length).toBe(4);
    expect(css).toContain("font-family:'TL Arabic';font-weight:700");
    expect(fontStack('ar').startsWith("'TL Arabic'")).toBe(true);
    expect(fontStack('tr').startsWith("'TL Latin'")).toBe(true);
  });
});
