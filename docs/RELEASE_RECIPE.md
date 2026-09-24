# TillLabel — Release recipe (for Codex)

> **Status: INHERITED FROM TILLCALC, NOT YET VALID FOR TILLLABEL.** Kept as the structure for G10. The branch name,
> test counts, profiles and identifiers below are TillCalc's. G10 regenerates this file with TillLabel facts
> (`com.tilllabel.app`, `com.tilllabel.app.review`, the review APK profile, the exact source SHA). Do not build
> TillLabel from this file before then.

Everything below was verified in the build sandbox except the native compile itself, which the
sandbox cannot run (no Android SDK, `dl.google.com` / `maven.google.com` / `api.expo.dev` blocked).
Run the steps in order on a machine with normal internet access.

Branch: `claude/build-a-to-z` · Expo SDK 54 · React Native 0.81.5 · Node 22 · TypeScript strict.

## 0. What is already proven in this repo

| Check | Result | Command |
|---|---|---|
| Types | clean | `npm run typecheck` |
| Lint | clean, zero warnings | `npm run lint` |
| Tests | 82 suites / 790 tests (+ navigation walk in six languages) | `npm test` |
| Expo config resolves with all plugins | exit 0 | `npx expo config --type introspect` |
| Release JS bundle builds | `index-*.hbc` 7.6 MB + assets | `npx expo export --platform android` |
| expo-doctor | 16/18 pass; the 2 failures are the network-only checks (config schema fetch, React Native Directory metadata) | `npx expo-doctor` |

Re-run the first three before every build. They must be green.

## 1. Test APK (everything unlocked) — the build the owner installs first

The test APK is built with the billing bypass so every Pro feature is testable without a store account.
No RevenueCat key is needed for this build.

### Path A — local Gradle build (fastest to iterate)

Prerequisites: JDK 17, Android SDK with platform 35, build-tools 35.0.0, NDK 27.1.12297006 (Expo SDK 54
defaults), `ANDROID_HOME` set.

```bash
git clone <repo> tillcalc && cd tillcalc && git checkout claude/build-a-to-z
npm ci
npm run typecheck && npm run lint && npm test

# Generate the native project (runs plugins/pdfiumAndroidVersion.js and the config plugins)
EXPO_PUBLIC_BILLING_BYPASS=1 npx expo prebuild -p android --clean

# One-off test keystore (never use for the store build)
keytool -genkeypair -v -keystore android/app/tillcalc-test.keystore -alias tillcalc-test \
  -keyalg RSA -keysize 2048 -validity 10000 -storepass tillcalc -keypass tillcalc \
  -dname "CN=TillCalc Test, O=LLILL LTD, C=GB"

# Point the release signing config at it (android/app/build.gradle → signingConfigs.release),
# or simply build a debug-signed release variant:
cd android && EXPO_PUBLIC_BILLING_BYPASS=1 ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

`EXPO_PUBLIC_*` variables are inlined at JS bundle time, so the variable must be set for the
`prebuild`/`gradlew` invocation that bundles the JS (both shown above).

### Path B — EAS build (no local SDK)

```bash
npm i -g eas-cli && eas login
eas init                    # writes extra.eas.projectId into app.json — commit it
EXPO_PUBLIC_BILLING_BYPASS=1 eas build -p android --profile preview
```

The `preview` profile in `eas.json` is `distribution: internal`, which produces an APK.
(`production` produces an AAB for Play.) Download the artifact from the EAS build page.

## 2. Store build (Pro gated by RevenueCat)

Set these before the build; nothing else in the source changes (see `src/modules/billing/billingConfig.ts`):

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_RC_ANDROID_KEY` | RevenueCat public SDK key (Android) |
| `EXPO_PUBLIC_RC_IOS_KEY` | RevenueCat public SDK key (iOS) |
| `EXPO_PUBLIC_RC_LIFETIME_ID_ANDROID` | Play product id of the lifetime unlock |
| `EXPO_PUBLIC_RC_LIFETIME_ID_IOS` | App Store product id of the lifetime unlock |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | support address shown in Help / About / legal (default support@tillnote.com — same as Till Note) |
| `EXPO_PUBLIC_PRIVACY_EMAIL`, `EXPO_PUBLIC_LEGAL_EMAIL`, `EXPO_PUBLIC_SECURITY_EMAIL` | optional overrides for the privacy / legal / security addresses in the legal documents (defaults: the Till Note addresses) |

