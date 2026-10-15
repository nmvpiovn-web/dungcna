<script>
  import { onMount, onDestroy } from 'svelte';
  import apkManifest from '$lib/apkIntegrityManifest.json';
  import { downloadAndVerifyApk } from '$lib/versionContract.js';
  import { checkForUpdate } from '$lib/stores/appUpdate.js';

  let verifyState = $state('idle'); // 'idle' | 'downloading' | 'verifying' | 'verified' | 'error'
  let verifyPercent = $state(0);
  let verifyError = $state('');
  let activeRevoke = null;
  let copiedHash = $state(false);
  let isAndroidDevice = $state(false);
  let isR10Device = $state(false);

  onMount(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      isAndroidDevice = /android/i.test(ua);
      isR10Device = /R10|DOOGEE/i.test(ua);
    }
  });

  onDestroy(() => {
    if (activeRevoke) {
      activeRevoke();
      activeRevoke = null;
    }
  });

  async function handleVerifiedDownload() {
    if (verifyState === 'downloading' || verifyState === 'verifying') return;
    verifyState = 'downloading';
    verifyPercent = 10;
    verifyError = '';

    if (activeRevoke) {
      activeRevoke();
      activeRevoke = null;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://timbk.io.vn';
    const res = await downloadAndVerifyApk({
      downloadUrl: apkManifest.download_url,
      expectedSha256: apkManifest.sha256,
      expectedBytes: apkManifest.file_size_bytes,
      currentOrigin: origin,
      onProgress: ({ phase, percent }) => {
        verifyState = phase;
        verifyPercent = percent;
      }
    });

    if (!res.success) {
      verifyState = 'error';
      verifyError = res.error || 'Xác minh SHA-256 thất bại.';
      return;
    }

    verifyState = 'verified';
    verifyPercent = 100;
    activeRevoke = res.revoke;

    if (typeof document !== 'undefined' && res.objectUrl) {
      const a = document.createElement('a');
      a.href = res.objectUrl;
      a.download = apkManifest.filename || 'tienganhcodung-latest.apk';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => {
        if (activeRevoke) {
          activeRevoke();
          activeRevoke = null;
        }
      }, 6000);
    }
  }

  async function copySha256() {
    try {
      await navigator.clipboard.writeText(apkManifest.sha256);
      copiedHash = true;
      setTimeout(() => (copiedHash = false), 2500);
    } catch {}
  }
</script>

<svelte:head>
  <title>Tải Ứng Dụng Android APK (DOOGEE R10) — Tiếng Anh Cô Dung</title>
</svelte:head>

