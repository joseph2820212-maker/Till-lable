/** Shared G2 fixtures: difficult real-world strings in all six label languages, each with an explicit currency. */
import fs from 'fs';
import path from 'path';
import { moneyFromMinor } from '../../../../domain/money';
import type { LanguageCode } from '../../../../domain/types';
import type { LabelContent } from '../renderLabel';
import type { LabelFontData } from '../fonts';

const root = path.resolve(__dirname, '../../../../..');
const ttf = (p: string) => fs.readFileSync(path.join(root, 'node_modules/@expo-google-fonts', p)).toString('base64');
export const TEST_FONTS: LabelFontData = {
  latinRegular: ttf('ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf'),
  latinBold: ttf('ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf'),
  arabicRegular: ttf('ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf'),
  arabicBold: ttf('ibm-plex-sans-arabic/700Bold/IBMPlexSansArabic_700Bold.ttf'),
};

/** The six required language + currency pairs (G2 acceptance L5), with realistic till-length names (≤ 40 characters). */
export const PAIRS: { lang: LanguageCode; currency: string; name: string; second: string; priceMinor: number; unitMinor: number; barcode: string; sku: string }[] = [
  { lang: 'en', currency: 'GBP', name: 'Heinz Cream of Tomato Soup Family Pack', second: '4 × 400 g', priceMinor: 449, unitMinor: 281, barcode: '5000157024671', sku: 'HNZ-TOM-4PK' },
  { lang: 'ar', currency: 'AED', name: 'حليب طازج كامل الدسم من العين', second: 'عبوة 2 لتر', priceMinor: 1275, unitMinor: 638, barcode: '6291003000010', sku: 'ALN-MILK-2L' },
  { lang: 'tr', currency: 'TRY', name: 'Doğal Çiçek Balı İnce Süzme Kavanoz', second: '850 g cam kavanoz', priceMinor: 28990, unitMinor: 34106, barcode: '8690504000013', sku: 'BAL-850-CAM' },
  { lang: 'fr', currency: 'EUR', name: 'Crème fraîche épaisse d’Isigny AOP', second: 'Pot de 20 cl', priceMinor: 289, unitMinor: 1445, barcode: '3017620422003', sku: 'ISI-CF-20' },
  { lang: 'es', currency: 'EUR', name: 'Aceite de oliva virgen extra Cazorla', second: 'Botella de 1 l', priceMinor: 1149, unitMinor: 1149, barcode: '8410660001019', sku: 'AOVE-CAZ-1L' },
  { lang: 'de', currency: 'EUR', name: 'Bio-Vollmilchschokolade mit Haselnüssen', second: 'Qualitätsprodukt · 250 g', priceMinor: 349, unitMinor: 1396, barcode: '4000417025005', sku: 'SCHO-HN-250' },
];

export function standardContent(i: number, kind: LabelContent['kind'] = 'standardPrice'): LabelContent {
  const p = PAIRS[i];
  const base: LabelContent = { kind, language: p.lang, name: p.name, secondLine: p.second, price: moneyFromMinor(p.priceMinor, p.currency), sku: p.sku };
  if (kind === 'priceUnitPrice') base.unitPrice = { amount: moneyFromMinor(p.unitMinor, p.currency), base: p.lang === 'es' ? 'per_litre' : 'per_kg' };
  if (kind === 'priceBarcode') base.barcode = { value: p.barcode, format: 'ean13' };
  return base;
}
