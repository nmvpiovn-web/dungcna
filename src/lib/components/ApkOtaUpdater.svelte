<script>
  import { onMount } from 'svelte';
  import { playAudioFeedback } from '$lib/speech.js';

  let currentAppVersion = '2.1.0';
  let serverVersionInfo = $state(null);
  let isChecking = $state(false);
  let isWifi = $state(true);
  let showUpdateModal = $state(false);
  let showBanner = $state(false);
  let isDownloading = $state(false);
  let downloadProgress = $state(0);
  let updateMessage = $state('');

  onMount(() => {
    detectNetwork();
    // Auto-check on Wi-Fi connection
    if (isWifi) {
      checkForUpdate(false);
    }

    if (navigator.connection) {
      navigator.connection.addEventListener('change', detectNetwork);
    }
  });

  function detectNetwork() {
    if (typeof navigator !== 'undefined' && navigator.connection) {
      const conn = navigator.connection;
      // WiFi detection
      isWifi = conn.type === 'wifi' || conn.effectiveType === '4g' || !conn.type;
    } else {
      isWifi = true;
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

        // Compare version codes
        if (data.version_code > 210) {
          showBanner = true;
          if (manualTrigger) {
            showUpdateModal = true;
          }
        } else if (manualTrigger) {
          updateMessage = '✅ Ứng dụng đã ở phiên bản mới nhất (v2.2.0)!';
          setTimeout(() => updateMessage = '', 4000);
        }
      }
    } catch (e) {
      if (manualTrigger) {
        updateMessage = '⚠️ Không thể kết nối máy chủ kiểm tra phiên bản.';
        setTimeout(() => updateMessage = '', 4000);
      }
    } finally {
      isChecking = false;
    }
  }

  function handleStartDownload() {
    isDownloading = true;
    downloadProgress = 10;
    playAudioFeedback('flip');

    const interval = setInterval(() => {
      downloadProgress += Math.floor(Math.random() * 25) + 15;
      if (downloadProgress >= 100) {
        downloadProgress = 100;
        clearInterval(interval);
        setTimeout(() => {
          isDownloading = false;
          playAudioFeedback('success');
          // Trigger browser direct download
          const link = document.createElement('a');
          link.href = serverVersionInfo?.download_url || '/downloads/tienganhcodung-latest.apk';
          link.download = 'tienganhcodung-latest.apk';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, 400);
      }
    }, 250);
  }
</script>

<!-- Floating OTA Wi-Fi Update Notification Banner -->
{#if showBanner && serverVersionInfo}
  <div class="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 p-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-2xl border border-emerald-400/40 animate-in slide-in-from-bottom-4 duration-300">
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl flex-shrink-0 animate-pulse">
          📶
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="font-extrabold text-xs tracking-tight">CẬP NHẬT APK QUA WI-FI</span>
            <span class="px-1.5 py-0.5 rounded text-[9px] bg-white/30 font-black">v{serverVersionInfo.version_name}</span>
          </div>
          <p class="text-[11px] text-emerald-100 mt-0.5 line-clamp-1">
            {serverVersionInfo.changelog[0] || 'Bản vá tính năng mới & Cổng game tiếng Anh'}
          </p>
        </div>
      </div>
      <button onclick={() => showBanner = false} class="text-emerald-200 hover:text-white text-sm">✕</button>
    </div>

    <div class="mt-3 pt-2.5 border-t border-white/20 flex items-center justify-between gap-2">
      <span class="text-[10px] text-emerald-200 flex items-center gap-1">
        <span>⚡ Dung lượng: {serverVersionInfo.file_size_mb} MB</span>
      </span>
      <div class="flex items-center gap-2">
        <button
          onclick={() => showUpdateModal = true}
          class="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-[11px] transition-all"
        >
          Xem Chi Tiết
        </button>
        <button
          onclick={handleStartDownload}
          disabled={isDownloading}
          class="px-3.5 py-1.5 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 font-black text-[11px] shadow-md transition-all hover:scale-105"
        >
          {#if isDownloading}
            <span>Đang Tải {downloadProgress}%...</span>
          {:else}
            <span>Cập Nhật Ngay ➔</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Toast Feedback for Manual Check -->
{#if updateMessage}
  <div class="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 border border-emerald-500/50 text-white font-bold text-xs shadow-2xl animate-in zoom-in-95">
    {updateMessage}
  </div>
{/if}

<!-- Detailed Update Modal -->
{#if showUpdateModal && serverVersionInfo}
  <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
    <div class="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl text-white">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl">
            📶
          </div>
          <div>
            <div class="text-xs font-bold text-emerald-400 uppercase tracking-wider">CẬP NHẬT APK TRỰC TIẾP QUA WI-FI (OTA)</div>
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
            <div class="text-[10px] text-emerald-400 uppercase font-bold">Phiên bản mới qua Wi-Fi</div>
            <div class="font-mono text-emerald-400 font-black text-sm">v{serverVersionInfo.version_name} (Build {serverVersionInfo.version_code})</div>
          </div>
        </div>

        <div>
          <div class="font-bold text-slate-300 mb-1.5">Nội Dung Bản Nâng Cấp:</div>
          <ul class="space-y-1.5 text-slate-300 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
            {#each serverVersionInfo.changelog as log}
              <li class="flex items-start gap-2">
                <span class="text-emerald-400 font-bold">•</span>
                <span class="leading-relaxed">{log}</span>
              </li>
            {/each}
          </ul>
        </div>

        {#if isDownloading}
          <div class="space-y-1.5 p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/30">
            <div class="flex justify-between font-bold text-[11px] text-emerald-300">
              <span>Đang tải gói cập nhật APK qua Wi-Fi...</span>
              <span>{downloadProgress}%</span>
            </div>
            <div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-200" style="width: {downloadProgress}%"></div>
            </div>
            <div class="text-[10px] text-slate-400">File APK sẽ tự động mở cài đặt khi hoàn tất.</div>
          </div>
        {/if}
      </div>

      <div class="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
        <div class="text-[11px] text-slate-400 flex items-center gap-1.5">
          <span>📶 {isWifi ? 'Đang dùng Wi-Fi (Tối ưu)' : 'Mạng di động'}</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            onclick={() => showUpdateModal = false}
            class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
          >
            Để Sau
          </button>
          <button
            onclick={handleStartDownload}
            disabled={isDownloading}
            class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 transition-all hover:scale-105 flex items-center gap-1.5"
          >
            <span>🚀 Tải &amp; Cài Đặt Trực Tiếp (APK)</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
