<script>
  import { onMount } from 'svelte';
  import { searchPedagogyResources, getCurrentUser, isTeacherOrAdmin } from '$lib/unifiedStore';

  let currentUser = $state(null);
  let searchQuery = $state('');
  let selectedCategory = $state('all');
  let activeResource = $state(null);

  onMount(() => {
    currentUser = getCurrentUser();
    const list = searchPedagogyResources();
    if (list.length > 0) activeResource = list[0];
  });

  let resources = $derived(searchPedagogyResources(searchQuery));
  let filteredResources = $derived(
    resources.filter(r => selectedCategory === 'all' || r.category === selectedCategory)
  );
</script>

<div class="space-y-6">
  <!-- Banner -->
  <div class="rounded-3xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-indigo-950/70 border border-slate-800 p-6 md:p-8 shadow-2xl relative overflow-hidden">
    <div class="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
      <div>
        <div class="flex items-center gap-2 mb-2">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Giáo Viên Bản Ngữ &amp; Kế Hoạch 5512
          </span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            Nội Suy &amp; Tra Cứu Tức Thì
          </span>
        </div>
        <h1 class="text-2xl md:text-3xl font-black text-white">
          Tiếng Anh Cô Dung — Phương Pháp Sư Phạm Hiện Đại &amp; Kế Hoạch Bài Dạy 5512
        </h1>
        <p class="text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
          Kho học liệu nội bộ Tiếng Anh Cô Dung kết hợp thực tiễn Việt Nam: Mô hình đồng giảng dạy (Co-Teaching), 
          phương pháp phản xạ toàn thân (TPR), tiếp cận giao tiếp (CLT), cấu trúc giáo án 4 bước theo Công văn 5512/BGDĐT.
        </p>
      </div>

      <!-- Quick Fast Search Input -->
      <div class="w-full md:w-80">
        <div class="relative">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="⚡ Nội suy nhanh (từ khóa, TPR, 5512)..."
            class="w-full bg-slate-900/90 border border-emerald-500/40 rounded-2xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-lg"
          />
          <span class="absolute left-3.5 top-2.5 text-emerald-400 text-sm">🔍</span>
          {#if searchQuery}
            <button onclick={() => searchQuery = ''} class="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs">✕</button>
          {/if}
        </div>
        <div class="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between">
          <span>Tìm kiếm đa chiều theo ngữ nghĩa</span>
          <span class="text-emerald-400 font-bold">{filteredResources.length} kết quả</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Category Filter Pills -->
  <div class="flex items-center gap-2 overflow-x-auto pb-1">
    <button
      onclick={() => selectedCategory = 'all'}
      class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap {selectedCategory === 'all' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}"
    >
      Tất Cả ({resources.length})
    </button>
    <button
      onclick={() => selectedCategory = 'native_methodology'}
      class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap {selectedCategory === 'native_methodology' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}"
    >
      👨‍🏫 Đồng Giảng Bản Ngữ (Co-Teaching)
    </button>
    <button
      onclick={() => selectedCategory = 'lesson_plan_5512'}
      class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap {selectedCategory === 'lesson_plan_5512' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}"
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
          class="w-full text-left p-4 rounded-2xl border transition-all {activeResource?.id === res.id ? 'bg-slate-800 border-emerald-500 shadow-xl ring-1 ring-emerald-500/50' : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/60 text-slate-300'}"
        >
          <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-1">
            <span class="text-emerald-400">{res.category === 'native_methodology' ? 'Đồng Giảng Bản Ngữ' : 'Kế Hoạch 5512'}</span>
            <span class="text-slate-500">{res.grade_level === 'all' ? 'K12 Toàn Cấp' : 'THCS / THPT'}</span>
          </div>
          <h3 class="font-bold text-sm text-white line-clamp-2 leading-snug">{res.title}</h3>
          {#if res.keywords}
            <div class="flex flex-wrap gap-1 mt-2">
              {#each res.keywords.split(',').slice(0, 3) as kw}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 font-mono">
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
        <div class="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 shadow-2xl space-y-6">
          <div class="border-b border-slate-800 pb-4">
            <div class="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
              <span>{activeResource.category === 'native_methodology' ? '🇬🇧 Chuyên Đề Bản Ngữ Co-Teaching' : '📜 Cấu Trúc Khung Giáo Án 5512'}</span>
              <span>•</span>
              <span class="text-slate-400">Tài liệu lưu hành nội bộ</span>
            </div>
            <h2 class="text-xl md:text-2xl font-black text-white">{activeResource.title}</h2>
          </div>

          <!-- Native Teacher Tip Box -->
          {#if activeResource.native_teacher_tips}
            <div class="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-3 text-xs">
              <span class="text-xl">💡</span>
              <div>
                <strong class="text-emerald-300 block mb-0.5">Lời khuyên từ Giáo viên Bản ngữ (Native Speaker Advice):</strong>
                <span class="text-slate-200 leading-relaxed font-sans">{activeResource.native_teacher_tips}</span>
              </div>
            </div>
          {/if}

          <!-- Markdown Content Body -->
          <div class="prose prose-invert max-w-none text-slate-300 text-xs sm:text-sm space-y-4 leading-relaxed">
            <div class="whitespace-pre-line font-sans bg-slate-950 p-6 rounded-2xl border border-slate-800/80">
              {activeResource.content_markdown}
            </div>
          </div>

          <!-- Keywords & Download Link -->
          <div class="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div class="text-slate-400">
              <span class="font-bold text-slate-300">Từ khóa nội suy:</span> {activeResource.keywords}
            </div>
            {#if activeResource.downloads_url}
              <a
                href={activeResource.downloads_url}
                target="_blank"
                class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold border border-slate-700 flex items-center gap-1.5"
              >
                <span>📥 Tải File Đính Kèm (.docx/.pdf)</span>
              </a>
            {/if}
          </div>
        </div>
      {:else}
        <div class="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">
          Chọn một tài liệu ở cột bên trái để xem chi tiết
        </div>
      {/if}
    </div>
  </div>
</div>
