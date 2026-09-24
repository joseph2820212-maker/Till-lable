# G0 report — scope, source reconciliation, reuse manifest, decisions

**Gate decision: HOLD** — the documents are complete. External facts that could not be sourced from the build
environment are listed as pending. G1 starts after owner review of this report and creation of the GitHub repository.

## Gate / scope

G0 of plan TNF-TL-R1-PLAN-1.1, with the owner decisions of 24 Sep 2026. Read-only work across both source apps. The
only writes are the documents in this repository.

## Source baseline

| App | SHA | Result |
|---|---|---|
| TillCalc `main` | `e7ea8caadd1b2f2e663b3c8059b4102d5515adcc` | clean tree; typecheck ✓ lint ✓ **101 suites / 1,043 tests passed** |
| Till Note `codex/testflight-1.0.5-ui-fixes-20260915` | `b647a481` | typecheck ✓ lint ✓ **533 suites / 5,553 tests: 5,552 passed, 1 failed (environmental)** |

The Till Note failure is `billingSourceGuards.test.ts`, which runs `git diff`. The baseline was run from a
`git archive` export without `.git`, so the failure is inherited and environmental, not a code defect. Details are in
`docs/FOUNDATION_BASELINE.md`.

## Documents produced

| Document | Content |
|---|---|
| `docs/SCOPE_LOCK.md` | R-01…R-20 mapped to plan sections and TL tests, exclusions, model rules, provisional commercial settings, decision log |
| `docs/FOUNDATION_BASELINE.md` | Both baselines, toolchain comparison |
| `docs/PROTECTED_SURFACES.md` | Read-only rules, locked files, verification commands for G6/G9/G10 |
| `docs/REUSE_MANIFEST.md` | Every candidate with disposition, tests to carry and limits |
| `docs/DEPENDENCY_DECISIONS.md` | Barcode, XLSX, XML, test decoder, fonts, CSV, money |
| `docs/PRINTER_STATIONERY_MATRIX.md` | Candidate sheets, all Unverified until sourced |
| `docs/ACCEPTANCE_BUDGETS.md` | Proposed geometry, paper, performance and import budgets |

## Validation findings (plan v1.1 against the real code)

| # | Finding | Effect |
|---|---|---|
| V1 | TillCalc `parseNumberCell` guesses decimal commas ("1,234" becomes 1.234) | Do not reuse. New locale-profile parser. |
| V2 | Both apps' money is float (TC `roundToMinor`, TN `round2`/epsilon); TC offer formulas are float and cost-based | New integer minor-unit module. TC formulas used only as test oracles. |
| V3 | No barcode renderer in either app | `bwip-js/generic` 4.11.4 (MIT): no dependencies, SVG for all four formats, rejects bad check digits. `bwip-js/react-native` needs an undeclared `react-zlib-js`, so it is avoided. |
| V4 | npm `xlsx` 0.18.5 carries GHSA-4r6h-8v6p-xvw6 and GHSA-5pgg-2g8v-p4x9 (confirmed with `npm audit`) | Bounded `fflate` + OOXML reader. |
| V5 | Neither app embeds fonts in PDFs; both fall back to system fonts | Bundle IBM Plex Sans Arabic TTF (OFL 1.1) and inject it as base64 `@font-face`. |
| V6 | No production guard against the billing bypass | Prebuild validation script (TL-35). |
| V7 | No Android file receiver in either app | Picker first; VIEW/SEND config plugin at G6, device-tested. |
| V8 | GB price-marking source | **Pending**: gov.uk is blocked by the environment's network policy. No legal wording until sourced. |
| V9 (revised) | My earlier claim that Till Note skips unreadable backup assets was wrong for `b647a481`: it fails closed. The real gaps are no creation-size cap and a fully in-memory backup. | Creation-time cap and size estimate added to the port. |
| V10 | Effort | About 32 builder days G0–G9. |
| **V11 (new)** | TC `AppPdfPreviewScreen` always renders HTML at A4 portrait | Label preview uses the generated file through `sourceUri`. One authoritative PDF. |
| **V12 (new)** | TC `priceListItemsStorage.ts` imports `repricingEngine`, which loads `pricingEngine` | First removal step in G1: cut this edge. |
| **V13 (new)** | Neither app calls `Print.printAsync`; all PDFs go through share | Printing and its confirmation flow are new work at G5. |
| **V14 (new)** | Till Note PDF file-name helpers strip non-ASCII, so Arabic names vanish | Display names are kept in job records. |

