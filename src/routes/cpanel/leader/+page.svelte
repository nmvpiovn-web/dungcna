<svelte:head>
  <title>Điều Hành Chuyên Môn • Cpanel Leader • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getCurrentUser } from '$lib/unifiedStore';
  import { currentLang, toggleLanguage, t } from '$lib/i18n';

  let currentUser = $state(null);
  let assignments = $state([]);
  let submissions = $state([]);
  let campuses = $state([]);
  let streams = $state([]);
  let loading = $state(true);
  let selectedCampus = $state('all');
  let lang = $state('vi');

  currentLang.subscribe(val => {
    lang = val;
  });

  async function loadData() {
    loading = true;
    currentUser = getCurrentUser();
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const [hwRes, campRes] = await Promise.all([
        fetch('/api/homework', { headers }),
        fetch('/api/campuses?streams=true', { headers })
      ]);

      const hwData = await hwRes.json();
      const campData = await campRes.json();

      if (hwData.success) {
        assignments = hwData.assignments || [];
        submissions = hwData.submissions || [];
      }
      if (campData.success) {
        campuses = campData.campuses || [];
        streams = campData.streams || [];
      }
    } catch (e) {
      console.error('Failed to load leader data:', e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
  });

  let filteredAssignments = $derived.by(() => {
    if (selectedCampus === 'all') return assignments;
    return assignments.filter(a => a.campus_id === selectedCampus);
  });

  let totalAssignments = $derived(filteredAssignments.length);
  let totalSubmissions = $derived(submissions.length);
  let totalGraded = $derived(submissions.filter(s => s.status === 'graded').length);
</script>

<div class="space-y-6">
  <!-- Leader Banner -->
  <div class="bg-gradient-to-r from-amber-600 via-rose-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
    <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-amber-200 text-xs font-bold uppercase tracking-wider mb-1">
          <span>👑 Ban Lãnh Đạo & Bài Test / Kiểm Tra</span>
          <span>•</span>
          <span>Giám Sát Chất Lượng Sư Phạm</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-black">Trung Tâm Điều Hành & Ngân Hàng Bài Test / Kiểm Tra 🎯</h1>
        <p class="text-amber-100 text-sm mt-1 max-w-xl">
          Kiểm soát lộ trình giảng dạy theo Obsidian Second-Brain, tỷ lệ hoàn thành BTVN của học sinh và ngân hàng bài test 15 phút, 45 phút, thi thử tốt nghiệp THPT.
        </p>
      </div>

      <div class="flex items-center gap-2 self-start md:self-auto">
        <a href="/admincp" class="px-5 py-2.5 rounded-2xl bg-white text-slate-900 font-black text-xs shadow-lg hover:bg-amber-50 transition-all flex items-center gap-1.5">
          <span>⚡ Mở AdminCP Tổng</span>
        </a>
      </div>
    </div>
  </div>

  <!-- Campus Selector Bar -->
  <div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
    <div class="flex items-center gap-2">
      <span class="text-xs font-bold text-slate-500">🏢 Lọc theo cơ sở:</span>
      <select 
        bind:value={selectedCampus}
        class="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 focus:outline-none"
      >
        <option value="all">🌐 Toàn Bộ Cơ Sở (Nhà Cô Dung + Sunshine + Thầy Vũ)</option>
        {#each campuses as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </div>

    <div class="text-xs font-medium text-slate-500">
      Tổng BTVN đang chạy: <strong class="text-sky-500">{totalAssignments}</strong>
    </div>
  </div>

  <!-- KPI Metrics Grid -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Tổng Bài Tập Đã Giao</div>
      <div class="text-3xl font-black text-sky-600 dark:text-sky-400 mt-2">{totalAssignments}</div>
      <div class="text-[11px] text-slate-500 mt-1">Gắn chặt với ca học & giáo án Obsidian</div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Bài Học Sinh Đã Nộp</div>
      <div class="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{totalSubmissions}</div>
      <div class="text-[11px] text-slate-500 mt-1">Đã chấm điểm: <strong class="text-slate-800 dark:text-slate-200">{totalGraded}</strong> bài</div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Lộ Trình Obsidian MOC</div>
      <div class="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-2">100%</div>
      <div class="text-[11px] text-slate-500 mt-1">Đã kết nối ngân hàng đề kiểm tra 15m/45m/THPT</div>
    </div>
  </div>

  <!-- Multi-location Event Stream Widget -->
  <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
    <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
      <div>
        <h3 class="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
          <span>📡 Dòng Hoạt Động Đa Cơ Sở Trực Tiếp</span>
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        </h3>
        <p class="text-xs text-slate-500 mt-0.5">Theo dõi luồng giao bài, nộp bài, điểm danh và dạy thay chéo giữa các điểm dạy.</p>
      </div>
    </div>

    {#if streams.length === 0}
      <div class="text-center py-8 text-xs text-slate-400">
        Chưa có sự kiện mới nào được ghi nhận trong phiên hôm nay.
      </div>
    {:else}
      <div class="space-y-2.5 max-h-96 overflow-y-auto pr-1">
        {#each streams as stm}
          {@const campusObj = campuses.find(c => c.id === stm.campus_id)}
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex items-start justify-between gap-3 text-xs">
            <div class="space-y-0.5">
              <div class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{stm.title}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                  {campusObj?.short_code || stm.campus_id}
                </span>
              </div>
              <p class="text-slate-500 dark:text-slate-400">{stm.detail}</p>
            </div>
            <span class="text-[11px] text-slate-400 whitespace-nowrap">
              {new Date(stm.created_at).toLocaleTimeString('vi-VN')}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
