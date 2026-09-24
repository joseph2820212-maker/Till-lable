# Label typography and compatibility matrix

Generated from the engine (`labelTemplate.ts` → `templateFor`, `layoutCompatibility`) on the G2 correction SHA.
Owner rules (24 Sep 2026, G2 correction handout §1, §4, §9, §14, §28, §29):

- Every **{format + layout}** has ONE fixed typography set. A short and a long product in the same layout print at
  identical sizes. No label ever shrinks its text to make content fit.
- Content that does not fit at the fixed size is **refused for that format**, with a reason: label name → edit the
  label name; pack size / condition → edit it or use a larger format; price → "This price needs a larger label
  format"; promotion + barcode on a format that cannot hold it → layout not available. An optional SKU that does not
  fit is left off with a warning. Stored catalogue data is never changed.
- Price sizes are designed around the widest currency in the catalogue (all 6 label languages): 6 significant digits
  on tickets and sticker labels, 5 on A6 / A5 offer cards (customer-facing, price-dominant), 7 on the A4 card (the
  large-price fallback: 99,999.99 · 9,999,999 · 9,999.999). No catalogue digit cap: a price is measured, not counted.
- Label-name room is 40 characters on every launch layout, proven with a realistic 40-character corpus (upper and
  title case, German compounds, French accents, Turkish, Arabic) — `NAME_CORPUS`.
- Critical content (SKU, unit price, barcode digits) keeps ≥ 2 mm from every cut edge (tickets 2.5 mm, sticker
  sheets 2 mm, cards 6–10 mm); measured ink distances are in `docs/gates/G02/REPORT.md`.
- Standard labels print white with no fill. Promotions use the yellow band; ink-saving prints the band outline only
  (for coloured stock).

Layouts: `standard` · `unitPrice` · `barcode` · `promo` · `promoDetail` (promotion with a condition or end date) ·
`promoBarcode` (promotion + barcode, only where available).

