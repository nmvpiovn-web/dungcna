import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSemver,
  compareSemver,
  isNewerVersion,
  isValidSha256,
  isValidApkDownloadUrl,
  fetchServerApkVersion,
  fetchServerBuildMeta
} from '../src/lib/versionContract.js';

test('VER-01: parseSemver correctly parses standard and prefixed versions', () => {
  assert.deepEqual(parseSemver('2.2.0'), { valid: true, major: 2, minor: 2, patch: 0, prerelease: null, raw: '2.2.0' });
  assert.deepEqual(parseSemver('v2.3.1'), { valid: true, major: 2, minor: 3, patch: 1, prerelease: null, raw: 'v2.3.1' });
  assert.deepEqual(parseSemver('1.0.0-beta.1'), { valid: true, major: 1, minor: 0, patch: 0, prerelease: 'beta.1', raw: '1.0.0-beta.1' });
  assert.equal(parseSemver('invalid-version').valid, false);
  assert.equal(parseSemver(null).valid, false);
  assert.equal(parseSemver('').valid, false);
});

test('VER-02: compareSemver correctly ranks version precedence', () => {
  assert.equal(compareSemver('2.3.0', '2.2.0'), 1);
  assert.equal(compareSemver('2.2.1', '2.2.0'), 1);
  assert.equal(compareSemver('3.0.0', '2.9.9'), 1);
  assert.equal(compareSemver('2.2.0', '2.2.0'), 0);
  assert.equal(compareSemver('2.1.9', '2.2.0'), -1);
  assert.equal(compareSemver('2.2.0-beta', '2.2.0'), -1);
  assert.equal(compareSemver('2.2.0', '2.2.0-beta'), 1);
});

test('VER-03: isNewerVersion handles version_code, semantic version, and timestamps', () => {
  // Case A: Higher version_code triggers true
  assert.equal(isNewerVersion({ version_code: 221, version_name: '2.2.1' }, { version_code: 220, version_name: '2.2.0' }), true);
  assert.equal(isNewerVersion({ version_code: 220, version_name: '2.2.0' }, { version_code: 220, version_name: '2.2.0' }), false);
  assert.equal(isNewerVersion({ version_code: 219, version_name: '2.1.9' }, { version_code: 220, version_name: '2.2.0' }), false);

  // Case B: Without version_code, falls back to semantic version comparison
  assert.equal(isNewerVersion({ version: '2.3.0' }, { version: '2.2.0' }), true);
  assert.equal(isNewerVersion({ version: '2.2.0' }, { version: '2.2.0' }), false);
  assert.equal(isNewerVersion({ version: '2.1.5' }, { version: '2.2.0' }), false);

  // Case C: Passing string as current version
  assert.equal(isNewerVersion({ version_code: 225, version_name: '2.2.5' }, '2.2.0'), true);
  assert.equal(isNewerVersion({ version_name: '2.2.0' }, '2.2.0'), false);

  // Case D: Same version but newer build timestamp
  const older = { version: '2.2.0', build_timestamp: '2026-10-01T10:00:00Z' };
  const newer = { version: '2.2.0', build_timestamp: '2026-10-09T10:00:00Z' };
  assert.equal(isNewerVersion(newer, older), true);
  assert.equal(isNewerVersion(older, newer), false);
});

test('VER-04: isValidSha256 strictly validates 64-char hexadecimal hashes', () => {
  const validHash = '075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97';
  assert.equal(isValidSha256(validHash), true);
  assert.equal(isValidSha256(validHash.toUpperCase()), true);
  assert.equal(isValidSha256('075F2972'), false); // Too short
  assert.equal(isValidSha256(validHash + 'a'), false); // Too long (65 chars)
  assert.equal(isValidSha256('g'.repeat(64)), false); // Non-hex chars
  assert.equal(isValidSha256(null), false);
  assert.equal(isValidSha256(''), false);
});

test('VER-05: isValidApkDownloadUrl enforces same-origin or HTTPS and rejects insecure/protocol-relative URLs', () => {
  assert.equal(isValidApkDownloadUrl('/downloads/tienganhcodung-latest.apk'), true);
  assert.equal(isValidApkDownloadUrl('https://timbk.io.vn/downloads/app.apk'), true);
  assert.equal(isValidApkDownloadUrl('http://localhost:5173/app.apk'), true);

  // Insecure and protocol-relative attacks must be blocked:
  assert.equal(isValidApkDownloadUrl('http://insecure-cdn.com/app.apk'), false);
  assert.equal(isValidApkDownloadUrl('//external.com/app.apk'), false);
  assert.equal(isValidApkDownloadUrl('javascript:alert(1)'), false);
  assert.equal(isValidApkDownloadUrl('data:application/vnd.android.package-archive;base64,...'), false);
  assert.equal(isValidApkDownloadUrl(''), false);
  assert.equal(isValidApkDownloadUrl(null), false);
});

test('VER-06: fetchServerApkVersion and fetchServerBuildMeta use no-store and handle errors gracefully', async () => {
  // Mock success fetch
  const mockFetchSuccess = async (url, opts) => {
    assert.match(url, /_cb=/);
    assert.equal(opts.cache, 'no-store');
    return {
      ok: true,
      json: async () => ({ version_name: '2.2.0', version_code: 220 })
    };
  };

  const resA = await fetchServerApkVersion(mockFetchSuccess);
  assert.equal(resA.success, true);
  assert.equal(resA.data.version_name, '2.2.0');

  // Mock network failure fetch
  const mockFetchFail = async () => {
    throw new Error('Connection refused');
  };

  const resB = await fetchServerApkVersion(mockFetchFail);
  assert.equal(resB.success, false);
  assert.match(resB.error, /Connection refused/);
});
