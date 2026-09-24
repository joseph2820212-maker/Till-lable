# Reuse manifest (G0)

Sources: TillCalc `e7ea8ca` (TC) and Till Note `b647a481` (TN), inventoried read-only on 24 Sep 2026.
Dispositions: **Reuse unchanged** · **Adapt** · **Extract pure function** · **Do not reuse** · **Not yet located**.
A row becomes "reused" only when the code and its tests are present in TillLabel and pass. At G0 every row is a
plan. Nothing has been copied yet.

## 1. Foundation (from TillCalc)

| Area | Source files | Disposition | Tests carried | Notes / limits |
|---|---|---|---|---|
| UI rules | TC `docs/UI_RULES.md` | Adapt | — | Keep layout, RTL and card discipline. Drop calculator examples. |
| Shared components | TC `src/components/*` (AppButton, AppShared, AppAlert(+Overlay), AppKeyboardScrollView, AppKeyboardBottomSheet, AppSwitch, AppTextInput, InputField, DropdownField, PickerSheet, OtherInputModal, CheckboxRow, RadioRow, FilterChip, ToggleSegment, DatePickerField, ScreenHeader, HeaderTopBleed, DemoBackArrow, ErrorBoundary, DocBlocks, AmountText, BackupPassphraseModal, `result/ResultCard.tsx`, `settings/SettingsRow.tsx`, `settings/SettingsSection.tsx`) | Reuse unchanged | `components/__tests__/*` except `defaultsConfirmBanner`; `r01UiCheckpoint` rewritten | |
| Calculator-only components | TC `DefaultsConfirmBanner`, `QuickMarginCard`, `result/ResultExtras`, `SaveScenarioSheet`, `WorkingsSection`, `fieldLabels`, `saved/SavedItemActions` | Do not reuse | — | Removed in G1 batch 2. |
| Navigation | TC `src/navigation/{AppNavigator,TabNavigator,sharedScreens,tabs}.tsx/ts` | Adapt | `persistentTabBar.test.ts` (new counts) | Tabs become Home · Products · To print · More. Keep one native stack per tab so the tab bar always shows. |
| Theme | TC `src/theme/*` | Reuse unchanged | `colorRegression` (paths updated), `useResponsive` | |
| Hooks | TC `src/hooks/*` | Reuse unchanged | — | |
| i18n | TC `src/i18n.ts`, `src/locales/*`, `native-locales/*` | Adapt | `localeKeyParity` unchanged; `localeLengths` (new BUTTON_KEYS, prefix list, key-count threshold); `localeNoCorruption` (new guarded keys) | Keys are pruned in all six files together. Adds printed-label language separate from app language. |
| Locale tooling | TC `scripts/addLocaleKeys.mjs` | Reuse unchanged | — | |
| Licence inventory | TC `scripts/genOssLicenses.mjs` | Reuse unchanged | `privacyWording` licence assertions | Re-run whenever a dependency is added. |
| Currency | TC `src/utils/currency.ts`, `currencyUnits.ts` | Adapt | `currency.test.ts`, `currencyUnits.test.ts` | `minorUnitsFor` reused for exponents. `roundToMinor` is float, so display only. **International carry-forward (24 Sep 2026):** (1) `currencyAfter()` decides symbol placement from the *app* language, so the label engine must not use it; label symbol and decimal placement come from the currency plus the printed-label language. (2) A fresh install silently defaults to GBP (`_code = 'GBP'`); the first product or first-run setup must ask for the currency explicitly (G3), never assume the UK. |
| Locale helpers | TC `src/utils/locale.ts`, `safeParse.ts` | Reuse unchanged | — | `parseStrictAmount` returns a float, so it is replaced for prices by the new parser. |
| Storage safety | TC `src/utils/storageSafety.ts` | Adapt | `storageSafety.test.ts` | Keep `withStorageKeyLock`, `parseStorageList`, `readStorageList`, `readStorageRawStrict`, `StorageCorruptionError`. Remove `FINANCIAL_STORAGE_WRITE_LOCK` and `SHOPS_WRITE_LOCK` (Till Note leftovers). |
| File I/O | TC `src/storage/fileUtils.ts`, `src/utils/persistPickedFile.ts` | Reuse unchanged | `fileUtils.test.ts` | |
| Secure storage | TC `src/storage/secureStorage.ts` | Adapt | — | Only as needed for the restore marker. New colon-free key names. |
| Error log | TC `src/utils/errorLog.ts` | Adapt | `errorLog.test.ts` | New key namespace `tilllabel:v1:diagnostics:errorLog`. |
| HTML escape / CSV write | TC `htmlEscape.ts`, `csv.ts`, `csvFile.ts`, `csvPreview.ts` | Reuse unchanged | their tests | `csv.ts` gains formula-injection guarding for exports (plan §K). |
| Journal pattern | TC `priceList/storage/repricingStorage.ts` (staged → committed → finish → recover) | Extract pattern | `repricingStorage.test.ts` scenarios reproduced | The file itself is repricing-specific and depends on the pricing engine. TillLabel reimplements the pattern for import commits and print-job confirmation. |
| Build/CI | TC `.github/workflows/ci.yml`, `package.json` scripts, `__mocks__/*`, `plugins/pdfiumAndroidVersion.js`, `android-libs/*` | Adapt | — | Rename "TillCalc" markers. Node 20. |
| Release recipe | TC `docs/RELEASE_RECIPE.md` | Adapt | — | Structure only. Regenerated with TillLabel facts. |

