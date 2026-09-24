/**
 * Label settings (docs/SCOPE_LOCK.md §0): the printed-label language is its own setting, independent of the app
 * language and the currency. Unset means "same as the app language" and is shown that way; nothing else defaults.
 */
import { useSyncExternalStore } from 'react';
import { TL_KEYS } from '../../../storage/keys';
import { readObject, writeObject } from '../../../storage/repo';
import type { LanguageCode } from '../../../domain/types';

export type ShelfKind = 'standardPrice' | 'priceUnitPrice' | 'priceBarcode';

export interface LabelSettings {
  /** Printed-label language; null = same as the app language. */
  labelLanguage: LanguageCode | null;
  /** Stationery profile used when nothing else is chosen. */
  defaultProfileId: string;
  /** Label type for new products. */
  defaultKind: ShelfKind;
  /** Offer band: yellow fill, or outline only for coloured stock. */
  promoStyle: 'promo' | 'inkSaving';
  /** Staff option: print the SKU on customer-facing offer cards. */
  showSkuOnCards: boolean;
  /** Print the barcode on promotions where the format allows it. */
  promoBarcode: boolean;
  /** Extra unit-price decimals (0 = the currency's own). */
  unitPriceExtraDecimals: 0 | 1 | 2;
}

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  labelLanguage: null,
  defaultProfileId: 'preset_shelf_70x38_a4',
  defaultKind: 'standardPrice',
  promoStyle: 'promo',
  showSkuOnCards: false,
  promoBarcode: false,
  unitPriceExtraDecimals: 0,
};

export interface ShopProfile { name: string; }
export const DEFAULT_SHOP: ShopProfile = { name: '' };

let current: LabelSettings = DEFAULT_LABEL_SETTINGS;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach(l => l()); };

export async function loadLabelSettings(): Promise<LabelSettings> {
  current = await readObject<LabelSettings>(TL_KEYS.labelSettings, DEFAULT_LABEL_SETTINGS);
  emit();
  return current;
}
export const getLabelSettings = (): LabelSettings => current;

export async function saveLabelSettings(patch: Partial<LabelSettings>): Promise<LabelSettings> {
  const next = { ...current, ...patch };
  await writeObject(TL_KEYS.labelSettings, next);
  current = next;
  emit();
  return next;
}

/** The language labels print in: the setting, or the app language when unset. */
export function resolveLabelLanguage(s: LabelSettings, appLanguage: string): LanguageCode {
  const app = (['en', 'ar', 'tr', 'fr', 'es', 'de'] as const).find(l => appLanguage.startsWith(l)) ?? 'en';
  return s.labelLanguage ?? app;
}

export function useLabelSettings(): LabelSettings {
  useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => version);
  return current;
}

export const loadShop = () => readObject<ShopProfile>(TL_KEYS.shop, DEFAULT_SHOP);
export const saveShop = (s: ShopProfile) => writeObject(TL_KEYS.shop, s);

export const __resetLabelSettingsForTests = () => { current = DEFAULT_LABEL_SETTINGS; emit(); };
