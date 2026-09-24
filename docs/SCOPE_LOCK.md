# Scope lock — TillLabel Release 1

Source: plan TNF-TL-R1-PLAN-1.1 §A, owner decisions of 24 Sep 2026, G0 validation (V1–V10).
A requirement may not be dropped silently. Changes are recorded in §5 with their effect.

## 0. Product definition (owner correction, 24 Sep 2026)

TillLabel Release 1 is a **six-language international app**: English, Arabic, Turkish, French, Spanish, German. It is
not a UK shelf-label app with translations. UK price-marking guidance is one country reference, not the product
definition, and it must not shape the architecture, data model, UI, unit-price engine or print engine.

**Five independent settings.** Changing one never silently changes another:

| # | Setting | Where it lives | Notes |
|---|---|---|---|
| 1 | App language | i18n (`app:language`) | UI only |
| 2 | Printed-label language | default in settings; recorded on every PrintIntent | Any of the six, regardless of the app language |
| 3 | Currency | default for new products; every Product keeps its own | Symbol and decimal placement on labels follow the currency + label language, never the app language |
| 4 | Country / regulatory profile | optional, guidance only (`docs/REGULATORY_PROFILES.md`) | Never changes engine, data, currency or language |
| 5 | Paper / label format | stationery profile | Independent of country; A4, US Letter, A5, A6 and custom pages |

Example that must be valid: Arabic app + English printed label + AED + a custom 70 × 38 mm shelf ticket.

**Currency rule (owner correction, 24 Sep 2026).** There is no default currency anywhere in TillLabel. Until the user
chooses one, the currency is unset. Currencies are stored as ISO 4217 codes, never only as a symbol (£, $, kr are
ambiguous). Printed prices are formatted by `formatMoney(amountMinor, currencyCode, labelLanguage)`; the app language
never overrides printed formatting, and a job without a currency fails clearly instead of assuming one.
Schema: `IndependentSettings`, `LanguageCode`, `LabelKind`, `PaperSize` in `src/domain/types.ts`.

**Label kinds the architecture supports:** standard price; price + unit price; price + barcode; was/now; percentage
off; money off; multibuy; reduced-to-clear; member / conditional price; A6, A5 and A4 offer cards; any of these on
custom sheet layouts. Business workflows arrive in G3–G5; the engine and schema must never make a kind impossible or
country-specific.

**Stationery is generic.** Categories: shelf-edge inserts / tickets, adhesive sticker sheets, plain paper / card with
cutting guides, promotional cards (A6 / A5 / A4). A shop anywhere can enter rows, columns, label size, margins, gaps
and orientation for any sheet. Manufacturer presets (Avery etc.) are conveniences on top and can grow without
changing the app.

## 1. Included (Release 1)

| ID | Requirement | Plan § | Acceptance tests |
|---|---|---|---|
| R-01 | Quick one-off label: description, price, copies, saved print setup; optional save | I | TL-01 |
| R-02 | Saved product catalogue: add, edit, duplicate, archive/delete, search, filter, bulk select | I, R | TL-11, TL-12, TL-40 |
| R-03 | Standard shelf price label with optional second line, unit price and barcode, in any of the six label languages and any currency | D, G, M, P | TL-05, TL-22, TL-25, TL-26 |
| R-04 | Offers: was/now, percentage off, money off, fixed-quantity multibuy, conditional/member price, optional dates | M | TL-03, TL-41 |
| R-05 | Reduced-to-clear batches stored apart from the normal price | M | TL-02, TL-20 |
| R-06 | Changed-only print queue (content fingerprint, copy counts, stale-preview detection) | N | TL-06, TL-07, TL-15, TL-16 |
| R-07 | Generic physical-layout engine: A4, US Letter, A5, A6 and custom pages; rows, columns, label size, four margins, gaps, orientation, start position, calibration offsets. Initial presets (owner, 24 Sep 2026): 70 × 38 mm shelf-edge ticket (priority), Avery L7160 / L7159 / L7163, plain A4 / card with cutting guides. Custom sheet editor is Pro. Physical tests of L7651 and a US Letter product deferred; US Letter geometry is supported from G2 | G | TL-22, TL-27, TL-28 |
| R-08 | One exact PDF per job for preview, print and export, with checksum | H | TL-18, TL-22, TL-45 |
| R-09 | Printer/stationery profiles, calibration page, 0.5 mm nudges, placement map | O | TL-23, TL-28 |
| R-10 | Print confirmation after the dialog (Confirm printed / Keep waiting / Reprint), partial pages, history | O | TL-17, TL-19, TL-21 |
| R-11 | Barcode scan to find/add; offline barcode rendering EAN-13, EAN-8, UPC-A, Code 128 | J | TL-11, TL-24, TL-25 |
| R-12 | CSV and genuine XLSX import with column mapping, locale profile, preview, transactional commit, saved mappings | K | TL-06, TL-09, TL-13, TL-14 |
| R-13 | TillCalc hand-off file `tillfamily.price-change` v1 (approved selling prices only) | L | TL-07–TL-10, TL-36, TL-46 |
| R-14 | Fixed A4, A5, A6 offer cards (yellow and ink-saving designs) | M | TL-26 |
| R-15 | Six languages (en, ar, tr, fr, es, de) for the app AND for printed labels, chosen independently; currency and country profile independent too (§0) | P | TL-25, TL-26, TL-39 |
| R-16 | Encrypted backup/restore including retained PDFs; staged restore with recovery | Q | TL-30–TL-32 |
| R-17 | Lifetime Pro framework; review build unlocked; production build rejects bypass | S | TL-33–TL-35 |
| R-18 | Settings, one shop profile, product and history search, help, FAQ, legal, support (family template) | R | TL-39 |
| R-19 | Security, accessibility and performance checks (2,000 normal / 10,000 stress) | T | TL-14, TL-40 |
| R-20 | Standalone Android review APK with build manifest and checksums | X, Y | TL-37, TL-38, TL-44 |

