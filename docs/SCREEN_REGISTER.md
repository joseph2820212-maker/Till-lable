# Screen register

Every planned route, the gate that delivers it, and its status. A route exists in `src/navigation` only from
the gate that implements it. States column: E = empty, L = loading, V = validation, P = populated, F = failure.

Status words: **Live** (implemented and in the navigation walk), **Planned** (not yet in the app).

## Tab roots

| Route | Tab | Purpose | States | Gate | Status |
|---|---|---|---|---|---|
| `Home` | Home | Waiting counts, first-run setup; later Quick label, Reduced label, Create offer, Scan / reprint | E P F | G1 (+G3/G4/G5 actions) | Live (counts + setup) |
| `Products` | Products | Catalogue list, search, filter | E L P F | G1 shell, G3 list | Live (empty state) |
| `ToPrint` | To print | Changed-only queue, counts, selection | E L P F | G1 shell, G5 queue | Live (empty / counts) |
| `More` | More | Settings, backup, Pro, help, legal | P | G1 | Live |

## Shared screens (registered in every tab's stack)

| Route | Purpose | States | Gate | Status |
|---|---|---|---|---|
| `SettingsLanguage` | App language (six languages, RTL transition) | P F | G1 (from TillCalc) | Live |
| `SettingsCurrency` | Shop currency for new products | P F | G1 (from TillCalc) | Live |
| `SettingsBackup` | Encrypted backup and restore | L P V F | G1 (AsyncStorage), G7 (PDF assets) | Live |
| `SettingsHelp` | How-to guide and Questions | P | G1, label chapters with their gates | Live |
| `SettingsLegal` | Privacy, terms, data-storage notice, licences; label disclaimer at G7 | P | G1, G7 | Live |
| `SettingsAbout` | App description, contact and support, legal links | P | G1 | Live |
| `SettingsOfflinePrivate` | Offline and privacy model | P | G1 | Live |
| `QuickLabel` | One-off label: name, price, copies, optional save; draft recovery | E V P F | G3 | Planned |
| `ProductDetail` | Add / edit / duplicate / archive a product | V P F | G3 | Planned |
| `Scan` | Find / add by barcode (camera, manual entry) | L P F | G3 | Planned |
| `Import` | Pick CSV/XLSX, sheet, column mapping, number profile | L V P F | G3 | Planned |
| `ImportPreview` | New / Changed / Unchanged / Conflict / Invalid, commit | L P F | G3 | Planned |
| `OfferEditor` | Was/now, % off, money off, multibuy, conditional; dates | V P F | G4 | Planned |
| `ReducedLabel` | Reduced-to-clear batch | V P F | G4 | Planned |
| `OfferCards` | A4 / A5 / A6 offer cards | P F | G4 | Planned |
| `PrintPreview` | The exact PDF, print / share, return confirmation | L P F | G2 engine, G5 flow | Planned |
| `PrintSetup` | Stationery profile, layout options | P V | G5 | Planned |
| `StationeryEditor` | Custom sheet geometry with validation | V P F | G5 | Planned |
| `Calibration` | Test page, 0.5 mm nudges, per printer + stationery | P F | G5 | Planned |
| `PrintHistory` | Retained jobs, reprint original or with latest prices | E P F | G5 | Planned |
| `TillCalcImport` | Receive a `tillfamily.price-change` file, preview, commit | L V P F | G6 | Planned |
| `ShopProfile` | One shop: name, currency, timezone, contact | V P | G7 | Planned |

## Guards

- `src/__tests__/navigationWalk.test.tsx` renders every Live route in six languages (no throw, no raw key, no
  "coming soon") and fails if a registered route is missing from its map.
- `src/navigation/__tests__/persistentTabBar.test.ts` pins the four tabs and the shared-screen count.
