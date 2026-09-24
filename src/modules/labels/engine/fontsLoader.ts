/**
 * Loads the four bundled label fonts as base64 (native side). The TTFs ship inside the app bundle via Metro's
 * asset system, so this works offline. Kept apart from fonts.ts so the pure engine stays testable without assets.
 */
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import type { LabelFontData } from './fonts';

const MODULES: Record<keyof LabelFontData, number> = {
  latinRegular: require('@expo-google-fonts/ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf'),
  latinBold: require('@expo-google-fonts/ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf'),
  arabicRegular: require('@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf'),
  arabicBold: require('@expo-google-fonts/ibm-plex-sans-arabic/700Bold/IBMPlexSansArabic_700Bold.ttf'),
};

let cache: Promise<LabelFontData> | null = null;

/** Read each font once per app session; a failure clears the cache so the next attempt retries. */
export function loadLabelFonts(): Promise<LabelFontData> {
  if (!cache) {
    cache = (async () => {
      const out = {} as LabelFontData;
      for (const key of Object.keys(MODULES) as (keyof LabelFontData)[]) {
        const asset = Asset.fromModule(MODULES[key]);
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        out[key] = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        if (!out[key]) throw new Error(`label font ${key} is empty`);
      }
      return out;
    })().catch(e => { cache = null; throw e; });
  }
  return cache;
}
