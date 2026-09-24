# Build report — the working app (plan gates G3–G8, source level)

Owner instruction (24 Sep 2026): build everything — scanning, printing, all screens, settings, help and support, all
languages — instead of stopping for an engineering APK. This report covers the source build on the approved G2
engine. Physical checks (phone, printer, paper, shop scanner) are listed as **READY FOR OWNER TEST**, never as passed.

## What the app does now

| Area | Built | Key files |
|---|---|---|
| Catalogue | Products list (search by name / SKU / barcode, accent-insensitive; filters: waiting, needs label name, archived), add / edit / duplicate / archive (never delete), full product name kept + separate label name with the 38 / 40 counter and live fit hints, selling unit + exact unit price, barcode with check-digit validation (never rewritten), SKU, shelf location, label type | `products/screens/*`, `products/storage/productStore.ts`, `domain/productLabel.ts`, `domain/pricing.ts` |
| Scanning | Camera scan (EAN-13/8, UPC-A/E, Code 128, ITF-14), torch, typed entry, duplicate-read guard, explain-before-permission, find → open or add; attach → fills the editor | `products/screens/ScanScreen.tsx` |
| Quick label | One-off label, copies, optional save as product, draft recovery (device-only, never in backups) | `QuickLabelScreen.tsx` |
| Import | CSV, XLSX (bounded fflate reader; formulas never run; caps on size, entries, rows, columns), TillCalc `tillfamily.price-change` v1 (checksum, no costs); column guessing in six languages; number format confirmed by the user (never guessed from "1,234"); New / Changed / Same / Conflict / Invalid preview; re-import detection by file SHA-256; all-or-nothing commit that re-checks against the catalogue; Free allowance respected, existing data never locked | `import/*`, `docs/FILE_FORMAT_V1.md` |
| Changed-only queue | Label queued when its printed content changes (fingerprint), refreshed not duplicated, nothing queued when unchanged since last print; one-off, offer and reduction labels as frozen snapshots; products and labels counted separately | `queue/storage/queueStore.ts` |
| Printing | To print (select, copies, remove, stationery, start position) → one PDF per job (embedded fonts, exact page size, calibration offsets, SHA-256) → Preview (Print / Share PDF) → question only after returning from Print (Yes, printed / Keep waiting / Print again); Share never marks printed; Print history reopens the original file | `print/printService.ts`, `print/screens/*`, `labels/engine/printFlow.ts` |
| Print setup | Stationery profiles (presets read-only with verification status; custom sheets with live validation — Pro), Label test in the label language + currency, Printer calibration (100 mm line; aligned / uniform offset / scaling / drift; 0.5 mm offsets per stationery), Label settings | `print/screens/*`, `settings/screens/LabelSettingsScreen.tsx` |
| Offers (Pro) | Was/now, % off, money off, multibuy, member price; several products; start / end dates (end date printed); exact offer prices; the normal price never changes; offer labels to To print, printable as tickets or A6 portrait / A6 landscape / A5 / A4 cards | `promotions/*`, `labels/content.ts` |
| Reduced to clear (Pro) | Batch with quick 25 / 50 / 75 % buttons, reason, copies; stored apart from the product | `ReducedLabelScreen.tsx` |
| Settings | App language, currency, printed-label language (independent), default label type, offer style (yellow / ink-saving), SKU on cards, barcode on offers, unit-price decimals | `labelSettings.ts` |
| Help & support | Guide: 10 chapters (first labels, product vs label name, scanning, importing, printing, calibration, offers, backup, languages, safe support); Questions: the family set + Printing, Labels, Free and Pro | `more/content/helpContent.ts` |
| Languages | Every new string in English, Arabic, Turkish, French, Spanish and German (512 new keys + help); RTL layouts | `src/locales/*`, `scripts/locale-keys/g3-*.json` |

## Verification

```
npm run typecheck && npm run lint && npm test      # final: see the commit that adds this report
npx expo export --platform android                 # Metro + Hermes bundle: 9.1 MB, label fonts included as assets
```

- Navigation walk renders **all 25 routes in all six languages** with seeded data: no crash, no raw key.
- End-to-end flow test: product → queue → real sheet engine + embedded fonts → job → "Yes, printed" → nothing waits →
  unchanged save queues nothing → price change queues again; oversize prices refused with a reason and no job; tests
  and calibration pages never touch the queue.
- Store tests: transactions roll back on a failed write; duplicate barcodes refused (UPC-A = EAN-13); archive keeps
  data; offers never change the normal price; calibration offsets snap to 0.5 mm within ±10 mm.
- Import tests: hostile XLSX (zip bomb, not a spreadsheet, no sheets) refused; formulas read as cached values only;
  six-language column guessing; ambiguous numbers counted; commit refused if the catalogue moved since the preview or
  new products exceed the Free allowance; price-change files refused when edited, carrying costs, or a newer version.
- Exact arithmetic tests: unit price, % off, money off, saving, percent below — integer, half-up, 0/2/3-decimal
  currencies, no float step.

## READY FOR OWNER TEST (needs a phone, printer, paper or scanner)

| Check | How |
|---|---|
| Install and run on the Samsung Galaxy S22 | Engineering APK (build recipe) |
| Camera scanning of real products | Products → Scan |
| Print from the S22 to your printer; PDF page size exact | To print → Preview → Print |
| Paper: 70 × 38 A4 card 14-up, Avery L7160 / L7159 / L7163, A6 / A5 / A4 cards | Label test, measure top / middle / bottom |
| Calibration: 100 mm line, first / last label | Printer calibration |
| Barcode scan-back from paper (S22, another phone, shop scanner) | Print price + barcode labels |
| Arabic / Turkish wording review by a native reader | All screens and labels |

## Not built (by decision or outside this environment)

- TillCalc exporter commit (awaits owner approval — plan G6).
- The APK itself and store listings (no Android SDK here; no store publishing).
- Avery margins stay **Unverified** until checked against the manufacturer's template or a real sheet.
