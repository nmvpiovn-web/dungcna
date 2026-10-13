<script>
  import { onMount } from 'svelte';
  import { playAudioFeedback } from '$lib/speech.js';
  import {
    appUpdateState,
    initAppUpdate,
    checkForUpdate,
    applyPwaUpdate,
    closeUpdateModal
  } from '$lib/stores/appUpdate.js';
  import { isValidSha256, isValidApkDownloadUrl } from '$lib/versionContract.js';

  let showPwaBanner = $state(false);
  let showIosInstructions = $state(false);
  let deferredPrompt = $state(null);
  let isStandalone = $state(false);
  let isIos = $state(false);

  const DISMISS_KEY = 'tienganh_pwa_dismissed_v22';

  onMount(() => {
    initAppUpdate();

    if (typeof window !== 'undefined') {
      isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

      const dismissedTime = localStorage.getItem(DISMISS_KEY);
      const isDismissed = dismissedTime && (Date.now() - parseInt(dismissedTime, 10)) < 7 * 24 * 60 * 60 * 1000;

      // Listen for PWA Install Prompt on Chromium / Android
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (!isStandalone && !isDismissed) {
          showPwaBanner = true;
        }
      });

      // On iOS Safari, show gentle tip once if not installed & not dismissed
      if (isIos && !isStandalone && !isDismissed) {
        setTimeout(() => {
          showPwaBanner = true;
        }, 3000);
      }
    }
  });

  function dismissBanner() {
    showPwaBanner = false;
    showIosInstructions = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }
  }

  async function handleInstallPwa() {
    if (deferredPrompt) {
      playAudioFeedback('success');
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        showPwaBanner = false;
        dismissBanner();
      }
      deferredPrompt = null;
    } else if (isIos) {
      showIosInstructions = true;
    } else {
      alert('Để cài đặt ứng dụng, vui lòng bấm vào menu trình duyệt (biểu tượng ⋮ hoặc Chia sẻ) và chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".');
      dismissBanner();
    }
  }

  // Export checkForUpdate for ref binding compatibility
  export function check(manual = true) {
    return checkForUpdate(manual);
  }
</script>

