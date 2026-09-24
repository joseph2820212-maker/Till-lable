/**
 * TillLabel build variants on top of app.json (source closure item 2). app.json holds the production identity;
 * APP_VARIANT=review gives the standalone review build its own identity so it installs beside, and never overwrites,
 * a production install. The build guard runs on every config read and refuses unsafe combinations.
 */
const { VARIANTS, variantFromEnv, assertBuild } = require('./scripts/buildGuard');

module.exports = ({ config }) => {
  const { variant } = variantFromEnv(process.env);
  const spec = VARIANTS[variant];
  const resolved = spec
    ? {
      ...config,
      name: spec.name,
      android: { ...config.android, package: spec.id },
      ios: { ...config.ios, bundleIdentifier: spec.id },
      extra: { ...config.extra, appVariant: variant },
    }
    : config;
  assertBuild(process.env, resolved);
  return resolved;
};
