<svelte:head>
  <title>Sổ Phụ Huynh • Cpanel Giám Sát Học Tập • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getCurrentUser } from '$lib/unifiedStore';

  let currentUser = $state(null);
  let assignments = $state([]);
  let submissions = $state([]);
  let loading = $state(true);
  let errorMessage = $state('');
  let activeTab = $state('homework'); // 'homework' | 'tuition' | 'attendance'
  let selectedStudentId = $state('all');
  let linkedStudents = $state([
    { id: 'all', name: 'Tất cả học sinh liên kết' },
    { id: 'stu_01', name: 'Học sinh: Nguyễn Hoàng Nam (Lớp 7A)' }
  ]);

  // Audio player preview for parent
  let currentAudioPlaying = $state(null);

  async function loadData() {
    loading = true;
    errorMessage = '';
    currentUser = getCurrentUser();

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
      const res = await fetch('/api/homework', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        throw new Error(`Mã lỗi máy chủ: ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        assignments = data.assignments || [];
        submissions = data.submissions || [];
      } else {
        errorMessage = data.error || 'Không thể tải dữ liệu học tập của con.';
      }
    } catch (e) {
      console.error('Failed to load parent data:', e);
      errorMessage = 'Lỗi kết nối máy chủ hoặc phiên đăng nhập đã hết hạn. Vui lòng tải lại.';
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

  let tuitionDiscountVnd = $derived(Math.floor(totalStarsEarned / 100) * 1000);
</script>

<div class="space-y-6">
  <!-- Parent Header Banner (Academic Ledger Style: Firm Navy, Restrained 8px radius, Clean Typography) -->
  <header class="bg-slate-900 border border-slate-800 rounded-lg p-6 text-slate-100 shadow-sm relative">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider">
          <span>Sổ Phụ Huynh</span>
          <span>•</span>
          <span>Cổng Thông Tin Học Vụ Gia Đình</span>
        </div>
        <h1 class="text-2xl font-semibold text-white">Báo Cáo Tiến Độ Học Tập &amp; Học Phí</h1>
        <p class="text-slate-300 text-sm max-w-2xl leading-relaxed">
          Theo dõi trực tiếp kết quả bài tập về nhà, bài viết tay, file ghi âm giọng nói của con và chi tiết đối trừ sao thưởng vào học phí định kỳ.
        </p>
      </div>

      <!-- Quick Metrics (Academic Ledger: Tabular Numbers, Restrained Borders) -->
      <div class="grid grid-cols-3 gap-3 self-stretch md:self-auto min-w-[300px]">
        <div class="bg-slate-800/80 border border-slate-700/60 rounded-md p-3 text-center">
          <div class="text-xl font-semibold text-amber-400 tabular-nums">{totalStarsEarned}</div>
          <div class="text-xs text-slate-400 mt-0.5">Sao Tích Lũy</div>
        </div>
        <div class="bg-slate-800/80 border border-slate-700/60 rounded-md p-3 text-center">
          <div class="text-xl font-semibold text-white tabular-nums">{totalGraded}/{assignments.length}</div>
          <div class="text-xs text-slate-400 mt-0.5">Đã Chấm</div>
        </div>
        <div class="bg-slate-800/80 border border-slate-700/60 rounded-md p-3 text-center">
          <div class="text-xl font-semibold text-sky-400 tabular-nums">{avgScore}</div>
          <div class="text-xs text-slate-400 mt-0.5">Điểm Trung Bình</div>
        </div>
      </div>
    </div>
  </header>

  <!-- Navigation Tabs & Verified Child Selector -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
    <nav class="flex items-center gap-2" aria-label="Các mục sổ phụ huynh">
      <button 
        onclick={() => activeTab = 'homework'}
        class="px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 {activeTab === 'homework' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        Bài Tập Về Nhà ({submissions.length}/{assignments.length})
      </button>
      <button 
        onclick={() => activeTab = 'tuition'}
        class="px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 {activeTab === 'tuition' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        Sổ Học Phí &amp; Đối Trừ Sao
      </button>
    </nav>

    <!-- Child Selector -->
    <div class="flex items-center gap-2">
      <label for="child-select" class="text-xs font-medium text-slate-500 dark:text-slate-400">Học sinh:</label>
      <select 
        id="child-select"
        bind:value={selectedStudentId}
        class="text-xs font-medium px-3 py-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        {#each linkedStudents as stu}
          <option value={stu.id}>{stu.name}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- STATE 1: LOADING SKELETON -->
  {#if loading}
    <div class="academic-loading-skeleton space-y-4" aria-busy="true" aria-label="Đang tải dữ liệu học tập">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
        <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3 animate-pulse"></div>
        <div class="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-2/3 animate-pulse"></div>
        <div class="h-16 bg-slate-50 dark:bg-slate-800/40 rounded animate-pulse"></div>
      </div>
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
        <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4 animate-pulse"></div>
        <div class="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-1/2 animate-pulse"></div>
        <div class="h-16 bg-slate-50 dark:bg-slate-800/40 rounded animate-pulse"></div>
      </div>
    </div>

  <!-- STATE 2: ERROR STATE WITH RETRY -->
  {:else if errorMessage}
    <div class="academic-error-state p-6 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-center space-y-3" role="alert">
      <div class="text-sm font-semibold text-rose-800 dark:text-rose-300">
        Đã xảy ra lỗi khi tải dữ liệu
      </div>
      <p class="text-xs text-rose-700 dark:text-rose-400 max-w-md mx-auto">
        {errorMessage}
      </p>
      <div>
        <button 
          onclick={loadData}
          class="btn-retry px-4 py-2 rounded-md text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          Tải lại dữ liệu
        </button>
      </div>
    </div>

  <!-- STATE 3 & 4: NORMAL / EMPTY DATA -->
  {:else if activeTab === 'homework'}
    {#if assignments.length === 0}
      <!-- Empty State -->
      <div class="academic-empty-state text-center py-16 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
        <div class="text-sm font-semibold text-slate-700 dark:text-slate-300">Chưa có bài tập nào được giao</div>
        <p class="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          Hiện tại giáo viên chưa phát hành bài tập mới cho ca học này. Vui lòng quay lại sau ca học tiếp theo.
        </p>
      </div>
    {:else}
      <div class="space-y-4">
        {#each assignments as assignment}
          {@const sub = submissions.find(s => s.assignment_id === assignment.id)}
          {@const isGraded = sub?.status === 'graded'}
          {@const isSubmitted = !!sub}
          {@const skillLabel = assignment.skill_type === 'writing' ? 'Viết Luận' : assignment.skill_type === 'reading' ? 'Đọc Hiểu' : 'Phát Âm & Nói'}

          <article class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
              <div>
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                    {skillLabel}
                  </span>
                  <h2 class="text-base font-semibold text-slate-900 dark:text-white">{assignment.title}</h2>
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1">
                  <span>Giáo viên phụ trách: <strong>{assignment.teacher_name}</strong></span>
                  <span>•</span>
                  <span>Hạn nộp: <span class="text-rose-600 dark:text-rose-400 font-medium tabular-nums">{assignment.deadline_time} • {assignment.deadline_date}</span></span>
                </div>
              </div>

              <!-- Status Badge (Restrained 4px rounded badge, non-gradient) -->
              <div>
                {#if isGraded}
                  <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <span class="tabular-nums">Điểm: {sub.score}/10</span>
                    {#if sub.stars_awarded > 0}
                      <span class="text-amber-600 dark:text-amber-400 tabular-nums">(+{sub.stars_awarded} sao)</span>
                    {/if}
                  </span>
                {:else if isSubmitted}
                  <span class="px-3 py-1 rounded text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Đã nộp bài • Chờ giáo viên chấm
                  </span>
                {:else}
                  <span class="px-3 py-1 rounded text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    Chưa nộp bài
                  </span>
                {/if}
              </div>
            </div>

            <!-- Details & Content Box -->
            <div class="bg-slate-50 dark:bg-slate-800/40 rounded-md p-4 text-xs space-y-3">
              <div>
                <span class="font-semibold text-slate-700 dark:text-slate-300">Yêu cầu buổi học:</span>
                <p class="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{assignment.description}</p>
              </div>

              {#if isSubmitted}
                <div class="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                  <div class="flex items-center justify-between text-slate-500">
                    <span class="font-semibold text-slate-700 dark:text-slate-300">Bài làm nộp:</span>
                    <span class="tabular-nums">Thời gian: {new Date(sub.submitted_at).toLocaleString('vi-VN')} ({sub.is_on_time ? 'Đúng hạn' : 'Nộp muộn'})</span>
                  </div>

                  {#if sub.content_text}
                    <div class="p-3 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200 text-xs">
                      {sub.content_text}
                    </div>
                  {/if}

                  {#if sub.handwritten_image_url}
                    <div class="space-y-1 pt-1">
                      <div class="flex items-center justify-between">
                        <span class="font-semibold text-slate-700 dark:text-slate-300">Ảnh bài viết tay trên giấy:</span>
                        <a href={sub.handwritten_image_url} target="_blank" rel="noopener noreferrer" class="text-sky-600 dark:text-sky-400 font-semibold hover:underline">Xem ảnh gốc</a>
                      </div>
                      <img src={sub.handwritten_image_url} alt="Bài viết tay của học sinh" class="max-h-48 rounded border border-slate-200 dark:border-slate-700 object-contain bg-white" />
                    </div>
                  {/if}

                  {#if sub.audio_url}
                    <div class="space-y-1 pt-1">
                      <span class="font-semibold text-slate-700 dark:text-slate-300">Bản ghi âm giọng đọc:</span>
                      <audio controls src={sub.audio_url} class="w-full mt-1"></audio>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Teacher Evaluation Box -->
              {#if isGraded}
                <div class="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded border border-emerald-200 dark:border-emerald-800/80 space-y-1">
                  <div class="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <span>Nhận xét sư phạm của {assignment.teacher_name}:</span>
                    <span class="text-amber-700 dark:text-amber-400 font-medium tabular-nums">Thưởng: +{sub.stars_awarded} sao</span>
                  </div>
                  <p class="text-emerald-700 dark:text-emerald-400 italic">"{sub.teacher_feedback || 'Học sinh hoàn thành tốt bài tập.'}"</p>
                </div>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}

  <!-- TAB 2: TUITION & STAR DISCOUNT -->
  {:else if activeTab === 'tuition'}
    <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Sổ Học Phí &amp; Đối Trừ Sao Thưởng</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Cơ chế quy đổi sao tích lũy từ BTVN đúng hạn và bài kiểm tra xuất sắc.</p>
        </div>
        <div class="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-md text-right">
          <div class="text-xs text-slate-500 dark:text-slate-400">Sao khả dụng kỳ này</div>
          <div class="text-xl font-semibold text-amber-500 tabular-nums">{totalStarsEarned} sao</div>
          <div class="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            Giảm trừ tương đương: <strong class="tabular-nums">{tuitionDiscountVnd.toLocaleString('vi-VN')} đ</strong>
          </div>
        </div>
      </div>

      <!-- CRITICAL RECONCILIATION POLICY NOTICE (VietQR is facilitator, not settlement proof) -->
      <div class="p-4 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs space-y-2">
        <div class="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
          <span>Quy Định Quyết Toán &amp; Đối Trừ Minh Bạch</span>
        </div>
        <p class="text-amber-700 dark:text-amber-400 leading-relaxed">
          <strong>Lưu ý đối soát thanh toán:</strong> Mã VietQR động trên hệ thống là tiện ích hỗ trợ chuyển khoản chính xác nội dung học phí. Việc quét mã hoặc chuyển tiền là phương tiện thanh toán, <em>không cấu thành bằng chứng đã quyết toán tự động</em>. Hóa đơn học phí chỉ được đánh dấu trạng thái <strong>Đã Thanh Toán (Paid)</strong> sau khi bộ phận Kế toán đối soát thành công qua sao kê ngân hàng và cấp biên lai điện tử.
        </p>
      </div>

      <!-- Tuition Calculation Rule Explainer -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div class="p-4 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
          <div class="font-semibold text-slate-800 dark:text-slate-200">1. Làm Bài Đúng Hạn &amp; Điểm Cao</div>
          <p class="text-slate-600 dark:text-slate-400 leading-relaxed">Học sinh nộp BTVN trước giờ học tiếp theo và đạt điểm &ge; 8.5 được thưởng từ 50 đến 100 sao/bài.</p>
        </div>
        <div class="p-4 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
          <div class="font-semibold text-slate-800 dark:text-slate-200">2. Quy Đổi Trừ Học Phí</div>
          <p class="text-slate-600 dark:text-slate-400 leading-relaxed">Mỗi 100 sao tích lũy = giảm trừ 1,000 VND trực tiếp trên thông báo học phí hàng tháng.</p>
        </div>
        <div class="p-4 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
          <div class="font-semibold text-slate-800 dark:text-slate-200">3. Biên Lai &amp; Quyết Toán</div>
          <p class="text-slate-600 dark:text-slate-400 leading-relaxed">Sau khi nhận chuyển khoản qua VietQR, kế toán Cô Dung phát hành biên lai thu phí có mã định danh.</p>
        </div>
      </div>
    </div>
  {/if}
</div>
