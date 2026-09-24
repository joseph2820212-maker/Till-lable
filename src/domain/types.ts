/**
 * TillLabel record types (plan §F). Every stored record has a stable id and a
 * schemaVersion so later migrations are explicit. Normal price, temporary
 * promotion and reduction batch are separate records: printing or reducing a
 * label never changes the product's normal price (TL-02, TL-20).
 */
import type { Money } from './money';

export const SCHEMA_VERSIONS = {
  product: 1,
  promotion: 1,
  reductionBatch: 1,
  printIntent: 1,
  printJob: 1,
  stationeryProfile: 1,
  printerCalibration: 1,
  importMapping: 1,
  importBatch: 1,
} as const;

export type IsoDateTime = string;
/** Local calendar date YYYY-MM-DD in the shop's timezone. */
export type LocalDate = string;

export type BarcodeFormat = 'ean13' | 'ean8' | 'upca' | 'code128';

export interface ProductBarcode {
  /** Exactly as scanned or typed: leading zeros and spacing preserved (TL-11). */
  raw: string;
  /** Normalised form used for matching (see products/utils/barcode.ts). */
  normalized: string;
  format: BarcodeFormat | 'unknown';
}

/** What the price is for, so a case price never silently becomes a single-item price. */
export type SellingUnit =
  | { kind: 'each' }
  | { kind: 'pack'; count: number }
  | { kind: 'weight'; grams: number }
  | { kind: 'volume'; millilitres: number }
  | { kind: 'length'; millimetres: number };

/** Base for unit pricing ("per kg", "per 100 ml"). */
export type UnitPriceBase = 'per_kg' | 'per_100g' | 'per_litre' | 'per_100ml' | 'per_metre' | 'per_item';

