# G2 acceptance criteria — label engine and first engineering APK

Owner-confirmed scope (international correction, 24 Sep 2026). G2 builds the generic engine; business workflows stay
in G3–G5, but nothing in G2 may make a later label kind impossible or tie it to one country, manufacturer or language.

## Engine

| # | Criterion | Proof |
|---|---|---|
| E1 | Generic geometry: A4, US Letter, A5, A6 and custom page sizes; portrait and landscape; rows, columns, label width and height, four margins, horizontal and vertical gaps | Unit tests for each paper size; custom page accepted when valid |
| E2 | Positions computed from one origin (`x = left + col × (w + gapX)`, `y = top + row × (h + gapY)`); mm → pt converted once (`pt = mm × 72 / 25.4`) with no accumulated rounding | Test: last label of a 3 × 8 and a 5 × 13 grid within ±0.1 mm of the formula |
| E3 | Validation rejects impossible profiles before any PDF: grid outside the page, negative or zero sizes, right/bottom margins that do not add up, safe area outside the label | TL-27 tests with a helpful reason per rule |
| E4 | Start position and unused positions; calibration X/Y offsets applied to the whole grid | Tests: start at label 7 skips 6; offsets move every box equally |
| E5 | Cutting guides for plain paper / card, drawn outside each ticket's safe area | Render test |
| E6 | One authoritative PDF per job (preview, print and share use the same file) with its SHA-256 recorded | Test: the checksum of the previewed file equals the job's |
| E7 | Page size set exactly (`@page { size; margin: 0 }`, width/height in points); no reliance on platform default margins | Generated HTML/page-size assertions; device inspection PENDING |

## Label kinds (schema and renderer must support all; G2 renders the first three end to end)

Standard price · price + unit price · price + barcode rendered in G2. Was/now, percentage off, money off, multibuy,
reduced-to-clear, member / conditional price and A6 / A5 / A4 offer cards: layout slots and data fields proven by a
render smoke test in G2, full workflows in G4.

## Six-language PDF proof

| # | Criterion |
|---|---|
| L1 | Render fixtures in **all six** label languages: English, Arabic (RTL), Turkish, French, Spanish, German. English + Arabic alone is not sufficient |
| L2 | Difficult strings per language: long product names (German compounds, French with articles, Spanish, Turkish with ğ ş ı İ ç ö ü), Arabic with connected shaping |
| L3 | Mixed direction: Arabic name + Latin SKU + EAN barcode + Western digits in the price; barcode bars never mirrored, digits and codes never reordered |
| L4 | Label language independent of app language: e.g. Arabic app rendering an English label and vice versa |
| L5 | Currency independent of language. Every print job and every fixture carries an explicit ISO currency; a job without one fails with `MissingCurrencyError` (no GBP or other default). Required pairs: **EN + GBP, AR + AED, TR + TRY, FR + EUR, ES + EUR, DE + EUR**; plus KWD (3 decimals) and JPY (0 decimals) |
| L6 | Printed prices go through `formatMoney(amountMinor, currencyCode, labelLanguage)` only (already built and tested in the pre-G2 correction). Cross-combination fixtures prove independence: **Arabic app + English label + AED**, **English app + Arabic label + EUR**, German app + French label + EUR, Turkish app + German label + GBP |
| L7 | Embedded fonts cover every glyph used by the six languages (Latin Extended-A for Turkish, Arabic); no system-font fallback. Coverage checked by a test over the fixtures |
| L8 | Required fields (price, unit price, conditions) never shrink below their minimum; a name that cannot fit gets controlled wrapping or an incompatible-format warning (TL-26) |

## Barcodes

EAN-13, EAN-8, UPC-A, Code 128 via `bwip-js/generic`; quiet zones kept; a wrong check digit is rejected, never fixed;
decoded by an independent decoder in tests. Physical scan-back PENDING (TL-24).

## Engineering APK and paper

Recipe for Codex to build an engineering APK (not the review APK). On the Samsung Galaxy S22: preview, print, share.
Paper tests on the initial presets are **PENDING** until printed and measured; manufacturer dimensions alone never
count as a pass.
