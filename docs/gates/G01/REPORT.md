# G1 report — isolated TillLabel skeleton

**Gate decision: PASS (source).** The app starts from TillCalc's shell with TillLabel's identity, four tabs, exact
money and the record types. No native build or device run in this gate (G2 engineering APK is the first).

## Gate / scope

Plan TNF-TL-R1-PLAN-1.1 §D, §E, §F (G1 row), with the G0 corrections. Repository `joseph2820212-maker/till-lable`,
branch `main`.

## Source baseline

| App | SHA | Changed by this gate? |
|---|---|---|
| TillCalc `main` | `e7ea8ca` | No (tree clean, HEAD unchanged) |
| Till Note `b647a481` | read-only | No (working copy clean) |

The TillCalc tree was taken with `git archive e7ea8ca`, installed with `npm ci`, and was green before any change
(101 suites / 1,043 tests).

## What changed

**Removed** (dependency-checked, V12 link cut by deleting the whole price-list module and keeping its pure
utilities): calculators, pricing, compare, saved, cash-up, price lists and repricing; calculator defaults,
history, saved and tax-rate storage; calculator-only components; tax / target / fee defaults screens; report PDF
templates; the PIN helper; their tests.

**Kept and re-pointed:** shared components, theme, hooks, i18n (six languages), navigation shell, storage safety,
file utils, currency and minor units, backup and crypto, billing, More / legal / help / about / support, PDF
helper and preview. Details: `docs/REUSE_MANIFEST.md` → "G1 — now present".

**New:**

| File | What |
|---|---|
| `src/domain/money.ts` | Exact money: integer minor units + currency exponent; parse by confirmed number profile; never rounds away extra decimals; Arabic digits; `isAmbiguousSeparator` for "1,234" (V1) |
| `src/domain/types.ts` | Product, Promotion, ReductionBatch, PrintIntent, PrintJob, StationeryProfile, PrinterCalibration, ImportMapping, ImportBatch, each with `schemaVersion` |
| `src/storage/keys.ts` | TillLabel storage keys and the backup namespace allowlist |
| `src/modules/queue/storage/summary.ts` | Waiting counts: products and label copies reported separately |
| `src/modules/{home,products,queue}/screens/*` | Home (counts + setup), Products (empty state), To print (empty state or counts) |
| `src/components/TabRootHeader.tsx`, `EmptyState.tsx`, `LabelRow.tsx` | Family shell pieces |
| `docs/SCREEN_REGISTER.md`, `docs/UI_RULES.md` (adapted) | Route register with gate per route; TillLabel UI additions |

**Identity:** `TillLabel` 0.1.0, `com.tilllabel.app` (iOS and Android), camera permission text in six native
locales, backup format `tilllabel` and file name `TillLabel_Backup_…`, error-log key `tilllabel:v1:…`,
Android PDF plugin markers, licence inventory regenerated (576 packages, 252 texts). Node 20 pinned in `.nvmrc`.
The review id `com.tilllabel.app.review` is applied by the G10 build profile, not in `app.json`.

**Strings:** locale files pruned from 2,055 to about 300 keys per language, all six in parity. 63 keys added or
rewritten in six languages (`scripts/locale-keys/g1-shell.json`) so no kept string describes TillCalc,
calculations, margins or scenarios. Help keeps the how-to (backup, languages, support) and the Questions tab; the
calculator formula chapters and the pricing disclaimer are gone. The label disclaimer is a G7 deliverable.

## Commands actually run

```
git -C tillcalc archive e7ea8ca | tar -x ; npm ci
npm run typecheck && npm run lint && npx jest --runInBand --silent     # before changes: 101 / 1,043 green
node scripts/addLocaleKeys.mjs scripts/locale-keys/g1-shell.json --overwrite   # 378 values written
node scripts/genOssLicenses.mjs
TL_RENDER_OUT=docs/gates/G01/render npx jest src/__tests__/navigationWalk.test.tsx
npm run typecheck && npm run lint && npx jest --runInBand --silent     # final
```

## Test counts (final, this SHA)

