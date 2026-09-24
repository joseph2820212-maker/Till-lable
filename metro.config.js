// Metro config: Expo defaults plus one explicit mapping.
// bwip-js publishes its dependency-free "generic" build only under the `import` export condition, which Metro
// does not apply to transpiled imports. Map the subpath to its file so the barcode engine resolves on device.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const BWIP_GENERIC = path.join(__dirname, 'node_modules/bwip-js/dist/bwip-js-gen.mjs');
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'bwip-js/generic') return { type: 'sourceFile', filePath: BWIP_GENERIC };
  return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
