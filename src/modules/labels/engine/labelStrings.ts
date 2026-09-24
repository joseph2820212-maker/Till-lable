/**
 * Words printed ON labels, in the printed-label language (independent of the app language, SCOPE_LOCK §0).
 * Kept apart from the app's i18n bundles on purpose: a label's language is chosen per print job.
 */
import type { LanguageCode, UnitPriceBase } from '../../../domain/types';

export type LabelTextKey =
  | 'was' | 'now' | 'save' | 'percentOff' | 'moneyOff' | 'multibuy' | 'reduced' | 'memberPrice' | 'validUntil' | 'unitPrice'
  | UnitPriceBase;

export const LABEL_TEXT: Record<LanguageCode, Record<LabelTextKey, string>> = {
  en: {
    was: 'Was', now: 'Now', save: 'Save {{amount}}', percentOff: '{{percent}} off', moneyOff: '{{amount}} off',
    multibuy: '{{quantity}} for {{price}}', reduced: 'Reduced', memberPrice: 'Member price', validUntil: 'Until {{date}}',
    unitPrice: '{{price}} {{base}}',
    per_kg: 'per kg', per_100g: 'per 100 g', per_litre: 'per litre', per_100ml: 'per 100 ml', per_metre: 'per metre', per_item: 'each',
  },
  ar: {
    was: 'كان', now: 'الآن', save: 'وفّر {{amount}}', percentOff: 'خصم {{percent}}', moneyOff: 'خصم {{amount}}',
    multibuy: '{{quantity}} بـ {{price}}', reduced: 'مخفَّض', memberPrice: 'سعر الأعضاء', validUntil: 'حتى {{date}}',
    unitPrice: '{{price}} {{base}}',
    per_kg: 'للكيلو', per_100g: 'لكل 100 غ', per_litre: 'للتر', per_100ml: 'لكل 100 مل', per_metre: 'للمتر', per_item: 'للقطعة',
  },
  tr: {
    was: 'Eski fiyat', now: 'Şimdi', save: '{{amount}} tasarruf', percentOff: '{{percent}} indirim', moneyOff: '{{amount}} indirim',
    multibuy: '{{quantity}} adet {{price}}', reduced: 'İndirimli', memberPrice: 'Üye fiyatı', validUntil: '{{date}} tarihine kadar',
    unitPrice: '{{base}} {{price}}',
    per_kg: 'kg fiyatı', per_100g: '100 g fiyatı', per_litre: 'litre fiyatı', per_100ml: '100 ml fiyatı', per_metre: 'metre fiyatı', per_item: 'adet fiyatı',
  },
  fr: {
    was: 'Avant', now: 'Maintenant', save: 'Économisez {{amount}}', percentOff: '{{percent}} de remise', moneyOff: '{{amount}} de remise',
    multibuy: '{{quantity}} pour {{price}}', reduced: 'Prix réduit', memberPrice: 'Prix adhérent', validUntil: 'Jusqu’au {{date}}',
    unitPrice: '{{price}} {{base}}',
    per_kg: 'le kg', per_100g: 'les 100 g', per_litre: 'le litre', per_100ml: 'les 100 ml', per_metre: 'le mètre', per_item: 'l’unité',
  },
  es: {
    was: 'Antes', now: 'Ahora', save: 'Ahorra {{amount}}', percentOff: '{{percent}} de descuento', moneyOff: '{{amount}} de descuento',
    multibuy: '{{quantity}} por {{price}}', reduced: 'Rebajado', memberPrice: 'Precio socio', validUntil: 'Hasta el {{date}}',
    unitPrice: '{{price}} {{base}}',
    per_kg: 'el kg', per_100g: 'los 100 g', per_litre: 'el litro', per_100ml: 'los 100 ml', per_metre: 'el metro', per_item: 'la unidad',
  },
  de: {
    was: 'Vorher', now: 'Jetzt', save: 'Sie sparen {{amount}}', percentOff: '{{percent}} Rabatt', moneyOff: '{{amount}} Rabatt',
    multibuy: '{{quantity}} für {{price}}', reduced: 'Reduziert', memberPrice: 'Mitgliederpreis', validUntil: 'Gültig bis {{date}}',
    unitPrice: '{{price}} {{base}}',
    per_kg: 'je kg', per_100g: 'je 100 g', per_litre: 'je Liter', per_100ml: 'je 100 ml', per_metre: 'je Meter', per_item: 'je Stück',
  },
};

export function labelText(lang: LanguageCode, key: LabelTextKey, vars: Record<string, string | number> = {}): string {
  const template = LABEL_TEXT[lang]?.[key];
  if (template === undefined) throw new RangeError(`missing label text ${lang}.${key}`);
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k) => {
    if (!(k in vars)) throw new RangeError(`missing value {{${k}}} for ${lang}.${key}`);
    return String(vars[k]);
  });
}

const MONTHS: Record<LanguageCode, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
};

/**
 * A validity date printed on a label. Always day + month name + year, never a numeric d/m vs m/d form,
 * so it cannot be misread in another country. Input is a local calendar date YYYY-MM-DD.
 */
export function formatLabelDate(ymd: string, lang: LanguageCode): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new RangeError(`bad date ${ymd}`);
  const [, y, mo, d] = m;
  const month = MONTHS[lang][Number(mo) - 1];
  if (!month) throw new RangeError(`bad month ${ymd}`);
  const day = String(Number(d));
  return lang === 'de' ? `${day}. ${month} ${y}` : `${day} ${month} ${y}`;
}

/** A percentage from hundredths of a percent (2000 = 20 %, 1250 = 12.5 %), with the label language's decimal mark. */
export function formatPercent(hundredths: number, lang: LanguageCode): string {
  if (!Number.isInteger(hundredths) || hundredths <= 0 || hundredths >= 10000) throw new RangeError('percent must be between 0.01 and 99.99');
  const whole = Math.floor(hundredths / 100);
  const frac = String(hundredths % 100).padStart(2, '0').replace(/0+$/, '');
  const dec = lang === 'en' || lang === 'ar' ? '.' : ',';
  return frac ? `${whole}${dec}${frac}` : String(whole);
}

/**
 * A complete percentage as printed in the label language, sign included, so the renderer can isolate it as ONE
 * left-to-right run: "25%" (en) · "25٪" (ar, Arabic percent sign U+066A, Western digits) · "%25" (tr) ·
 * "25 %" (fr: narrow no-break space; es / de: no-break space). Keeping the sign inside the isolated run is what stops an Arabic label
 * printing "%25 خصم" instead of "خصم 25٪" (owner review, 24 Sep 2026).
 */
export function formatPercentText(hundredths: number, lang: LanguageCode): string {
  const n = formatPercent(hundredths, lang);
  switch (lang) {
    case 'ar': return `${n}\u066A`;
    case 'tr': return `%${n}`;
    case 'fr': return `${n}\u202F%`;
    case 'es': case 'de': return `${n}\u00A0%`;
    default: return `${n}%`;
  }
}