<!-- Floating PWA Install Notification (Positioned safely above BottomNav on mobile) -->
{#if showPwaBanner && !isStandalone}
  <aside
    class="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] lg:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 p-4 rounded-2xl bg-surface-0 text-ink-900 shadow-2xl border border-emerald-600/40 animate-in slide-in-from-bottom-4 duration-300"
    role="region"
    aria-label="Thông báo cài đặt ứng dụng"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center text-xl shrink-0 shadow-xs">
          📱
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="font-extrabold text-xs tracking-tight text-ink-900">CÀI ĐẶT ỨNG DỤNG HỌC TẬP</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold">PWA v{$appUpdateState.currentVersion}</span>
          </div>
          <p class="text-xs text-ink-500 mt-0.5 line-clamp-2">
            {#if isIos}
              Cài app lên iPhone/iPad để học toàn màn hình và nhận thông báo đón con.
            {:else}
              Cài đặt lên màn hình chính để học tập mượt mà, học offline và nhận thông báo học phí.
            {/if}
          </p>
        </div>
      </div>
      <button
        onclick={dismissBanner}
        class="text-ink-400 hover:text-ink-900 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors"
        aria-label="Đóng"
      >
        ✕
      </button>
    </div>

    <!-- Action Buttons -->
    <div class="mt-3 pt-2.5 border-t border-line flex items-center justify-between gap-2">
      <button
        onclick={dismissBanner}
        class="text-xs text-ink-500 hover:text-ink-900 font-semibold px-2 py-2 min-h-[44px] flex items-center"
      >
        Để Sau
      </button>

      <div class="flex items-center gap-2">
        {#if isIos}
          <button
            onclick={() => showIosInstructions = !showIosInstructions}
            class="px-4 py-2 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span>📲 Xem Cách Cài Lên iOS</span>
          </button>
        {:else}
          <button
            onclick={handleInstallPwa}
            class="px-4 py-2 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all hover:scale-105 flex items-center gap-1.5"
          >
            <span>⚡ Cài Đặt Ngay</span>
          </button>
        {/if}
      </div>
    </div>

    <!-- iOS Installation Guide Card Dropdown -->
    {#if showIosInstructions}
      <div class="mt-3 p-3.5 rounded-xl bg-surface-1 border border-line text-xs space-y-2 animate-in fade-in duration-150">
        <div class="font-bold text-emerald-800 flex items-center gap-1.5">
          <span>🍎</span> Hướng dẫn cài trên Safari iOS:
        </div>
        <ol class="space-y-1.5 text-ink-700 text-[11px] list-decimal list-inside leading-relaxed">
          <li>Nhấn vào nút <strong>Chia sẻ (Share)</strong> <span class="px-1.5 py-0.5 rounded bg-surface-0 border border-line">⎋</span> ở thanh công cụ dưới Safari.</li>
          <li>Cuộn xuống và chọn <strong>"Thêm vào Màn hình chính" (Add to Home Screen)</strong> ➕.</li>
          <li>Nhấn <strong>Thêm (Add)</strong> ở góc trên bên phải để hoàn tất!</li>
        </ol>
        <button
          onclick={dismissBanner}
          class="w-full mt-1 min-h-[44px] py-2 rounded-xl bg-surface-0 border border-line hover:bg-surface-2 text-center font-bold text-xs text-ink-900 transition-colors"
        >
          Đã Hiểu &amp; Đóng
        </button>
      </div>
    {/if}
  </aside>
{/if}

<!-- Toast Feedback for Manual Check -->
{#if $appUpdateState.message && !$appUpdateState.showModal}
  <div
    class="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] px-4 py-3 rounded-2xl bg-surface-0 border border-emerald-500/50 text-ink-900 font-bold text-xs shadow-2xl animate-in zoom-in-95 flex items-center gap-2"
    role="status"
    aria-live="polite"
  >
    {#if $appUpdateState.status === 'checking'}
      <span class="animate-spin text-emerald-600">⏳</span>
    {:else if $appUpdateState.status === 'latest'}
      <span class="text-emerald-600">✅</span>
    {:else if $appUpdateState.status === 'available' || $appUpdateState.status === 'restart_needed'}
      <span class="text-emerald-600">⚡</span>
    {:else if $appUpdateState.status === 'offline'}
      <span class="text-rose-600">⚠️</span>
    {/if}
    <span class="leading-tight">{$appUpdateState.message}</span>
    {#if $appUpdateState.status === 'offline'}
      <button
        onclick={() => checkForUpdate(true)}
        class="ml-2 px-2.5 py-1 min-h-[44px] bg-surface-1 border border-line hover:bg-surface-2 text-ink-900 rounded-lg text-[11px] font-bold"
      >
        Thử lại
      </button>
    {/if}
    <button
      onclick={() => appUpdateState.update(s => ({ ...s, message: '' }))}
      class="ml-1 text-ink-400 hover:text-ink-900 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
      aria-label="Đóng"
    >
      ✕
    </button>
  </div>
{/if}

<!-- Detailed Update Modal (Dialog a11y & Focus Management) -->
{#if $appUpdateState.showModal && $appUpdateState.serverVersion}
  <div
    class="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 overflow-y-auto"
    role="dialog"
    aria-modal="true"
    aria-labelledby="update-modal-title"
  >
    <div class="bg-surface-0 border border-line rounded-3xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl text-ink-900 my-auto">
      <div class="flex items-center justify-between border-b border-line pb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center text-xl shrink-0">
            📶
          </div>
          <div>
            <div class="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">CẬP NHẬT ỨNG DỤNG QUA MẠNG</div>
            <h3 id="update-modal-title" class="text-base font-black text-ink-900 mt-0.5">
              Tiếng Anh Cô Dung v{$appUpdateState.serverVersion.version_name || $appUpdateState.serverVersion.version}
            </h3>
          </div>
        </div>
        <button
          onclick={closeUpdateModal}
          class="text-ink-400 hover:text-ink-900 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors"
          aria-label="Đóng"
        >
          ✕
        </button>
      </div>

      <!-- Warning if user is currently busy -->
      {#if $appUpdateState.isBusyBlocked}
        <div class="p-3 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2.5 animate-in fade-in" role="alert">
          <span class="text-base shrink-0">⚠️</span>
          <div class="leading-relaxed">
            <strong>Đang có tác vụ chưa lưu:</strong> Vui lòng hoàn thành bài tập, bài thi hoặc lưu thay đổi biểu mẫu trước khi khởi động lại ứng dụng để không mất dữ liệu.
          </div>
        </div>
      {/if}

      <div class="space-y-3 text-xs">
        <div class="p-3.5 rounded-2xl bg-surface-1 border border-line flex items-center justify-between">
          <div>
            <div class="text-[10px] text-ink-500 uppercase font-bold">Phiên bản hiện tại</div>
            <div class="font-mono text-ink-900 font-bold text-sm">v{$appUpdateState.currentVersion}</div>
          </div>
          <div class="text-right">
            <div class="text-[10px] text-emerald-700 uppercase font-bold">Phiên bản trên mạng</div>
            <div class="font-mono text-emerald-700 font-black text-sm">
              v{$appUpdateState.serverVersion.version_name || $appUpdateState.serverVersion.version}
              {#if $appUpdateState.serverVersion.version_code}
                (Build {$appUpdateState.serverVersion.version_code})
              {/if}
            </div>
          </div>
        </div>

        <!-- Section 1: PWA in-place update -->
        <div class="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
          <div class="font-bold text-emerald-900 flex items-center gap-1.5">
            <span>⚡</span> Cập Nhật Ngay Trong Trình Duyệt / PWA (In-place)
          </div>
          <p class="text-[11px] text-emerald-800 leading-relaxed">
            Hệ thống sẽ tải ngầm tài nguyên mới và khởi động lại phiên làm việc an toàn mà không làm mất tài khoản đã đăng nhập.
          </p>
          <div class="pt-1">
            <button
              onclick={applyPwaUpdate}
              class="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              <span>🚀</span>
              <span>{$appUpdateState.status === 'restart_needed' ? 'Mở Lại Ứng Dụng Để Kích Hoạt' : 'Cập Nhật & Làm Mới Giao Diện'}</span>
            </button>
          </div>
        </div>

        <!-- Section 2: APK Download for Android tablets -->
        {#if $appUpdateState.serverVersion.download_url && isValidSha256($appUpdateState.serverVersion.sha256) && isValidApkDownloadUrl($appUpdateState.serverVersion.download_url)}
          <div class="p-3.5 rounded-2xl bg-surface-1 border border-line space-y-2">
            <div class="font-bold text-ink-900 flex items-center justify-between">
              <span class="flex items-center gap-1.5"><span>📦</span> Tệp Tin Cài Đặt Android APK</span>
              {#if $appUpdateState.serverVersion.file_size_mb}
                <span class="text-[11px] font-mono text-ink-500">{$appUpdateState.serverVersion.file_size_mb} MB</span>
              {/if}
            </div>
            <p class="text-[11px] text-ink-500 leading-relaxed">
              Dành riêng cho máy tính bảng Android (DOOGEE R10) hoặc thiết bị cài APK độc lập. Sau khi tải xong, Android Package Installer sẽ hỏi bạn xác nhận cài đặt đè.
            </p>
            <div class="text-[10px] font-mono text-ink-500 truncate" title={$appUpdateState.serverVersion.sha256}>
              SHA-256: {$appUpdateState.serverVersion.sha256.slice(0, 16)}...{$appUpdateState.serverVersion.sha256.slice(-16)}
            </div>
            <div class="pt-1">
              <a
                href={$appUpdateState.serverVersion.download_url}
                download="tienganhcodung-latest.apk"
                class="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-surface-0 border border-line hover:bg-surface-2 text-ink-900 font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <span>📥</span>
                <span>Tải Tệp APK Về Máy (Cần Xác Nhận Cài Đặt)</span>
              </a>
            </div>
          </div>
        {/if}

        {#if $appUpdateState.serverVersion.changelog && $appUpdateState.serverVersion.changelog.length > 0}
          <div>
            <div class="font-bold text-ink-700 mb-1.5">Nội Dung Bản Nâng Cấp:</div>
            <ul class="space-y-1.5 text-ink-600 bg-surface-1 p-3 rounded-2xl border border-line text-[11px]">
              {#each $appUpdateState.serverVersion.changelog as log}
                <li class="flex items-start gap-2">
                  <span class="text-emerald-600 font-bold">•</span>
                  <span class="leading-relaxed">{log}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <div class="flex items-center justify-end gap-2 pt-3 border-t border-line">
        <button
          onclick={closeUpdateModal}
          class="min-h-[44px] px-4 py-2 rounded-xl bg-surface-1 hover:bg-surface-2 text-ink-700 font-bold text-xs transition-colors"
        >
          Đóng
        </button>
      </div>
    </div>
  </div>
{/if}
