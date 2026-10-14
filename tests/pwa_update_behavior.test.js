import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { get } from 'svelte/store';
import { GET as getApkVersion } from '../src/routes/api/apk/version/+server.js';
import apkManifest from '../src/lib/apkIntegrityManifest.json' with { type: 'json' };
import { isValidSha256, isValidApkDownloadUrl } from '../src/lib/versionContract.js';
import {
  appUpdateState,
  initAppUpdate,
  checkForUpdate,
  applyPwaUpdate,
  handleControllerChange,
  registerBusyState,
  unregisterBusyState,
  resetAppUpdateForTest
} from '../src/lib/stores/appUpdate.js';

test('PWA-01: Bundled apkIntegrityManifest.json matches real static APK bytes, SHA-256, and X.509 signing certificate', () => {
  const apkPath = path.resolve('static', apkManifest.download_url.replace(/^\//, ''));
  assert.equal(fs.existsSync(apkPath), true, 'APK file must exist on disk');

  const buf = fs.readFileSync(apkPath);
  const actualSha256 = crypto.createHash('sha256').update(buf).digest('hex');

  assert.equal(apkManifest.bytes, buf.byteLength, 'Manifest bytes must match APK file size');
  assert.equal(apkManifest.file_size_bytes, buf.byteLength, 'Manifest file_size_bytes must match APK file size');
  assert.equal(apkManifest.sha256, actualSha256, 'Manifest sha256 must match APK SHA-256 digest');
  assert.equal(apkManifest.package_id, 'vn.edu.tienganhcodung.app');
  assert.equal(apkManifest.version_name, '2.2.0');
  assert.equal(apkManifest.version_code, 220);

  // Extract APK Signature Scheme v2 X.509 certificate and verify signing_cert_sha256
  const magic = Buffer.from('APK Sig Block 42');
  const idx = buf.indexOf(magic);
  assert.ok(idx > 0, 'APK must contain APK Sig Block 42');
  const blockEnd = idx + 16;
  const sizeOfBlock = Number(buf.readBigUInt64LE(idx - 8));
  const blockStart = blockEnd - sizeOfBlock - 8;
  let p = blockStart + 8;
  let extractedCertSha256 = null;
  while (p < idx - 8) {
    const pairLen = Number(buf.readBigUInt64LE(p));
    const id = buf.readUInt32LE(p + 8);
    if (id === 0x7109871a || id === 0xf05368c0) {
      const val = buf.subarray(p + 12, p + 8 + pairLen);
      const digestsLen = val.readUInt32LE(12);
      const certsOffset = 12 + 4 + digestsLen;
      const firstCertLen = val.readUInt32LE(certsOffset + 4);
      const certDer = val.subarray(certsOffset + 8, certsOffset + 8 + firstCertLen);
      extractedCertSha256 = crypto.createHash('sha256').update(certDer).digest('hex');
      break;
    }
    p += 8 + pairLen;
  }
  assert.equal(
    apkManifest.signing_cert_sha256,
    extractedCertSha256,
    'Manifest signing_cert_sha256 must match real APK X.509 certificate SHA-256 digest'
  );
});

test('PWA-02: /api/apk/version serves O(1) manifest with ETag/304 and zero file reads or hashes per request', async () => {
  let fileReadCount = 0;
  let subtleDigestCount = 0;
  const origReadFileSync = fs.readFileSync;
  const origDigest = crypto.subtle.digest.bind(crypto.subtle);

  fs.readFileSync = function (...args) {
    fileReadCount++;
    return origReadFileSync.apply(this, args);
  };
  crypto.subtle.digest = async function (...args) {
    subtleDigestCount++;
    return origDigest(...args);
  };

  try {
    let etag = null;
    for (let i = 0; i < 25; i++) {
      const req = new Request('https://timbk.io.vn/api/apk/version');
      const res = await getApkVersion({ request: req, url: new URL(req.url) });
      assert.equal(res.status, 200);
      etag = res.headers.get('ETag');
      assert.ok(etag, 'ETag header must be present');

      if (i === 0) {
        const data = await res.json();
        assert.equal(data.package_id, 'vn.edu.tienganhcodung.app');
        assert.equal(data.version_name, '2.2.0');
        assert.equal(data.version_code, 220);
        assert.equal(isValidSha256(data.sha256), true);
        assert.equal(data.sha256, '075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97');
        assert.equal(data.file_size_bytes, 2975961);
        assert.equal(isValidApkDownloadUrl(data.download_url, 'https://timbk.io.vn'), true);
        assert.equal(JSON.stringify(data).includes('WiFi Direct'), false);
      }
    }

    assert.equal(fileReadCount, 0, 'Repeated /api/apk/version calls must NOT read APK file from disk');
    assert.equal(subtleDigestCount, 0, 'Repeated /api/apk/version calls must NOT run SHA-256 hashing');

    // Verify conditional request returns 304 Not Modified
    const conditionalReq = new Request('https://timbk.io.vn/api/apk/version', {
      headers: { 'if-none-match': etag }
    });
    const conditionalRes = await getApkVersion({ request: conditionalReq, url: new URL(conditionalReq.url) });
    assert.equal(conditionalRes.status, 304);
    assert.equal(conditionalRes.headers.get('ETag'), etag);
  } finally {
    fs.readFileSync = origReadFileSync;
    crypto.subtle.digest = origDigest;
  }
});

test('PWA-03: static/sw.js install handler does not auto-skipWaiting and only activates on explicit SKIP_WAITING message', () => {
  const swSource = fs.readFileSync(path.resolve('static/sw.js'), 'utf-8');
  const installMatch = swSource.match(/self\.addEventListener\(['"]install['"],[\s\S]*?\n\}\);/);
  assert.ok(installMatch, 'install listener must exist in static/sw.js');
  assert.equal(
    /self\.skipWaiting\s*\(\s*\)/.test(installMatch[0]),
    false,
    'install listener in static/sw.js must NOT call self.skipWaiting() automatically'
  );
  assert.match(swSource, /SKIP_WAITING[\s\S]*?self\.skipWaiting\(\)/);
});

test('PWA-04: Production checkForUpdate compares compile-time client identity against server build_meta without overwriting currentVersion', async () => {
  const mockWin = {
    location: { pathname: '/', origin: 'https://timbk.io.vn', reload: () => {} }
  };
  const mockNav = {
    onLine: true,
    serviceWorker: {
      controller: {},
      getRegistration: async () => null,
      addEventListener: () => {}
    }
  };

  const clientMeta = {
    version: '2.2.0',
    build_identity: 'build_client1_1000',
    build_timestamp: '2026-10-10T10:00:00.000Z'
  };

  resetAppUpdateForTest({ clientBuildMeta: clientMeta });
  initAppUpdate({ window: mockWin, navigator: mockNav, clientBuildMeta: clientMeta });

  // Verify initAppUpdate preserves compile-time client identity
  assert.equal(get(appUpdateState).currentVersion, '2.2.0');
  assert.equal(get(appUpdateState).currentBuildIdentity, 'build_client1_1000');

  // Case A: Server build_meta has SAME build_identity and APK is same version => status 'latest'
  await checkForUpdate(true, {
    window: mockWin,
    navigator: mockNav,
    clientBuildMeta: clientMeta,
    fetchFn: async (url) => {
      if (String(url).includes('/build_meta.json')) {
        return {
          ok: true,
          json: async () => ({
            version: '2.2.0',
            build_identity: 'build_client1_1000',
            build_timestamp: '2026-10-10T10:00:00.000Z'
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          version_name: '2.2.0',
          version_code: 220,
          download_url: '/downloads/tienganhcodung-latest.apk',
          sha256: '075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97'
        })
      };
    }
  });

  assert.equal(get(appUpdateState).status, 'latest');
  assert.equal(get(appUpdateState).pwaUpdateAvailable, false);
  assert.equal(get(appUpdateState).currentBuildIdentity, 'build_client1_1000');

  // Case B: Server build_meta has NEWER build_identity on same semver => status 'available'
  await checkForUpdate(true, {
    window: mockWin,
    navigator: mockNav,
    clientBuildMeta: clientMeta,
    fetchFn: async (url) => {
      if (String(url).includes('/build_meta.json')) {
        return {
          ok: true,
          json: async () => ({
            version: '2.2.0',
            build_identity: 'build_server2_2000',
            build_timestamp: '2026-10-14T10:00:00.000Z'
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          version_name: '2.2.0',
          version_code: 220,
          download_url: '/downloads/tienganhcodung-latest.apk',
          sha256: '075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97'
        })
      };
    }
  });

  assert.equal(get(appUpdateState).status, 'available');
  assert.equal(get(appUpdateState).pwaUpdateAvailable, true);
  assert.equal(get(appUpdateState).currentBuildIdentity, 'build_client1_1000', 'Client build identity must remain compile-time value');
});

test('PWA-05: Production applyPwaUpdate and handleControllerChange enforce dirty guard, explicit SKIP_WAITING, and single reload', () => {
  let reloadCount = 0;
  let skipWaitingMessages = 0;

  const mockWin = {
    location: {
      pathname: '/quiz-menu',
      origin: 'https://timbk.io.vn',
      reload: () => {
        reloadCount++;
      }
    },
    dispatchEvent: () => {}
  };

  const mockWaitingWorker = {
    state: 'installed',
    postMessage: (msg) => {
      if (msg === 'SKIP_WAITING' || msg?.type === 'SKIP_WAITING') {
        skipWaitingMessages++;
      }
    }
  };

  const mockReg = {
    waiting: mockWaitingWorker,
    installing: null,
    active: { state: 'activated' }
  };

  const mockNav = {
    onLine: true,
    serviceWorker: {
      controller: {}
    }
  };

  // 1. First install claim (hadPreviousController = false) must NOT reload
  resetAppUpdateForTest({ swRegistration: mockReg, hadPreviousController: false });
  const firstClaimRes = handleControllerChange(mockWin, mockNav);
  assert.equal(firstClaimRes.reloaded, false);
  assert.equal(firstClaimRes.reason, 'first_install_claim');
  assert.equal(reloadCount, 0);

  // 2. Unsolicited controllerchange (without explicit applyPwaUpdate) must NOT reload
  const unsolicitedRes = handleControllerChange(mockWin, mockNav);
  assert.equal(unsolicitedRes.reloaded, false);
  assert.equal(unsolicitedRes.reason, 'not_explicit');
  assert.equal(reloadCount, 0);

  // 3. When /quiz-menu or /schedule is dirty, applyPwaUpdate blocks SKIP_WAITING & reload
  registerBusyState('quiz-menu-dirty', mockWin);
  const blockedApply = applyPwaUpdate({ window: mockWin, swRegistration: mockReg });
  assert.equal(blockedApply.applied, false);
  assert.equal(blockedApply.reason, 'busy_blocked');
  assert.equal(skipWaitingMessages, 0);
  assert.equal(reloadCount, 0);
  assert.equal(get(appUpdateState).isBusyBlocked, true);

  // 4. Clear dirty state -> explicit applyPwaUpdate posts SKIP_WAITING -> controllerchange reloads strictly once
  unregisterBusyState('quiz-menu-dirty', mockWin);
  const okApply = applyPwaUpdate({ window: mockWin, swRegistration: mockReg });
  assert.equal(okApply.applied, true);
  assert.equal(okApply.reason, 'skip_waiting_posted');
  assert.equal(skipWaitingMessages, 1);

  const reloadRes1 = handleControllerChange(mockWin, mockNav);
  assert.equal(reloadRes1.reloaded, true);
  assert.equal(reloadCount, 1);

  // Duplicate controllerchange event must NOT reload a second time
  const reloadRes2 = handleControllerChange(mockWin, mockNav);
  assert.equal(reloadRes2.reloaded, false);
  assert.equal(reloadCount, 1);
});
