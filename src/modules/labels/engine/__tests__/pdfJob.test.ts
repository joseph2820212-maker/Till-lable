jest.mock('expo-file-system/legacy', () => ({ EncodingType: { UTF8: 'utf8', Base64: 'base64' }, readAsStringAsync: jest.fn() }));
jest.mock('../../../../utils/pdfFile', () => ({ printHtmlToPdfFile: jest.fn(async () => 'file:///docs/labels/job.pdf') }));
import * as FileSystem from 'expo-file-system/legacy';
import { printHtmlToPdfFile } from '../../../../utils/pdfFile';
import { generateLabelPdf, sha256OfFile, __test } from '../pdfJob';

describe('one authoritative PDF per job, fingerprinted (E6)', () => {
  it('decodes base64 exactly (padding cases)', () => {
    expect(Array.from(__test.base64ToBytes('YWJj'))).toEqual([97, 98, 99]);
    expect(Array.from(__test.base64ToBytes('YWI='))).toEqual([97, 98]);
    expect(Array.from(__test.base64ToBytes('YQ=='))).toEqual([97]);
  });
  it('SHA-256 of the file bytes matches the standard test vector', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce('YWJj');
    expect(await sha256OfFile('file:///x.pdf')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('asks for the exact page size in points, keeps the file durable, and returns its checksum', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce('YWJj');
    const r = await generateLabelPdf('<html></html>', 'Labels.pdf', 595.276, 841.89);
    expect(printHtmlToPdfFile).toHaveBeenCalledWith('<html></html>', 'Labels.pdf', { width: 595.276, height: 841.89 }, { temporary: false });
    expect(r).toEqual({ uri: 'file:///docs/labels/job.pdf', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
  });
});
