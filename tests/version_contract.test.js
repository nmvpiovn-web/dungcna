import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  parseSemver,
  compareSemver,
  isNewerVersion,
  isNewerBuildIdentity,
  getClientBuildIdentity,
  isValidSha256,
  canonicalizeApkDownloadUrl,
  isValidApkDownloadUrl,
  downloadAndVerifyApk,
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

test('VER-03: isNewerVersion & isNewerBuildIdentity compare client compile-time identity vs server build_meta', () => {
  // APK version_code comparison
  assert.equal(isNewerVersion({ version_code: 221, version_name: '2.2.1' }, { version_code: 220, version_name: '2.2.0' }), true);
  assert.equal(isNewerVersion({ version_code: 220, version_name: '2.2.0' }, { version_code: 220, version_name: '2.2.0' }), false);
  assert.equal(isNewerVersion({ version_code: 219, version_name: '2.1.9' }, { version_code: 220, version_name: '2.2.0' }), false);

  // Client compile-time build identity vs Server build_meta
  const clientIdentity = getClientBuildIdentity({
    version: '2.2.0',
    build_identity: 'build_abc1111_1791500000000',
    build_timestamp: '2026-10-09T10:00:00.000Z',
    source_commit: 'abc1111'
  });

  // Same build identity => latest (false)
  const sameServerMeta = {
    version: '2.2.0',
    build_identity: 'build_abc1111_1791500000000',
    build_timestamp: '2026-10-09T10:00:00.000Z'
  };
  assert.equal(isNewerBuildIdentity(sameServerMeta, clientIdentity), false);

  // Newer build identity on same semver => update available (true)
  const newerServerMeta = {
    version: '2.2.0',
    build_identity: 'build_def2222_1791600000000',
    build_timestamp: '2026-10-10T10:00:00.000Z'
  };
  assert.equal(isNewerBuildIdentity(newerServerMeta, clientIdentity), true);

  // Older server timestamp => not newer (false)
  const olderServerMeta = {
    version: '2.2.0',
    build_identity: 'build_0000000_1791400000000',
    build_timestamp: '2026-10-08T10:00:00.000Z'
  };
  assert.equal(isNewerBuildIdentity(olderServerMeta, clientIdentity), false);
});

test('VER-04: isValidSha256 strictly validates 64-char hexadecimal hashes', () => {
  const validHash = '075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97';
  assert.equal(isValidSha256(validHash), true);
  assert.equal(isValidSha256(validHash.toUpperCase()), true);
  assert.equal(isValidSha256('075F2972'), false);
  assert.equal(isValidSha256(validHash + 'a'), false);
  assert.equal(isValidSha256('g'.repeat(64)), false);
  assert.equal(isValidSha256(null), false);
  assert.equal(isValidSha256(''), false);
});