| Format | Layout | Available | Name | Pack size | Price | Promo band | "Now" | Unit price | SKU | Bars (mm) | Price designed for | Label-name room | Condition room |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Shelf-edge ticket 70 × 38 mm (A4 card, cutting guides) | standard | Yes | 10 pt × 2 lines | 7 pt | 30 pt | — | — | 7 pt | 6 pt | — | 6 digits | 40 | — |
| Shelf-edge ticket 70 × 38 mm (A4 card, cutting guides) | unitPrice | Yes | 10 pt × 2 lines | 7 pt | 30 pt | — | — | 7 pt | 6 pt | — | 6 digits | 40 | — |
| Shelf-edge ticket 70 × 38 mm (A4 card, cutting guides) | barcode | Yes | 10 pt × 2 lines | 7 pt | 24 pt | — | — | 7 pt | 6 pt | 7.0 | 6 digits | 40 | — |
| Shelf-edge ticket 70 × 38 mm (A4 card, cutting guides) | promo | Yes | 10 pt × 2 lines | 7 pt | 22 pt | 10.5 pt | 8.5 pt | 7 pt | 6 pt | — | 6 digits | 40 | — |
| Shelf-edge ticket 70 × 38 mm (A4 card, cutting guides) | promoDetail | Yes | 10 pt × 2 lines | 7 pt | 17.5 pt | 10.5 pt | 8.5 pt | 7 pt | 6 pt | — | 6 digits | 40 | 22 |
| Shelf-edge ticket 70 × 38 mm (A4 card, cutting guides) | promoBarcode | **No** — needs a larger format | | | | | | | | | | | |
| Shelf-edge ticket 70 × 38 mm (US Letter card, cutting guides) | standard | Yes | 10 pt × 2 lines | 7 pt | 30 pt | — | — | 7 pt | 6 pt | — | 6 digits | 40 | — |
| Shelf-edge ticket 70 × 38 mm (US Letter card, cutting guides) | unitPrice | Yes | 10 pt × 2 lines | 7 pt | 30 pt | — | — | 7 pt | 6 pt | — | 6 digits | 40 | — |
| Shelf-edge ticket 70 × 38 mm (US Letter card, cutting guides) | barcode | Yes | 10 pt × 2 lines | 7 pt | 24 pt | — | — | 7 pt | 6 pt | 7.0 | 6 digits | 40 | — |
| Shelf-edge ticket 70 × 38 mm (US Letter card, cutting guides) | promo | Yes | 10 pt × 2 lines | 7 pt | 22 pt | 10.5 pt | 8.5 pt | 7 pt | 6 pt | — | 6 digits | 40 | — |
| Shelf-edge ticket 70 × 38 mm (US Letter card, cutting guides) | promoDetail | Yes | 10 pt × 2 lines | 7 pt | 17.5 pt | 10.5 pt | 8.5 pt | 7 pt | 6 pt | — | 6 digits | 40 | 22 |
| Shelf-edge ticket 70 × 38 mm (US Letter card, cutting guides) | promoBarcode | **No** — needs a larger format | | | | | | | | | | | |
| Avery L7160 (21 per A4, 63.5 × 38.1 mm) | standard | Yes | 10.3 pt × 2 lines | 7.2 pt | 27.5 pt | — | — | 7.2 pt | 6.2 pt | — | 6 digits | 40 | — |
| Avery L7160 (21 per A4, 63.5 × 38.1 mm) | unitPrice | Yes | 10.3 pt × 2 lines | 7.2 pt | 27.5 pt | — | — | 7.2 pt | 6.2 pt | — | 6 digits | 40 | — |
| Avery L7160 (21 per A4, 63.5 × 38.1 mm) | barcode | Yes | 10.3 pt × 2 lines | 7.2 pt | 25 pt | — | — | 7.2 pt | 6.2 pt | 7.2 | 6 digits | 40 | — |
| Avery L7160 (21 per A4, 63.5 × 38.1 mm) | promo | Yes | 10.3 pt × 2 lines | 7.2 pt | 19 pt | 10.9 pt | 8.8 pt | 7.2 pt | 6.2 pt | — | 6 digits | 40 | — |
| Avery L7160 (21 per A4, 63.5 × 38.1 mm) | promoDetail | Yes | 10.3 pt × 2 lines | 7.2 pt | 18.5 pt | 10.9 pt | 8.8 pt | 7.2 pt | 6.2 pt | — | 6 digits | 40 | 17 |
| Avery L7160 (21 per A4, 63.5 × 38.1 mm) | promoBarcode | **No** — needs a larger format | | | | | | | | | | | |
| Avery L7159 (24 per A4, 63.5 × 33.9 mm) | standard | Yes | 9.1 pt × 2 lines | 6.3 pt | 27.5 pt | — | — | 6.3 pt | 5.5 pt | — | 6 digits | 40 | — |
| Avery L7159 (24 per A4, 63.5 × 33.9 mm) | unitPrice | Yes | 9.1 pt × 2 lines | 6.3 pt | 27.5 pt | — | — | 6.3 pt | 5.5 pt | — | 6 digits | 40 | — |
| Avery L7159 (24 per A4, 63.5 × 33.9 mm) | barcode | Yes | 9.1 pt × 2 lines | 6.3 pt | 22.5 pt | — | — | 6.3 pt | 5.5 pt | 5.9 | 6 digits | 40 | — |
| Avery L7159 (24 per A4, 63.5 × 33.9 mm) | promo | Yes | 9.1 pt × 2 lines | 6.3 pt | 20 pt | 9.5 pt | 7.7 pt | 6.3 pt | 5.5 pt | — | 6 digits | 40 | — |
| Avery L7159 (24 per A4, 63.5 × 33.9 mm) | promoDetail | Yes | 9.1 pt × 2 lines | 6.3 pt | 16 pt | 9.5 pt | 7.7 pt | 6.3 pt | 5.5 pt | — | 6 digits | 40 | 22 |
| Avery L7159 (24 per A4, 63.5 × 33.9 mm) | promoBarcode | **No** — needs a larger format | | | | | | | | | | | |
| Avery L7163 (14 per A4, 99.1 × 38.1 mm) | standard | Yes | 10.3 pt × 2 lines | 7.2 pt | 41 pt | — | — | 7.2 pt | 6.2 pt | — | 6 digits | 40 | — |
| Avery L7163 (14 per A4, 99.1 × 38.1 mm) | unitPrice | Yes | 10.3 pt × 2 lines | 7.2 pt | 35 pt | — | — | 7.2 pt | 6.2 pt | — | 6 digits | 40 | — |
| Avery L7163 (14 per A4, 99.1 × 38.1 mm) | barcode | Yes | 10.3 pt × 2 lines | 7.2 pt | 25 pt | — | — | 7.2 pt | 6.2 pt | 7.2 | 6 digits | 40 | — |
| Avery L7163 (14 per A4, 99.1 × 38.1 mm) | promo | Yes | 10.3 pt × 2 lines | 7.2 pt | 25.5 pt | 10.9 pt | 8.8 pt | 7.2 pt | 6.2 pt | — | 6 digits | 40 | — |
| Avery L7163 (14 per A4, 99.1 × 38.1 mm) | promoDetail | Yes | 10.3 pt × 2 lines | 7.2 pt | 18.5 pt | 10.9 pt | 8.8 pt | 7.2 pt | 6.2 pt | — | 6 digits | 40 | 40 |
| Avery L7163 (14 per A4, 99.1 × 38.1 mm) | promoBarcode | **No** — needs a larger format | | | | | | | | | | | |
| Offer cards A6 (4 per A4, cutting guides) | standard | Yes | 17.7 pt × 3 lines | 11 pt | 51.5 pt | — | — | 11 pt | 8 pt (off by default) | — | 5 digits | 40 | — |
| Offer cards A6 (4 per A4, cutting guides) | unitPrice | Yes | 17.7 pt × 3 lines | 11 pt | 51.5 pt | — | — | 11 pt | 8 pt (off by default) | — | 5 digits | 40 | — |
| Offer cards A6 (4 per A4, cutting guides) | barcode | Yes | 17.7 pt × 3 lines | 11 pt | 51.5 pt | — | — | 11 pt | 8 pt (off by default) | 16.3 | 5 digits | 40 | — |
| Offer cards A6 (4 per A4, cutting guides) | promo | Yes | 17.7 pt × 3 lines | 11 pt | 51.5 pt | 18.1 pt | 19.5 pt | 11 pt | 8 pt (off by default) | — | 5 digits | 40 | — |
| Offer cards A6 (4 per A4, cutting guides) | promoDetail | Yes | 17.7 pt × 3 lines | 11 pt | 51.5 pt | 18.1 pt | 19.5 pt | 11 pt | 8 pt (off by default) | — | 5 digits | 40 | 60 |
| Offer cards A6 (4 per A4, cutting guides) | promoBarcode | Yes | 17.7 pt × 3 lines | 11 pt | 51.5 pt | 18.1 pt | 19.5 pt | 11 pt | 8 pt (off by default) | 16.3 | 5 digits | 40 | 60 |
| Offer cards A5 (2 per A4 landscape, cutting guides) | standard | Yes | 25.1 pt × 3 lines | 15.6 pt | 73 pt | — | — | 15.6 pt | 11.3 pt (off by default) | — | 5 digits | 40 | — |
| Offer cards A5 (2 per A4 landscape, cutting guides) | unitPrice | Yes | 25.1 pt × 3 lines | 15.6 pt | 73 pt | — | — | 15.6 pt | 11.3 pt (off by default) | — | 5 digits | 40 | — |
| Offer cards A5 (2 per A4 landscape, cutting guides) | barcode | Yes | 25.1 pt × 3 lines | 15.6 pt | 73 pt | — | — | 15.6 pt | 11.3 pt (off by default) | 22.0 | 5 digits | 40 | — |
| Offer cards A5 (2 per A4 landscape, cutting guides) | promo | Yes | 25.1 pt × 3 lines | 15.6 pt | 73 pt | 25.8 pt | 27.6 pt | 15.6 pt | 11.3 pt (off by default) | — | 5 digits | 40 | — |
| Offer cards A5 (2 per A4 landscape, cutting guides) | promoDetail | Yes | 25.1 pt × 3 lines | 15.6 pt | 73 pt | 25.8 pt | 27.6 pt | 15.6 pt | 11.3 pt (off by default) | — | 5 digits | 40 | 60 |
| Offer cards A5 (2 per A4 landscape, cutting guides) | promoBarcode | Yes | 25.1 pt × 3 lines | 15.6 pt | 73 pt | 25.8 pt | 27.6 pt | 15.6 pt | 11.3 pt (off by default) | 22.0 | 5 digits | 40 | 60 |
| Offer card A4 (1 per sheet) | standard | Yes | 36 pt × 3 lines | 22.3 pt | 80.5 pt | — | — | 22.3 pt | 16.2 pt (off by default) | — | 7 digits | 40 | — |
| Offer card A4 (1 per sheet) | unitPrice | Yes | 36 pt × 3 lines | 22.3 pt | 80.5 pt | — | — | 22.3 pt | 16.2 pt (off by default) | — | 7 digits | 40 | — |
| Offer card A4 (1 per sheet) | barcode | Yes | 36 pt × 3 lines | 22.3 pt | 80.5 pt | — | — | 22.3 pt | 16.2 pt (off by default) | 22.0 | 7 digits | 40 | — |
| Offer card A4 (1 per sheet) | promo | Yes | 36 pt × 3 lines | 22.3 pt | 80.5 pt | 33.2 pt | 39.6 pt | 22.3 pt | 16.2 pt (off by default) | — | 7 digits | 40 | — |
| Offer card A4 (1 per sheet) | promoDetail | Yes | 36 pt × 3 lines | 22.3 pt | 80.5 pt | 33.2 pt | 39.6 pt | 22.3 pt | 16.2 pt (off by default) | — | 7 digits | 40 | 60 |
| Offer card A4 (1 per sheet) | promoBarcode | Yes | 36 pt × 3 lines | 22.3 pt | 80.5 pt | 33.2 pt | 39.6 pt | 22.3 pt | 16.2 pt (off by default) | 22.0 | 7 digits | 40 | 60 |