## 2. Catalogue, scanning, import (from TillCalc priceList)

| Area | Source | Disposition | Tests | Notes |
|---|---|---|---|---|
| Barcode normalisation | TC `priceList/utils/barcode.ts` (no imports) | Reuse unchanged | `itemsStorageAndIndex`, `barcodeRoles` (adapted) | `ean13CheckDigit`, `isValidEan13`, `expandUpcE`, `normalizeBarcode`, `barcodesEquivalent`. The raw scanned string is also stored (plan §J). |
| IDs | TC `priceList/utils/ids.ts` | Reuse unchanged | — | `checksum` is djb2: corruption detection only. SHA-256 for PDF and hand-off checksums uses `@noble/hashes`. |
| Search index | TC `priceList/utils/itemIndex.ts` | Adapt | `itemsStorageAndIndex` | Keep `buildIndex`, `searchItems`, `findByBarcode`, `findBySku`, duplicate checks. Drop the pack/cost check in `validateItem`. |
| Scan bus | TC `priceList/utils/scanBus.ts` | Adapt | `scanBus.test.ts` | Scan targets become `product` and `queue`. |
| Scan screen | TC `priceList/screens/ScanScreen.tsx` | Adapt | scan screen tests | Keep camera, permission card, symbologies, 1.5 s duplicate guard, haptics, torch, modes find/add. Remove `costUpdate`, `useRepricingDraft`, `ItemStatusChip`, `parseCalculatorNumber`. |
| Catalogue storage | TC `priceList/storage/{keys,priceListStorage,priceListItemsStorage,draftsStorage}.ts` | Adapt | storage tests | **Coupling to cut first:** `priceListItemsStorage.ts:6` imports `nextRevision` and `priceAffectingFieldsChanged` from `repricingEngine`, which loads `pricingEngine`. Replace with `ids.makeRevision` and a content-fingerprint check. Remove `purchase`, `targetOverride`, `salesTaxRate`. |
| Catalogue UI pieces | TC `priceList/components/{FormCard,LabelRow,BarcodeEditor,AddActionSheet}.tsx` | Adapt | `barcodeRoles.test.tsx` | `BarcodeEditor` uses `parseCalculatorNumber`, which is replaced with the new quantity parser. |
| CSV reading | TC `priceList/utils/csvImport.ts` `parseCsv`, `normaliseHeader` | Extract pure function | `csvImport.test.ts` (parse cases) | |
| CSV numbers | TC `csvImport.ts` `parseNumberCell` | Do not reuse | — | Guesses decimal commas: "1,234" becomes 1.234 (V1). Replaced by a user-confirmed locale-profile parser. |
| CSV matching | TC `matchRows`, `planImport` | Adapt | `csvImport.test.ts` | Types are cost-shaped. The logic of exact SKU/barcode matching and in-file duplicate detection is kept. |
| Cost import | TC `TEMPLATE_COLUMNS`, `REQUIRED_COLUMNS`, `parseTillCalcCsv`, `parseCostUpdateCsv`, `matchCostUpdates` | Do not reuse | — | Cost-specific. TillCalc CSVs are still importable through the generic column mapper. |
| Import screen | TC `priceList/screens/CsvImportScreen.tsx` | Adapt | import screen tests | Keep picker, preview and selection UI. Replace `rowToInput` (defaults-driven costs). Add the mapper, XLSX, the New/Changed/Unchanged/Conflict/Invalid preview and transactional commit. |
| Repricing, targets, costs | TC `itemPricing`, `repricingEngine`, `targetResolver`, `roundingRules`, `listSummary`, `itemForm`, `usePriceListData`, `useRepricingDraft`, `priceListPdfTemplates`, `StatusChip`, screens CostChangedScope/Repricing*/MyTargets/BatchHistory/ItemPriceHistory/PriceListExport/PriceListSettings | Do not reuse | — | Cost and margin features stay in TillCalc. |
| Sample list | TC `priceList/data/sampleList.ts` | Adapt | — | Sample products stay separate from real data (plan §U). |

