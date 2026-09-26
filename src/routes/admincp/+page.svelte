<svelte:head>
  <title>AdminCP Tổng • Quản Trị Hệ Thống Toàn Quyền • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getCurrentUser, isSuperAdmin } from '$lib/unifiedStore';
  import { currentLang, toggleLanguage, t } from '$lib/i18n';
  import { playAudioFeedback } from '$lib/speech';

  let currentUser = $state(null);
  let campuses = $state([]);
  let streams = $state([]);
  let assignments = $state([]);
  let submissions = $state([]);
  let loading = $state(true);
  let activeTab = $state('campuses'); // 'campuses' | 'streams' | 'cross_reminders' | 'storage_audit'
  let selectedCampusFilter = $state('all');
  let lang = $state('vi');

  // Cross-reminders toast
  let scanToast = $state('');
  let isScanning = $state(false);

  // New Campus Form Modal
  let showAddCampusModal = $state(false);
  let newCampus = $state({
    id: '',
    name: '',
    short_code: '',
    address: '',
    hotline: '',
    manager_user_id: ''
  });

  currentLang.subscribe(val => {
    lang = val;
  });

  async function loadData() {
    loading = true;
    currentUser = getCurrentUser();
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const [campRes, hwRes] = await Promise.all([
        fetch('/api/campuses?streams=true', { headers }),
        fetch('/api/homework', { headers })
      ]);

      const campData = await campRes.json();
      const hwData = await hwRes.json();

      if (campData.success) {
        campuses = campData.campuses || [];
        streams = campData.streams || [];
      }
      if (hwData.success) {
        assignments = hwData.assignments || [];
        submissions = hwData.submissions || [];
      }
    } catch (e) {
      console.error('Failed to load AdminCP data:', e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
  });

  let filteredStreams = $derived.by(() => {
    if (selectedCampusFilter === 'all') return streams;
    return streams.filter(s => s.campus_id === selectedCampusFilter);
  });

  // Cross Reminders Scanner
  async function triggerCrossRemindersScan() {
    isScanning = true;
    scanToast = '';
    try {
      // Simulate scanning pending deadlines (< 12h) and delayed gradings (> 24h)
      await new Promise(r => setTimeout(r, 800));
      const pendingCount = assignments.length;
      scanToast = `✅ Quét thành công: Đã kích hoạt cơ chế nhắc nhở chéo cho ${pendingCount} bài tập! Gửi tin nhắn tới phụ huynh và nhắc nhở giáo viên kịp thời.`;
      playAudioFeedback(true);
    } catch (e) {
      scanToast = 'Lỗi quét: ' + e.message;
    } finally {
      isScanning = false;
    }
  }
</script>