## 2. Excluded

EPOS/till; stock management; accounting; supplier purchasing; margin planning; free-form design canvas; cloud
catalogue; live POS APIs; electronic shelf labels; ingredient/allergen labels; weighing-scale and variable-price
barcodes; thermal-printer SDKs (a later, separately approved project); iOS build and TestFlight (later gate).

## 3. Model rules

- Normal price, temporary promotion and reduction batch are three separate records. Printing a label never changes
  the till.
- Money is exact: integer minor units plus currency exponent. No binary floating point in price arithmetic (V2).
- Price fields are the final customer selling price. Net-price imports need an explicit reviewed conversion.
- App language, printed language, currency and shop timezone are independent settings.

## 4. Commercial settings (owner-approved 24 Sep 2026)

Lifetime purchase only; no subscription in Release 1. Launch price **£14.99 in the UK store**; every other country uses
the nearest local price point, set in the stores and RevenueCat, not in code. The review APK unlocks everything.

| Free | Pro (lifetime) |
|---|---|
| Up to 200 saved products | Unlimited products |
| Quick label | Was/now |
| Standard shelf-price label | Percentage off |
| Price + barcode label | Money off |
| Unit-price label | Multibuy |
| CSV and TillCalc import | Reduced-to-clear |
| Real PDF preview | A4 / A5 / A6 offer cards |
| Calibration and test printing | Custom sheet layouts |
| Unlimited normal printing | Multiple saved printer / stationery profiles |
| Backup and restore | Advanced bulk workflows and queue filters |
| All six languages | |
| Existing data is never locked | |

A limit only stops adding new Pro capacity. Existing or restored data is never deleted, hidden or locked (TL-33).
The feature lists are pinned in code in `src/modules/billing/limits.ts` (`FREE_FEATURES`, `PRO_FEATURES`).

## 5. Owner decisions and changes

