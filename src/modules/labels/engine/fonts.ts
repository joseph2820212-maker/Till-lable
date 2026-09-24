/**
 * Embedded label fonts (docs/gates/G02/ACCEPTANCE.md L7). IBM Plex Sans covers Latin including Turkish
 * (ğ ş İ ı) and the narrow no-break space; IBM Plex Sans Arabic covers Arabic. Both SIL OFL 1.1.
 * Labels never rely on device system fonts, so the PDF looks the same on every phone and offline.
 */
export interface LabelFontData {
  latinRegular: string;
  latinBold: string;
  arabicRegular: string;
  arabicBold: string;
}

export const FONT_FAMILY_LATIN = 'TL Latin';
export const FONT_FAMILY_ARABIC = 'TL Arabic';

/** @font-face rules with the fonts inlined as base64 data URIs. */
export function buildFontFaceCss(f: LabelFontData): string {
  const face = (family: string, weight: number, b64: string) =>
    `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
  return [
    face(FONT_FAMILY_LATIN, 400, f.latinRegular),
    face(FONT_FAMILY_LATIN, 700, f.latinBold),
    face(FONT_FAMILY_ARABIC, 400, f.arabicRegular),
    face(FONT_FAMILY_ARABIC, 700, f.arabicBold),
  ].join('\n');
}

/** Font stack for a label language: its primary script first, the other for any mixed-script text. */
export function fontStack(lang: string): string {
  return lang === 'ar' ? `'${FONT_FAMILY_ARABIC}','${FONT_FAMILY_LATIN}'` : `'${FONT_FAMILY_LATIN}','${FONT_FAMILY_ARABIC}'`;
}