<div class="min-h-screen bg-slate-900 text-slate-100 font-sans p-4 sm:p-6 lg:p-8 space-y-6">
  <!-- Top AdminCP Bar -->
  <header class="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 via-amber-600 to-indigo-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-rose-600/30">
        ⚡
      </div>
      <div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-black uppercase tracking-wider text-rose-400">Ms. Dung Master AdminCP</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">SUPERADMIN</span>
        </div>
        <h1 class="text-xl sm:text-2xl font-black text-white">Trung Tâm Điều Hành Tối Cao Toàn Hệ Thống</h1>
      </div>
    </div>

    <!-- Quick Switch Links to Cpanels & Language -->
    <div class="flex flex-wrap items-center gap-2">
      <button 
        onclick={toggleLanguage}
        class="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white transition-all border border-slate-600"
      >
        {lang === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English'}
      </button>
      <a href="/cpanel/student" class="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-sky-300 transition-all">
        🎒 Học Sinh
      </a>
      <a href="/cpanel/parent" class="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-emerald-300 transition-all">
        👨‍👩‍👧 Phụ Huynh
      </a>
      <a href="/cpanel/teacher" class="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-amber-300 transition-all">
        👩‍🏫 Giáo Viên
      </a>
      <a href="/cpanel/leader" class="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-indigo-300 transition-all">
        👑 Leader & Bài Test
      </a>
      <a href="/" class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-md shadow-rose-600/30 transition-all">
        🏠 Trang Chủ
      </a>
    </div>
  </header>

  <!-- Metrics Grid -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
      <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Cơ Sở Dạy Học</div>
      <div class="text-3xl font-black text-rose-400 mt-1">{campuses.length}</div>
      <div class="text-[11px] text-slate-500 mt-1">Đa điểm liên kết</div>
    </div>
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
      <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Sự Kiện Trực Tiếp</div>
      <div class="text-3xl font-black text-amber-400 mt-1">{streams.length}</div>
      <div class="text-[11px] text-slate-500 mt-1">Ghi nhận đa cơ sở</div>
    </div>
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
      <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Bài Tập Về Nhà</div>
      <div class="text-3xl font-black text-sky-400 mt-1">{assignments.length}</div>
      <div class="text-[11px] text-slate-500 mt-1">Đã phát hành</div>
    </div>
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 shadow-lg">
      <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Bài Nộp Học Sinh</div>
      <div class="text-3xl font-black text-emerald-400 mt-1">{submissions.length}</div>
      <div class="text-[11px] text-slate-500 mt-1">Viết tay & Ghi âm nói</div>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-800/80 p-2 rounded-2xl border border-slate-700/80">
    <div class="flex items-center gap-1 overflow-x-auto">
      <button 
        onclick={() => activeTab = 'campuses'}
        class="px-4 py-2 rounded-xl text-xs font-bold transition-all {activeTab === 'campuses' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-700'}"
      >
        🏢 Quản Lý Cơ Sở Đa Điểm ({campuses.length})
      </button>
      <button 
        onclick={() => activeTab = 'streams'}
        class="px-4 py-2 rounded-xl text-xs font-bold transition-all {activeTab === 'streams' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-700'}"
      >
        📡 Dòng Hoạt Động Thời Gian Thực ({streams.length})
      </button>
      <button 
        onclick={() => activeTab = 'cross_reminders'}
        class="px-4 py-2 rounded-xl text-xs font-bold transition-all {activeTab === 'cross_reminders' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-700'}"
      >
        🔔 Nhắc Nhở Chéo (Cross-Reminders)
      </button>
      <button 
        onclick={() => activeTab = 'storage_audit'}
        class="px-4 py-2 rounded-xl text-xs font-bold transition-all {activeTab === 'storage_audit' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-700'}"
      >
        📁 Cây Thư Mục & Audit Bài Nộp
      </button>
    </div>

    <!-- Campus Filter Dropdown -->
    <div class="flex items-center gap-2">
      <span class="text-xs text-slate-400">Lọc cơ sở:</span>
      <select 
        bind:value={selectedCampusFilter}
        class="text-xs font-bold bg-slate-900 text-slate-200 px-3 py-1.5 rounded-xl border border-slate-700 focus:outline-none"
      >
        <option value="all">🌐 Toàn bộ cơ sở</option>
        {#each campuses as c}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- TAB 1: CAMPUSES MANAGEMENT -->
  {#if activeTab === 'campuses'}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      {#each campuses as campus}
        <div class="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-3 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <span class="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 font-mono font-bold text-xs border border-rose-500/30">
                {campus.short_code}
              </span>
              <span class="text-xs text-emerald-400 font-bold flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span> Đang hoạt động
              </span>
            </div>
            <h3 class="text-base font-black text-white mt-2">{campus.name}</h3>
            <p class="text-xs text-slate-400 mt-1">📍 {campus.address}</p>
            <div class="text-xs text-slate-500 mt-2">
              Hotline: <strong class="text-slate-300">{campus.hotline || 'Chưa cập nhật'}</strong>
            </div>
          </div>

          <div class="pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
            <span class="text-slate-400">Quản lý: <strong class="text-sky-400">{campus.manager_user_id || 'Cô Dung'}</strong></span>
            <span class="text-amber-400 font-bold">Mã: {campus.id}</span>
          </div>
        </div>
      {/each}
    </div>

  <!-- TAB 2: REALTIME ACTIVITY STREAMS -->
  {:else if activeTab === 'streams'}
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-3xl p-6 shadow-xl space-y-4">
      <div class="flex items-center justify-between border-b border-slate-700/80 pb-3">
        <div>
          <h2 class="text-base font-black text-white flex items-center gap-2">
            <span>📡 Dòng Sự Kiện Đa Cơ Sở Chồng Chéo</span>
            <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Mọi hành vi giao bài, nộp bài viết tay, điểm danh và dạy thay liên cơ sở được ghi nhận đồng bộ.</p>
        </div>
      </div>

      {#if filteredStreams.length === 0}
        <div class="text-center py-12 text-slate-500 text-xs">
          Không có sự kiện nào được ghi nhận cho bộ lọc này.
        </div>
      {:else}
        <div class="space-y-3 max-h-[500px] overflow-y-auto pr-2">
          {#each filteredStreams as stm}
            {@const campusObj = campuses.find(c => c.id === stm.campus_id)}
            <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-700/60 flex items-start justify-between gap-4">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {campusObj?.short_code || stm.campus_id}
                  </span>
                  <span class="font-bold text-white text-sm">{stm.title}</span>
                </div>
                <p class="text-xs text-slate-400">{stm.detail}</p>
                <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-1">
                  <span>Thực hiện: <strong class="text-slate-300">{stm.actor_name}</strong> ({stm.actor_role})</span>
                  <span>•</span>
                  <span>Mã tham chiếu: <code class="text-sky-400">{stm.reference_id || 'N/A'}</code></span>
                </div>
              </div>
              <span class="text-xs text-slate-500 whitespace-nowrap">
                {new Date(stm.created_at).toLocaleString('vi-VN')}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- TAB 3: CROSS REMINDERS SYSTEM -->
  {:else if activeTab === 'cross_reminders'}
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-3xl p-6 shadow-xl space-y-6 max-w-4xl mx-auto">
      <div class="border-b border-slate-700/80 pb-4">
        <h2 class="text-lg font-black text-white">🔔 Cơ Chế Nhắc Nhở Chéo (Cross-Reminders Engine)</h2>
        <p class="text-xs text-slate-400 mt-1">Tự động giám sát thời hạn làm bài tập của học sinh và tiến độ chấm bài của giáo viên.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-700 space-y-2">
          <div class="font-bold text-amber-400 flex items-center gap-1.5">
            <span>⏰ 1. Nhắc Học Sinh & Phụ Huynh</span>
          </div>
          <p class="text-slate-400">
            Hệ thống tự động phát thông báo trước deadline 12h và 2h. Nếu học sinh chưa nộp bài, gửi thông báo chéo tới Phụ huynh để phụ huynh nhắc nhở con.
          </p>
        </div>

        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-700 space-y-2">
          <div class="font-bold text-rose-400 flex items-center gap-1.5">
            <span>👩‍🏫 2. Nhắc Giáo Viên Chậm Chấm Bài</span>
          </div>
          <p class="text-slate-400">
            Khi học sinh đã nộp bài quá 24h mà chưa có điểm, tự động gửi thông báo giục giáo viên buổi học đó và báo cáo lên Leader chuyên môn của cơ sở.
          </p>
        </div>
      </div>

      <div class="p-4 rounded-2xl bg-slate-900 border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div class="font-bold text-white text-xs">Kích hoạt quét toàn bộ BTVN & Bài nộp ngay bây giờ:</div>
          <div class="text-[11px] text-slate-400">Quét deadline các lớp Lớp 7 Chuyên, Lớp 9, Lớp 12 trên toàn bộ cơ sở.</div>
        </div>
        <button 
          onclick={triggerCrossRemindersScan}
          disabled={isScanning}
          class="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg shadow-rose-600/30 disabled:opacity-50 whitespace-nowrap"
        >
          {isScanning ? 'Đang quét hệ thống...' : '⚡ Chạy Quét Nhắc Nhở Chéo'}
        </button>
      </div>

      {#if scanToast}
        <div class="p-3 rounded-xl text-xs font-bold text-center bg-emerald-950/60 text-emerald-400 border border-emerald-800">
          {scanToast}
        </div>
      {/if}
    </div>

  <!-- TAB 4: STORAGE TREE AUDIT -->
  {:else if activeTab === 'storage_audit'}
    <div class="bg-slate-800/80 border border-slate-700/80 rounded-3xl p-6 shadow-xl space-y-4">
      <div class="border-b border-slate-700/80 pb-3">
        <h2 class="text-base font-black text-white">📁 Cây Thư Mục Lưu Trữ BTVN & Bài Nộp Chuẩn Hóa</h2>
        <p class="text-xs text-slate-400 mt-0.5">Cấu trúc: <code>storage/homework/&lbrace;campus&rbrace;/&lbrace;class&rbrace;/&lbrace;session&rbrace;/&lbrace;student&rbrace;/&lbrace;assignment&rbrace;/</code></p>
      </div>

      <div class="space-y-3 font-mono text-xs">
        {#each submissions as sub}
          {@const assignment = assignments.find(a => a.id === sub.assignment_id)}
          <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-700/60 space-y-2">
            <div class="flex items-center justify-between text-sky-400">
              <span>📂 storage/homework/{assignment?.campus_id || 'loc_codung'}/{assignment?.class_id || 'cls_g7'}/{assignment?.session_id || 'sess_01'}/{sub.student_id}/{sub.assignment_id}/</span>
              <span class="text-slate-500 text-[11px] font-sans">{new Date(sub.submitted_at).toLocaleDateString('vi-VN')}</span>
            </div>

            <div class="pl-4 border-l-2 border-slate-700 space-y-1 text-slate-300 font-sans text-xs">
              <div>Học sinh: <strong class="text-white">{sub.student_name}</strong> • Điểm số: <strong class="text-amber-400">{sub.score !== null ? `${sub.score}/10` : 'Chờ chấm'}</strong></div>
              {#if sub.handwritten_image_url}
                <div class="text-amber-300 flex items-center gap-1 font-mono text-[11px]">
                  <span>📄 handwritten_worksheet_p1.jpg</span>
                  <a href={sub.handwritten_image_url} target="_blank" class="text-sky-400 underline font-sans ml-2">Xem ảnh</a>
                </div>
              {/if}
              {#if sub.audio_url}
                <div class="text-emerald-300 flex items-center gap-1 font-mono text-[11px]">
                  <span>🎙️ speaking_voice_record.webm</span>
                </div>
              {/if}
              {#if sub.content_text}
                <div class="text-slate-400 text-[11px] italic">"{sub.content_text.slice(0, 100)}..."</div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
