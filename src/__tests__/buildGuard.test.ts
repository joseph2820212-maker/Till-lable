/**
 * Build-safety guard and build identities (source closure items 2–4, TL-35). The guard is plain Node in
 * scripts/buildGuard.js and is run by app.config.js on every Expo config read.
 */
const guard = require('../../scripts/buildGuard');
const appConfig = require('../../app.config');
const appJson = require('../../app.json');
const easJson = require('../../eas.json');

const resolve = (env: Record<string, string | undefined>) => {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (k.startsWith('EXPO_PUBLIC_') || k.startsWith('EAS_BUILD') || k === 'APP_VARIANT') delete process.env[k];
  Object.assign(process.env, env);
  try { return appConfig({ config: JSON.parse(JSON.stringify(appJson.expo)) }); }
  finally { process.env = saved; }
};

describe('build identities', () => {
  it('production is com.tilllabel.app; review is com.tilllabel.app.review with its own name, so it installs beside production', () => {
    const prod = resolve({ APP_VARIANT: 'production' });
    expect(prod.android.package).toBe('com.tilllabel.app');
    expect(prod.ios.bundleIdentifier).toBe('com.tilllabel.app');
    expect(prod.name).toBe('TillLabel');
    const review = resolve({ APP_VARIANT: 'review', EXPO_PUBLIC_BILLING_BYPASS: '1' });
    expect(review.android.package).toBe('com.tilllabel.app.review');
    expect(review.ios.bundleIdentifier).toBe('com.tilllabel.app.review');
    expect(review.name).toBe('TillLabel Review');
    expect(review.extra.appVariant).toBe('review');
    // Everything else about the app is identical between the two.
    expect({ ...review.android, package: '' }).toEqual({ ...prod.android, package: '' });
    expect(review.plugins).toEqual(prod.plugins);
    expect(review.version).toBe(prod.version);
  });
  it('an unset variant is production (the safe default) and app.json itself holds the production identity', () => {
    expect(resolve({}).android.package).toBe('com.tilllabel.app');
    expect(appJson.expo.android.package).toBe('com.tilllabel.app');
    expect(appJson.expo.android.allowBackup).toBe(false);
  });
});

describe('eas.json', () => {
  it('review builds an APK with the review variant and the bypass; production builds an AAB with no bypass', () => {
    expect(easJson.build.review.android.buildType).toBe('apk');
    expect(easJson.build.review.env).toEqual({ APP_VARIANT: 'review', EXPO_PUBLIC_BILLING_BYPASS: '1' });
    expect(easJson.build.production.android.buildType).toBe('app-bundle');
    expect(easJson.build.production.env).toEqual({ APP_VARIANT: 'production' });
    expect(guard.checkEasJson(easJson)).toEqual([]);
  });
  it('the guard catches every way eas.json can drift', () => {
    const bad = (mutate: (e: any) => void) => { const e = JSON.parse(JSON.stringify(easJson)); mutate(e); return guard.checkEasJson(e).join(' | '); };
    expect(bad(e => { delete e.build.review.android.buildType; })).toMatch(/review.*buildType="apk"/);
    expect(bad(e => { e.build.production.android.buildType = 'apk'; })).toMatch(/production.*app-bundle/);
    expect(bad(e => { e.build.production.env.EXPO_PUBLIC_BILLING_BYPASS = '1'; })).toMatch(/bypass is allowed only with APP_VARIANT=review/);
    expect(bad(e => { e.build.review.env.APP_VARIANT = 'production'; })).toMatch(/review.*APP_VARIANT="review"/);
    expect(bad(e => { delete e.build.production.env; })).toMatch(/production.*APP_VARIANT="production"/);
    expect(bad(e => { e.build.preview = { distribution: 'internal' }; })).toMatch(/"preview" is not a TillLabel profile/);
    expect(bad(e => { delete e.build.review; })).toMatch(/no "review" profile/);
  });
});