## 3. PDF, fonts, printing

| Area | Source | Disposition | Tests | Notes |
|---|---|---|---|---|
| PDF file helper | TC `src/utils/pdfFile.ts` (same file exists in TN) | Adapt | `pdfFileReliability.test.ts` | `printHtmlToPdfFile` passes width/height in points to `expo-print`. Retained label PDFs move from `pdf-cache/` to a durable `labels/` folder. |
| Preview screen | TC `src/components/pdf/AppPdfPreviewScreen.tsx` | Adapt | `appPdfPreviewTopAlign.test.ts` | **Always renders at A4 portrait** (V11). It must take the job's page size, or preview the already-generated authoritative file through `sourceUri`. The TillLabel path uses `sourceUri` so preview, print and share use one file (plan §H). |
| Report templates | TC `src/utils/pdfTemplates.ts`, `pdfPageSizes.ts` | Do not reuse for labels | — | Report chrome is not label output. Only `@page { margin: 0 }` and the `dir` handling are taken as ideas. |
| Printing | — | New | new | `Print.printAsync` is not used anywhere in either app. Printing is new work, with the confirmation flow of plan §O. |
| Fonts | `@expo-google-fonts/ibm-plex-sans-arabic` (TTFs in node_modules; `LICENSE_FONT` = SIL OFL 1.1) | Adapt | new PDF font test | Neither app embeds fonts in PDFs (V5). The TTF is bundled as an app asset and injected as a base64 `@font-face`. The Latin companion face is chosen at G2. |
| PDF native viewer | TC `@config-plugins/react-native-pdf`, `react-native-blob-util`, `plugins/pdfiumAndroidVersion.js`, `android-libs/AndroidPdfViewer-4.0.1-tillnote.aar` | Reuse unchanged | — | The Android PDF stability patch comes with its licence file. |
| File name safety | TN `safeStoredFileName` / `buildPdfFilename` strip non-ASCII | Adapt | new | Arabic product names disappear from physical file names, so the display name is kept in the job record. |

## 4. Money and offers

| Area | Source | Disposition | Notes |
|---|---|---|---|
| Exact money | — (neither app has integer minor-unit helpers; TN `money.ts` uses `round2`/epsilon floats) | New | Integer minor units + exponent, one rounding policy, overflow and negative checks (plan §F). |
| Offer arithmetic | TC `calculatorFormulas.ts` `calcDiscount`, `calcMultiBuy` (locked, float, cost-based) | Do not reuse (test oracle only) | V2. |
| Unit price | TC `pricing/utils/measureUnits` (inventory G1) | Extract pure function if exact | Conversion tables only. Arithmetic uses the new exact module. |

## 5. Backup and restore

