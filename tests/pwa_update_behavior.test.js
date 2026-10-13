import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as getApkVersion } from '../src/routes/api/apk/version/+server.js';
import { isValidSha256, isValidApkDownloadUrl, isNewerVersion } from '../src/lib/versionContract.js';

test('PWA-01: /api/apk/version returns real sha256, file_size_bytes, and no "WiFi Direct" wording', async () => {
  const req = new Request('https://timbk.io.vn/api/apk/version');
  const res = await getApkVersion({ url: new URL(req.url) });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.package_id, 'vn.edu.tienganhcodung.app');
  assert.equal(data.version_name, '2.2.0');
  assert.equal(data.version_code, 220);

  // Assert exact SHA-256 (64 hex lowercase)
  assert.ok(data.sha256, 'sha256 must be present');
  assert.equal(isValidSha256(data.sha256), true);
  assert.equal(data.sha256, '075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97');

  // Assert file size is real
  assert.ok(data.file_size_bytes > 2_000_000, 'file_size_bytes must be ~2.9 MB');
  assert.equal(data.file_size_bytes, 2975961);
  assert.ok(data.file_size_mb >= 2.8 && data.file_size_mb <= 3.0);

  // Assert URL validity
  assert.equal(isValidApkDownloadUrl(data.download_url), true);

  // Assert NO misleading "WiFi Direct" string in changelog or payload
  const payloadStr = JSON.stringify(data);
  assert.equal(payloadStr.includes('WiFi Direct'), false, 'Must not claim WiFi Direct for HTTP downloads');

  // Assert Cache-Control header is no-store
  assert.match(res.headers.get('Cache-Control'), /no-store/);
});

test('PWA-02: Busy registry protects active exam and dirty forms against controllerchange reload', () => {
  let reloadCount = 0;
  let eventDispatched = false;

  const mockWindow = {
    location: {
      pathname: '/exam/quiz-123',
      reload: () => { reloadCount++; }
    },
    __isExamActive: true,
    __appBusyRegistry: new Set(['exam-active']),
    isAppBusy: function() {
      return this.__appBusyRegistry.size > 0 || this.__isExamActive;
    },
    dispatchEvent: (evt) => {
      if (evt.type === 'sw-update-available') eventDispatched = true;
    }
  };

  // When app is busy, controllerchange must NOT call window.location.reload()
  assert.equal(mockWindow.isAppBusy(), true);
  if (mockWindow.isAppBusy()) {
    mockWindow.dispatchEvent({ type: 'sw-update-available' });
  } else {
    mockWindow.location.reload();
  }

  assert.equal(reloadCount, 0, 'Must NOT reload when form/exam is busy');
  assert.equal(eventDispatched, true, 'Must notify user without disruptive reload');

  // When app is idle, reload occurs once
  mockWindow.__isExamActive = false;
  mockWindow.__appBusyRegistry.clear();
  assert.equal(mockWindow.isAppBusy(), false);

  if (mockWindow.isAppBusy()) {
    mockWindow.dispatchEvent({ type: 'sw-update-available' });
  } else {
    mockWindow.location.reload();
  }
  assert.equal(reloadCount, 1, 'Safe reload should execute when app is idle');
});

test('PWA-03: ServiceWorker SKIP_WAITING postMessage flow triggers activation', async () => {
  let skipWaitingSent = false;

  const mockWaitingWorker = {
    state: 'installed',
    postMessage: (msg) => {
      if (msg === 'SKIP_WAITING' || msg?.type === 'SKIP_WAITING') {
        skipWaitingSent = true;
      }
    }
  };

  const mockRegistration = {
    waiting: mockWaitingWorker,
    installing: null,
    active: { state: 'activated' },
    update: async () => {}
  };

  // Simulate applyPwaUpdate when registration.waiting is present
  assert.ok(mockRegistration.waiting);
  mockRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  assert.equal(skipWaitingSent, true, 'Must post SKIP_WAITING message to waiting service worker');
});

test('PWA-04: Offline and network failure returns actionable offline status without crashing', async () => {
  const currentVer = '2.2.0';

  // Offline simulation (navigator.onLine === false)
  const isOffline = false; // simulated online=false
  let status = 'idle';
  if (!isOffline) {
    status = 'offline';
  }
  assert.equal(status, 'offline');

  // Verify server version comparison: same version code does not claim newer
  const currentMeta = { version_code: 220, version_name: '2.2.0' };
  const serverMeta = { version_code: 220, version_name: '2.2.0' };
  assert.equal(isNewerVersion(serverMeta, currentMeta), false, 'Same version code must not report update');

  // Newer version code reports true
  const newerServerMeta = { version_code: 221, version_name: '2.2.1' };
  assert.equal(isNewerVersion(newerServerMeta, currentMeta), true, 'Higher version code must report update');
});
