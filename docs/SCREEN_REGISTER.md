# Screen register

Every planned route, the gate that delivers it, and its status. A route exists in `src/navigation` only from
the gate that implements it. States column: E = empty, L = loading, V = validation, P = populated, F = failure.

Status words: **Live** (implemented and in the navigation walk). Every planned route is now live; the navigation walk renders all 25 routes in all six languages.

## Tab roots

| Route | Tab | Purpose | States | Status |
|---|---|---|---|---|
| `Home` | Home | Waiting counts; Quick label, Scan, Offers, Reduced to clear; set-up (app language, currency, label language, print setup) | E P F | Live |
| `Products` | Products | Catalogue: search, filters (waiting / needs label name / archived), add, scan, import | E L P F | Live |
| `ToPrint` | To print | Changed-only queue: select, copies, remove, stationery, start position → Preview | E L P F | Live |
| `More` | More | Settings, label settings, print setup, backup, Pro, help, legal | P | Live |

## Shared screens (registered in every tab's stack)

| Route | Purpose | States | Status |
|---|---|---|---|
| `SettingsLanguage` | App language (six languages, RTL transition) | P F | Live |
| `SettingsCurrency` | Shop currency (ISO code; never assumed) | P F | Live |
| `SettingsLabels` | Printed-label language (independent), default label type, offer style, card options, unit-price decimals | P F | Live |
| `SettingsBackup` | Encrypted backup and restore | L P V F | Live |
| `SettingsHelp` | How-to guide (10 chapters) and Questions (8 chapters) | P | Live |
| `SettingsLegal` | Privacy, terms, data-storage notice, licences | P | Live |
| `SettingsAbout` | App description, contact and support | P | Live |
| `SettingsOfflinePrivate` | Offline and privacy model | P | Live |
| `ProductDetail` | Add / edit / duplicate / archive; full product name + label name (38 / 40); price, unit price, barcode (scan), SKU, label type | V P F | Live |
| `Scan` | Find a product by barcode, or attach a code to the editor; torch; typed entry | L P F | Live |
| `QuickLabel` | One-off label with copies; optional save as product; draft recovery | E V P F | Live |
| `Import` | CSV / XLSX / TillCalc price-change: mapping, confirmed number format, New/Changed/Same/Conflict/Invalid preview, all-or-nothing commit | L V P F | Live |
| `Offers` | Offers (running / scheduled / ended) and recent reductions | E P | Live |
| `OfferEditor` | Was/now, % off, money off, multibuy, member price; products; dates; exact preview (Pro) | V P F | Live |
| `ReducedLabel` | Reduced-to-clear batch (Pro), stored apart from the product | V P F | Live |
| `PrintPreview` | The exact PDF; Print / Share PDF; confirmation only after returning from Print | L P F | Live |
| `PrintSetup` | Stationery profiles · Label test · Printer calibration · Print history · Label settings | P | Live |
| `StationeryEditor` | Preset details (use / calibrate / copy) or a custom sheet with live validation (Pro) | V P F | Live |
| `LabelTest` | One sheet of samples in the label language and currency | P F | Live |
| `Calibration` | Calibration page (100 mm line), measurement → aligned / offset / scaling / drift, 0.5 mm offsets | P V F | Live |
| `PrintHistory` | Every generated PDF, newest first; opens the original file | E P | Live |

## Guards

- `src/__tests__/navigationWalk.test.tsx` renders every Live route in six languages (no throw, no raw key, no
  "coming soon") and fails if a registered route is missing from its map.
- `src/navigation/__tests__/persistentTabBar.test.ts` pins the four tabs and the shared-screen count.
