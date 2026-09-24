# TillLabel — Release recipe

For the native-build operator (Codex). This file is written for TillLabel only. Section 2 builds the **review APK**
for the owner's Samsung Galaxy S22. Section 5 describes the **production AAB**, which is **not** built at this stage.

> **Do not start before the gate allows it.** Build the review APK only from the exact source SHA that the
> independent audit (plan G9) closes, and only when the owner asks for it. This recipe does not authorise store
> work, TillCalc changes or publishing anything.

## 1. Facts

| Item | Value |
|---|---|
| Repository | `https://github.com/joseph2820212-maker/Till-lable` (older links to `till-lable` redirect here) |
| Branch | `main` |
| Source SHA | the SHA named in the audit closure report. Check with `git rev-parse HEAD` before building. |
| App version | `0.1.0` (`app.json` → `expo.version`) |
| Expo SDK | 54 (`expo` ~54.0.36; 54.0.37 installed by `npm ci` from the lockfile) |
| React Native / React | 0.81.5 / 19.1.0, New Architecture on, Hermes |
| Node | 20 (per `.nvmrc`) or 22. The source checks below were run on 22.22.2. |
| Android toolchain | JDK 17, Android SDK platform 36, build-tools 36.0.0, NDK 27.1.12297006, min SDK 24 |
| **Production package** | `com.tilllabel.app` (Android package and iOS bundle id), app name "TillLabel" |
| **Review package** | `com.tilllabel.app.review` (Android package and iOS bundle id), app name "TillLabel Review" |
| Variant switch | `APP_VARIANT=production` (the default when unset) or `APP_VARIANT=review`, read by `app.config.js` |
| Review billing unlock | `EXPO_PUBLIC_BILLING_BYPASS=1`. Allowed **only** with `APP_VARIANT=review`. No RevenueCat keys in a review build. |
| OTA updates | disabled (`updates.enabled: false`). The JS bundle is embedded in the APK. |
| Android OS backup | disabled (`android.allowBackup: false`). The app has its own encrypted backup. |

The review and production identities are different packages, so the review APK installs **beside** a later
production install and can never overwrite it.

## 2. Review APK (for the S22)

### 2.0 Source checks (every time, before any build)

```bash
git clone https://github.com/joseph2820212-maker/Till-lable.git tilllabel && cd tilllabel
git checkout main && git rev-parse HEAD            # must equal the audited SHA
npm ci
npm run typecheck && npm run lint && npm test -- --runInBand --watch=false
APP_VARIANT=review EXPO_PUBLIC_BILLING_BYPASS=1 npm run validate:build   # prints variant=review ... OK
```

All four must be green. The expected test count is the one in the audit closure report for that SHA. If it differs,
stop and report it.

### 2.1 The build-safety guard

`scripts/buildGuard.js` runs **every time Expo reads the app config**, through `app.config.js`. That covers
`expo prebuild`, the release JS bundle step inside Gradle (`expo export:embed`), `expo export` and EAS. It also runs on
its own with `npm run validate:build`, and on EAS before install (`eas-build-pre-install`). It **stops the build**
when:

- the billing bypass is set for a production build (`EXPO_PUBLIC_BILLING_BYPASS` is anything but unset, `''` or `0`);
- `APP_VARIANT` is anything other than `production` or `review`;
- the resolved Android package or iOS bundle id does not match the variant. This includes a production build with the
  review id, and a review build with the production id;
- on EAS, `APP_VARIANT` is missing or does not match the profile, or the profile is not `production` or `review`;
- a review build carries RevenueCat keys (they would switch the review unlock off);
- QA demo mode is set for production;
- an EAS production build has no RevenueCat key or no lifetime product id for its platform;
- `eas.json` drifts: the review profile is not `apk`, production is not `app-bundle`, or a profile's env is wrong.

Never work around a refusal. Fix the environment instead.

### 2.2 Path A: local Gradle build (no Expo account needed)

Export the two variables **once for the whole shell session**. Every step below must see them, because Gradle
re-reads the config and bundles the JS.

```bash
export APP_VARIANT=review
export EXPO_PUBLIC_BILLING_BYPASS=1
unset EXPO_PUBLIC_RC_ANDROID_KEY EXPO_PUBLIC_RC_IOS_KEY

npx expo prebuild -p android --clean     # generates android/ with applicationId com.tilllabel.app.review
grep -n 'applicationId' android/app/build.gradle   # must show com.tilllabel.app.review
cd android && ./gradlew assembleRelease && cd ..
# → android/app/build/outputs/apk/release/app-release.apk
```

Do not edit the generated `android/` files by hand. The identity comes only from `app.config.js`. `android/` is
generated and never committed.

**Signing: one dedicated review key, kept for all review APKs.** A replacement review APK only installs over the
previous one if it has the same key. Create the key **once**, store it and its passwords with the owner, and never
use it for production:

```bash
# once, then keep safely (never commit it)
keytool -genkeypair -v -keystore tilllabel-review.keystore -alias tilllabel-review \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=TillLabel Review"
```

Re-sign the Gradle output with that key, without editing any generated file:

```bash
BT=$ANDROID_HOME/build-tools/36.0.0
$BT/zipalign -p -f 4 android/app/build/outputs/apk/release/app-release.apk aligned.apk
$BT/apksigner sign --ks tilllabel-review.keystore --ks-key-alias tilllabel-review --out review.apk aligned.apk
```