test('VER-05: isValidApkDownloadUrl canonicalizes with currentOrigin and blocks backslash/cross-origin/non-apk attacks', () => {
  // Valid same-origin URLs
  assert.equal(isValidApkDownloadUrl('/downloads/tienganhcodung-latest.apk', 'https://timbk.io.vn'), true);
  assert.equal(
    canonicalizeApkDownloadUrl('/downloads/tienganhcodung-latest.apk', 'https://timbk.io.vn'),
    'https://timbk.io.vn/downloads/tienganhcodung-latest.apk'
  );
  assert.equal(isValidApkDownloadUrl('https://timbk.io.vn/downloads/app.apk', 'https://timbk.io.vn'), true);
  assert.equal(isValidApkDownloadUrl('http://localhost:5173/downloads/app.apk', 'http://localhost:5173'), true);

  // Explicit allowlist permits trusted CDN origin while blocking untrusted origins
  assert.equal(
    isValidApkDownloadUrl('https://cdn.timbk.io.vn/releases/app.apk', 'https://timbk.io.vn', ['https://cdn.timbk.io.vn']),
    true
  );

  // Regression: backslash protocol-relative bypass MUST be false
  assert.equal(isValidApkDownloadUrl('/\\evil.example/app.apk', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl('/\\\\evil.example/app.apk', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl('\\\\evil.example\\app.apk', 'https://timbk.io.vn'), false);

  // Protocol-relative, cross-origin, userinfo, hash, control chars, non-.apk MUST be false
  assert.equal(isValidApkDownloadUrl('//external.com/app.apk', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl('https://evil.example/app.apk', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl('http://insecure-cdn.com/app.apk', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl('https://admin:secret@timbk.io.vn/downloads/app.apk', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl('/downloads/app.apk#fragment', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl('/downloads/app.exe', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl('/downloads/app\n.apk', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl('javascript:alert(1)', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl('', 'https://timbk.io.vn'), false);
  assert.equal(isValidApkDownloadUrl(null, 'https://timbk.io.vn'), false);
});

test('VER-06: downloadAndVerifyApk verifies SHA-256 before creating Blob URL and rejects corrupted payloads', async () => {
  const sampleBytes = new TextEncoder().encode('fake-apk-binary-payload-for-test');
  const expectedHash = crypto.createHash('sha256').update(sampleBytes).digest('hex');

  let createdUrlCount = 0;
  let revokedUrlCount = 0;
  const mockUrlApi = {
    createObjectURL: () => {
      createdUrlCount++;
      return 'blob:https://timbk.io.vn/verified-apk-blob';
    },
    revokeObjectURL: () => {
      revokedUrlCount++;
    }
  };

  // 1. Valid SHA-256 and byte length -> succeeds and creates object URL
  const okRes = await downloadAndVerifyApk({
    downloadUrl: '/downloads/tienganhcodung-latest.apk',
    expectedSha256: expectedHash,
    expectedBytes: sampleBytes.byteLength,
    currentOrigin: 'https://timbk.io.vn',
    urlApi: mockUrlApi,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => sampleBytes.buffer
    })
  });

  assert.equal(okRes.success, true);
  assert.equal(okRes.sha256, expectedHash);
  assert.equal(okRes.objectUrl, 'blob:https://timbk.io.vn/verified-apk-blob');
  assert.equal(createdUrlCount, 1);
  okRes.revoke();
  assert.equal(revokedUrlCount, 1);

  // 2. Corrupted payload (wrong SHA-256) -> fails closed without creating object URL
  const wrongHash = 'f'.repeat(64);
  const badRes = await downloadAndVerifyApk({
    downloadUrl: '/downloads/tienganhcodung-latest.apk',
    expectedSha256: wrongHash,
    expectedBytes: sampleBytes.byteLength,
    currentOrigin: 'https://timbk.io.vn',
    urlApi: mockUrlApi,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => sampleBytes.buffer
    })
  });

  assert.equal(badRes.success, false);
  assert.match(badRes.error, /SHA-256/);
  assert.equal(createdUrlCount, 1, 'Must NOT create object URL when SHA-256 check fails');
});

test('VER-07: fetchServerApkVersion and fetchServerBuildMeta handle responses and network errors gracefully', async () => {
  const mockFetchSuccess = async (url, opts) => {
    assert.match(url, /_cb=/);
    return {
      ok: true,
      json: async () => ({ version_name: '2.2.0', version_code: 220 })
    };
  };

  const resA = await fetchServerApkVersion(mockFetchSuccess);
  assert.equal(resA.success, true);
  assert.equal(resA.data.version_name, '2.2.0');

  const mockBuildMetaFetch = async (url, opts) => {
    assert.equal(opts.cache, 'no-store');
    return {
      ok: true,
      json: async () => ({ version: '2.2.0', build_identity: 'build_123' })
    };
  };
  const resMeta = await fetchServerBuildMeta(mockBuildMetaFetch);
  assert.equal(resMeta.success, true);
  assert.equal(resMeta.data.build_identity, 'build_123');

  const resB = await fetchServerApkVersion(async () => {
    throw new Error('Connection refused');
  });
  assert.equal(resB.success, false);
  assert.match(resB.error, /Connection refused/);
});
