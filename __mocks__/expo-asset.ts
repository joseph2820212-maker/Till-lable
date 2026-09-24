// expo-asset mock for Jest: label fonts are loaded from node_modules in tests (fixtures), never through Asset.
export const Asset = { fromModule: () => ({ downloadAsync: async () => undefined, localUri: null, uri: 'asset://mock' }) };
export default { Asset };
