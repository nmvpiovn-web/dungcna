import { writable, get } from 'svelte/store';
import {
  getClientBuildIdentity,
  isNewerBuildIdentity,
  isNewerVersion,
  fetchServerApkVersion,
  fetchServerBuildMeta
} from '../versionContract.js';

const initialClientMeta = getClientBuildIdentity();

export const appUpdateState = writable({
  status: 'idle', // 'idle' | 'checking' | 'latest' | 'available' | 'offline' | 'updating' | 'restart_needed'
  message: '',
  currentVersion: initialClientMeta.version,
  currentBuildIdentity: initialClientMeta.build_identity,
  currentBuildTimestamp: initialClientMeta.build_timestamp,
  serverBuildMeta: null,
  serverVersion: null,
  pwaUpdateAvailable: false,
  apkUpdateAvailable: false,
  showModal: false,
  isBusyBlocked: false,
  lastCheckedAt: null
});

let swRegistration = null;
let controllerListenerAttached = false;
let reloadDispatched = false;
let explicitApplyRequested = false;
let hadPreviousController = false;

export function ensureBusyRegistry(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return;
  if (!win.__appBusyRegistry) {
    win.__appBusyRegistry = new Set();
  }
  if (typeof win.registerBusyState !== 'function') {
    win.registerBusyState = function (id) {
      if (id) win.__appBusyRegistry.add(id);
      return function () {
        win.__appBusyRegistry.delete(id);
      };
    };
  }
  if (typeof win.unregisterBusyState !== 'function') {
    win.unregisterBusyState = function (id) {
      win.__appBusyRegistry.delete(id);
    };
  }
  if (typeof win.isAppBusy !== 'function') {
    win.isAppBusy = function () {
      if (win.__appBusyRegistry && win.__appBusyRegistry.size > 0) return true;
      if (win.__isExamActive) return true;
      if (win.location?.pathname?.startsWith('/exam') && !win.__isExamSubmitted) return true;
      if (win.__isRecordingActive) return true;
      if (win.__hasUnsavedChanges) return true;
      if (typeof document !== 'undefined' && document.querySelector?.('form.dirty, input.dirty, textarea.dirty')) {
        return true;
      }
      return false;
    };
  }
}

export function registerBusyState(id, win = typeof window !== 'undefined' ? window : null) {
  if (!win) return () => {};
  ensureBusyRegistry(win);
  return win.registerBusyState(id);
}

export function unregisterBusyState(id, win = typeof window !== 'undefined' ? window : null) {
  if (!win) return;
  ensureBusyRegistry(win);
  win.unregisterBusyState(id);
}

export function isAppBusy(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  ensureBusyRegistry(win);
  return Boolean(win.isAppBusy());
}

function attachInstallingWorkerListener(worker, nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!worker || typeof worker.addEventListener !== 'function') return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && nav?.serviceWorker?.controller) {
      appUpdateState.update((s) => ({
        ...s,
        status: 'restart_needed',
        pwaUpdateAvailable: true,
        message: 'Bản cập nhật mới đã tải xong và đang chờ kích hoạt an toàn.'
      }));
    }
  });
}

function bindRegistrationListeners(reg, nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!reg) return;
  swRegistration = reg;
  if (reg.waiting && nav?.serviceWorker?.controller) {
    appUpdateState.update((s) => ({
      ...s,
      status: 'restart_needed',
      pwaUpdateAvailable: true,
      message: 'Bản cập nhật mới đã sẵn sàng. Bấm cập nhật để kích hoạt khi đã lưu bài.'
    }));
  }
  if (reg.installing) {
    attachInstallingWorkerListener(reg.installing, nav);
  }
  if (typeof reg.addEventListener === 'function' && !reg.__updateFoundBound) {
    reg.__updateFoundBound = true;
    reg.addEventListener('updatefound', () => {
      if (reg.installing) {
        attachInstallingWorkerListener(reg.installing, nav);
      }
    });
  }
}

export function handleControllerChange(win = typeof window !== 'undefined' ? window : null, nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!win) return { reloaded: false, reason: 'no_window' };

  // First install claim when page had no previous controller must NOT reload
  if (!hadPreviousController) {
    hadPreviousController = Boolean(nav?.serviceWorker?.controller || true);
    return { reloaded: false, reason: 'first_install_claim' };
  }

  // Only reload if explicit user apply was requested
  if (!explicitApplyRequested && !win.__swExplicitApplyRequested) {
    appUpdateState.update((s) => ({
      ...s,
      status: 'restart_needed',
      pwaUpdateAvailable: true,
      message: 'Bản cập nhật mới đã sẵn sàng. Nhấn nút cập nhật để mở lại ứng dụng.'
    }));
    return { reloaded: false, reason: 'not_explicit' };
  }

  // Block reload if user has dirty form / active quiz / open schedule modal
  if (isAppBusy(win)) {
    explicitApplyRequested = false;
    win.__swExplicitApplyRequested = false;
    appUpdateState.update((s) => ({
      ...s,
      status: 'restart_needed',
      isBusyBlocked: true,
      message: 'Đã phát hiện bản cập nhật mới! Bạn đang làm bài hoặc có dữ liệu chưa lưu, hãy hoàn thành trước khi mở lại.'
    }));
    win.dispatchEvent?.(new CustomEvent('sw-update-available'));
    return { reloaded: false, reason: 'busy_blocked' };
  }

  // Reload strictly once after explicit apply when idle
  if (!reloadDispatched && !win.__swReloading) {
    reloadDispatched = true;
    win.__swReloading = true;
    explicitApplyRequested = false;
    win.__swExplicitApplyRequested = false;
    win.location.reload();
    return { reloaded: true, reason: 'explicit_idle_reload' };
  }

  return { reloaded: false, reason: 'already_reloaded' };
}

