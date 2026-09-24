# Printer and stationery matrix

Status words: **User-defined** (typed by the user), **Geometry verified** (checked against the manufacturer's published
spec sheet, source cited), **Paper verified** (printed and measured on listed equipment, photo evidence). Nothing is
"supported" until it reaches at least Geometry verified.

## Candidate presets (G0)

The manufacturer pages could not be read from the build environment (the network policy blocks avery.co.uk). Every
row below is therefore **Unverified**. The sizes are the commonly published ones and are placeholders until checked.

| Preset | Paper | Labels per sheet | Label size (published, unverified) | Pitch / margins | Status | Notes |
|---|---|---|---|---|---|---|
| Avery L7160 | A4 | 21 (3 × 7) | 63.5 × 38.1 mm | not yet sourced | Unverified | Candidate |
| Avery L7159 | A4 | 24 (3 × 8) | 63.5 × 33.9 mm | not yet sourced | Unverified | Candidate |
| Avery L7163 | A4 | 14 (2 × 7) | 99.1 × 38.1 mm | not yet sourced | Unverified | Candidate |
| Avery 5160 | US Letter | 30 (3 × 10) | 1 × 2⅝ in | not yet sourced | Unverified | Candidate |
| Avery L7651 | A4 | 65 (5 × 13) | 38.1 × 21.2 mm | not yet sourced | Unverified | Optional: usable content space must be proven (plan §G) |
| Plain paper 70 × 38 mm with cut guides | A4 | computed | 70 × 38 mm (design size) | computed | Design dimension | Not a proprietary sheet grid |
| Plain paper 50 × 38 mm with cut guides | A4 | computed | 50 × 38 mm (design size) | computed | Design dimension | Not a proprietary sheet grid |

## What is needed to verify (owner or native operator)

1. The spec sheet for each preset (manufacturer template PDF or product page with top margin, side margin, horizontal
   and vertical pitch). Either allow `avery.co.uk` and `avery.com` in the environment's network policy, or save the
   spec sheets into `docs/evidence/stationery/`.
2. Which sheets the shops you know actually buy, including shelf-edge insert strips (brand and code).
3. Paper tests after G2: top, middle and bottom labels measured with a ruler on one laser and one inkjet printer.

## Rules

- Positions are computed from one origin: `x = left + col × (width + gapX)`, `y = top + row × (height + gapY)`.
  Millimetres convert to points once: `pt = mm × 72 / 25.4`.
- Never infer top margins from label size. Never treat similarly named sheets as interchangeable.
- Adhesive sheets are not re-fed: the placement map shows used positions and a material warning (TL-28).
