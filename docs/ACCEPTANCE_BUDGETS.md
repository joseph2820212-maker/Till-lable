# Acceptance budgets (proposed at G0, fixed after the G2 baseline)

These are project targets, not manufacturer guarantees. They change only with evidence and owner approval.

| Area | Budget | How measured |
|---|---|---|
| PDF geometry | Every label box within ±0.1 mm of the specified geometry; content inside the safe area | Parse generated HTML/page size in Jest; inspect the PDF page box on device (G2) |
| Paper position | ±1 mm for top, middle and bottom labels; no progressive drift | Owner worksheet with ruler and photos (TL-23) |
| Barcode | Quiet zones preserved; never scaled below the format's minimum module width | Engine test + independent decoder + phone and shop scanner (TL-24) |
| Product list, 2,000 items | Search/filter result under 150 ms in Jest; smooth scroll on the reference device | Jest benchmark; device timing at G8/G10 |
| Stress, 10,000 items | Import, search and queue complete without freeze or data corruption; memory recorded | Jest + reference device (TL-40) |
| Import | 2,000-row CSV/XLSX preview under 3 s on the reference device; hostile files rejected within caps | Fixtures (TL-13, TL-14) |
| Label PDF | 21-label sheet generated under 2 s on the reference device; large jobs chunked without losing order or copy counts | Device timing at G10 |
| Cold start | Recorded on the reference device; no fixed budget until measured | Device timing |

Reference device: **Samsung Galaxy S22** (owner decision, 24 Sep 2026). A slower second Android may be added later.