export function initAppUpdate(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  const nav = options.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  if (!win) return;

  ensureBusyRegistry(win);

  // Set compile-time client build identity (never overwrite from server /build_meta.json!)
  const clientMeta = getClientBuildIdentity(options.clientBuildMeta || win.__CLIENT_BUILD_META_OVERRIDE__ || null);
  appUpdateState.update((s) => ({
    ...s,
    currentVersion: clientMeta.version,
    currentBuildIdentity: clientMeta.build_identity,
    currentBuildTimestamp: clientMeta.build_timestamp
  }));

  if (nav && 'serviceWorker' in nav) {
    hadPreviousController = Boolean(nav.serviceWorker.controller);

    nav.serviceWorker.getRegistration().then((reg) => {
      if (reg) {
        bindRegistrationListeners(reg, nav);
      }
    }).catch(() => {});

    if (!controllerListenerAttached && typeof nav.serviceWorker.addEventListener === 'function') {
      controllerListenerAttached = true;
      nav.serviceWorker.addEventListener('controllerchange', () => {
        handleControllerChange(win, nav);
      });
    }
  }
}

export async function checkForUpdate(manualTrigger = true, options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  const nav = options.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  if (!win) return;

  const clientMeta = getClientBuildIdentity(
    options.clientBuildMeta || win.__CLIENT_BUILD_META_OVERRIDE__ || {
      version: get(appUpdateState).currentVersion,
      build_identity: get(appUpdateState).currentBuildIdentity,
      build_timestamp: get(appUpdateState).currentBuildTimestamp
    }
  );

  appUpdateState.update((s) => ({
    ...s,
    currentVersion: clientMeta.version,
    currentBuildIdentity: clientMeta.build_identity,
    currentBuildTimestamp: clientMeta.build_timestamp,
    status: 'checking',
    message: 'Đang kiểm tra cập nhật...',
    isBusyBlocked: false
  }));

  // Offline check
  if (nav && nav.onLine === false) {
    appUpdateState.update((s) => ({
      ...s,
      status: 'offline',
      lastCheckedAt: Date.now(),
      message: 'Thiết bị đang ngoại tuyến. Vui lòng kết nối mạng để kiểm tra cập nhật.'
    }));
    return;
  }

  try {
    let hasWaitingWorker = false;

    // 1. Service Worker Update check
    if (nav && 'serviceWorker' in nav) {
      try {
        const reg = options.swRegistration || swRegistration || (await nav.serviceWorker.getRegistration?.());
        if (reg) {
          bindRegistrationListeners(reg, nav);
          if (typeof reg.update === 'function') {
            await reg.update();
          }

          if (reg.waiting) {
            hasWaitingWorker = true;
          } else if (reg.installing) {
            attachInstallingWorkerListener(reg.installing, nav);
            await new Promise((resolve) => {
              const worker = reg.installing;
              if (!worker || typeof worker.addEventListener !== 'function') {
                resolve();
                return;
              }
              const timer = setTimeout(resolve, 4000);
              worker.addEventListener('statechange', () => {
                if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') {
                  clearTimeout(timer);
                  resolve();
                }
              });
            });
            if (reg.waiting) {
              hasWaitingWorker = true;
            }
          }
        }
      } catch (swErr) {
        console.warn('[AppUpdate] ServiceWorker check notice:', swErr?.message);
      }
    }

    // 2. Fetch both Server PWA build_meta (no-store) and Server APK version metadata
    const [buildMetaRes, apkRes] = await Promise.all([
      fetchServerBuildMeta(fetchFn),
      fetchServerApkVersion(fetchFn)
    ]);

    const serverBuildMeta = buildMetaRes.success ? buildMetaRes.data : null;
    const serverApkData = apkRes.success ? apkRes.data : null;

    if (!serverBuildMeta && !serverApkData) {
      if (hasWaitingWorker) {
        appUpdateState.update((s) => ({
          ...s,
          status: 'restart_needed',
          pwaUpdateAvailable: true,
          showModal: manualTrigger,
          lastCheckedAt: Date.now(),
          message: 'Bản cập nhật mới đã tải về xong. Cần mở lại để áp dụng.'
        }));
      } else {
        appUpdateState.update((s) => ({
          ...s,
          status: 'offline',
          lastCheckedAt: Date.now(),
          message: 'Không thể kết nối máy chủ để kiểm tra phiên bản mới.'
        }));
      }
      return;
    }

    // Compare PWA compile-time identity vs server build_meta (distinct from APK version)
    const isPwaNewer = serverBuildMeta ? isNewerBuildIdentity(serverBuildMeta, clientMeta) : false;
    // Compare APK version against client version
    const isApkNewer = serverApkData ? isNewerVersion(serverApkData, clientMeta.version) : false;

    const mergedServerVersion = {
      ...(serverApkData || {}),
      version_name: serverApkData?.version_name || serverBuildMeta?.version || clientMeta.version,
      pwa_version: serverBuildMeta?.version || clientMeta.version,
      pwa_build_identity: serverBuildMeta?.build_identity || '',
      pwa_build_timestamp: serverBuildMeta?.build_timestamp || ''
    };

    if (hasWaitingWorker) {
      appUpdateState.update((s) => ({
        ...s,
        status: 'restart_needed',
        serverBuildMeta,
        serverVersion: mergedServerVersion,
        pwaUpdateAvailable: true,
        apkUpdateAvailable: isApkNewer,
        showModal: manualTrigger,
        lastCheckedAt: Date.now(),
        message: 'Bản cập nhật mới đã sẵn sàng. Cần mở lại ứng dụng để hoàn tất.'
      }));
    } else if (isPwaNewer || isApkNewer) {
      const targetVerLabel = isApkNewer
        ? (serverApkData?.version_name || serverApkData?.version || clientMeta.version)
        : (serverBuildMeta?.version || clientMeta.version);
      appUpdateState.update((s) => ({
        ...s,
        status: 'available',
        serverBuildMeta,
        serverVersion: mergedServerVersion,
        pwaUpdateAvailable: isPwaNewer,
        apkUpdateAvailable: isApkNewer,
        showModal: manualTrigger,
        lastCheckedAt: Date.now(),
        message: `Đã có phiên bản mới v${targetVerLabel}!`
      }));
    } else {
      appUpdateState.update((s) => ({
        ...s,
        status: 'latest',
        serverBuildMeta,
        serverVersion: mergedServerVersion,
        pwaUpdateAvailable: false,
        apkUpdateAvailable: false,
        showModal: Boolean(manualTrigger),
        lastCheckedAt: Date.now(),
        message: `Ứng dụng đã ở phiên bản mới nhất (v${clientMeta.version}).`
      }));
    }
  } catch (err) {
    appUpdateState.update((s) => ({
      ...s,
      status: 'offline',
      lastCheckedAt: Date.now(),
      message: 'Lỗi kiểm tra cập nhật: ' + (err?.message || 'Mất kết nối mạng.')
    }));
  }
}

