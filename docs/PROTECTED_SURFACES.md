# Protected surfaces

TillLabel reads both source apps. It never edits them, except the one TillCalc exporter commit that needs owner
approval at G6. SHAs are recorded again at G6, G9 and G10 (acceptance test TL-42).

## Source apps

| App | Repository | Baseline | Rule |
|---|---|---|---|
| TillCalc | joseph2820212-maker/tillcalc | `main` @ `e7ea8caadd1b2f2e663b3c8059b4102d5515adcc` | Read-only. One exporter commit after owner approval. |
| Till Note | joseph2820212-maker/PrivateBusinessVault_Master_v10_2 | `codex/testflight-1.0.5-ui-fixes-20260915` @ `b647a481` | Read-only. Never edited by TillLabel work. |

## Locked files that may be read or copied, never edited in their source app

**Till Note (its CLAUDE.md):** `src/storage/secureStorage.ts`, `src/storage/appStorage.ts`,
`src/modules/onboarding/utils/recoveryKey.ts`, the PIN and recovery screens under `src/modules/onboarding/screens/`,
`src/modules/settingsBackup/storage/settingsBackupStorage.ts` `changePin()`,
`src/modules/settingsBackup/utils/settingsHelpers.ts` `generateRecoveryKeyLocal()`, `src/utils/useFilePicker.ts`,
`src/components/FileViewerModal.tsx`. TillLabel does not need the PIN, recovery or vault flows. It copies no file
from this list without recording why in `REUSE_MANIFEST.md`.

**TillCalc (repair protocol):** `src/modules/pricing/pricingEngine.ts`, `supplierCompare.ts`,
`src/modules/calculators/utils/calculatorFormulas.ts`, `costBuyingFormulas.ts`, `src/backup/backupCrypto.ts`, PDF
templates, `PricingPdf/Share/SaveScreen`, billing internals, `eas.json`. In TillLabel, `backupCrypto.ts` is copied
unchanged (authenticated encryption and KDF limits are preserved). Calculator formulas are used only as test oracles.

## Verification command (run at G6, G9, G10)

```
git -C <tillcalc> rev-parse HEAD            # e7ea8ca…, or e7ea8ca + the approved exporter commit only
git -C <tillnote> rev-parse b647a481^{commit}
git -C <tillnote> status --porcelain         # no changes caused by TillLabel work
```
