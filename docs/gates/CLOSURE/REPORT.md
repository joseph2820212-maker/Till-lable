# Source-closure report — before the independent audit

| | |
|---|---|
| Starting point | `main` @ `8f31e887e0d90962b0f9a81f0e4067976334c531` (accepted as a working checkpoint) |
| Closure source commit | `99429c273ba6118f2799d0f773bdf9d482a92a8e` |
| First report | `6efda34b841d25eddce43e898387e7a006989b5c` (documentation only) |
| Final owner decisions (§9) | implemented in the commit that contains this version of the report. **The audit target is that commit**, `main` HEAD as given to the auditor by the owner. |
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
| A missing or damaged retained PDF is handled safely | **Superseded by the owner decision in §9:** the backup stops and asks; it continues only when the user explicitly chooses to back up without the listed PDFs. | §9 tests |
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

## 9. Final owner decisions (implemented)

### 9.1 A missing or damaged history PDF no longer blocks every backup, and is never skipped silently

- `createBackup()` first stats every referenced retained PDF, then reads and hashes the ones present. If any are
  missing, or their bytes no longer match the job's `pdfSha256`, it **writes and shares nothing**. It throws
  `BackupError('pdfs-unavailable')` listing every affected entry: job id, name, and `missing` or `corrupt`.
- The Backup screen shows "Some print-history PDFs cannot be included". The message gives the count, explains that the
  business data can still be backed up, and names up to 5 entries. The buttons are **Cancel** and **Back up without
  missing PDF(s)**. Cancel writes nothing.
- Continuing calls `createBackup(…, { omitUnavailablePdfs: [those job ids] })`. Only the agreed entries lose their
  PDF. If another PDF has gone missing in the meantime, the backup stops again, so agreement never covers anything
  the user wasn't shown.
- In the backup, each affected job keeps all its history fields, with `pdfUri: ''` and `pdfUnavailable: true`. The
  file header and the result carry `omittedPdfCount`: the number of history entries in the file without their PDF,
  counted honestly and including any that were already unavailable. The success message and the restore preview
  ("History entries without PDF") show it.
- On restore, those entries stay in Print history. The row shows "PDF not available". Print preview shows
  `print.pdfNotOnPhone` and offers no Print or Share. v1/v2 backups mark their entries the same way. No path from the
  source phone survives.
- Tests (`backupAssets.test.tsx`, `backupScreen.test.tsx`):
  - one missing PDF → stop, entry listed, nothing shared;
  - screen: Cancel → no file written or shared;
  - screen: continue → one file shared, and the summary counts the omission;
  - explicit continue → products, queue, offers, reductions and settings all survive a restore on another phone,
    the available PDFs are byte-identical, and the missing entry is visible, marked, and cannot Print or Share;
  - a damaged PDF shared by two entries → both listed as `corrupt`, same explicit rule;
  - agreeing to omit one PDF does not cover a second missing one.

### 9.2 Orphaned retained PDFs

- `jobStore.recordJob()`: when history goes over 300 entries, the pruned jobs are returned from the same history
  transaction. After it commits, a pruned job's PDF is deleted **only if no surviving job refers to the same file**.
  The delete is best effort, under the retained-PDF lock, and a failure never affects the history write.
- `reconcileJobPdfs()` → `retainedPdfs.reconcileRetainedPdfs()` runs in the background at every app start. It
  removes files in `<documents>/pdf-cache/` that no job refers to, with these safeguards:
  - it only considers safe `.pdf` names directly in that directory, and nothing in the cache directory;
  - it only removes files older than 10 minutes, because a PDF is written just before its job is recorded;
  - it holds the same lock as backup and restore;
  - it matches references by file name, so an older absolute path (for example, iOS moving the app container) can
    only keep a file, never delete it;
  - it reads history **strictly**, so a corrupt or unreadable history deletes **nothing** (the ordinary list reader
    would have returned "no jobs" and deleted every PDF);
  - it never throws.
- Tests (`src/modules/print/__tests__/retainedPdfs.test.ts`):
  - pruning deletes an unshared PDF and keeps a PDF still shared with a survivor;
  - a failed delete leaves history correct, and reconciliation removes the file later;
  - reconciliation keeps referenced, recent, non-PDF, nested and other-directory files;
  - an old-location path still protects its file;
  - corrupt history deletes nothing;
  - a partial delete failure is counted and does not throw.

### 9.3 Not changed, as decided

- **100 MB cap** is unchanged for the review candidate. Backup **memory and time are device-unverified**. The file is
  built as JSON → UTF-8 → AES-GCM → base64 in JS memory, so peak RAM can be a multiple of the final file size. It is
  on the S22 checklist (`docs/gates/BUILD/REPORT.md`) and is flagged for the auditor.
- **Unreadable restore journal:** left exactly as it is, for the auditor to challenge (point 4 below).
- **versionCode 1** for the first review APK. Replacements get a higher versionCode and the same key, as the recipe
  already says.

### 9.4 Verification (final)

```
npm run typecheck && npm run lint && npm test -- --runInBand --silent
  typecheck: clean · lint: clean, 0 warnings
  Test Suites: 60 passed, 60 total
  Tests:       1 skipped, 586 passed, 587 total        (was 59 / 576 at 6efda34)

APP_VARIANT=review EXPO_PUBLIC_BILLING_BYPASS=1 npx expo export --platform android
  exit 0 · Hermes bundle index-*.hbc 9,237,906 bytes · 34 assets
```

TillCalc `main` is still `e7ea8ca` and Till Note is still `b647a481`: both unchanged. No APK was built.

## For the independent auditor — known limits and open questions (not fixed here)

1. ~~Orphaned PDFs~~: fixed, see §9.2.
2. ~~One lost PDF blocks every backup~~: resolved by the owner decision, see §9.1.
3. **Memory and time on the device (owner: review this for memory amplification).** A backup near the 100 MB cap is built as one string in JS memory, and every
   PDF is hashed with pure-JS SHA-256. Neither has been measured on the S22.
4. **Unreadable journal (owner: the auditor should challenge this failure path specifically).** If the marker says `prepared` but the journal file is unreadable, recovery clears the
   transaction and returns `unrecoverable` rather than blocking all future restores. The store may then be partial,
   and the user is expected to restore again. The only path to this state is corruption of the app's own document
   storage.
5. **Path A versionCode** comes from `app.json` (1). The owner accepts this for the first review APK; replacements
   need a higher versionCode and the same key.
6. **Repository visibility.** `joseph2820212-maker/Till-lable` is **public** (TillCalc is private). Only the owner can
   change this, in GitHub → Settings → General → Danger Zone → Change visibility.
7. **Process note.** The work from G3 to G8 was done in one run without the agreed stop after G2. This closure does
   not change that history. The audit should treat all of G3–G8 as unreviewed.
8. **iOS absolute paths (not a review-APK concern).** Jobs store absolute `pdfUri` values. If iOS moves the app
   container, backup treats an old-location path as "not retained" and marks that entry unavailable without asking,
   and Print preview would not find the file. Reconciliation is safe here, because it matches by name and keeps the
   file. Android keeps a stable path. This needs a decision before any iOS build.
