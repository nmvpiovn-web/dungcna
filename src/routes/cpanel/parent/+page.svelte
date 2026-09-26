<svelte:head>
  <title>Góc Phụ Huynh • Cpanel Giám Sát Học Tập • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getCurrentUser } from '$lib/unifiedStore';

  let currentUser = $state(null);
  let assignments = $state([]);
  let submissions = $state([]);
  let loading = $state(true);
  let activeTab = $state('homework'); // 'homework' | 'tuition' | 'attendance'
  let selectedStudentId = $state('all');

  // Audio player preview for parent
  let currentAudioPlaying = $state(null);

  async function loadData() {
    loading = true;
    currentUser = getCurrentUser();
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
      const res = await fetch('/api/homework', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        assignments = data.assignments || [];
        submissions = data.submissions || [];
      }
    } catch (e) {
      console.error('Failed to load parent data:', e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
  });

  // Calculate stats
  let totalSubmitted = $derived(submissions.length);
  let totalGraded = $derived(submissions.filter(s => s.status === 'graded').length);
  let totalStarsEarned = $derived(submissions.reduce((acc, s) => acc + (s.stars_awarded || 0), 0));
  let avgScore = $derived.by(() => {
    const graded = submissions.filter(s => s.status === 'graded' && s.score !== null);
    if (graded.length === 0) return '0.0';
    const sum = graded.reduce((acc, s) => acc + Number(s.score), 0);
    return (sum / graded.length).toFixed(1);
  });
</script>

