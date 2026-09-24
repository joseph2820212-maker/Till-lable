# G2 report — label engine, owner correction round

Status: **READY FOR OWNER REVIEW** (visual / product hold lifted only by the owner). Physical paper, scan-back and
device checks: **READY FOR OWNER TEST / PENDING**. G3 not started.

## Gate / scope

G2 label engine plus the **G2 Combined Owner Review & Correction Handout (24 Sep 2026)**: targeted corrections only.
The fixed-typography direction and the engine architecture are kept. No screens or routes were added. The G2 screens
remain mockups until the owner approves them.

## What changed (by handout item)

| § | Correction | Where |
|---|---|---|
| 1, 29 | Fixed typography per **{format + layout}**; the renderer only looks up templates and never searches for a smaller size | `labelTemplate.ts` (`templateFor`), test "no dynamic shrinking" |
| 2, 26 | Full **product name** kept as imported (`Product.name`); separate printable **label name** (`Product.labelName`, counter 40); `printableName` / `suggestLabelName` never auto-cut (only lossless whitespace tidying); `ImportField` gains `labelName` | `domain/types.ts`, `domain/productLabel.ts` |
| 3 | SKU and barcode never truncated or rewritten. An SKU that does not fit is left off with a `skuOmitted` warning. Catalogue storage bounds are generous (name 250, pack size 120, SKU 64) and refuse at import instead of cutting | `renderLabel.ts`, `productLabel.ts` |
| 4 | **Global 6-digit cap removed** (`priceTooLong` and `MAX_PRICE_DIGITS` deleted). A price is accepted when the **rendered width** of the exact formatted string (symbol / code, separators, decimals, label locale) fits the format's fixed price box. There is no digit-count rule: `PRICE_DESIGN_DIGITS*` were removed in the decisions round. Too wide → `priceDoesNotFit / needsLargerFormat` ("This price needs a larger label format") | `labelTemplate.ts` |
| 5 | Currency stays an explicit ISO code; `formatMoney(amountMinor, currencyCode, printedLabelLocale)` unchanged apart from an optional `extraDecimals` for unit prices (§11) | `formatMoney.ts` |
| 6 | Arabic money is one isolated run: number, NBSP, symbol inside `<bdi dir="ltr">` (pinned by a test) | `renderLabel.ts` |
| 7 | Arabic percent: `خصم 30٪`. U+066A is kept **inside** the isolated number run (`formatPercentText`); templates carry `{{percent}}` with the sign included | `labelStrings.ts`, regression tests |
| 8 | German `Mitgliederpreis` pinned (the string was already correct; test added so it cannot regress) | test |
| 9 | Promotion barcode is **layout-specific** (`promoBarcode` layout, `RenderOptions.promoBarcode`): off by default, `layoutIncompatible` on tickets and sticker labels, available on A6 / A5 / A4 cards | `layoutCompatibility()` |
| 10, 11 | Safe area: tickets 2.5 mm (was 2), sticker presets 2 mm (was 1.5); `safeInsetBelowRecommended` warning under 2 mm. Unit-price precision independent of the selling price (`unitPrice.extraDecimals`) | `presets.ts`, `geometry.ts` |
| 12 | Barcode layout has its own template: bars 7 mm (was 6.1) at price 24 pt on 70 × 38 — **owner-approved** (scan reliability first) | `labelTemplate.ts` |
| 13, 16 | Yellow band kept. Ink-saving style (outline, no fill) shown on the promotion sheet. Standard labels white with no fill. App UI Till Note cream / navy (tone switch removed from the mockup) | `LABEL_CSS`, mockup |
| 14 | Cards: separate card template (A6 portrait 51.5 pt approved; **A6 landscape 80 pt added**); name ≈ 0.19 × width; price takes the free height, centred (`.pricebox`); "Now" as its own readable line; SKU off by default (`showSku` staff option); pack-size spacing so name descenders never touch it | `cardTemplate`, `renderLabel.ts` |
| 15 | Review captions no longer pair a language with a currency | mockup v4 |
| 17 | More → **Print setup**: Stationery profiles · Label test · **Printer calibration** | mockup v4 |
| 18 | Calibration page: **100 mm reference line**, "Print at 100% / Actual size. Do not use Fit to page.", uniform-offset vs drift guidance in six languages. `classifyCalibration()` → aligned / uniformOffset (0.5 mm steps) / scaling / progressiveDrift | `testPage.ts`, `calibration.ts` |
| 19 | Generic plain-A4 70 × 38 is and was **14-up (2 × 7)**. The earlier 12 was the size of a sample set; evidence sheets now fill all 14. Documented in `PRINTER_STATIONERY_MATRIX.md` | docs, tests |
| 20 | Engine has no manufacturer assumptions (test: "Avery" appears only in `presets.ts`); preset margins stay **Unverified** | test |
| 21 | A4, US Letter, custom pages, orientation, rows, columns, margins, gaps, start / skip positions, calibration offsets: unchanged, already covered by `geometry.test.ts` | — |
| 22, 25 | Six languages everywhere. Realistic 40-character name corpus (`NAME_CORPUS`: upper and title case, German compounds, French accents, Turkish, Arabic) proven on **every compatible layout of every preset**. Mixed-direction tests: Arabic + SKU, Arabic + EAN, English label + AED, Arabic label + EUR, German label + GBP / TRY | `render.test.ts` |
| 23, 24 | `printFlow.ts`: question only after Print → system dialog → return; Yes, printed / Keep waiting / Print again; Share never asks and never marks printed; one PDF identity (SHA-256) through every state | `printFlow.ts` |
| 27 | Member-price conditions have a per-format room (`promoDetail` layout); a condition too long for the smallest format → `tooWide / condition` (needs a larger label); no app-wide minimum | `labelTemplate.ts` |
| 28 | Separate templates: standard · unitPrice · barcode · promo · promoDetail · promoBarcode. A standard label reserves nothing for promotion or barcode elements | `labelTemplate.ts` |

