<svelte:head>
  <title>Sổ Phụ Huynh • Cpanel Giám Sát Học Tập • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getAuthToken, getCurrentUser } from '$lib/unifiedStore';

  let currentUser = $state(null);
  let assignments = $state([]);
  let rawSubmissions = $state([]);
  let loading = $state(true);
  let errorMessage = $state('');
  let activeTab = $state('homework'); // 'homework' | 'tuition'
  let selectedStudentId = $state('');
  let linkedStudents = $state([]);
  let pendingLinks = $state([]);

  // Audio player preview for parent
  let currentAudioPlaying = $state(null);

  // Filter submissions by selected student
  let filteredSubmissions = $derived.by(() => {
    if (selectedStudentId === 'all') {
      return rawSubmissions;
    }
    return rawSubmissions.filter(s => s.student_id === selectedStudentId);
  });

  // Calculate stats based on active child selection
  let totalSubmitted = $derived(filteredSubmissions.length);
  let totalGraded = $derived(filteredSubmissions.filter(s => s.status === 'graded').length);
  let totalStarsEarned = $derived(filteredSubmissions.reduce((acc, s) => acc + (s.stars_awarded || 0), 0));
  let avgScore = $derived.by(() => {
    const graded = filteredSubmissions.filter(s => s.status === 'graded' && s.score !== null);
    if (graded.length === 0) return '0.0';
    const sum = graded.reduce((acc, s) => acc + Number(s.score), 0);
    return (sum / graded.length).toFixed(1);
  });

  let tuitionDiscountVnd = $derived(Math.floor(totalStarsEarned / 100) * 1000);

  async function loadLinkedChildren() {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/parents/children', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const verified = (data.children || []).filter(c => c.is_verified === true);
          pendingLinks = (data.children || []).filter(c => c.is_verified !== true);
          linkedStudents = [
            ...(verified.length > 1 ? [{ id: 'all', name: 'Tất cả học sinh đã xác minh' }] : []),
            ...verified.map(c => ({
              id: c.id,
              name: `${c.name} (${c.grade || 'Chưa xác định khối'})`
            }))
          ];
          if (!linkedStudents.some(student => student.id === selectedStudentId)) {
            selectedStudentId = linkedStudents[0]?.id || '';
          }
        }
      }
    } catch (err) {
      console.warn('Could not load linked children dynamically:', err);
    }
  }

  let loadSequence = 0;
  async function loadData() {
    const sequence = ++loadSequence;
    assignments = [];
    rawSubmissions = [];
    loading = true;
    errorMessage = '';
    currentUser = getCurrentUser();

    if (linkedStudents.length === 0 || !selectedStudentId) {
      loading = false;
      return;
    }

    try {
      const token = getAuthToken();
      const queryParam = selectedStudentId !== 'all' ? `?child_id=${encodeURIComponent(selectedStudentId)}` : '';
      const res = await fetch(`/api/homework${queryParam}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        throw new Error(`Mã lỗi máy chủ: ${res.status}`);
      }

      const data = await res.json();
      if (sequence !== loadSequence) return;
      if (data.success) {
        assignments = data.assignments || [];
        rawSubmissions = data.submissions || [];
      } else {
        errorMessage = data.error || 'Không thể tải dữ liệu học tập của con.';
      }
    } catch (e) {
      if (sequence !== loadSequence) return;
      console.error('Failed to load parent data:', e);
      errorMessage = 'Lỗi kết nối máy chủ hoặc phiên đăng nhập đã hết hạn. Vui lòng tải lại.';
    } finally {
      if (sequence === loadSequence) loading = false;
    }
  }

  function handleChildChange() {
    loadData();
  }

  onMount(async () => {
    await loadLinkedChildren();
    await loadData();
  });
</script>

<div class="space-y-6 max-w-7xl mx-auto">
  <!-- Parent Header Banner (Academic Ledger Style: Firm Navy, Restrained borders, 390px responsive) -->
  <header class="bg-slate-900 border border-slate-800 rounded-lg p-4 sm:p-6 text-slate-100 shadow-sm relative overflow-hidden">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
      <div class="space-y-2 min-w-0">
        <div class="flex items-center gap-2 text-cx-400 text-xs font-semibold uppercase tracking-wider">
          <svg class="w-4 h-4 text-cx-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span>Sổ Phụ Huynh</span>
          <span>•</span>
          <span>Cổng Thông Tin Học Vụ Gia Đình</span>
        </div>
        <h1 class="text-xl sm:text-2xl font-semibold text-white tracking-tight">Báo Cáo Tiến Độ Học Tập &amp; Học Phí</h1>
        <p class="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
          Theo dõi trực tiếp kết quả bài tập về nhà, bài viết tay, file ghi âm giọng nói của con và chi tiết đối trừ sao thưởng vào học phí định kỳ.
        </p>
      </div>

      <!-- Quick Metrics (Academic Ledger: Tabular Numbers, Restrained Borders, Non-overflowing 390px) -->
      <div class="grid grid-cols-3 gap-2 sm:gap-3 w-full md:w-auto min-w-0">
        <div class="bg-slate-800/80 border border-slate-700/60 rounded-md p-2.5 sm:p-3 text-center min-w-0">
          <div class="text-lg sm:text-xl font-semibold text-amber-400 tabular-nums truncate">{totalStarsEarned}</div>
          <div class="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">Sao Tích Lũy</div>
        </div>
        <div class="bg-slate-800/80 border border-slate-700/60 rounded-md p-2.5 sm:p-3 text-center min-w-0">
          <div class="text-lg sm:text-xl font-semibold text-white tabular-nums truncate">{totalGraded}/{assignments.length}</div>
          <div class="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">Đã Chấm</div>
        </div>
        <div class="bg-slate-800/80 border border-slate-700/60 rounded-md p-2.5 sm:p-3 text-center min-w-0">
          <div class="text-lg sm:text-xl font-semibold text-cx-400 tabular-nums truncate">{avgScore}</div>
          <div class="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">Điểm TB</div>
        </div>
      </div>
    </div>
  </header>

  <!-- Navigation Tabs & Verified Child Selector -->
  {#if pendingLinks.length > 0}
    <div class="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200" data-testid="pending-child-links">
      <div class="font-semibold">Có {pendingLinks.length} yêu cầu liên kết đang chờ nhà trường xác minh.</div>
      <div class="mt-1">Dữ liệu học tập và học phí chỉ mở sau khi Leader/Admin xác minh đúng học sinh.</div>
    </div>
  {/if}

  {#if linkedStudents.length === 0}
    <div class="p-6 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center" data-testid="no-verified-child">
      <div class="font-semibold text-slate-800 dark:text-slate-200">Chưa có học sinh nào được xác minh liên kết</div>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Vui lòng gửi mã học sinh và chờ Leader/Admin duyệt yêu cầu liên kết.</p>
    </div>
  {/if}

  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
    <nav class="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0" aria-label="Các mục sổ phụ huynh">
      <button 
        onclick={() => activeTab = 'homework'}
        class="whitespace-nowrap px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cx-500 {activeTab === 'homework' ? 'bg-cx-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        Bài Tập Về Nhà ({filteredSubmissions.length}/{assignments.length})
      </button>
      <button 
        onclick={() => activeTab = 'tuition'}
        class="whitespace-nowrap px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cx-500 {activeTab === 'tuition' ? 'bg-cx-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        Sổ Học Phí &amp; Đối Trừ Sao
      </button>
    </nav>

    <!-- Child Selector with activeChildId -->
    <div class="flex items-center gap-2 w-full sm:w-auto min-w-0">
      <label for="child-select" class="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Học sinh:</label>
      <select 
        id="child-select"
        bind:value={selectedStudentId}
        onchange={handleChildChange}
        class="flex-1 sm:flex-none text-xs font-medium px-3 py-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cx-500 truncate"
        disabled={linkedStudents.length === 0}
      >
        {#if linkedStudents.length === 0}
          <option value="">Chưa có học sinh đã xác minh</option>
        {/if}
        {#each linkedStudents as stu}
          <option value={stu.id}>{stu.name}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- STATE 1: LOADING SKELETON -->
  {#if linkedStudents.length === 0}
    <!-- Link state is shown above; no child data may be requested or displayed. -->
  {:else if loading}
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
          {@const sub = filteredSubmissions.find(s => s.assignment_id === assignment.id)}
          {@const isGraded = sub?.status === 'graded'}
          {@const isSubmitted = !!sub}
          {@const skillLabel = assignment.skill_type === 'writing' ? 'Viết Luận' : assignment.skill_type === 'reading' ? 'Đọc Hiểu' : 'Phát Âm & Nói'}

          <article class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4 min-w-0">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-0.5 rounded text-[11px] font-medium bg-cx-50 dark:bg-cx-950/60 text-cx-700 dark:text-cx-300 border border-cx-200 dark:border-cx-800 shrink-0">
                    {skillLabel}
                  </span>
                  <h2 class="text-sm sm:text-base font-semibold text-slate-900 dark:text-white break-words">{assignment.title}</h2>
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
                  <span>Giáo viên: <strong>{assignment.teacher_name}</strong></span>
                  <span>•</span>
                  <span>Hạn nộp: <span class="text-rose-600 dark:text-rose-400 font-medium tabular-nums">{assignment.deadline_time} • {assignment.deadline_date}</span></span>
                </div>
              </div>

              <!-- Status Badge (Restrained 4px rounded badge, non-gradient) -->
              <div class="shrink-0">
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
            <div class="bg-slate-50 dark:bg-slate-800/40 rounded-md p-3.5 sm:p-4 text-xs space-y-3 min-w-0">
              <div>
                <span class="font-semibold text-slate-700 dark:text-slate-300">Yêu cầu buổi học:</span>
                <p class="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed break-words">{assignment.description}</p>
              </div>

              {#if isSubmitted}
                <div class="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between text-slate-500 gap-1">
                    <span class="font-semibold text-slate-700 dark:text-slate-300">Bài làm nộp:</span>
                    <span class="tabular-nums text-[11px] sm:text-xs">Thời gian: {new Date(sub.submitted_at).toLocaleString('vi-VN')} ({sub.is_on_time ? 'Đúng hạn' : 'Nộp muộn'})</span>
                  </div>

                  {#if sub.content_text}
                    <div class="p-3 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200 text-xs break-words whitespace-pre-wrap">
                      {sub.content_text}
                    </div>
                  {/if}

                  {#if sub.handwritten_image_url}
                    <div class="space-y-1 pt-1">
                      <div class="flex items-center justify-between">
                        <span class="font-semibold text-slate-700 dark:text-slate-300">Ảnh bài viết tay trên giấy:</span>
                        <a href={sub.handwritten_image_url} target="_blank" rel="noopener noreferrer" class="text-cx-600 dark:text-cx-400 font-semibold hover:underline">Xem ảnh gốc</a>
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
                  <div class="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between flex-wrap gap-1">
                    <span>Nhận xét sư phạm của {assignment.teacher_name}:</span>
                    <span class="text-amber-700 dark:text-amber-400 font-medium tabular-nums">Thưởng: +{sub.stars_awarded} sao</span>
                  </div>
                  <p class="text-emerald-700 dark:text-emerald-400 italic break-words">"{sub.teacher_feedback || 'Học sinh hoàn thành tốt bài tập.'}"</p>
                </div>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}

  <!-- TAB 2: TUITION & STAR DISCOUNT -->
  {:else if activeTab === 'tuition'}
    <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-6 shadow-sm min-w-0">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 class="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">Sổ Học Phí &amp; Đối Trừ Sao Thưởng</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Cơ chế quy đổi sao tích lũy từ BTVN đúng hạn và bài kiểm tra xuất sắc.</p>
        </div>
        <div class="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-md sm:text-right">
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
          <svg class="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
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