<div class="space-y-6">
  <!-- Parent Header Banner -->
  <div class="bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
    <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-emerald-200 text-xs font-bold uppercase tracking-wider mb-1">
          <span>👨‍👩‍👧 Cổng Thông Tin Phụ Huynh</span>
          <span>•</span>
          <span>Đồng Hành Cùng Con</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-black">Kính chào Quý Phụ Huynh! 🌸</h1>
        <p class="text-emerald-100 text-sm mt-1 max-w-xl">
          Theo dõi trực tiếp tiến độ làm bài tập về nhà (Viết/Đọc/Nói), nghe lại bản ghi âm của con, xem nhận xét của giáo viên và số sao tích lũy giảm trừ học phí.
        </p>
      </div>

      <!-- Quick Metrics -->
      <div class="grid grid-cols-3 gap-2.5">
        <div class="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center">
          <div class="text-xl font-black text-amber-300">⭐ {totalStarsEarned}</div>
          <div class="text-[10px] text-emerald-100 font-medium">Sao Tích Lũy</div>
        </div>
        <div class="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center">
          <div class="text-xl font-black text-white">{totalGraded}/{assignments.length}</div>
          <div class="text-[10px] text-emerald-100 font-medium">Đã Hoàn Thành</div>
        </div>
        <div class="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-center">
          <div class="text-xl font-black text-sky-200">{avgScore}</div>
          <div class="text-[10px] text-emerald-100 font-medium">Điểm Trung Bình</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
    <button 
      onclick={() => activeTab = 'homework'}
      class="px-4 py-2 rounded-xl text-xs font-bold transition-all {activeTab === 'homework' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      📝 Tiến Độ BTVN ({submissions.length}/{assignments.length})
    </button>
    <button 
      onclick={() => activeTab = 'tuition'}
      class="px-4 py-2 rounded-xl text-xs font-bold transition-all {activeTab === 'tuition' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      💳 Học Phí & Đối Trừ Sao
    </button>
  </div>

  <!-- Tab 1: Homework Monitor -->
  {#if activeTab === 'homework'}
    {#if loading}
      <div class="text-center py-12 text-slate-400">
        <div class="inline-block animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mb-3"></div>
        <p class="text-sm font-medium">Đang tải báo cáo học tập...</p>
      </div>
    {:else if assignments.length === 0}
      <div class="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
        <p class="text-sm font-bold text-slate-600 dark:text-slate-400">Chưa có bài tập nào được giao cho con trong kỳ này.</p>
      </div>
    {:else}
      <div class="space-y-4">
        {#each assignments as assignment}
          {@const sub = submissions.find(s => s.assignment_id === assignment.id)}
          {@const isGraded = sub?.status === 'graded'}
          {@const isSubmitted = !!sub}
          {@const skillIcon = assignment.skill_type === 'writing' ? '✍️' : assignment.skill_type === 'reading' ? '📖' : '🎙️'}

          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="text-lg">{skillIcon}</span>
                <div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-white">{assignment.title}</h3>
                  <div class="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>👩‍🏫 Giáo viên: <strong>{assignment.teacher_name}</strong></span>
                    <span>•</span>
                    <span>Hạn nộp: <strong class="text-rose-500">{assignment.deadline_time} • {assignment.deadline_date}</strong></span>
                  </div>
                </div>
              </div>

              <!-- Status Badge -->
              <div>
                {#if isGraded}
                  <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <span>⭐ {sub.score}/10 Điểm</span>
                    {#if sub.stars_awarded > 0}
                      <span class="text-amber-500">(+{sub.stars_awarded} sao)</span>
                    {/if}
                  </span>
                {:else if isSubmitted}
                  <span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    Con đã nộp bài • Chờ cô chấm
                  </span>
                {:else}
                  <span class="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                    Chưa nộp bài
                  </span>
                {/if}
              </div>
            </div>

            <!-- Details Box -->
            <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-xs space-y-2.5">
              <div>
                <span class="font-bold text-slate-700 dark:text-slate-300">Yêu cầu buổi học:</span>
                <p class="text-slate-600 dark:text-slate-400 mt-0.5">{assignment.description}</p>
              </div>

              {#if isSubmitted}
                <div class="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div class="flex items-center justify-between text-slate-500 mb-1">
                    <span class="font-bold text-slate-700 dark:text-slate-300">Bài làm của con:</span>
                    <span>Thời gian nộp: {new Date(sub.submitted_at).toLocaleString('vi-VN')} ({sub.is_on_time ? 'Đúng hạn' : 'Nộp muộn'})</span>
                  </div>

                  {#if sub.content_text}
                    <div class="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200">
                      "{sub.content_text}"
                    </div>
                  {/if}

                  {#if sub.handwritten_image_url}
                    <div class="mt-2 space-y-1">
                      <div class="flex items-center justify-between">
                        <span class="font-bold text-amber-600 dark:text-amber-400">📄 Ảnh bài viết tay trên giấy của con:</span>
                        <a href={sub.handwritten_image_url} target="_blank" class="text-sky-500 font-bold hover:underline text-[11px]">Xem Ảnh Gốc</a>
                      </div>
                      <img src={sub.handwritten_image_url} alt="Bài viết tay của con" class="max-h-48 rounded-lg border border-slate-300 dark:border-slate-700 object-contain bg-white shadow-sm" />
                    </div>
                  {/if}

                  {#if sub.audio_url}
                    <div class="mt-2 space-y-1">
                      <span class="font-bold text-emerald-600 dark:text-emerald-400">🎙️ Bản ghi âm giọng nói của con:</span>
                      <audio controls src={sub.audio_url} class="w-full mt-1"></audio>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Teacher Evaluation Box -->
              {#if isGraded}
                <div class="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-1">
                  <div class="font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <span>💬 Nhận xét chi tiết của {assignment.teacher_name}:</span>
                    <span class="text-amber-500 font-bold">Thưởng: +{sub.stars_awarded} Sao</span>
                  </div>
                  <p class="text-emerald-700 dark:text-emerald-300 italic">"{sub.teacher_feedback || 'Bé hoàn thành tốt bài tập.'}"</p>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

  <!-- Tab 2: Tuition & Star Discount -->
  {:else if activeTab === 'tuition'}
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 class="text-lg font-black text-slate-900 dark:text-white">💰 Sổ Học Phí & Đối Trừ Sao Thưởng</h2>
          <p class="text-xs text-slate-500 mt-1">Cơ chế tự động quy đổi sao tích lũy từ BTVN và các bài kiểm tra xuất sắc.</p>
        </div>
        <div class="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-2xl text-right">
          <div class="text-xs text-amber-600 dark:text-amber-400 font-medium">Số sao khả dụng</div>
          <div class="text-xl font-black text-amber-500">⭐ {totalStarsEarned} sao</div>
          <div class="text-[11px] text-slate-500">Giảm trừ tương đương: <strong>{(Math.floor(totalStarsEarned / 100) * 1000).toLocaleString('vi-VN')} đ</strong></div>
        </div>
      </div>

      <!-- Tuition Calculation Rule Explainer -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div class="font-bold text-slate-800 dark:text-slate-200 mb-1">🎯 1. Làm Bài Đúng Hạn & Điểm Cao</div>
          <p class="text-slate-500">Học sinh nộp BTVN trước giờ học tiếp theo và đạt điểm >= 8.5 được thưởng ngay từ 50 đến 100 sao/bài.</p>
        </div>
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div class="font-bold text-slate-800 dark:text-slate-200 mb-1">📉 2. Tự Động Giảm Trừ Học Phí</div>
          <p class="text-slate-500">Cứ 100 sao tích lũy = giảm ngay 1,000 VND trực tiếp trên hóa đơn học phí định kỳ hàng tháng.</p>
        </div>
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div class="font-bold text-slate-800 dark:text-slate-200 mb-1">📱 3. Chuyển Khoản Tiện Lợi VietQR</div>
          <p class="text-slate-500">Mã QR động tự động khấu trừ số tiền giảm sau khi trừ sao, phụ huynh chỉ cần quét bằng app ngân hàng.</p>
        </div>
      </div>
    </div>
  {/if}
</div>
