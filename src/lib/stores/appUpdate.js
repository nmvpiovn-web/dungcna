import { writable } from 'svelte/store';
import { isNewerVersion, isValidSha256, isValidApkDownloadUrl, fetchServerApkVersion, fetchServerBuildMeta } from '$lib/versionContract.js';

export const appUpdateState = writable({
  status: 'idle', // 'idle' | 'checking' | 'latest' | 'available' | 'offline' | 'updating' | 'restart_needed'
  message: '',
  currentVersion: '2.2.0',
  currentBuildIdentity: '',
  serverVersion: null,
  showModal: false,
  isBusyBlocked: false,
  lastCheckedAt: null
});

let swRegistration = null;
let controllerListenerAttached = false;
let reloadDispatched = false;

export function initAppUpdate() {
  if (typeof window === 'undefined') return;

  // Initialize client version from build_meta if available
  fetchServerBuildMeta().then(res => {
    if (res.success && res.data?.version) {
      appUpdateState.update(s => ({
        ...s,
        currentVersion: res.data.version,
        currentBuildIdentity: res.data.build_identity || ''
      }));
    }
  }).catch(() => {});

  // Setup SW registration & controllerchange listener
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      swRegistration = reg;
      if (reg?.waiting) {
        appUpdateState.update(s => ({
          ...s,
          status: 'restart_needed',
          message: 'Bản cập nhật mới đã sẵn sàng. Cần mở lại ứng dụng để hoàn tất.'
        }));
      }
    }).catch(() => {});

    if (!controllerListenerAttached) {
      controllerListenerAttached = true;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Check if form or active exam is busy
        if (typeof window.isAppBusy === 'function' && window.isAppBusy()) {
          appUpdateState.update(s => ({
            ...s,
            status: 'restart_needed',
            isBusyBlocked: true,
            message: 'Đã phát hiện bản cập nhật mới! Bạn đang làm bài hoặc có dữ liệu chưa lưu, hãy hoàn thành trước khi mở lại.'
          }));
          return;
        }

        // Safe reload once
        if (!reloadDispatched && !window.__swReloading) {
          reloadDispatched = true;
          window.__swReloading = true;
          window.location.reload();
        }
      });
    }
  }
}

export async function checkForUpdate(manualTrigger = true) {
  if (typeof window === 'undefined') return;

  appUpdateState.update(s => ({
    ...s,
    status: 'checking',
    message: 'Đang kiểm tra cập nhật...',
    isBusyBlocked: false
  }));

  // Offline check
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    appUpdateState.update(s => ({
      ...s,
      status: 'offline',
      message: 'Thiết bị đang ngoại tuyến. Vui lòng kết nối mạng để kiểm tra cập nhật.'
    }));
    return;
  }

  try {
    let hasWaitingWorker = false;

    // 1. Service Worker Update check
    if ('serviceWorker' in navigator) {
      try {
        const reg = swRegistration || await navigator.serviceWorker.getRegistration();
        if (reg) {
          swRegistration = reg;
          await reg.update();

          if (reg.waiting) {
            hasWaitingWorker = true;
          } else if (reg.installing) {
            reg.installing.addEventListener('statechange', (e) => {
              if (e.target.state === 'installed' && navigator.serviceWorker.controller) {
                appUpdateState.update(s => ({
                  ...s,
                  status: 'restart_needed',
                  message: 'Đã tải xong bản cập nhật mới. Vui lòng làm mới trang để kích hoạt.'
                }));
              }
            });
          }
        }
      } catch (swErr) {
        console.warn('[AppUpdate] ServiceWorker check notice:', swErr.message);
      }
    }

    // 2. Server API version check
    const apkRes = await fetchServerApkVersion();
    let currentVer = '2.2.0';
    appUpdateState.subscribe(s => { currentVer = s.currentVersion; })();

    if (apkRes.success && apkRes.data) {
      const serverData = apkRes.data;
      const isNewer = isNewerVersion(serverData, currentVer);

      if (hasWaitingWorker) {
        appUpdateState.update(s => ({
          ...s,
          status: 'restart_needed',
          serverVersion: serverData,
          showModal: manualTrigger,
          lastCheckedAt: Date.now(),
          message: 'Bản cập nhật mới đã sẵn sàng. Cần mở lại ứng dụng để hoàn tất.'
        }));
      } else if (isNewer) {
        appUpdateState.update(s => ({
          ...s,
          status: 'available',
          serverVersion: serverData,
          showModal: manualTrigger,
          lastCheckedAt: Date.now(),
          message: `Đã có phiên bản mới v${serverData.version_name || ''}!`
        }));
      } else {
        appUpdateState.update(s => ({
          ...s,
          status: 'latest',
          serverVersion: serverData,
          showModal: false,
          lastCheckedAt: Date.now(),
          message: `Ứng dụng đã ở phiên bản mới nhất (v${currentVer}).`
        }));
      }
    } else {
      // If API failed but we have waiting worker
      if (hasWaitingWorker) {
        appUpdateState.update(s => ({
          ...s,
          status: 'restart_needed',
          showModal: manualTrigger,
          lastCheckedAt: Date.now(),
          message: 'Bản cập nhật mới đã tải về xong. Cần mở lại để áp dụng.'
        }));
      } else {
        appUpdateState.update(s => ({
          ...s,
          status: 'offline',
          lastCheckedAt: Date.now(),
          message: 'Không thể kết nối máy chủ để kiểm tra phiên bản mới.'
        }));
      }
    }
  } catch (err) {
    appUpdateState.update(s => ({
      ...s,
      status: 'offline',
      lastCheckedAt: Date.now(),
      message: 'Lỗi kiểm tra cập nhật: ' + (err.message || 'Mất kết nối mạng.')
    }));
  }
}

export function applyPwaUpdate() {
  if (typeof window === 'undefined') return;

  // Protect dirty/busy states
  if (typeof window.isAppBusy === 'function' && window.isAppBusy()) {
    appUpdateState.update(s => ({
      ...s,
      isBusyBlocked: true,
      message: 'Không thể làm mới ngay: Có bài thi hoặc nội dung chưa lưu. Vui lòng lưu bài trước khi cập nhật!'
    }));
    return;
  }

  appUpdateState.update(s => ({ ...s, status: 'updating', message: 'Đang áp dụng bản cập nhật...' }));

  if (swRegistration?.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    // If no waiting worker, reload once cleanly
    if (!reloadDispatched) {
      reloadDispatched = true;
      window.location.reload();
    }
  }
}

export function closeUpdateModal() {
  appUpdateState.update(s => ({ ...s, showModal: false }));
}