export function applyPwaUpdate(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  const reg = options.swRegistration || swRegistration;
  if (!win) return { applied: false, reason: 'no_window' };

  // Protect dirty/busy states BEFORE posting SKIP_WAITING or reloading
  if (isAppBusy(win)) {
    explicitApplyRequested = false;
    win.__swExplicitApplyRequested = false;
    appUpdateState.update((s) => ({
      ...s,
      isBusyBlocked: true,
      message: 'Không thể làm mới ngay: Có bài thi hoặc nội dung chưa lưu. Vui lòng lưu bài trước khi cập nhật!'
    }));
    return { applied: false, reason: 'busy_blocked' };
  }

  explicitApplyRequested = true;
  win.__swExplicitApplyRequested = true;
  appUpdateState.update((s) => ({
    ...s,
    isBusyBlocked: false,
    status: 'updating',
    message: 'Đang áp dụng bản cập nhật...'
  }));

  if (reg?.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    return { applied: true, reason: 'skip_waiting_posted' };
  }

  // If no waiting worker, reload once cleanly
  if (!reloadDispatched && !win.__swReloading) {
    reloadDispatched = true;
    win.__swReloading = true;
    explicitApplyRequested = false;
    win.__swExplicitApplyRequested = false;
    win.location.reload();
    return { applied: true, reason: 'direct_reload' };
  }

  return { applied: false, reason: 'already_reloaded' };
}

export function closeUpdateModal() {
  appUpdateState.update((s) => ({ ...s, showModal: false }));
}

export function resetAppUpdateForTest(options = {}) {
  swRegistration = options.swRegistration || null;
  controllerListenerAttached = false;
  reloadDispatched = false;
  explicitApplyRequested = false;
  hadPreviousController = Boolean(options.hadPreviousController ?? true);
  const clientMeta = getClientBuildIdentity(options.clientBuildMeta || null);
  appUpdateState.set({
    status: 'idle',
    message: '',
    currentVersion: clientMeta.version,
    currentBuildIdentity: clientMeta.build_identity,
    currentBuildTimestamp: clientMeta.build_timestamp,
    serverBuildMeta: null,
    serverVersion: null,
    pwaUpdateAvailable: false,
    apkUpdateAvailable: false,
    showModal: false,
    isBusyBlocked: false,
    lastCheckedAt: null
  });
}