<div class="max-w-3xl mx-auto px-3 sm:px-4 py-6 pb-24 space-y-6">
  <!-- Hero Banner -->
  <section class="rounded-3xl bg-surface-0 border border-emerald-500/40 p-5 sm:p-7 shadow-lg space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold uppercase tracking-wider">
        📦 Bản Cài Đặt Chính Thức • Android &amp; DOOGEE R10
      </span>
      <span class="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-surface-1 border border-line text-ink-700">
        v{apkManifest.version_name} (Build #{apkManifest.version_code})
      </span>
    </div>

    <div class="flex items-start gap-4">
      <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-3xl font-extrabold shadow-md shrink-0">
        📱
      </div>
      <div class="space-y-1 min-w-0">
        <h1 class="text-xl sm:text-2xl font-black text-ink-900 leading-tight">
          Tiếng Anh Cô Dung — Android APK
        </h1>
        <p class="text-xs sm:text-sm text-ink-500 leading-relaxed">
          Tối ưu hóa toàn màn hình cho máy tính bảng <strong>DOOGEE R10</strong> và điện thoại Android (Android 7.0+). Tích hợp làm bài Quiz 7 dạng tương tác, đồng bộ tài liệu và tự động cập nhật OTA.
        </p>
        {#if isR10Device}
          <div class="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold">
            ✅ Đã nhận diện thiết bị DOOGEE R10 của bạn!
          </div>
        {:else if isAndroidDevice}
          <div class="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold">
            ✅ Thiết bị Android tương thích 100%
          </div>
        {/if}
      </div>
    </div>

    <!-- Primary Download Buttons -->
    <div class="grid sm:grid-cols-2 gap-3 pt-2">
      <a
        href={apkManifest.download_url}
        download={apkManifest.filename || 'tienganhcodung-latest.apk'}
        data-testid="direct-apk-download-btn"
        class="min-h-[52px] px-5 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2.5 text-center"
      >
        <span class="text-lg">⬇️</span>
        <span>Tải Ngay APK v{apkManifest.version_name} ({apkManifest.file_size_mb} MB)</span>
      </a>

      <button
        type="button"
        onclick={handleVerifiedDownload}
        disabled={verifyState === 'downloading' || verifyState === 'verifying'}
        data-testid="verified-apk-download-btn"
        class="min-h-[52px] px-5 py-3.5 rounded-2xl bg-surface-1 hover:bg-surface-2 border border-emerald-600/40 text-ink-900 font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {#if verifyState === 'downloading'}
          <span class="animate-spin">⏳</span>
          <span>Đang tải &amp; kiểm tra ({verifyPercent}%)...</span>
        {:else if verifyState === 'verifying'}
          <span class="animate-spin">🔐</span>
          <span>Đang đối chiếu SHA-256...</span>
        {:else}
          <span>🔐</span>
          <span>Tải &amp; Xác Minh SHA-256 Tự Động</span>
        {/if}
      </button>
    </div>

    <div class="pt-1">
      <a
        href="/app"
        data-testid="install-open-mobile-app-btn"
        class="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-sky-700 hover:bg-sky-800 text-white font-black text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2"
      >
        <span class="text-lg">📱</span>
        <span>Mở Trực Tiếp Giao Diện App Mobile (LingoNest • R10)</span>
      </a>
    </div>

    {#if verifyState === 'verified'}
      <div class="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2">
        <span>✅</span>
        <span>Đã xác minh khớp 100% chữ ký SHA-256! Trình duyệt đang lưu tệp <code>{apkManifest.filename}</code> về máy R10 của bạn.</span>
      </div>
    {:else if verifyState === 'error'}
      <div class="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold flex items-center justify-between gap-2">
        <span>⚠️ {verifyError}</span>
        <a
          href={apkManifest.download_url}
          download={apkManifest.filename || 'tienganhcodung-latest.apk'}
          class="px-3 py-1.5 rounded-xl bg-rose-700 text-white font-bold shrink-0"
        >
          Tải trực tiếp
        </a>
      </div>
    {/if}

    <!-- Technical Specs & Integrity Box -->
    <div class="rounded-2xl bg-surface-1 border border-line p-4 space-y-2.5 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-bold text-ink-900">🔒 Thông số kiểm định an toàn gói APK:</span>
        <button
          type="button"
          onclick={copySha256}
          class="px-2.5 py-1 rounded-lg bg-surface-0 border border-line hover:bg-surface-2 text-ink-700 font-semibold text-[11px]"
        >
          {copiedHash ? '✓ Đã chép SHA-256' : '📋 Chép mã SHA-256'}
        </button>
      </div>
      <div class="grid sm:grid-cols-2 gap-2 text-[11px] text-ink-600">
        <div>• <strong>Package ID:</strong> <code class="font-mono text-ink-900">{apkManifest.package_id}</code></div>
        <div>• <strong>Dung lượng:</strong> <code class="font-mono text-ink-900">{apkManifest.file_size_bytes.toLocaleString('vi-VN')} bytes ({apkManifest.file_size_mb} MB)</code></div>
        <div>• <strong>Hệ điều hành:</strong> Android {apkManifest.min_android || '7.0+'} (SDK 24–34)</div>
        <div>• <strong>Đường dẫn tĩnh:</strong> <a href={apkManifest.download_url} class="text-brand-600 underline font-mono">{apkManifest.download_url}</a></div>
      </div>
      <div class="pt-1 border-t border-line/70 font-mono text-[10px] text-ink-500 break-all">
        <strong>SHA-256:</strong> {apkManifest.sha256}
      </div>
    </div>
  </section>

  <!-- Step-by-Step Guide for DOOGEE R10 -->
  <section class="rounded-3xl bg-surface-0 border border-line p-5 sm:p-6 shadow-sm space-y-4">
    <h2 class="text-base sm:text-lg font-black text-ink-900 flex items-center gap-2">
      <span>🛠️</span>
      <span>Hướng dẫn cài đặt nhanh trên máy tính bảng DOOGEE R10</span>
    </h2>
    <ol class="space-y-3 text-xs sm:text-sm text-ink-700 list-decimal list-inside leading-relaxed">
      <li>
        Bấm nút <strong>"⬇️ Tải Ngay APK v{apkManifest.version_name}"</strong> màu xanh ở trên để tải tệp <code>tienganhcodung-latest.apk</code> về máy.
      </li>
      <li>
        Khi trình duyệt Chrome trên R10 hỏi xác nhận tải tệp, chọn <strong>"Vẫn tải xuống" (Download anyway)</strong> rồi bấm <strong>"Mở" (Open)</strong> ngay khi tải xong.
      </li>
      <li>
        Nếu cài lần đầu, Android sẽ hỏi quyền <em>"Cho phép cài đặt ứng dụng từ nguồn này"</em> — gạt bật công tắc cho Chrome rồi bấm <strong>"Cài đặt" (Install)</strong>.
      </li>
      <li>
        Sau khi cài xong, bấm <strong>"Mở" (Open)</strong> để trải nghiệm ứng dụng Tiếng Anh Cô Dung toàn màn hình! Từ các bản sau, bạn có thể bấm nút <strong>"Kiểm tra cập nhật qua mạng"</strong> ngay trong menu ứng dụng.
      </li>
    </ol>

    <div class="pt-2 flex flex-wrap items-center gap-3">
      <a
        href="/quiz-menu"
        class="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-xs"
      >
        📝 Vào thử Quiz Studio ngay
      </a>
      <button
        type="button"
        onclick={() => checkForUpdate(true)}
        class="px-4 py-2.5 rounded-xl bg-surface-1 hover:bg-surface-2 border border-line text-ink-900 font-bold text-xs"
      >
        📶 Mở Hộp Thoại Kiểm Tra OTA
      </button>
    </div>
  </section>
</div>
