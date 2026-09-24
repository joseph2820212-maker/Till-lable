#!/usr/bin/env node
/**
 * TillLabel build-safety guard (plan V6 / TL-35, source closure item 4). Plain Node, no dependencies, so it can run
 * before `npm install` on a build server.
 *
 * Two build variants, chosen by APP_VARIANT:
 *   production → com.tilllabel.app          store AAB, billing bypass FORBIDDEN
 *   review     → com.tilllabel.app.review   standalone review APK, installs beside production, bypass allowed
 *
 * It fails closed. It is called by app.config.js whenever Expo reads the config (expo prebuild, the release JS bundle
 * step inside Gradle, EAS), and on its own by `npm run validate:build` (which also checks eas.json).
 */
const fs = require('fs');
const path = require('path');

const PRODUCTION_ID = 'com.tilllabel.app';
const REVIEW_ID = 'com.tilllabel.app.review';
const VARIANTS = {
  production: { id: PRODUCTION_ID, name: 'TillLabel', bypassAllowed: false, easProfile: 'production', androidBuildType: 'app-bundle' },
  review: { id: REVIEW_ID, name: 'TillLabel Review', bypassAllowed: true, easProfile: 'review', androidBuildType: 'apk' },
};

/** Resolve the variant from the environment. Unset means production (the safe default: bypass forbidden). */
function variantFromEnv(env) {
  const raw = env.APP_VARIANT;
  if (raw === undefined || raw === '') return { variant: 'production', explicit: false };
  return { variant: raw, explicit: true };
}

/** Anything other than unset, '' or '0' counts as "bypass requested" (so 'true', 'yes', ' 1' cannot slip through). */
function bypassRequested(env) {
  const v = env.EXPO_PUBLIC_BILLING_BYPASS;
  return v !== undefined && v !== '' && v !== '0';
}

/**
 * Check one build. `resolved` is the final Expo config ({ android: { package }, ios: { bundleIdentifier } }) when known.
 * Returns a list of human-readable errors; empty means safe.
 */
function checkBuild(env, resolved, options = {}) {
  const errors = [];
  const { variant, explicit } = variantFromEnv(env);
  const spec = VARIANTS[variant];
  if (!spec) {
    errors.push(`APP_VARIANT="${variant}" is not a TillLabel build variant (use "production" or "review").`);
    return errors;
  }
  if (env.EXPO_PUBLIC_BILLING_BYPASS !== undefined && !['', '0', '1'].includes(env.EXPO_PUBLIC_BILLING_BYPASS)) {
    errors.push(`EXPO_PUBLIC_BILLING_BYPASS="${env.EXPO_PUBLIC_BILLING_BYPASS}" is ambiguous; use "1" (review only) or leave it unset.`);
  }
  if (bypassRequested(env) && !spec.bypassAllowed) {
    errors.push(`EXPO_PUBLIC_BILLING_BYPASS is set for a ${variant} build. The billing bypass is allowed only with APP_VARIANT=review.`);
  }
  const qaDemo = env.EXPO_PUBLIC_BUILD_VARIANT === 'demo-validation' || (env.EXPO_PUBLIC_QA_FORCE_DEMO !== undefined && env.EXPO_PUBLIC_QA_FORCE_DEMO !== '' && env.EXPO_PUBLIC_QA_FORCE_DEMO !== '0');
  if (variant === 'production' && qaDemo) errors.push('QA demo mode (EXPO_PUBLIC_BUILD_VARIANT / EXPO_PUBLIC_QA_FORCE_DEMO) is set for a production build; it would lock paying customers out of Pro.');
  const rcKeys = ['EXPO_PUBLIC_RC_ANDROID_KEY', 'EXPO_PUBLIC_RC_IOS_KEY'].filter(k => env[k] && String(env[k]).trim());
  if (variant === 'review' && rcKeys.length) errors.push(`A review build must not carry RevenueCat keys (${rcKeys.join(', ')}): with a key present the review unlock is switched off.`);
  // On EAS the variant must be explicit and must match the profile, so a profile can never build the other identity.
  if (env.EAS_BUILD === 'true' || env.EAS_BUILD === '1') {
    const profile = env.EAS_BUILD_PROFILE;
    if (!explicit) errors.push('EAS build without APP_VARIANT: set it in the eas.json profile env.');
    const expected = Object.keys(VARIANTS).find(k => VARIANTS[k].easProfile === profile);
    if (!expected) errors.push(`EAS profile "${profile}" is not a TillLabel profile (production or review).`);
    else if (expected !== variant) errors.push(`EAS profile "${profile}" must build APP_VARIANT=${expected}, not ${variant}.`);
    // A store build without its billing keys would ship with Pro impossible to buy. (Secrets live in EAS, not eas.json.)
    if (variant === 'production' && !options.skipSecrets) {
      const platform = env.EAS_BUILD_PLATFORM === 'ios' ? 'IOS' : 'ANDROID';
      for (const k of [`EXPO_PUBLIC_RC_${platform}_KEY`, `EXPO_PUBLIC_RC_LIFETIME_ID_${platform}`]) {
        if (!env[k] || !String(env[k]).trim()) errors.push(`Production EAS build without ${k}: Pro could not be bought.`);
      }
    }
  }
  if (resolved) {
    const androidId = resolved.android && resolved.android.package;
    const iosId = resolved.ios && resolved.ios.bundleIdentifier;
    if (androidId !== spec.id) errors.push(`Android package is "${androidId}" but a ${variant} build must be "${spec.id}".`);
    if (iosId !== spec.id) errors.push(`iOS bundle identifier is "${iosId}" but a ${variant} build must be "${spec.id}".`);
    if (variant === 'production' && (androidId === REVIEW_ID || iosId === REVIEW_ID)) errors.push('A production build is using the review identity.');
    if (variant === 'review' && (androidId === PRODUCTION_ID || iosId === PRODUCTION_ID)) errors.push('A review build is using the production identity; it would overwrite a production install.');
  }
  return errors;
}

