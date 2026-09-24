# Scope lock — TillLabel Release 1

Source: plan TNF-TL-R1-PLAN-1.1 §A, owner decisions of 24 Sep 2026, G0 validation (V1–V10).
A requirement may not be dropped silently. Changes are recorded in §5 with their effect.

## 1. Included (Release 1)

| ID | Requirement | Plan § | Acceptance tests |
|---|---|---|---|
| R-01 | Quick one-off label: description, price, copies, saved print setup; optional save | I | TL-01 |
| R-02 | Saved product catalogue: add, edit, duplicate, archive/delete, search, filter, bulk select | I, R | TL-11, TL-12, TL-40 |
| R-03 | Standard shelf price label with optional second line, unit price and barcode | D, G, M | TL-05, TL-22, TL-26 |
| R-04 | Offers: was/now, percentage off, money off, fixed-quantity multibuy, conditional/member price, optional dates | M | TL-03, TL-41 |
| R-05 | Reduced-to-clear batches stored apart from the normal price | M | TL-02, TL-20 |
| R-06 | Changed-only print queue (content fingerprint, copy counts, stale-preview detection) | N | TL-06, TL-07, TL-15, TL-16 |
| R-07 | Stationery: shelf-edge inserts, adhesive sheets, plain paper/card with cutting guides; custom geometry | G | TL-22, TL-27, TL-28 |
| R-08 | One exact PDF per job for preview, print and export, with checksum | H | TL-18, TL-22, TL-45 |
| R-09 | Printer/stationery profiles, calibration page, 0.5 mm nudges, placement map | O | TL-23, TL-28 |
| R-10 | Print confirmation after the dialog (Confirm printed / Keep waiting / Reprint), partial pages, history | O | TL-17, TL-19, TL-21 |
| R-11 | Barcode scan to find/add; offline barcode rendering EAN-13, EAN-8, UPC-A, Code 128 | J | TL-11, TL-24, TL-25 |
| R-12 | CSV and genuine XLSX import with column mapping, locale profile, preview, transactional commit, saved mappings | K | TL-06, TL-09, TL-13, TL-14 |
| R-13 | TillCalc hand-off file `tillfamily.price-change` v1 (approved selling prices only) | L | TL-07–TL-10, TL-36, TL-46 |
| R-14 | Fixed A4, A5, A6 offer cards (yellow and ink-saving designs) | M | TL-26 |
| R-15 | Six languages (en, ar, tr, fr, es, de); printed-label language separate from app language | P | TL-25, TL-26, TL-39 |
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

## 4. Provisional commercial settings (not owner-approved)

200 saved products on Free; no sheet counter; lifetime Pro for larger catalogues and advanced conveniences. The review
APK unlocks everything, so these do not block testing.

## 5. Owner decisions and changes

| Date | Decision | Effect |
|---|---|---|
| 24 Sep 2026 | New repo `tilllabel`, work on `main` | Replaces plan §B branch `build/tilllabel-r1` |
| 24 Sep 2026 | TillCalc exporter = one commit on TillCalc `main`, only after owner approval at G6 | Replaces plan §L exporter branch |
| 24 Sep 2026 | Till Note baseline = `codex/testflight-1.0.5-ui-fixes-20260915` @ `b647a481` | Replaces plan §B reference `6fa6e941` |
