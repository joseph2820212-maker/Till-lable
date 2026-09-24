# Printer and stationery matrix

**The engine is generic and international.** It lays out any sheet from its physical numbers: page size (A4, US
Letter, A5, A6 or custom), orientation, rows, columns, label width and height, top / bottom / left / right margins,
horizontal and vertical gaps, a starting position with unused positions, and calibration offsets. A shop in any
country, using any manufacturer's stock, can enter its sheet as a custom profile. The presets below are a first,
convenient list, not the only supported labels, and the list can grow without changing the app.

Categories: shelf-edge inserts / tickets · adhesive sticker sheets · plain paper / card with cutting guides ·
promotional cards (A6 / A5 / A4).

Status words: **User-defined** (typed by the user), **Geometry verified** (checked against the manufacturer's published
spec sheet, source cited), **Paper verified** (printed and measured on listed equipment, photo evidence). Nothing is
"supported" until it reaches at least Geometry verified.

## Initial presets (owner decision, 24 Sep 2026)

"Launch" means the app will offer the profile. It does not mean verified: geometry stays **Unverified** until
sourced from the manufacturer, and physical status stays **Pending** until printed and measured. Manufacturer
dimensions alone never become a physical pass.

| Preset | Paper | Labels per sheet | Label size | Pitch / margins | Launch | Geometry | Physical | Notes |
|---|---|---|---|---|---|---|---|---|
| Shelf-edge ticket / insert | A4 (plain card) or supplier insert strip | **14 (2 × 7)** generic plain A4; US Letter also 2 × 7 | **70 × 38 mm** (design size) | computed, centred (A4: 35 mm sides, 15.5 mm top/bottom) | **Yes — priority** | Design dimension | Pending | The format TillLabel is built around. The generic plain-card profile is **14-up** (2 × 70 = 140 mm, 7 × 38 = 266 mm). The 12 labels in earlier review screenshots were a 12-item fixture, not a 12-up profile. A manufacturer's pre-cut 70 × 38 product with a different grid would be its own named preset, sourced from that product. Safe area 2.5 mm. |
| Avery L7160 | A4 | 21 (3 × 7) | 63.5 × 38.1 mm (published, unverified) | not yet sourced | Yes | Unverified | Pending | |
| Avery L7159 | A4 | 24 (3 × 8) | 63.5 × 33.9 mm (published, unverified) | not yet sourced | Yes | Unverified | Pending | |
| Avery L7163 | A4 | 14 (2 × 7) | 99.1 × 38.1 mm (published, unverified) | not yet sourced | Yes | Unverified | Pending | |
| Plain paper / card with cutting guides | A4 or US Letter | computed | chosen ticket size | computed | Yes | Design dimension | Pending | Cut marks printed outside the ticket safe area |
| Offer cards A6 / A5 / A4 | A4 or US Letter (imposed) or the card size itself | 4 / 2 / 1 per A4 | A6 / A5 / A4 | computed | Yes (Pro) | Design dimension | Pending | Cutting guides when imposed on A4 / Letter |
| Custom sheet (user-measured) | A4 | user | user | user | Yes — Pro, advanced | User-defined | Pending | Validated before PDF; test page required |
| Avery L7651 | A4 | 65 (5 × 13) | 38.1 × 21.2 mm (published, unverified) | not yet sourced | Preset deferred until after the first review | Unverified | — | Can still be entered as a custom profile |
| Avery 5160 | US Letter | 30 (3 × 10) | 1 × 2⅝ in (published, unverified) | not yet sourced | Preset deferred; **US Letter geometry supported from G2** | Unverified | — | Physical test of a US Letter product deferred until after the first review |

## What is needed to verify (owner or native operator)

1. The spec sheet for each preset (manufacturer template PDF or product page with top margin, side margin, horizontal
   and vertical pitch). Either allow `avery.co.uk` and `avery.com` in the environment's network policy, or save the
   spec sheets into `docs/evidence/stationery/`.
2. For the 70 × 38 mm shelf-edge format: the exact product (brand, code or supplier) if a perforated insert sheet is used
   rather than plain card.
3. Paper tests after G2 on the Samsung Galaxy S22: top, middle and bottom labels measured with a ruler on one laser and
   one inkjet printer.

## Rules

- Positions are computed from one origin: `x = left + col × (width + gapX)`, `y = top + row × (height + gapY)`.
  Millimetres convert to points once: `pt = mm × 72 / 25.4`.
- Never infer top margins from label size. Never treat similarly named sheets as interchangeable.
- Adhesive sheets are not re-fed: the placement map shows used positions and a material warning (TL-28).


## Safe area (owner handout §10, 24 Sep 2026)

Critical content (SKU, unit price, barcode digits) stays at least 2 mm inside every cut or perforation edge: tickets 2.5 mm, adhesive sheet presets 2 mm, offer cards 6–10 mm. A profile below 2 mm gets the `safeInsetBelowRecommended` warning. Manufacturer presets remain presets on top of the generic engine; their margins stay **Unverified** until checked against the manufacturer's template or a real sheet.
