# Dependency decisions (G0)

Checked 24 Sep 2026 from the npm registry and a local install in scratch. Versions are pinned exactly when added.

| Need | Decision | Version / licence | Evidence | Rejected alternative |
|---|---|---|---|---|
| Barcode drawing (EAN-13, EAN-8, UPC-A, Code 128) | **`bwip-js`, imported from `bwip-js/generic`** | 4.11.4 · MIT | The generic entry imports only its own `bwipp.mjs` (no zlib, DOM or native module). `toSVG` produced SVG for all four formats. A wrong EAN-13 check digit (`5012345678901`) is rejected with `ean13badCheckDigit`, never silently corrected. | `bwip-js/react-native` imports `react-zlib-js`, which is not a declared dependency, so it would fail to resolve. JsBarcode needs a DOM or canvas. An in-house encoder is ruled out by plan §J. |
| XLSX reading | **Bounded reader: `fflate` (unzip) + small in-house OOXML reader** for `workbook.xml`, `sharedStrings.xml` and one worksheet's cached values | fflate 0.8.3 · MIT | Size and entry caps are applied before and during unzip. No formulas evaluated, no external links followed. Prototype built and fuzzed at G3 with hostile fixtures (TL-14). | npm `xlsx` 0.18.5 is the last npm release and `npm audit` reports two high advisories: GHSA-4r6h-8v6p-xvw6 (prototype pollution, fixed only in 0.19.3) and GHSA-5pgg-2g8v-p4x9 (ReDoS, fixed only in 0.20.2). Patched builds are published only on the SheetJS CDN. |
| XML parsing inside XLSX | Decide at G3: `fast-xml-parser` or a minimal scanner limited to the three OOXML parts | fast-xml-parser 5.11.1 · MIT | Chosen on hostile-fixture results and bundle size. | — |
| Test-only barcode decode (independent oracle) | Decide at G2: `@zxing/library` decoding a rasterised bar pattern, or an independent module-width decoder written against the GS1 tables | @zxing/library 0.23.0 · Apache-2.0 | The plan (§J) requires decoding by something other than the encoder. Physical scan-back (TL-24) is still required. | Same encoder checking its own output. |
| Fonts in label PDFs | Embed as base64 `@font-face`: one Latin family and one Arabic family, both SIL OFL, bundled locally | licence files shipped with the app | TillCalc's PDF templates name DM Sans / Newsreader but embed nothing, so output falls back to system fonts (V5). The exact files are chosen at G2 from assets already bundled in TillCalc, or added with their OFL text. | Relying on device system fonts. |
| CSV | Reuse TillCalc `parseCsv` (quoting, BOM) only | in-repo | TillCalc `parseNumberCell` guesses decimal commas, so "1,234" becomes 1.234 (V1). A new locale-profile number parser replaces it. | Reusing `parseNumberCell`. |
| Money | New integer minor-unit module; reuse TillCalc `minorUnitsFor` for exponents | in-repo | Plan §F forbids float money (V2). | Reusing float calculator formulas. |

No analytics, crash-reporting or network SDK is added. Every new dependency is entered in the licence inventory
(`scripts/genOssLicenses.mjs`, carried over from TillCalc) in the same commit that adds it.
