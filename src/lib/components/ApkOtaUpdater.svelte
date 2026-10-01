<script>
  import { onMount } from 'svelte';
  import { playAudioFeedback } from '$lib/speech.js';

  let currentAppVersion = '2.2.0';
  let serverVersionInfo = $state(null);
  let isChecking = $state(false);
  let isWifi = $state(true);
  let showPwaBanner = $state(false);
  let showIosInstructions = $state(false);
  let showUpdateModal = $state(false);
  let updateMessage = $state('');

  let deferredPrompt = $state(null);
  let isStandalone = $state(false);
  let isIos = $state(false);

  const DISMISS_KEY = 'tienganh_pwa_dismissed_v22';

  onMount(() => {
    // 1. Detect Standalone / Installed mode
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
        // Delay 3s to let page load smoothly
        setTimeout(() => {
          showPwaBanner = true;
        }, 3000);
      }
    }

    detectNetwork();

    if (typeof navigator !== 'undefined' && navigator.connection) {
      navigator.connection.addEventListener('change', detectNetwork);
    }
  });

  function detectNetwork() {
    if (typeof navigator !== 'undefined' && navigator.connection) {
      const conn = navigator.connection;
      isWifi = conn.type === 'wifi' || conn.effectiveType === '4g' || !conn.type;
    } else {
      isWifi = true;
    }
  }

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
      // Direct instruction fallback
      alert('Để cài đặt ứng dụng, vui lòng bấm vào menu trình duyệt (biểu tượng 3 chấm ⋮) và chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".');
      dismissBanner();
    }
  }

  export async function checkForUpdate(manualTrigger = true) {
    isChecking = true;
    updateMessage = '';
    try {
      const res = await fetch('/api/apk/version');
      if (res.ok) {
        const data = await res.json();
        serverVersionInfo = data;

        // Check if server version is strictly higher than 220
        if (data.version_code > 220) {
          showUpdateModal = true;
        } else if (manualTrigger) {
          updateMessage = `✅ Ứng dụng đã ở phiên bản mới nhất (v${currentAppVersion})!`;
          setTimeout(() => updateMessage = '', 4000);
        }
      }
    } catch {
      if (manualTrigger) {
        updateMessage = '⚠️ Không thể kết nối máy chủ kiểm tra phiên bản.';
        setTimeout(() => updateMessage = '', 4000);
      }
    } finally {
      isChecking = false;
    }
  }
</script>

<!-- Floating PWA Install Notification (Only if NOT installed yet & NOT dismissed) -->
{#if showPwaBanner && !isStandalone}
  <div class="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 p-4 rounded-3xl bg-slate-900/95 backdrop-blur-md text-white shadow-2xl border border-emerald-500/40 animate-in slide-in-from-bottom-4 duration-300">
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cx-500 via-teal-500 to-emerald-600 flex items-center justify-center text-xl flex-shrink-0 shadow-lg shadow-emerald-500/20">
          📱
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="font-extrabold text-xs tracking-tight">CÀI ĐẶT ỨNG DỤNG HỌC TẬP</span>
            <span class="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/30 text-emerald-300 font-black">PWA v{currentAppVersion}</span>
          </div>
          <p class="text-[11px] text-slate-300 mt-0.5 line-clamp-2">
            {#if isIos}
              Cài app lên iPhone/iPad để học toàn màn hình và nhận thông báo đón con.
            {:else}
              Cài đặt lên màn hình chính để học tập mượt mà, offline và nhận thông báo học phí.
            {/if}
          </p>
        </div>
      </div>
      <button
        onclick={dismissBanner}
        class="text-slate-400 hover:text-white text-sm p-1"
        aria-label="Đóng thông báo"
      >
        ✕
      </button>
    </div>

    <!-- Action Buttons -->
    <div class="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2">
      <button
        onclick={dismissBanner}
        class="text-[11px] text-slate-400 hover:text-slate-200 font-semibold px-2 py-1"
      >
        Để Sau
      </button>

      <div class="flex items-center gap-2">
        {#if isIos}
          <button
            onclick={() => showIosInstructions = !showIosInstructions}
            class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-md transition-all flex items-center gap-1.5"
          >
            <span>📲 Xem Cách Cài Lên iOS</span>
          </button>
        {:else}
          <button
            onclick={handleInstallPwa}
            class="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-md transition-all hover:scale-105 flex items-center gap-1.5"
          >
            <span>⚡ Cài Đặt Ngay</span>
          </button>
        {/if}
      </div>
    </div>

    <!-- iOS Installation Guide Card Dropdown -->
    {#if showIosInstructions}
      <div class="mt-3 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs space-y-2 animate-in fade-in duration-150">
        <div class="font-bold text-emerald-400 flex items-center gap-1.5">
          <span>🍎</span> Hướng dẫn cài trên Safari iOS:
        </div>
        <ol class="space-y-1.5 text-slate-300 text-[11px] list-decimal list-inside leading-relaxed">
          <li>Nhấn vào nút <strong>Chia sẻ (Share)</strong> <span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">⎋</span> ở thanh công cụ dưới Safari.</li>
          <li>Cuộn xuống và chọn <strong>"Thêm vào Màn hình chính" (Add to Home Screen)</strong> ➕.</li>
          <li>Nhấn <strong>Thêm (Add)</strong> ở góc trên bên phải để hoàn tất!</li>
        </ol>
        <button
          onclick={dismissBanner}
          class="w-full mt-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-center font-bold text-[11px] text-white"
        >
          Đã Hiểu &amp; Đóng
        </button>
      </div>
    {/if}
  </div>
{/if}

<!-- Toast Feedback for Manual Check -->
{#if updateMessage}
  <div class="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 border border-emerald-500/50 text-white font-bold text-xs shadow-2xl animate-in zoom-in-95">
    {updateMessage}
  </div>
{/if}

<!-- Detailed Update Modal (Only for real major new version) -->
{#if showUpdateModal && serverVersionInfo}
  <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
    <div class="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl text-white">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl">
            📶
          </div>
          <div>
            <div class="text-xs font-bold text-emerald-400 uppercase tracking-wider">BẢN CẬP NHẬT HỆ THỐNG MỚI</div>
            <h3 class="text-base font-black text-white mt-0.5">Tiếng Anh Cô Dung v{serverVersionInfo.version_name}</h3>
          </div>
        </div>
        <button onclick={() => showUpdateModal = false} class="text-slate-400 hover:text-white">✕</button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <div class="text-[10px] text-slate-500 uppercase font-bold">Phiên bản hiện tại</div>
            <div class="font-mono text-slate-300 font-bold">v{currentAppVersion}</div>
          </div>
          <div class="text-right">
            <div class="text-[10px] text-emerald-400 uppercase font-bold">Phiên bản mới</div>
            <div class="font-mono text-emerald-400 font-black text-sm">v{serverVersionInfo.version_name} (Build {serverVersionInfo.version_code})</div>
          </div>
        </div>

        <div>
          <div class="font-bold text-slate-300 mb-1.5">Nội Dung Bản Nâng Cấp:</div>
          <ul class="space-y-1.5 text-slate-300 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
            {#each (serverVersionInfo.changelog || []) as log}
              <li class="flex items-start gap-2">
                <span class="text-emerald-400 font-bold">•</span>
                <span class="leading-relaxed">{log}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
        <button
          onclick={() => showUpdateModal = false}
          class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
        >
          Đóng
        </button>
        <button
          onclick={() => { window.location.reload(); }}
          class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 transition-all hover:scale-105"
        >
          Làm Mới Trình Duyệt ➔
        </button>
      </div>
    </div>
  </div>
{/if}