Renderer version bumped to `tl-labels-2`.

## Typography / compatibility matrix

Full generated table: `docs/LABEL_TYPOGRAPHY_MATRIX.md`. Key values:

| Format | Layout | Name | Price | Other |
|---|---|---|---|---|
| 70 × 38 ticket | standard / unit price | 10 pt | 30 pt | SKU 6 pt |
| 70 × 38 ticket | barcode | 10 pt | 24 pt | bars 7 mm, module 0.264 mm |
| 70 × 38 ticket | promo | 10 pt | 22 pt | band 10.5 pt, "Now" 8.5 pt |
| 70 × 38 ticket | promo + details | 10 pt | 17.5 pt | condition room 22 characters |
| 70 × 38 ticket | promo + barcode | **not available** | | needs a larger format |
| A6 card | all | 17.7 pt | 51.5 pt | "Now" 19.5 pt, promo + barcode available |
| A5 card | all | 25.1 pt | 73 pt | |
| A6 landscape card | all (promo + barcode: 48.5 pt) | 17.7 pt | 80 pt | 4 per A4 landscape, "Now" 19.5 pt own line |
| A4 card | all | 36 pt | 80.5 pt | the large-price card |

## Commands actually run

```
npx jest src/modules/labels src/domain --silent                      # focused: 8 suites, 150 passed, 1 skipped
TL_FIXTURE_OUT=<scratch>/g2fixtures npx jest src/modules/labels/engine/__tests__/render.test.ts -t "writes sample"
node shoot.js ; node safecheck.js ; node crop.js ; node zoomshots.js   # Chromium (Playwright) with the embedded fonts
npm run typecheck && npm run lint && npx jest --runInBand --silent   # final
```

## Test counts (final, this SHA)

| Check | Result |
|---|---|
| Typecheck | pass |
| Lint (`--max-warnings 0`) | pass |
| Jest | **51 suites; 474 passed, 1 skipped, 0 failed (475 total)** |

The one skipped test is the evidence writer. It runs only with `TL_FIXTURE_OUT` set, and it ran for this report.