| Date | Decision | Effect |
|---|---|---|
| 24 Sep 2026 | New repo `tilllabel`, work on `main` | Replaces plan §B branch `build/tilllabel-r1` |
| 24 Sep 2026 | TillCalc exporter = one commit on TillCalc `main`, only after owner approval at G6 | Replaces plan §L exporter branch |
| 24 Sep 2026 | Till Note baseline = `codex/testflight-1.0.5-ui-fixes-20260915` @ `b647a481` | Replaces plan §B reference `6fa6e941` |
| 24 Sep 2026 | Reference Android phone: **Samsung Galaxy S22** (review APK, scanning, performance, PDF preview, printing). A slower second Android is desirable later, not a blocker | `ACCEPTANCE_BUDGETS.md`, device evidence |
| 24 Sep 2026 | Release-1 stationery: 70 × 38 mm shelf-edge (priority), L7160, L7159, L7163, plain A4/card with guides, custom editor (Pro); L7651 and 5160 deferred | R-07, `PRINTER_STATIONERY_MATRIX.md` |
| 24 Sep 2026 | Free / Pro split as in §4 | §4, `billing/limits.ts` |
| 24 Sep 2026 | Pro is lifetime only, UK £14.99, no subscription | §4; recorded in the G10 release recipe |
| 24 Sep 2026 | **International scope correction:** six-language international app; five independent settings (§0); generic engine with presets on top; UK guidance is one optional country profile | §0, R-03, R-07, R-15, `REGULATORY_PROFILES.md`, G2 acceptance |
| 24 Sep 2026 | US Letter is supported by the geometry engine from G2; only the physical test of a specific US Letter product is deferred | R-07, `PRINTER_STATIONERY_MATRIX.md` |
| 24 Sep 2026 | **No silent currency default.** GBP fallback removed now (not deferred to G3); ISO codes stored; printed formatting = currency + label language; G2 fixtures carry explicit currencies | §0, `formatMoney.ts`, G2 acceptance L5/L6 |
| 24 Sep 2026 | Printed-label language is chosen in **Settings** (More), next to app language and currency; screens show it, they do not offer per-screen language buttons | §0 setting 2, G2 screens |
| 24 Sep 2026 | Label layout redesigned after owner review: fixed zones, shared bottom baseline, uniform sizes per sheet (tickets), barcode digits as text below the bars, smaller word/Arabic currency symbols, full quiet zones | `renderLabel.ts`, G2 mockup v2 |
| 24 Sep 2026 | ~~Fixed sizes and character limits, like a till.~~ **Superseded by the G2 correction handout (next rows).** Every text size is fixed per format (never auto-shrunk per product). The product screens enforce one app-wide set of limits: name 40, pack size 22, SKU 20, member-price condition 18, price 6 digits. Promotion labels print no barcode (the normal ticket carries it). The engine still refuses anything that would not fit | `labelTemplate.ts` (`templateFor`, `fieldLimitsFor`, `productFieldLimits`), `renderLabel.ts`, G2 mockup v3 |
| 24 Sep 2026 | **G2 correction handout (owner):** fixed typography per **{format + layout}**, never per-product shrinking; content that does not fit is refused for that format with a reason | `labelTemplate.ts`, `docs/LABEL_TYPOGRAPHY_MATRIX.md` |
| 24 Sep 2026 | Catalogue data is never shortened: full **product name** stored as imported; separate printable **label name** (counter 40); SKU / barcode never truncated (SKU omitted with a warning if it does not fit); pack size and conditions measured per format | `Product.labelName`, `domain/productLabel.ts`, `renderLabel.ts` |
| 24 Sep 2026 | **No global six-digit price cap.** A price is accepted by the rendered width of the exact formatted string (symbol / code, separators, decimals, label locale) in the format's fixed price box; wider → "This price needs a larger label format". No digit-count rule anywhere (see the owner decision rows below) | `labelTemplate.ts`, `renderLabel.ts` |
| 24 Sep 2026 | Promotion barcode is layout-specific (compatibility matrix), not banned: unavailable on tickets / sticker labels, optional on A6 / A5 / A4 cards | `layoutCompatibility()` |
| 24 Sep 2026 | Offer cards: price dominant and centred, SKU off by default (staff option), readable "Now" line; tickets: "Now" at a readable fixed size | `cardTemplate`, `renderLabel.ts` |
| 24 Sep 2026 | Arabic percent: "خصم 30٪" (U+066A inside the isolated number run); German "Mitgliederpreis" pinned | `labelStrings.ts`, regression tests |
| 24 Sep 2026 | Safe area: critical content ≥ 2 mm from the cut (tickets 2.5 mm, sticker sheets 2 mm); warning below 2 mm | `presets.ts`, `geometry.ts` |
| 24 Sep 2026 | Final print backgrounds: app UI Till Note cream / navy; standard labels white (no fill); promotions yellow band; ink-saving = no fill | `LABEL_CSS` |
| 24 Sep 2026 | More → **Print setup**: Stationery profiles · Label test · Printer calibration (renamed from "Printer test page"); calibration page has a 100 mm scale line, "Actual size" instruction, offset vs drift guidance | `testPage.ts`, `calibration.ts`, G2 screens |
| 24 Sep 2026 | Print confirmation asked only after Print → system dialog → return; answers Yes, printed / Keep waiting / Print again; Share PDF never marks printed | `printFlow.ts` |
| 24 Sep 2026 | **Owner decision:** 70 × 38 barcode ticket = **24 pt price + 7 mm bars** (2.5 mm safe area, full quiet zones). Scan reliability first; do not shorten bars to ~5.3 mm for a 28 pt price. Physical scan-back PENDING (S22 + shop scanner) | `labelTemplate.ts`, pinned test |
| 24 Sep 2026 | **Owner decision:** A6 portrait offer card price **51.5 pt** (approved). No "5 significant digits" or other digit rule: compatibility by rendered width only | `APPROVED_PRICE_PT`, width tests (£999.99 · 999,99 € · AED 999.99 · ₺999,99) |
| 24 Sep 2026 | **Owner decision:** add **A6 landscape** offer cards (148 × 105 mm, 4 per A4 landscape) as the high-impact card: fixed **80 pt** price, same fixed-size, width-measurement, six-language and RTL rules. A6 portrait, A5 and A4 kept | `presets.ts` (`preset_offer_a6_landscape_on_a4`), tests |
| 24 Sep 2026 | **Owner decision:** source-level G2 does not wait for physical Avery sheets; presets stay **Unverified**; paper, calibration and scan-back move to a separate physical gate after the engineering APK | `PRINTER_STATIONERY_MATRIX.md`, G2 report |