Do **not** set `EXPO_PUBLIC_BILLING_BYPASS` for the store build.

RevenueCat dashboard: entitlement `pro`, offering `default`, one package `$rc_lifetime` attached to the
lifetime product on each store. The app reads exactly these identifiers.

Identification rule (audit F07): the app buys ONLY the `$rc_lifetime` package (a package whose product id equals
`EXPO_PUBLIC_RC_LIFETIME_ID_*` is accepted too) and never falls back to "the first package". A paid entitlement is
trusted offline only when its product id EXACTLY equals `EXPO_PUBLIC_RC_LIFETIME_ID_*` for the platform (or it is a
RevenueCat promotional grant); with those variables unset, Pro still works online but is re-verified on each launch.
Set both variables in the store build. There is no monthly, yearly or trial product in Release 1.

```bash
eas build -p android --profile production     # AAB for Play
eas build -p ios --profile production          # for App Store
```

Production keystore / Apple signing: let EAS manage credentials (`eas credentials`) unless the owner
already has a keystore; either way the keystore must be kept — a lost keystore means a new package name.

## 3. Things to know

- `app.json` is additive: `expo-camera` (barcode scanning, camera permission text in six native locales
  under `native-locales/`), `expo-document-picker` (CSV import, backup restore),
  `android.allowBackup=false` (no OS-level cloud copy of the store). `react-native-purchases` autolinks
  and needs no config plugin.
- Optional: `npx expo install expo-system-ui` silences the introspection hint about
  `userInterfaceStyle` on Android. Not required for release.
- Export-compliance flag (audit F08.3): `app.json` sets `ITSAppUsesNonExemptEncryption: false`. The only encryption
  in the app is the standard AES-256-GCM / scrypt used for the user's own backup files (no proprietary algorithms, no
  encrypted network traffic of its own beyond the platform's TLS). Standard-algorithm use of this kind is normally
  exempt, but the owner must confirm the answer to Apple's export-compliance question for their account and, if
  required, file the annual self-classification report. Leave the flag as it is unless that review says otherwise.
- OTA updates (audit F08.1): `app.json` sets `updates.enabled: false` — the app never fetches code updates itself and
  the privacy policy says so. If Codex adopts EAS Update later, flip the flag AND update `legal.privacy.l5` in the six
  locales in the same change.
- Backups: encrypted with the user's passphrase (AES-256-GCM + scrypt, pure JS). Nobody can open a backup
  without the passphrase; there is no recovery path by design.
- Analytics: none in Release 1. Store metrics and RevenueCat purchase data only.
- Not in Release 1 (deliberate): hourly/day-rate, job costing, staff cost estimator, ratios, app-wide
  search, product lookup provider, any payroll/PAYE/NI wording, external benchmarks.

## 4. Store listing inputs (from Scope v2.1)

- Name: **TillCalc**. Subtitle: **Pricing & Profit Calculator**.
- One-liner: *Supplier put prices up? Enter the new costs, keep your margin, accept each price, print the changes.*
- Privacy line: *Everything stays on your phone. No account, no tracking, no analytics. Purchases go through your app store.*
- Screenshot frames: Figma file `zKAriksP3OQbIszvaeslXW` (Price Lists, Cost changed steps 1–3, Done, Item, Quick margin, Cash-up, Backup).
- Free vs Pro copy: `billing.proSummary` in `src/locales/en.json`.

## 5. After the owner's device pass

Work through `docs/DEVICE_CHECKLIST.md` on the test APK. Anything that fails there is a bug to fix
before the store build, not a listing task.