describe('the guard fails closed', () => {
  const refuses = (env: Record<string, string>, pattern: RegExp) => expect(() => resolve(env)).toThrow(pattern);
  it('production with the billing bypass is refused, however the value is spelt', () => {
    for (const v of ['1', 'true', 'yes', ' 1']) refuses({ APP_VARIANT: 'production', EXPO_PUBLIC_BILLING_BYPASS: v }, /bypass/);
    refuses({ EXPO_PUBLIC_BILLING_BYPASS: '1' }, /allowed only with APP_VARIANT=review/); // unset variant = production
    expect(() => resolve({ APP_VARIANT: 'production', EXPO_PUBLIC_BILLING_BYPASS: '0' })).not.toThrow();
    expect(() => resolve({ APP_VARIANT: 'production', EXPO_PUBLIC_BILLING_BYPASS: '' })).not.toThrow();
  });
  it('an unknown variant is refused', () => {
    refuses({ APP_VARIANT: 'staging' }, /not a TillLabel build variant/);
    refuses({ APP_VARIANT: 'Review' }, /not a TillLabel build variant/);
  });
  it('on EAS the variant must be explicit and match the profile', () => {
    refuses({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production' }, /without APP_VARIANT/);
    refuses({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'review', APP_VARIANT: 'production' }, /must build APP_VARIANT=review/);
    refuses({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production', APP_VARIANT: 'review', EXPO_PUBLIC_BILLING_BYPASS: '1' }, /must build APP_VARIANT=production/);
    refuses({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'preview', APP_VARIANT: 'review' }, /not a TillLabel profile/);
    expect(() => resolve({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'review', APP_VARIANT: 'review', EXPO_PUBLIC_BILLING_BYPASS: '1' })).not.toThrow();
    const storeKeys = { EXPO_PUBLIC_RC_ANDROID_KEY: 'goog_abc', EXPO_PUBLIC_RC_LIFETIME_ID_ANDROID: 'tilllabel_pro_lifetime' };
    expect(() => resolve({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production', APP_VARIANT: 'production', EAS_BUILD_PLATFORM: 'android', ...storeKeys })).not.toThrow();
    refuses({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production', APP_VARIANT: 'production', EAS_BUILD_PLATFORM: 'android' }, /without EXPO_PUBLIC_RC_ANDROID_KEY/);
    refuses({ EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production', APP_VARIANT: 'production', EAS_BUILD_PLATFORM: 'ios', ...storeKeys }, /without EXPO_PUBLIC_RC_IOS_KEY/);
  });
  it('a resolved identity that does not match its variant is refused (e.g. someone edits the package by hand)', () => {
    const errs = (env: object, android: string, ios: string) => guard.checkBuild(env, { android: { package: android }, ios: { bundleIdentifier: ios } }).join(' | ');
    expect(errs({ APP_VARIANT: 'production' }, guard.REVIEW_ID, guard.PRODUCTION_ID)).toMatch(/production build is using the review identity/);
    expect(errs({ APP_VARIANT: 'review' }, guard.PRODUCTION_ID, guard.REVIEW_ID)).toMatch(/would overwrite a production install/);
    expect(errs({ APP_VARIANT: 'review' }, guard.REVIEW_ID, guard.PRODUCTION_ID)).toMatch(/iOS bundle identifier/);
    expect(errs({ APP_VARIANT: 'production' }, 'com.tillcalc.app', guard.PRODUCTION_ID)).toMatch(/must be "com.tilllabel.app"/);
    expect(errs({ APP_VARIANT: 'review' }, guard.REVIEW_ID, guard.REVIEW_ID)).toBe('');
    expect(errs({ APP_VARIANT: 'production' }, guard.PRODUCTION_ID, guard.PRODUCTION_ID)).toBe('');
  });
  it('inconsistent billing values are refused: QA demo mode in production, store keys in a review build', () => {
    refuses({ APP_VARIANT: 'production', EXPO_PUBLIC_QA_FORCE_DEMO: '1' }, /QA demo mode/);
    refuses({ EXPO_PUBLIC_BUILD_VARIANT: 'demo-validation' }, /QA demo mode/);
    refuses({ APP_VARIANT: 'review', EXPO_PUBLIC_BILLING_BYPASS: '1', EXPO_PUBLIC_RC_ANDROID_KEY: 'goog_abc' }, /must not carry RevenueCat keys/);
  });
  it('the review variant with the bypass is accepted', () => {
    expect(guard.checkBuild({ APP_VARIANT: 'review', EXPO_PUBLIC_BILLING_BYPASS: '1' }, null)).toEqual([]);
  });
});

describe('docs/RELEASE_RECIPE.md is TillLabel\'s own', () => {
  const recipe = require('fs').readFileSync(require('path').join(__dirname, '../../docs/RELEASE_RECIPE.md'), 'utf8') as string;
  it('names both identities, the APK/AAB split and the guard, and carries nothing inherited', () => {
    for (const must of ['com.tilllabel.app.review', 'com.tilllabel.app', '--profile review', 'buildType: "apk"', 'app-bundle', 'validate:build', 'arm64-v8a', 'sha256sum', 'apksigner verify', 'index.android.bundle']) expect(recipe).toContain(must);
    for (const banned of [/NOT YET VALID/i, /com\.tillcalc/i, /--profile preview/, /claude\/build-a-to-z/, /tillcalc-test\.keystore/i, /Pricing & Profit/, /\d+ suites \/ \d+ tests/]) expect(recipe).not.toMatch(banned);
  });
});
