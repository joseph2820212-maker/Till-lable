# TillLabel

Till Note family app: prints shelf-edge price, offer and reduced-to-clear labels from a saved product list, and
reprints only what changed. Offline, no account.

Status: **G1 (isolated skeleton)**. Four tabs (Home, Products, To print, More), exact money and record types, TillLabel identity. Label features arrive gate by gate (`docs/SCREEN_REGISTER.md`). Build plan: TNF-TL-R1-PLAN-1.1 (24 Sep 2026) with the
corrections in `docs/gates/G00/REPORT.md`. Work happens on `main` (owner decision, 24 Sep 2026).

## Checks

```
npm ci
npm run typecheck && npm run lint && npm test -- --runInBand
```