export interface Product {
  schemaVersion: typeof SCHEMA_VERSIONS.product;
  id: string;
  /**
   * Full catalogue name exactly as imported (EPOS / CSV / XLSX / TillCalc) or typed. Never shortened to fit a
   * label (owner handout §2); only a generous storage bound applies (CATALOGUE_LIMITS.productName).
   */
  name: string;
  /**
   * Printable shelf-label name (≤ LABEL_NAME_MAX). Optional: when absent the full name is printed if it fits;
   * otherwise the user is asked to write one. Editing it never changes `name`.
   */
  labelName?: string;
  /** Optional second line, e.g. size or brand. */
  secondLine?: string;
  /** Final customer selling price (tax included). Never a cost. No digit cap: fit is decided per label format. */
  price: Money;
  sellingUnit: SellingUnit;
  unitPriceBase?: UnitPriceBase;
  /** Which shelf label this product normally prints (standard, with unit price, or with barcode). */
  labelKind?: 'standardPrice' | 'priceUnitPrice' | 'priceBarcode';
  barcodes: ProductBarcode[];
  sku?: string;
  categoryId?: string;
  supplierId?: string;
  shelfLocation?: string;
  /** Changes on every edit to printed content; print intents record the revision they were made for. */
  revision: string;
  status: 'active' | 'archived';
  isSample: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type PromotionType =
  | { kind: 'wasNow'; referencePrice: Money }
  | { kind: 'percentOff'; percentHundredths: number }
  | { kind: 'moneyOff'; amount: Money }
  | { kind: 'multibuy'; quantity: number; totalPrice: Money }
  | { kind: 'conditional'; condition: string; conditionalPrice: Money };

export interface Promotion {
  schemaVersion: typeof SCHEMA_VERSIONS.promotion;
  id: string;
  name: string;
  productIds: string[];
  type: PromotionType;
  /** Printed conditions, e.g. "Mix and match across the range". */
  conditions?: string;
  startDate?: LocalDate;
  endDate?: LocalDate;
  status: 'draft' | 'active' | 'ended';
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ReductionBatch {
  schemaVersion: typeof SCHEMA_VERSIONS.reductionBatch;
  id: string;
  productId?: string;
  /** Snapshot of what was on the label, so a one-off reduction needs no catalogue entry. */
  productName: string;
  normalPrice: Money;
  reducedPrice: Money;
  copies: number;
  reason?: string;
  createdAt: IsoDateTime;
}

export type PrintPurpose = 'normal' | 'promotion' | 'reduction';

export interface PrintIntent {
  schemaVersion: typeof SCHEMA_VERSIONS.printIntent;
  id: string;
  purpose: PrintPurpose;
  productId?: string;
  promotionId?: string;
  reductionId?: string;
  /** Product revision the label content was taken from. */
  productRevision?: string;
  /** Hash of everything that appears on the printed label. Hidden notes never change it. */
  contentFingerprint: string;
  layoutId: string;
  labelKind: LabelKind;
  /** Printed-label language, independent of the app language. */
  labelLanguage: LanguageCode;
  copies: number;
  reason: 'new' | 'priceChanged' | 'contentChanged' | 'manual' | 'import' | 'handoff';
  status: 'waiting' | 'printed' | 'removed';
  createdAt: IsoDateTime;
  /** Frozen label content for one-off labels (Quick label, reductions without a product). */
  snapshot?: import('../modules/labels/engine/renderLabel').LabelContent;
  /** Short name shown in the queue list (never printed). */
  title?: string;
  updatedAt?: IsoDateTime;
}

export interface PrintJobLine {
  intentId: string;
  contentFingerprint: string;
  copies: number;
  /** Copies the user confirmed printed (partial pages, TL-19). */
  confirmedCopies: number;
}

export interface PrintJob {
  schemaVersion: typeof SCHEMA_VERSIONS.printJob;
  id: string;
  lines: PrintJobLine[];
  stationeryProfileId: string;
  layoutId: string;
  rendererVersion: string;
  /** Durable copy of the exact PDF that was previewed and printed. */
  pdfUri: string;
  /** Human-readable file name (may contain non-Latin text; the stored file name stays ASCII, V14). */
  displayName: string;
  pdfSha256: string;
  startPosition: number;
  status: 'generated' | 'sentToPrinter' | 'confirmed' | 'partiallyConfirmed' | 'cancelled';
  createdAt: IsoDateTime;
  confirmedAt?: IsoDateTime;
  /** The PDF is not on this phone: it was left out of a backup (missing or damaged, user agreed) or came from an older backup. pdfUri is ''. */
  pdfUnavailable?: boolean;
}

export type Material = 'shelfEdgeInsert' | 'adhesiveSheet' | 'plainPaper' | 'card' | 'promoCard';

/**
 * Page size. Named sizes carry their standard dimensions; `custom` uses pageWidthMm / pageHeightMm as entered.
 * The engine is generic: A4 and US Letter are both first-class, and no size is tied to a country or manufacturer.
 */
export type PaperSize = 'A4' | 'Letter' | 'A5' | 'A6' | 'custom';

/**
 * What a label shows. Independent of stationery, language, currency and country (docs/SCOPE_LOCK.md §0).
 * Every kind must render in all six languages; Pro gating is decided in billing/limits.ts, not here.
 */
export type LabelKind =
  | 'standardPrice'
  | 'priceUnitPrice'
  | 'priceBarcode'
  | 'wasNow'
  | 'percentOff'
  | 'moneyOff'
  | 'multibuy'
  | 'reducedToClear'
  | 'memberPrice'
  | 'offerCardA6'
  | 'offerCardA5'
  | 'offerCardA4';

/** The six app / printed-label languages. */
export type LanguageCode = 'en' | 'ar' | 'tr' | 'fr' | 'es' | 'de';

/**
 * Optional country guidance profile (e.g. 'GB'). Guidance only: it never changes the engine, the data model,
 * the currency or the label language, and no jurisdiction-specific claim is shown without a cited source.
 */
export type CountryProfileId = string;

/**
 * The five independent settings (docs/SCOPE_LOCK.md §0). Changing one never silently changes another:
 * e.g. Arabic app + English printed label + AED + a custom 70 × 38 mm ticket is valid.
 */
export interface IndependentSettings {
  /** App interface language (i18n). */
  appLanguage: LanguageCode;
  /** Default printed-label language for new labels; each PrintIntent records its own. */
  labelLanguage: LanguageCode;
  /** ISO 4217 currency for new products; each Product keeps its own price currency. */
  currency: string;
  /** Optional guidance profile; null = none. */
  countryProfile: CountryProfileId | null;
  /** Default stationery profile; each PrintJob records the one it used. */
  stationeryProfileId: string | null;
}
export type VerificationStatus = 'userDefined' | 'geometryVerified' | 'paperVerified' | 'unverified';

/** Millimetres throughout; converted to PDF points once (plan §G). */
export interface StationeryProfile {
  schemaVersion: typeof SCHEMA_VERSIONS.stationeryProfile;
  id: string;
  name: string;
  manufacturerCode?: string;
  paper: PaperSize;
  orientation: 'portrait' | 'landscape';
  pageWidthMm: number;
  pageHeightMm: number;
  rows: number;
  columns: number;
  labelWidthMm: number;
  labelHeightMm: number;
  marginTopMm: number;
  marginLeftMm: number;
  /**
   * Right / bottom margins as printed on the manufacturer's sheet, when known. The grid is positioned from
   * top/left; when these are given the validator checks that top + rows×height + gaps + bottom = page height
   * (and likewise across) so a mistyped profile is rejected before it reaches the printer.
   */
  marginRightMm?: number;
  marginBottomMm?: number;
  gapXMm: number;
  gapYMm: number;
  safeInsetMm: number;
  cornerRadiusMm?: number;
  material: Material;
  /** False for adhesive sheets: a used sheet must not be fed again (TL-28). */
  refeedSafe: boolean;
  verification: VerificationStatus;
  verificationSource?: string;
  /** True for bundled manufacturer presets (convenience only); false for user-created profiles. */
  isPreset: boolean;
}

export interface PrinterCalibration {
  schemaVersion: typeof SCHEMA_VERSIONS.printerCalibration;
  id: string;
  /** User-named printer; the OS rarely exposes a stable printer identity. */
  printerName: string;
  stationeryProfileId: string;
  offsetXMm: number;
  offsetYMm: number;
  /** Set after a restore on a new device: the offsets must be checked again. */
  needsRecheck: boolean;
  notes?: string;
  updatedAt: IsoDateTime;
}

export type ImportField = 'name' | 'labelName' | 'secondLine' | 'price' | 'sellingUnit' | 'barcode' | 'sku' | 'category' | 'supplier' | 'shelfLocation' | 'unitPriceBase' | 'ignore';

export interface ImportMapping {
  schemaVersion: typeof SCHEMA_VERSIONS.importMapping;
  id: string;
  name: string;
  sourceFormat: 'csv' | 'xlsx';
  /** Hash of the header row, to offer the mapping again for the same file layout. */
  headerSignature: string;
  columns: { header: string; field: ImportField }[];
  numberProfile: { decimal: '.' | ','; grouping: ',' | '.' | ' ' | "'" | 'none' };
  /** Asked, never assumed: does the price column include tax? */
  pricesIncludeTax: boolean;
  createdAt: IsoDateTime;
}

export interface ImportBatch {
  schemaVersion: typeof SCHEMA_VERSIONS.importBatch;
  id: string;
  source: 'csv' | 'xlsx' | 'tillcalc';
  fileName: string;
  /** SHA-256 of the imported file, so re-importing the same file creates nothing new (TL-09). */
  fileSha256: string;
  counts: { new: number; changed: number; unchanged: number; conflict: number; invalid: number };
  queueOnImport: boolean;
  committedAt?: IsoDateTime;
  state: 'previewed' | 'committed' | 'abandoned';
}
