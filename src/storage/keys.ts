/**
 * TillLabel storage keys. Every persisted key is `<namespace>:<name>`; the
 * backup allowlist is built from BACKUP_NAMESPACES so a key outside these
 * namespaces can never be restored (docs/REUSE_MANIFEST.md §5).
 */
export const TL_KEYS = {
  products: 'products:items',
  categories: 'products:categories',
  suppliers: 'products:suppliers',
  promotions: 'promotions:items',
  reductions: 'reductions:batches',
  queue: 'queue:intents',
  jobs: 'jobs:index',
  stationery: 'stationery:profiles',
  calibration: 'stationery:calibration',
  importMappings: 'imports:mappings',
  importBatches: 'imports:batches',
  shop: 'settings:shop',
  labelSettings: 'settings:labels',
  /** Fingerprint of what was last printed per product label (changed-only queue). */
  printed: 'queue:printed',
} as const;

/** Namespaces that belong in a backup. Drafts, billing cache, journals and device-only keys are excluded. */
export const BACKUP_NAMESPACES = ['settings', 'products', 'promotions', 'reductions', 'queue', 'jobs', 'stationery', 'imports'] as const;