| Area | Source | Disposition | Tests | Notes |
|---|---|---|---|---|
| Crypto | TC `src/backup/backupCrypto.ts` (TN has the same design) | Reuse unchanged | `backupCrypto.test.ts` | AES-256-GCM + scrypt, KDF bounds. Protected: not edited. |
| Backup core | TC `modules/backup/backupFile.ts` | Adapt | `backupFile.test.ts`, `backupScreen.test.tsx` | Storage-only today. Remove the `cashUp` import and calculator entity counts. New `RESTORABLE_NAMESPACES`. Journal rollback kept. |
| Asset bundling | TN `settingsBackup/utils/backupFile.ts` `documentRoot`, `collectDocumentUrisFromData`, `collectFileAssets`, `planFileRestore`, `rewriteDataFileUris`, `writeFileVerified`, `ensureDirForFile`, staged file transaction 316–556 | Extract pure function | TN `backupFile.test.ts`, `backupRestoreHardening.test.ts` (path traversal, reserved dir, interruption) reproduced | **At `b647a481` asset collection fails closed**: a missing file stops the backup. This corrects V9. The real gaps are no size cap on creation and the whole backup built in memory as one JSON string (V9-revised). TillLabel adds a creation-time cap and a pre-backup size estimate. |
| TN backup dependencies | `financialOperationJournal`, `notificationReconciliation`, `backupSchema`, `demoAsyncStorage`, `SECURE_KEYS` (locked) | Do not reuse | — | Accounting, reminders, demo workspace and Personal Space. The restore marker uses TillLabel's own storage. |
| Backup screen | TC `modules/backup/screens/BackupScreen.tsx` | Adapt | `backupScreen.test.tsx` | Remove `loadCalculatorDefaults` after restore. |

## 6. Billing

| Area | Source | Disposition | Tests | Notes |
|---|---|---|---|---|
| Billing module | TC `src/modules/billing/*` | Adapt | `billingHardening`, `billingService`, `freeLimitSheet` | New product IDs. "TillCalc Pro" is hard-coded in `FreeLimitSheet.tsx` and must be replaced. |
| Limits | TC `priceList/utils/limits.ts` (`FREE_LIMITS`, `LIMIT_CAPS`, `checkLimit`) | Adapt | `limitGate.test.ts` | Move to `billing/limits.ts`. Kinds become `products` (provisional 200) and Pro-only features. Never deletes data. |
| Bypass | TC `useTier.ts` `isBypassActive` (`__DEV__ || EXPO_PUBLIC_BILLING_BYPASS==='1'`, and no RevenueCat key) | Adapt | new build-guard test | Add a prebuild script that fails a production build when the bypass is on (V6, TL-35). |

## 7. Settings, profile, search, legal, help

| Area | Source | Disposition | Notes |
|---|---|---|---|
| More / legal / help / about / support | TC `src/modules/more/*`, `appMeta.ts` | Adapt | Keep the structure, legal parity, support mail and FAQ. Rewrite content for labels. Remove Tax/Target/PaymentFees defaults screens. |
| Settings UI | TN `settingsBackup/components/SettingsComponents.tsx` | Reuse pattern | TC already has `SettingsRow`/`SettingsSection`. TN's version adds cards not needed in R1. |
| Shop profile | TN `settingsBackup/storage/settingsBackupStorage.ts` `Shop`, `saveShop` strict-read-under-lock | Adapt (re-implemented) | One shop: name, currency, timezone, address/phone/email, optional logo. **Not copied**: the same file contains locked `changePin`. |
| Categories / suppliers | TN `businessLists/storage/businessListsStorage.ts` pattern (stable-ID defaults, `i18nKey`, hide-never-delete, `mergeDefaults`), `utils/businessListLabels.ts` `tOrRaw` | Adapt | Drop `shopId` scoping and `deleteSupplierIfUnreferenced` (reads Daily Book). |
| Search | TN `globalSearch/utils/globalSearchHelpers.ts` `filterSearchResults`, `SearchResult` shape, recent-query helpers | Extract pure function | Loader rewritten for products and print history. TN has no Arabic normalisation, so TillLabel adds digit normalisation. |
| Print history files | TN `src/storage/fileStorage.ts` `addFileStrict`/`deleteFile`/`renameFileRecord`, `utils/saveToFileCentre.ts` copy-to-unique-path pattern | Adapt | Remove Till Note folders and the Daily Book shop resolver. |
| In-app viewer | TN `src/components/FileViewerModal.tsx` (locked in TN) | Not needed in R1 | `react-native-pdf` preview covers PDFs. A copy would be taken only if a non-PDF viewer is needed. |
| Onboarding | TN onboarding slides / setup patterns | Adapt (UX only) | No PIN, recovery or vault. First run: language, currency, optional shop name, sample products kept separate. |