## G1 removal order (dependency-checked)

1. Cut `priceListItemsStorage` → `repricingEngine` (inline `makeRevision`; replace `priceAffectingFieldsChanged` with a
   content fingerprint).
2. Remove `modules/{calculators,pricing,compare,saved,cashUp}`, the four calculator storage files, the calculator-only
   components, the defaults screens and their routes, and the `App.tsx` defaults/repricing bootstrap calls.
3. Remove repricing, targets and cost screens from `priceList` and rename the module `products`.
4. Move limits into `billing`. Replace backup namespaces and entity counts.
5. Adapt the guard tests (navigation walk, persistent tab bar, keyboard avoidance, locale lengths, locale corruption,
   privacy wording, colour regression, bottom safe area) and prune locale keys in all six files together.
6. New identity (`TillLabel`, `com.tilllabel.app`, review `com.tilllabel.app.review`), new storage key prefixes, new
   backup format marker.

Each batch ends green before the next starts.

## UI shell proposal (for review before G1 screens multiply)

- Tabs: **Home · Products · To print · More**. The tab bar persists on every screen (TillCalc pattern: one stack per
  tab).
- Home: Quick label, Reduced label, Create offer, Scan / reprint, and the "N products · M labels waiting" count. No
  dashboard.
- Print setup (stationery, layouts, calibration) is reached from To print and from More, not from its own tab.
- Chrome: TillCalc headers, cards, buttons, alerts and keyboard handling unchanged. Label PDFs carry no app branding.
- Screenshots of Home, Quick label, Products, To print and Print setup, in English and Arabic, come at the end of G1
  as jest render trees. Device screenshots are pending.

## Commands actually run

```
git -C tillcalc status --porcelain; git -C tillcalc rev-parse HEAD
npm run typecheck; npm run lint; npx jest --runInBand --silent                 # TillCalc
git archive b647a481 | tar -x -C <scratch>; npm ci --ignore-scripts             # Till Note
npm run typecheck; npm run lint; npm test -- --runInBand --watch=false --silent # Till Note
npm view bwip-js|fflate|fast-xml-parser|@zxing/library|xlsx version license
npm audit (scratch project with the candidates)
node: bwip-js toSVG for ean13/ean8/upca/code128 and a bad check digit
```

## Untested / pending

| Item | Why pending | Who |
|---|---|---|
| Stationery geometry for every preset | avery.co.uk blocked by the network policy | Owner: allow the domain or supply spec sheets |
| GB price-marking guidance source and date | gov.uk blocked | Owner: allow the domain or supply the page |
| Reference device for budgets | not named | Owner |
| Sheets actually used in shops | owner knowledge | Owner |
| Commercial Free/Pro split and price | owner decision (does not block review APK) | Owner |

## Findings opened / closed

None opened against source code. V9 corrected in this report.

## Exact final SHA / clean state

Recorded after the local commit (see git log). Not pushed: the GitHub repository `joseph2820212-maker/tilllabel` does
not exist yet.

## Next authorised gate

G1, after (1) owner review of this report and (2) the repository exists and is added to the session.

---

## Addendum — owner decisions closed (24 Sep 2026)

Recorded after G0; the baseline, findings and commands above are unchanged.

| Item (from "Untested / pending") | Decision | Status |
|---|---|---|
| Reference device for budgets | Samsung Galaxy S22 | Closed |
| Sheets actually used in shops | 70 × 38 mm shelf-edge (priority), L7160, L7159, L7163, plain A4/card with guides, custom editor (Pro); L7651 and 5160 deferred | Closed |
| Commercial Free/Pro split and price | Free and Pro lists in `SCOPE_LOCK.md` §4; lifetime only, UK £14.99, no subscription | Closed |
| Stationery geometry for every preset | Still not sourced (avery.co.uk blocked) | **Pending** |
| GB price-marking guidance source | Still not sourced (gov.uk blocked) | **Pending** |
| Physical paper evidence | Only after printing on real stationery | **Pending** |
