# Foundation baseline (G0, 24 Sep 2026)

Baselines were run in the build environment (Linux, Node 22.22.2, npm 10.9.7). TillCalc CI pins Node 20. TillLabel
pins Node 20 in `.nvmrc` and CI at G1.

## TillCalc

| Item | Value |
|---|---|
| Repository | joseph2820212-maker/tillcalc |
| Branch / SHA | `main` @ `e7ea8caadd1b2f2e663b3c8059b4102d5515adcc` |
| Tree | clean (`git status --porcelain` empty) |
| App version | 1.0.0 · `com.tillcalc.app` |
| Typecheck | pass (`tsc --noEmit`) |
| Lint | pass (`eslint --max-warnings 0`) |
| Tests | **101 suites / 1,043 tests, all passed** (18.2 s, `jest --runInBand --silent`) |
| Known issue | A time-based run-ID uniqueness test in the locked pricing engine failed once in an earlier session and passed on rerun. It passed in this baseline. Not TillLabel's concern; not copied. |
| Device evidence | None yet for TillCalc (owner device pass pending per its `DEVICE_CHECKLIST.md`) |

## Till Note

| Item | Value |
|---|---|
| Repository | joseph2820212-maker/PrivateBusinessVault_Master_v10_2 |
| Branch / SHA | `codex/testflight-1.0.5-ui-fixes-20260915` @ `b647a481` ("chore(release): remove temporary TestFlight workflow", 15 Sep 2026) |
| How run | `git archive b647a481` into a scratch folder (the Till Note working copy was not touched), `npm ci --ignore-scripts` |
| Typecheck | pass (`tsc --noEmit -p tsconfig.app.json`) |
| Lint | pass |
| Tests | **533 suites / 5,553 tests: 5,552 passed, 1 failed** (95.5 s) |
| The failure | `src/modules/billing/__tests__/billingSourceGuards.test.ts` › "adds billing to Settings without rewriting business math modules" runs `git diff --name-only HEAD`. The archive export has no `.git`, so git refuses. **Environmental, inherited, not a code defect.** It would pass in a git checkout. |
| Note | `6fa6e941` (`codex/till-note-visual-correction`, cited by the plan) is later than `b647a481` and not its descendant; 203 files differ. The owner chose `b647a481`. |

## Toolchain shared by both apps

| Package | TillCalc | Till Note |
|---|---|---|
| expo | ~54.0.36 | ~54.0.36 |
| react-native | 0.81.5 | 0.81.5 |
| react | 19.1.0 | 19.1.0 |
| typescript | ~5.9.0 | ~5.9.0 |
| expo-print | ~15.0.8 | ~15.0.8 |
| expo-sharing | ~14.0.8 | ~14.0.8 |
| expo-document-picker | ~14.0.8 | ~14.0.0 |
| expo-camera | ~17.0.10 | — |
| expo-file-system | ~19.0.23 | ~19.0.23 |
| react-native-purchases | ^10.4.0 | ^10.4.0 |
| @noble/ciphers, @noble/hashes | ^2.2.0 | ^2.2.0 |
| jest | ^29.7.0 | ^29.7.0 |
| async-storage | 2.2.0 | 2.2.0 |

TillLabel starts from TillCalc's lockfile unchanged. No SDK upgrade in Release 1.

## Logs

Raw logs are kept outside the repo (scratch). Counts above are copied from them. Re-running the same commands on the
same SHAs reproduces them.