## 8. Not yet located

| Item | Where to look | Gate |
|---|---|---|
| Unit-measure conversion tables with exact factors | TC `pricing/utils/measureUnits`, `calculators/utils` | G1 |
| Android VIEW/SEND intent receiver pattern | none in either app; new config plugin | G6 |

## G1 — now present in TillLabel (reused, with their tests)

| Item | Source | Where now | Tests present |
|---|---|---|---|
| Shared components, theme, hooks, i18n, locale tooling | TC | `src/components`, `src/theme`, `src/hooks`, `src/i18n.ts`, `scripts/addLocaleKeys.mjs` | component, theme, locale parity/length/corruption tests |
| Navigation shell (one stack per tab) | TC | `src/navigation/*` (4 tabs) | `persistentTabBar`, `navigationWalk` |
| Storage safety, file utils, secure storage, error log | TC | `src/utils/storageSafety.ts`, `src/storage/fileUtils.ts`, `src/storage/secureStorage.ts`, `src/utils/errorLog.ts` | `storageSafety`, `fileUtils`, `errorLog` |
| Currency and minor units | TC | `src/utils/currency.ts`, `src/utils/currencyUnits.ts` | `currency`, `currencyUnits` |
| Barcode normalisation, ids, scan bus, CSV cell parsing | TC `priceList/utils` | `src/modules/products/utils/*` | `products/__tests__/reusedUtils.test.ts` |
| Backup core (AsyncStorage) + crypto | TC | `src/modules/backup/*`, `src/backup/backupCrypto.ts` (unchanged) | `backupFile`, `backupScreen`, `backupCrypto` |
| Billing (lifetime), limit layer | TC | `src/modules/billing/*` (`limits.ts` moved here) | `billingHardening`, `billingService`, `freeLimitSheet`, `limitGate` |
| More / legal / help / about / support | TC | `src/modules/more/*` | `content`, `legalParity`, `supportMail`, `settingsScreens`, `settingsValidation`, `moreScreenSilentAction` |
| PDF helper and preview | TC | `src/utils/pdfFile.ts`, `src/components/pdf/*` | `pdfFileReliability`, `appPdfPreviewTopAlign`, `csvPreviewModalSafeArea` |

New in G1 (not reused): exact money `src/domain/money.ts` (+ tests), record types `src/domain/types.ts`, storage
keys and backup namespaces `src/storage/keys.ts`, work summary `src/modules/queue/storage/summary.ts` (+ tests),
`TabRootHeader`, `EmptyState`, Home / Products / To print screens.

Removed in G1 (TC code with no TillLabel role): calculators, pricing, compare, saved, cash-up, the whole price-list
module except the utilities above, calculator defaults / history / saved / tax-rate storage, calculator-only
components, the tax / target / fee defaults screens, report PDF templates, the PIN helper.

## International carry-forward (owner correction, 24 Sep 2026)

TillCalc and Till Note were built UK-first. Everything reused into TillLabel keeps the five independent settings of
`SCOPE_LOCK.md` §0: app language, printed-label language, currency, optional country profile and paper format.
Known inherited UK defaults and their handling:

| Inherited behaviour | Where | Handling |
|---|---|---|
| Currency defaults to GBP on first run | `src/utils/currency.ts` | Explicit currency choice in first-run / first product (G3) |
| Currency symbol side follows the app language | `currencyAfter()` in `src/utils/currency.ts` | Not used by the label engine; label formatting takes currency + label language (G2) |
| Legal governing law England and Wales | `legal.terms.p6` | Correct: it is the publisher's governing law, not a claim about the user's country; mandatory local consumer rights are preserved in the same sentence |
| UK £14.99 | `SCOPE_LOCK.md` §4 | UK store price only; other stores use local price points |
