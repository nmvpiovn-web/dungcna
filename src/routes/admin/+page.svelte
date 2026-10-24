<svelte:head>
  <title>Cổng Điều Phối AdminCP • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let redirecting = $state(true);

  onMount(() => {
    const timer = setTimeout(() => {
      goto('/admincp', { replaceState: true });
    }, 350);
    return () => clearTimeout(timer);
  });
</script>

<div class="max-w-4xl mx-auto py-12 px-4">
  <div class="bg-white border border-emerald-200 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4">
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
      <span>👑 ADMINCP UNIFIED WORKSPACE</span>
    </div>
    <h1 class="text-xl sm:text-2xl font-extrabold text-slate-900">
      Trung Tâm Điều Hành Hợp Nhất AdminCP
    </h1>
    <p class="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
      Toàn bộ chức năng quản trị 3 cơ sở học tập (Nhà Cô Dung 42 Hiệp Bình, Sunshine KDC Thanh Niên, Nhà Thầy Vũ KDC Hồng Long), Sổ Học Phí VietQR, Giao diện Sự kiện và Langflow CRAG 100 Phase đã được hợp nhất tại <strong>/admincp</strong>.
    </p>
    <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
      <a
        href="/admincp"
        class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors"
      >
        🚀 Mở Trung Tâm AdminCP ({redirecting ? 'Đang chuyển hướng...' : 'Sẵn sàng'})
      </a>
      <a
        href="/langflow"
        class="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs sm:text-sm font-semibold transition-colors"
      >
        🕸️ Langflow CRAG 100 Phase
      </a>
      <a
        href="/session-audit"
        class="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs sm:text-sm font-semibold transition-colors"
      >
        📊 Đối Soát Ca Dạy
      </a>
    </div>
  </div>
</div>
