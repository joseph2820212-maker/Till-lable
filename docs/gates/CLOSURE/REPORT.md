# Source-closure report — before the independent audit

| | |
|---|---|
| Starting point | `main` @ `8f31e887e0d90962b0f9a81f0e4067976334c531` (accepted as a working checkpoint) |
| Closure source commit | `99429c273ba6118f2799d0f773bdf9d482a92a8e` |
| This report | added in the next commit (documentation only). The audit target is that final `main` HEAD. |
| Date | 24 Sep 2026 |
| Verdict | **Source closure done.** All eight items are closed at source level. The **APK is not built**. Physical and device checks are still **READY FOR OWNER TEST**. |

The app is a **source-complete candidate**, not a proven app. The camera, the Arabic right-to-left layout, printing at
exact scale and barcode scan-back stay unproven until the review APK runs on the S22.

## 1. Asset-aware backup / restore — CLOSED (source)

`src/modules/backup/backupFile.ts` was rewritten. It reuses the Till Note asset-transaction **design** (stage →
journal → commit → verify → roll back), not its code wholesale.

| Requirement | How it is met | Proven by |
|---|---|---|
| Retained print-job PDFs are backed up | Backup format v3 encrypts `{data, assets}`. The assets are found **explicitly** from the jobs list (`pdfUri` inside the app's `pdf-cache/`), not by scanning stored values. Several history entries that share one file store it once. | `backupAssets.test.tsx` › round trip |
| Size estimate and hard cap at creation | `estimateBackupBytes()` works out the final file size from the file sizes before **any** PDF is read. Above `MAX_BACKUP_BYTES` (100 MB) it stops with `too-large`. The same cap is checked again while reading, and restore refuses files above it. | › "refuses from the file sizes alone: no PDF is read"; › "estimate is never below the real file" |
| A missing retained PDF fails backup safely | `missing-pdf` names the history entry and nothing is shared. A PDF whose bytes no longer match the job's SHA-256 fails with `corrupt-pdf`. A job whose PDF was never retained (generation fell back to a temporary file, or it came from an older backup) keeps its record without a path and does not block backup. | › "backup fails closed…"; › older backup case |
| Path traversal / reserved paths | A restored PDF may only be a plain ASCII name written directly into `<documents>/pdf-cache/`. No separators, dot-segments, leading dots, percent escapes or backslashes, and it can never reach the reserved `.tilllabel_restore/` directory. A bad name rejects the **whole** restore before anything is written. | › 14 hostile names; › "accepts every name the app itself generates" |
| Staged restore | The PDFs are staged into `.tilllabel_restore/`. Any file they would replace is copied there first. The journal (store snapshot + file plan) is written to a file, with a small checksummed marker in AsyncStorage. | › interrupted cases |
| Written files verified | Every staged and final write is read back and compared. Staged bytes are re-hashed against the expected SHA-256 before being moved into place. Before that, every asset is checked against its declared SHA-256 **and** the job's `pdfSha256`. | › "restore refuses a backup whose PDF bytes do not match…" |
| Metadata and files roll back together | A failure after the PDFs are written restores the replaced PDF, deletes the new ones and restores the store. A crash (the in-process rollback also dies) leaves the marker `prepared`, and the next launch rolls both back. Once `committed`, a later launch never rolls back. | › three interrupted-restore tests; `backupFile.test.ts` marker test |
| `pdfUri` rewritten, no stale source-phone URI | Job records are parsed and each `pdfUri` is set to this phone's `pdf-cache/` path. v1/v2 backups (no PDFs) set `pdfUri` to `''`. The test restores on a phone with a different document directory and asserts the source directory appears **nowhere** in storage. | › round trip; › older backup |
| Print History opens the exact historical PDF | After restore, each job's file is byte-identical, its SHA-256 equals `pdfSha256`, and `PrintPreviewScreen` is rendered and passes that exact URI to the preview. A job whose PDF is not on the phone shows `print.pdfNotOnPhone` and offers no Print or Share. | › round trip (screen rendered per job) |
| Still encrypted | v3 is AES-256-GCM + scrypt. The test confirms no PDF bytes and no `pdf-cache` path appear in the file. | › round trip |
| Exclusions unchanged | `drafts:`, `billing:`, `app:`, `backup:`, `journal:` and `tilllabel:` are never exported or restored. | `backupFile.test.ts` (unchanged assertions) |

The other visible changes are: new six-language strings (`backup.createErrors.*`, `backup.counts.pdfs`,
`print.pdfNotOnPhone`), the Backup screen names the history entry at fault, and the restore preview shows the PDF
count.

Test-harness finding: the jest-expo preset replaced `expo-file-system/legacy` with blank stubs, so the backup
suites never had a working file system. The three backup suites now load the in-memory mock explicitly.

## 2. Review build identity — CLOSED

`app.config.js` (new) builds on `app.json`. `APP_VARIANT=review` gives Android package **and** iOS bundle id
`com.tilllabel.app.review`, the name "TillLabel Review" and `extra.appVariant`. Unset or `production` keeps
`com.tilllabel.app`. Nothing else differs between the variants (the test compares the resolved configs). No
generated native file was edited. Checked with `APP_VARIANT=review npx expo config` →
`package: 'com.tilllabel.app.review'`.

## 3. eas.json — CLOSED

- `review`: `distribution: internal`, `android.buildType: "apk"`, env `APP_VARIANT=review` and
  `EXPO_PUBLIC_BILLING_BYPASS=1`, `autoIncrement`.
- `production`: `android.buildType: "app-bundle"`, env `APP_VARIANT=production`.
- The inherited `preview` profile was removed. It had no buildType and no variant. The guard now rejects any profile
  that is not `production` or `review`.

## 4. Build-safety guard — CLOSED

`scripts/buildGuard.js` is plain Node with no dependencies. `app.config.js` calls it on **every** Expo config read
(prebuild, the Gradle JS-bundle step, `expo export`, EAS). It also runs as `npm run validate:build` and as
`eas-build-pre-install`. It fails closed on:

- the bypass in production, however it is spelt (`1`, `true`, `yes`, ` 1`);
- an unknown variant;
- an identity that does not match its variant, in either direction;
- on EAS, a missing variant, a variant that does not match the profile, or a foreign profile;
- store keys in a review build;
- QA demo mode in production;
- a production EAS build without the RevenueCat key and lifetime id for its platform;
- `eas.json` drift.

Checked for real, not only in unit tests:

| Command | Result |
|---|---|
| `npm run validate:build` | OK (variant=production, bypass off) |
| `APP_VARIANT=review EXPO_PUBLIC_BILLING_BYPASS=1 npm run validate:build` | OK (variant=review, bypass ON) |
| `EXPO_PUBLIC_BILLING_BYPASS=1 npm run validate:build` | **exit 1**: bypass refused for production |
| `EXPO_PUBLIC_BILLING_BYPASS=1 npx expo export --platform android` | **exit 1**: `BuildGuardError` while Expo reads the config |
| `APP_VARIANT=staging npx expo config` | refused: unknown variant |

Tests: `src/__tests__/buildGuard.test.ts`, 11 tests covering positive and negative cases, eas.json drift and the
recipe content.

## 5. Release recipe — CLOSED

`docs/RELEASE_RECIPE.md` is fully replaced. It covers:

- the repository, branch, and how to confirm the SHA;
- prerequisites and versions (Expo 54, React Native 0.81.5, React 19.1.0, Node 20/22, JDK 17, SDK 36, build-tools
  36.0.0, NDK 27.1.12297006);
- both package ids, the variant switch, and the review bypass rule;
- the source checks;
- the guard: what it refuses and where it runs;
- Path A (local Gradle, one dedicated review signing key with no hand-edited generated files) and Path B (EAS
  `--profile review`);
- the artefact name `TillLabel_Review_0.1.0_b<versionCode>_<sha8>.apk` and `SHA256SUMS.txt`;
- `BUILD_MANIFEST.json` contents;
- verification: `aapt2` package, label and versionCode; `apksigner` certificate; `arm64-v8a`; embedded
  `index.android.bundle`; no debuggable or dev-client entries; an airplane-mode start on the S22;
- production/AAB kept in a separate section that is marked "NOT at this stage".

A test fails if TillCalc identifiers, the old profile, the old branch or keystore, store copy, stale test counts or
the "NOT YET VALID" banner come back.

## 6. Verification (this closure)

```
npm run typecheck && npm run lint && npm test -- --runInBand --silent
  typecheck: clean · lint: clean, 0 warnings
  Test Suites: 59 passed, 59 total
  Tests:       1 skipped, 576 passed, 577 total        (was 57 suites / 541 passed at 8f31e88)

APP_VARIANT=review EXPO_PUBLIC_BILLING_BYPASS=1 npx expo export --platform android
  exit 0 · Hermes bundle index-*.hbc 9,225,919 bytes · 34 assets (label fonts included)
```

New and changed tests: `backupAssets.test.tsx` (24), `buildGuard.test.ts` (11), `backupFile.test.ts` (journal
test rewritten for the new transaction format), `backupScreen.test.tsx` (uses the in-memory file system).

## 7. Source apps protected

| App | Check | Result |
|---|---|---|
| TillCalc | `git ls-remote origin refs/heads/main` | `e7ea8caadd1b2f2e663b3c8059b4102d5515adcc`: unchanged, working tree clean. **No exporter added.** |
| Till Note | `git ls-remote origin refs/heads/codex/testflight-1.0.5-ui-fixes-20260915` | `b647a48122329ae1dbaed091b97fef0d45db1b39`: unchanged. No Till Note file touched. |

## 8. Stop

Committed and pushed to TillLabel `main`, then stopped. **Not done, deliberately:**

- no APK build;
- no store work;
- no TillCalc change;
- no feature expansion.

## For the independent auditor — known limits and open questions (not fixed here)

1. **Orphaned PDFs.** The job list is capped at 300 (`jobStore.MAX_JOBS`). A pruned job's PDF file is not deleted,
   so disk use can grow. Those files are never backed up, because only files referenced by a job are collected.
   (After a successful restore, the replaced history's PDFs **are** removed.)
2. **One lost PDF blocks every backup.** As instructed, a missing retained PDF fails backup. No in-app action removes
   a single history entry, so a user whose PDF was deleted outside the app cannot back up until this is decided.
   This needs an owner decision.
3. **Memory and time on the device.** A backup near the 100 MB cap is built as one string in JS memory, and every
   PDF is hashed with pure-JS SHA-256. Neither has been measured on the S22.
4. **Unreadable journal.** If the marker says `prepared` but the journal file is unreadable, recovery clears the
   transaction and returns `unrecoverable` rather than blocking all future restores. The store may then be partial,
   and the user is expected to restore again. The only path to this state is corruption of the app's own document
   storage.
5. **Path A versionCode** comes from `app.json` (1). A replacement review APK built locally needs a reviewed bump
   commit. EAS (Path B) increments it remotely.
6. **Repository visibility.** `joseph2820212-maker/Till-lable` is **public** (TillCalc is private). Only the owner can
   change this, in GitHub → Settings → General → Danger Zone → Change visibility.
7. **Process note.** The work from G3 to G8 was done in one run without the agreed stop after G2. This closure does
   not change that history. The audit should treat all of G3–G8 as unreviewed.