/** Check eas.json: each TillLabel profile pins its variant, its artifact type and the bypass rule. */
function checkEasJson(eas) {
  const errors = [];
  const build = (eas && eas.build) || {};
  for (const [variant, spec] of Object.entries(VARIANTS)) {
    const p = build[spec.easProfile];
    if (!p) { errors.push(`eas.json has no "${spec.easProfile}" profile.`); continue; }
    const env = p.env || {};
    if (env.APP_VARIANT !== variant) errors.push(`eas.json "${spec.easProfile}" must set env.APP_VARIANT="${variant}".`);
    const buildType = p.android && p.android.buildType;
    if (buildType !== spec.androidBuildType) errors.push(`eas.json "${spec.easProfile}" must set android.buildType="${spec.androidBuildType}" (found ${JSON.stringify(buildType)}).`);
    errors.push(...checkBuild({ ...env, EAS_BUILD: 'true', EAS_BUILD_PROFILE: spec.easProfile }, null, { skipSecrets: true }).map(e => `eas.json "${spec.easProfile}": ${e}`));
  }
  for (const name of Object.keys(build)) {
    if (!Object.values(VARIANTS).some(v => v.easProfile === name)) errors.push(`eas.json profile "${name}" is not a TillLabel profile (production or review).`);
  }
  return errors;
}

class BuildGuardError extends Error {
  constructor(errors) { super(`TillLabel build guard refused this build:\n  - ${errors.join('\n  - ')}`); this.name = 'BuildGuardError'; this.errors = errors; }
}

/** Throws unless the build is safe. Used by app.config.js. */
function assertBuild(env, resolved) {
  const errors = checkBuild(env, resolved);
  if (errors.length) throw new BuildGuardError(errors);
}

module.exports = { PRODUCTION_ID, REVIEW_ID, VARIANTS, variantFromEnv, bypassRequested, checkBuild, checkEasJson, assertBuild, BuildGuardError };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const errors = [];
  try { errors.push(...checkEasJson(JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8')))); }
  catch (e) { errors.push(`eas.json could not be read: ${e.message}`); }
  try {
    // app.config.js runs assertBuild itself; a refusal surfaces here as a thrown BuildGuardError.
    const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
    const resolved = require(path.join(root, 'app.config.js'))({ config: appJson.expo });
    const { variant } = variantFromEnv(process.env);
    console.log(`TillLabel build guard: variant=${variant} android=${resolved.android.package} ios=${resolved.ios.bundleIdentifier} bypass=${bypassRequested(process.env) ? 'ON' : 'off'}`);
  } catch (e) {
    errors.push(...(e instanceof BuildGuardError ? e.errors : [e.message]));
  }
  if (errors.length) {
    console.error(`TillLabel build guard FAILED:\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
  }
  console.log('TillLabel build guard: OK');
}