**versionCode.** Path A takes it from `app.json` (`android.versionCode`, currently `1`). Each replacement review APK
needs a higher versionCode. Bump it in `app.json` in a reviewed source commit, then rebuild from that SHA.

### 2.3 Path B: EAS build

```bash
npm i -g eas-cli && eas login
eas init                                   # first time only: writes extra.eas.projectId into app.json; commit it
eas build -p android --profile review
```

The `review` profile in `eas.json` already sets `APP_VARIANT=review` and `EXPO_PUBLIC_BILLING_BYPASS=1`, and
`android.buildType: "apk"`. Its versionCode is managed remotely and increases on every build. Let EAS create and keep
the review keystore. It is separate from the production keystore because the package is different. Download the APK
from the build page.

### 2.4 Name, fingerprint and record the artefact

```bash
SHA=$(git rev-parse --short=8 HEAD)
VC=$($ANDROID_HOME/build-tools/36.0.0/aapt2 dump badging review.apk | sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p")
OUT="TillLabel_Review_0.1.0_b${VC}_${SHA}.apk"
mv review.apk "$OUT"
sha256sum "$OUT" | tee SHA256SUMS.txt
```

Write `BUILD_MANIFEST.json` next to it, containing: the file name, SHA-256, source SHA (full), versionCode,
versionName, package, build path (A or B), the signing certificate SHA-256 (from `apksigner verify --print-certs`),
Node/JDK/build-tools versions, and the build date.

### 2.5 Verify the APK before handing it over

Run every check and record its output in the manifest or build report. If any check fails, the APK is not handed
over.

```bash
BT=$ANDROID_HOME/build-tools/36.0.0
$BT/aapt2 dump badging "$OUT" | grep -E "^package:|application-label:|sdkVersion|targetSdkVersion"
#   package: name='com.tilllabel.app.review' versionCode='<VC>' versionName='0.1.0'
#   application-label:'TillLabel Review'
$BT/apksigner verify --print-certs "$OUT"          # verifies; certificate = the review key, NOT a debug key
unzip -l "$OUT" | grep -E "lib/arm64-v8a/" | head  # arm64-v8a present (the S22 is arm64)
unzip -l "$OUT" | grep -E "assets/index.android.bundle"   # the JS is embedded: no Metro needed
$BT/aapt2 dump xmltree "$OUT" --file AndroidManifest.xml | grep -iE "debuggable|expo.modules.devlauncher|DevMenu" \
  && echo "FAIL: debug/dev-client build" || echo "OK: release, no dev client"
```

- **No Metro / no dev client.** `expo-dev-client` is not a dependency (`package.json`). A release build embeds
  `index.android.bundle`, and the app starts with the phone offline and no computer attached. Check this on the S22:
  install, turn on airplane mode, force-stop, open. It must reach Home.
- **Review identity check on the phone.** Settings → Apps shows "TillLabel Review". Pro features (offers, reduced
  to clear, offer cards) are unlocked without any purchase.
- **Install:** `adb install -r "$OUT"`. A replacement with the same key and a higher versionCode keeps the owner's
  data.

## 3. What the owner tests on the S22

Use the "READY FOR OWNER TEST" table in `docs/gates/BUILD/REPORT.md`: install, camera scanning, printing at exact
scale, paper measurements on each stationery, calibration, barcode scan-back, the Arabic right-to-left walk-through,
and backup → restore on a second phone, including a **benchmark of a substantial backup** (time and memory near the
100 MB cap are device-unverified). Nothing on that list counts as passed until the owner records evidence.

## 4. Things to know

- **Backups** are encrypted with the user's password (AES-256-GCM + scrypt, pure JS). They include the retained
  Print-history PDFs. Nobody can open one without the password.
- **Export compliance.** `ITSAppUsesNonExemptEncryption: false` is set in `app.json`. The only encryption is
  standard AES-GCM / scrypt on the user's own backup file. The owner confirms the answer for their Apple account
  before any iOS store work.
- **Support address.** `EXPO_PUBLIC_SUPPORT_EMAIL` sets the address shown in Help and legal. The default is the
  shared Till family address. The owner confirms the TillLabel address before the production build.
- **Analytics:** none.

## 5. Production AAB (NOT at this stage)

Listed only so the two procedures are never confused. Production is built **only on the owner's instruction, after
the review cycle**.

- Variant: `APP_VARIANT=production` (the `production` profile sets it). Package `com.tilllabel.app`.
- Never set `EXPO_PUBLIC_BILLING_BYPASS`; the guard refuses it.
- Set these as EAS secrets. The guard refuses a production EAS build without the key and lifetime id for its
  platform:

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_RC_ANDROID_KEY` / `EXPO_PUBLIC_RC_IOS_KEY` | RevenueCat public SDK key per platform |
| `EXPO_PUBLIC_RC_LIFETIME_ID_ANDROID` / `EXPO_PUBLIC_RC_LIFETIME_ID_IOS` | store product id of the lifetime unlock (UK £14.99, owner decision 24 Sep 2026) |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | the TillLabel support address, once confirmed by the owner |

- RevenueCat: entitlement `pro`, offering `default`, package `$rc_lifetime`. No subscription or trial product.
- Build: `eas build -p android --profile production` produces an **AAB** (`app-bundle`). The production keystore is
  separate from the review keystore and must be kept for the life of the app.