| Check | Result |
|---|---|
| Typecheck | pass |
| Lint (`--max-warnings 0`) | pass |
| Jest | **43 suites / 311 tests, all passed** |

New or rewritten tests: `domain/__tests__/money.test.ts` (8), `products/__tests__/reusedUtils.test.ts` (carried
barcode / CSV / scan-bus / ids cases), `queue/__tests__/toPrint.test.tsx` (4), `billing/__tests__/limitGate.test.ts`
(TillLabel plan), and the adapted guards: navigation walk (11 routes × 6 languages), persistent tab bar (4 tabs, 7
shared screens), keyboard avoidance, locale lengths / corruption / parity, privacy wording (now also: no TillCalc
branding and no calculator wording in any locale), colour regression, bottom safe area, backup, legal parity, help
content.

## Evidence

- Render text of every live route in English and Arabic: `docs/gates/G01/render/*.txt` (jest render trees; device
  screenshots are pending until the G2 engineering APK).
- The render dump found one real defect during the gate: To print showed "Labels: 3" in the header and "Nothing
  waiting to print" in the body. Fixed (empty state only when nothing waits) and pinned by `toPrint.test.tsx`.

## Findings opened / closed

| ID | Finding | Status |
|---|---|---|
| G1-F1 | To print contradicted itself when labels were waiting | Fixed in source, test added, closed |

## Untested / pending

| Item | Why | When |
|---|---|---|
| App starts on a device | No native build here | G2 engineering APK (Codex) |
| Device screenshots (en, ar) | Same | G2 |
| Human review of the 63 new AR/TR/FR/ES/DE strings | Machine-written | Owner / language reviewer |
| Legal documents fully rewritten for labels, label disclaimer | Scope of G7 | G7 |
| `docs/RELEASE_RECIPE.md` | Still TillCalc's (marked "not yet valid") | G10 |

## Exact final SHA / clean state

Recorded by the commit that contains this report (see `git log -1`). Tree clean after commit.

## Next authorised gate

G2 (label engine and first engineering APK), after owner review of this report.

---

## Addendum — alignment with the owner decisions of 24 Sep 2026

The G1 values already matched the approved plan (200-product Free cap, lifetime Pro). `limits.ts` now also pins
the approved Free and Pro feature lists (`FREE_FEATURES`, `PRO_FEATURES`, `canUseFeature`, unknown features fail
closed) so G3–G5 gate each feature from one list; tests in `limitGate.test.ts`. No screen behaviour changed.
Reference device for all later device evidence: Samsung Galaxy S22.

## Carry-forward — international scope (owner correction, 24 Sep 2026)

Schema only, no behaviour change: `src/domain/types.ts` gains `PaperSize` (A4, Letter, A5, A6, custom), optional
right / bottom margins and `isPreset` on stationery, `LabelKind`, `LanguageCode`, `CountryProfileId`,
`IndependentSettings`, and `labelKind` + typed `labelLanguage` on PrintIntent. Two inherited UK defaults are recorded
for G2/G3 (`REUSE_MANIFEST.md`, International carry-forward): the GBP first-run default and `currencyAfter()`
following the app language.

## Carry-forward — currency correction before G2 (owner, 24 Sep 2026)

The inherited TillCalc GBP behaviour is **removed**, not deferred: `src/utils/currency.ts` starts unset
(`isCurrencySet()`), stores the chosen currency as its ISO code (older "symbol CODE" values still load), and More /
Home show "Not chosen yet" (six languages). Printed prices use the new `src/domain/formatMoney.ts`
(`formatMoney(amountMinor, currencyCode, labelLanguage)`): explicit inputs, deterministic per-language conventions,
Western digits, Arabic-script symbols only on Arabic labels, `MissingCurrencyError` on a missing or invalid code.
Test stubs no longer return GBP. Guards: `domain/__tests__/formatMoney.test.ts` (six language + currency pairs and
four cross-language combinations), `utils/__tests__/currency.test.ts` (no default, ISO storage),
`__tests__/noCurrencyDefault.test.ts` (no hard-coded currency outside the catalogues). The G3 first-use currency
picker is still G3 work.
