// In-memory expo-file-system mock for Jest.
const store: Record<string, string> = {};
/** Modification time in SECONDS (as expo-file-system/legacy reports it). Tests can backdate a file. */
const mtimes: Record<string, number> = {};
export const __setModificationTime = (uri: string, seconds: number) => { mtimes[uri] = seconds; };

export const documentDirectory = 'file:///docs/';
export const cacheDirectory = 'file:///cache/';
export const EncodingType = { UTF8: 'utf8', Base64: 'base64' };

export const writeAsStringAsync = jest.fn(async (uri: string, content: string) => {
  store[uri] = content;
  mtimes[uri] = Date.now() / 1000;
});

export const readAsStringAsync = jest.fn(async (uri: string): Promise<string> => {
  if (uri in store) return store[uri];
  throw new Error(`File not found: ${uri}`);
});

export const deleteAsync = jest.fn(async (uri?: string) => {
  if (!uri) return;
  for (const key of Object.keys(store)) {
    if (key === uri || key.startsWith(uri.endsWith('/') ? uri : `${uri}/`)) delete store[key];
  }
});

export const readDirectoryAsync = jest.fn(async (dir: string): Promise<string[]> =>
  Object.keys(store)
    .filter(u => u.startsWith(dir))
    .map(u => u.slice(dir.length)),
);

export const getInfoAsync = jest.fn(async (uri: string) => ({
  exists: uri in store || Object.keys(store).some(key => key.startsWith(uri.endsWith('/') ? uri : `${uri}/`)),
  isDirectory: !(uri in store) && Object.keys(store).some(key => key.startsWith(uri.endsWith('/') ? uri : `${uri}/`)),
  size: store[uri]?.length ?? 0,
  modificationTime: mtimes[uri],
  uri,
}));
export const makeDirectoryAsync = jest.fn(async () => {});
