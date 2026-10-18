<svelte:head>
  <title>Phương Pháp Sư Phạm &amp; Giáo Án 5512 • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { searchPedagogyResources, getCurrentUser } from '$lib/unifiedStore';
  import { normalizeVietnameseSourceTitle } from '$lib/quizSourceNormalizer.js';

  let currentUser = $state(null);
  let searchQuery = $state('');
  let selectedCategory = $state('all');
  let activeResource = $state(null);

  function normalizeRes(r) {
    if (!r) return r;
    return { ...r, title: normalizeVietnameseSourceTitle(r.title || r.id) };
  }

  onMount(() => {
    currentUser = getCurrentUser();
    const list = searchPedagogyResources().map(normalizeRes);
    if (list.length > 0) activeResource = list[0];
  });

  let resources = $derived(searchPedagogyResources(searchQuery).map(normalizeRes));
  let filteredResources = $derived(
    resources.filter(r => selectedCategory === 'all' || r.category === selectedCategory)
  );
</script>

<div class="space-y-6 pb-20 lg:pb-8">
  <!-- Academic Warmth Hero Banner -->
  <div class="rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-teal-700 text-white p-6 md:p-8 shadow-lg relative overflow-hidden">
    <div class="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
      <div>
        <div class="flex flex-wrap items-center gap-2 mb-2.5">
          <span class="px-3 py-1 rounded-full text-xs font-extrabold bg-white/15 text-white border border-white/25">
            👩‍🏫 Giáo Viên Bản Ngữ &amp; Kế Hoạch 5512
          </span>
          <span class="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-400/20 text-amber-100 border border-amber-300/30">
            ⚡ Nội Suy &amp; Tra Cứu Tức Thì
          </span>
        </div>
        <h1 class="text-2xl md:text-3xl font-heading font-extrabold text-white tracking-tight">
          Phương Pháp Sư Phạm Hiện Đại &amp; Kế Hoạch Bài Dạy 5512
        </h1>
        <p class="text-sm text-white/90 mt-2 max-w-3xl leading-relaxed">
          Kho học liệu nội bộ Tiếng Anh Cô Dung kết hợp thực tiễn Việt Nam: Mô hình đồng giảng dạy (Co-Teaching),
          phương pháp phản xạ toàn thân (TPR), tiếp cận giao tiếp (CLT), cấu trúc giáo án 4 bước theo Công văn 5512/BGDĐT.
        </p>
      </div>

      <!-- Quick Fast Search Input -->
      <div class="w-full md:w-80 shrink-0">
        <div class="relative">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Tìm nhanh (từ khóa, TPR, 5512)..."
            class="w-full bg-white text-ink-900 border border-white/40 rounded-2xl py-2.5 pl-10 pr-8 text-xs placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-md"
          />
          <span class="absolute left-3.5 top-2.5 text-brand-600 text-sm">🔍</span>
          {#if searchQuery}
            <button onclick={() => searchQuery = ''} class="absolute right-3 top-2.5 text-ink-500 hover:text-ink-900 text-xs font-bold">✕</button>
          {/if}
        </div>
        <div class="text-[11px] text-white/85 mt-1.5 flex items-center justify-between px-1">
          <span>Tìm kiếm đa chiều theo ngữ nghĩa</span>
          <span class="font-extrabold text-amber-200">{filteredResources.length} tài liệu</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Category Filter Pills -->
  <div class="flex items-center gap-2 overflow-x-auto pb-1">
    <button
      onclick={() => selectedCategory = 'all'}
      class="px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap {selectedCategory === 'all' ? 'bg-brand-600 text-white shadow-sm' : 'bg-surface-0 text-ink-500 hover:text-ink-900 border border-line'}"
    >
      📚 Tất Cả ({resources.length})
    </button>
    <button
      onclick={() => selectedCategory = 'native_methodology'}
      class="px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap {selectedCategory === 'native_methodology' ? 'bg-brand-600 text-white shadow-sm' : 'bg-surface-0 text-ink-500 hover:text-ink-900 border border-line'}"
    >
      👨‍🏫 Đồng Giảng Bản Ngữ (Co-Teaching)
    </button>
    <button
      onclick={() => selectedCategory = 'lesson_plan_5512'}
      class="px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap {selectedCategory === 'lesson_plan_5512' ? 'bg-brand-600 text-white shadow-sm' : 'bg-surface-0 text-ink-500 hover:text-ink-900 border border-line'}"
    >
      📋 Giáo Án Kế Hoạch 5512
    </button>
  </div>

  <!-- Main Grid: Left List & Right Detail Reader -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Resources Sidebar -->
    <div class="space-y-3">
      {#each filteredResources as res}
        <button
          onclick={() => activeResource = res}
          class="w-full text-left p-4 rounded-2xl border transition-all {activeResource?.id === res.id ? 'bg-brand-50 border-brand-600 shadow-md ring-1 ring-brand-600/30' : 'bg-surface-0 border-line hover:border-brand-200 hover:bg-surface-1'}"
        >
          <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-1">
            <span class="text-brand-700">{res.category === 'native_methodology' ? 'Đồng Giảng Bản Ngữ' : 'Kế Hoạch 5512'}</span>
            <span class="text-ink-500">{res.grade_level === 'all' ? 'K12 Toàn Cấp' : 'THCS / THPT'}</span>
          </div>
          <h3 class="font-heading font-bold text-sm text-ink-900 line-clamp-2 leading-snug">{res.title}</h3>
          {#if res.keywords}
            <div class="flex flex-wrap gap-1 mt-2">
              {#each res.keywords.split(',').slice(0, 3) as kw}
                <span class="text-[10px] px-2 py-0.5 rounded-md bg-surface-1 border border-line text-ink-500 font-mono">
                  #{kw.trim()}
                </span>
              {/each}
            </div>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Active Resource Detail View -->
    <div class="lg:col-span-2">
      {#if activeResource}
        <div class="rounded-3xl bg-surface-0 border border-line p-6 md:p-8 shadow-sm space-y-6">
          <div class="border-b border-line pb-4">
            <div class="flex flex-wrap items-center gap-2 text-xs font-bold text-brand-700 uppercase tracking-wider mb-1">
              <span>{activeResource.category === 'native_methodology' ? '🇬🇧 Chuyên Đề Bản Ngữ Co-Teaching' : '📜 Cấu Trúc Khung Giáo Án 5512'}</span>
              <span>•</span>
              <span class="text-ink-500">Tài liệu sư phạm chuẩn hóa</span>
            </div>
            <h2 class="text-xl md:text-2xl font-heading font-extrabold text-ink-900">{activeResource.title}</h2>
          </div>

          <!-- Native Teacher Tip Box -->
          {#if activeResource.native_teacher_tips}
            <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-xs">
              <span class="text-xl">💡</span>
              <div>
                <strong class="text-emerald-800 block mb-0.5">Lời khuyên từ Giáo viên Bản ngữ (Native Speaker Advice):</strong>
                <span class="text-emerald-900 leading-relaxed">{activeResource.native_teacher_tips}</span>
              </div>
            </div>
          {/if}

          <!-- Markdown Content Body -->
          <div class="max-w-none text-ink-900 text-xs sm:text-sm space-y-4 leading-relaxed">
            <div class="whitespace-pre-line font-sans bg-surface-1 p-5 sm:p-6 rounded-2xl border border-line text-ink-900">
              {activeResource.content_markdown}
            </div>
          </div>

          <!-- Keywords & Download Link -->
          <div class="pt-4 border-t border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div class="text-ink-500">
              <span class="font-bold text-ink-900">Từ khóa nội suy:</span> {activeResource.keywords}
            </div>
            {#if activeResource.downloads_url}
              <a
                href={activeResource.downloads_url}
                target="_blank"
                rel="noopener noreferrer"
                class="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <span>📥 Tải File Đính Kèm (.docx/.pdf)</span>
              </a>
            {/if}
          </div>
        </div>
      {:else}
        <div class="p-12 text-center rounded-2xl bg-surface-0 border border-line text-ink-500">
          Chọn một tài liệu ở cột bên trái để xem chi tiết
        </div>
      {/if}
    </div>
  </div>
</div>
