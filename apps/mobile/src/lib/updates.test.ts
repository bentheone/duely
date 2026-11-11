import { parseRelease } from './updates';

jest.mock('./db/repo', () => ({ getMetaJson: () => null, setMetaJson: () => undefined }));

const rel = (tag: string, assets = [{ name: 'duely.apk', browser_download_url: 'https://x/duely.apk' }]) => ({ tag_name: tag, name: 'Build', body: 'notes', assets });

test('offers only newer build-N releases with an APK', () => {
  expect(parseRelease(rel('build-12'), 10)).toMatchObject({ build: 12, apkUrl: 'https://x/duely.apk' });
  expect(parseRelease(rel('build-10'), 10)).toBeNull();
  expect(parseRelease(rel('v1.0.0'), 0)).toBeNull();
  expect(parseRelease(rel('build-12', []), 0)).toBeNull();
});