Proof points in the suite:
- six-language render; mixed direction; Arabic percent and money isolation; `Mitgliederpreis`;
- label-name corpus on every layout and preset; no shrinking (source check);
- large prices (9,999,999 JPY · 99,999.99 GBP / AED / MXN · 9,999.999 KWD on the A4 card, six languages);
- width, not digits: £999.99 · 999,99 € · AED 999.99 · ₺999,99 fit A6 portrait and landscape; £9,999.99 fits A6 portrait but AED 9,999.99 needs a larger format; £99,999.99 exceeds A6 landscape and prints on the A4 card; a source check finds no digit constant or digit counting in the engine;
- A6 landscape: 4 per A4 landscape, 80 pt pinned, six languages, RTL and every promotion;
- SKU omission; barcode never rewritten; quiet zones;
- compatibility matrix; pinned typography;
- 14-up sheet; US Letter 612 × 792 pt; exact `@page`; embedded-font glyph coverage (fixtures, corpus, promotions, calibration text);
- calibration classifier; print flow; no hidden currency (`noCurrencyDefault.test.ts`); geometry safe-area warning.

Barcode geometry and decoding: `barcode.test.ts` (independent GS1 decoder), unchanged and passing.

## Evidence

- Measured on the rendered sample pages (Chromium, embedded fonts, glyph-ink boxes from canvas metrics):
  `evidence/safe-area-measurements.json`, script `evidence/safecheck.js`. **0 overlapping elements and 0 elements
  outside a label on all 11 sample sheets (A6 landscape included).** Critical bottom content (SKU, unit price, barcode digits) sits ≥ 2.42 mm
  from the cut on every sheet (tickets 2.88 mm). The closest ink of all is a name accent on the Avery presets at
  1.73 mm; that is the name, not critical content.
- Visual evidence (owner review page, mockup v4, new `v4-` image names): Edit product (product name vs label name,
  no price digit counter), 14-up standard / unit price / barcode sheets, promotion sheet with corrected Arabic and
  German plus ink-saving, A6 / A5 / A4 cards, language and currency independence, More → Print setup, calibration page,
  preview before and after a print attempt.

## Findings opened / closed

| ID | Finding | Status |
|---|---|---|
| G2-F1 | Arabic percent sign outside the isolated number run (printed "%25 خصم") | Fixed, regression test, closed |
| G2-F2 | Global 6-digit price cap and app-wide name / SKU / condition limits could block legitimate catalogue data | Fixed (removed), closed |
| G2-F3 | Offer-card name / pack-size ink could touch at card sizes | Fixed (0.3 em spacing), measured 0 overlaps, closed |
| G2-F4 | Calibration had no scale check | Fixed (100 mm line and classifier), closed |

## Untested / pending

| Item | Why | When |
|---|---|---|
| Paper print of every sheet; 100 mm line measured; first and last label offsets | Needs printer and real stationery | READY FOR OWNER TEST |
| Barcode scan-back (S22, another phone, a shop / EPOS scanner) on printed paper | Automated decoding does not replace it | READY FOR OWNER TEST |
| Engineering APK | No Android SDK here | Codex, from the recipe |
| Avery preset margins | Manufacturer templates not reachable from here; stay **Unverified** (owner: do not wait for sheets) | Separate physical gate after the APK |
| Human review of Arabic / Turkish label and calibration strings | Machine-written | Language reviewer |

## Owner decisions closed (24 Sep 2026)

| Decision | Implemented |
|---|---|
| 70 × 38 barcode ticket: 24 pt price + 7 mm bars; 2.5 mm safe area and full quiet zones kept; no 5.3 mm bars | Pinned test. Scan-back from paper (S22, shop scanner) PENDING |
| A6 portrait price 51.5 pt, approved. No digit-count rule of any kind; compatibility by rendered width | `APPROVED_PRICE_PT`; the width-example tests above; source check |
| Add A6 landscape (high-impact) at about 80 pt; A6 portrait, A5 and A4 kept | `preset_offer_a6_landscape_on_a4`: 80 pt for standard / unit / barcode / promo / details; promo + barcode 48.5 pt (bars take height on the short side; barcode optional, off by default) |
| Remove "accepts N digits" wording | Engine, tests and docs; `LABEL_TYPOGRAPHY_MATRIX.md` regenerated |
| Do not wait for Avery sheets | Presets stay Unverified; paper, calibration and scan-back go to a separate physical gate after the engineering APK |

## Exact final SHA / clean state

Recorded by the commit that contains this report (see `git log -1`). Tree clean after commit.

## Next authorised gate

None until the owner reviews this correction round. **STOP. G3 is not started.**
