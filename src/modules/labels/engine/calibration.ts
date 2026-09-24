/**
 * Printer calibration (owner G2 correction handout §18). A uniform OFFSET (the whole page shifted) is corrected with
 * X / Y offsets in 0.5 mm steps. SCALING (the 100 mm reference line does not measure 100 mm) and progressive DRIFT
 * (the error grows down or across the sheet) cannot be fixed by an offset, and the app must say so instead of
 * pretending a nudge will help.
 *
 * Measurements are how far the printed crosshair sits from where it should be: +x = too far right, +y = too low.
 */
import type { LanguageCode } from '../../../domain/types';

export interface CrosshairError { dxMm: number; dyMm: number }

export interface CalibrationMeasurement {
  /** The printed 100 mm reference line, as measured with a ruler. */
  referenceLineMm: number;
  /** First label (top-left) and last label (bottom-right) crosshairs. */
  first: CrosshairError;
  last: CrosshairError;
}

export type CalibrationVerdict =
  | { kind: 'aligned' }
  | { kind: 'uniformOffset'; offsetXMm: number; offsetYMm: number }
  | { kind: 'scaling'; percent: number }
  | { kind: 'progressiveDrift'; driftXMm: number; driftYMm: number };

/** Tolerances: 0.5 mm on the 100 mm line and between first and last label; ≤ 0.25 mm counts as aligned. */
export const CALIBRATION_TOLERANCE = { scaleMm: 0.5, driftMm: 0.5, alignedMm: 0.25, stepMm: 0.5 } as const;

const toStep = (v: number) => {
  const r = Math.round(v / CALIBRATION_TOLERANCE.stepMm) * CALIBRATION_TOLERANCE.stepMm;
  return r === 0 ? 0 : r; // never -0
};

export function classifyCalibration(m: CalibrationMeasurement): CalibrationVerdict {
  if (!(m.referenceLineMm > 0)) throw new RangeError('reference line must be measured');
  if (Math.abs(m.referenceLineMm - 100) > CALIBRATION_TOLERANCE.scaleMm) return { kind: 'scaling', percent: Math.round(m.referenceLineMm * 10) / 10 };
  const driftX = m.last.dxMm - m.first.dxMm;
  const driftY = m.last.dyMm - m.first.dyMm;
  if (Math.abs(driftX) > CALIBRATION_TOLERANCE.driftMm || Math.abs(driftY) > CALIBRATION_TOLERANCE.driftMm) {
    return { kind: 'progressiveDrift', driftXMm: Math.round(driftX * 10) / 10, driftYMm: Math.round(driftY * 10) / 10 };
  }
  const avgX = (m.first.dxMm + m.last.dxMm) / 2;
  const avgY = (m.first.dyMm + m.last.dyMm) / 2;
  if (Math.abs(avgX) <= CALIBRATION_TOLERANCE.alignedMm && Math.abs(avgY) <= CALIBRATION_TOLERANCE.alignedMm) return { kind: 'aligned' };
  // The correction moves the grid the opposite way to the measured error.
  return { kind: 'uniformOffset', offsetXMm: toStep(-avgX), offsetYMm: toStep(-avgY) };
}

type CalKey = 'actualSize' | 'measureLine' | 'uniform' | 'drift';
/** Words printed on the calibration page, in the app language (it is read by staff, not shoppers). */
export const CALIBRATION_TEXT: Record<LanguageCode, Record<CalKey, string>> = {
  en: {
    actualSize: 'Print at 100% / Actual size. Do not use Fit to page.',
    measureLine: 'This line must measure exactly 100 mm.',
    uniform: 'Same shift on the first and last label: adjust offset X / Y.',
    drift: 'Shift grows down or across the sheet: scaling or paper feed. An offset cannot fix this.',
  },
  ar: {
    actualSize: 'اطبع بنسبة 100% / الحجم الفعلي. لا تستخدم «ملاءمة الصفحة».',
    measureLine: 'يجب أن يكون طول هذا الخط 100 مم بالضبط.',
    uniform: 'الإزاحة نفسها في أول ملصق وآخر ملصق: عدّل الإزاحة X / Y.',
    drift: 'الإزاحة تزداد على طول الورقة: مشكلة تحجيم أو تغذية ورق. الإزاحة لا تصلح ذلك.',
  },
  tr: {
    actualSize: '%100 / Gerçek boyutta yazdırın. Sayfaya sığdır seçeneğini kullanmayın.',
    measureLine: 'Bu çizgi tam 100 mm olmalıdır.',
    uniform: 'İlk ve son etikette aynı kayma: X / Y ofsetini ayarlayın.',
    drift: 'Kayma sayfa boyunca artıyor: ölçekleme veya kâğıt besleme. Ofset bunu düzeltemez.',
  },
  fr: {
    actualSize: 'Imprimez à 100 % / Taille réelle. N’utilisez pas « Ajuster à la page ».',
    measureLine: 'Cette ligne doit mesurer exactement 100 mm.',
    uniform: 'Même décalage sur la première et la dernière étiquette : réglez le décalage X / Y.',
    drift: 'Le décalage augmente sur la feuille : mise à l’échelle ou entraînement du papier. Un décalage ne peut pas corriger cela.',
  },
  es: {
    actualSize: 'Imprima al 100 % / Tamaño real. No use «Ajustar a la página».',
    measureLine: 'Esta línea debe medir exactamente 100 mm.',
    uniform: 'Mismo desplazamiento en la primera y la última etiqueta: ajuste el desplazamiento X / Y.',
    drift: 'El desplazamiento crece a lo largo de la hoja: escala o arrastre del papel. Un desplazamiento no lo corrige.',
  },
  de: {
    actualSize: 'Mit 100 % / Tatsächlicher Größe drucken. Nicht „An Seite anpassen“ verwenden.',
    measureLine: 'Diese Linie muss genau 100 mm lang sein.',
    uniform: 'Gleiche Verschiebung beim ersten und letzten Etikett: Versatz X / Y anpassen.',
    drift: 'Die Verschiebung wächst über das Blatt: Skalierung oder Papiereinzug. Ein Versatz behebt das nicht.',
  },
};
