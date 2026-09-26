<svelte:head>
  <title>Ban Điều Hành Chuyên Môn • Cpanel Leader • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getCurrentUser } from '$lib/unifiedStore';
  import { currentLang, toggleLanguage } from '$lib/i18n';
  import { playAudioFeedback } from '$lib/speech';

  let currentUser = $state(null);
  let assignments = $state([]);
  let submissions = $state([]);
  let campuses = $state([]);
  let streams = $state([]);
  let leaves = $state([]);
  let advances = $state([]);
  let recruitment = $state([]);
  let loading = $state(true);
  let errorMessage = $state('');
  let activeTab = $state('overview'); // 'overview' | 'leaves' | 'advances' | 'recruitment'
  let selectedCampus = $state('all');
  let lang = $state('vi');

  // Action toast state
  let actionToast = $state('');
  let isProcessing = $state(false);

  // Interview scheduling modal state
  let showInterviewModal = $state(false);
  let selectedCandidate = $state(null);
  let interviewTime = $state('');
  let interviewerName = $state('Cô Dung');
  let interviewNotes = $state('');
  let candidateStatus = $state('interview_scheduled');
  let trialFeedback = $state('');

  currentLang.subscribe(val => {
    lang = val;
  });

  async function loadData() {
    loading = true;
    errorMessage = '';
    currentUser = getCurrentUser();

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const [hwRes, campRes, wfRes] = await Promise.all([
        fetch('/api/homework', { headers }),
        fetch('/api/campuses?streams=true', { headers }),
        fetch('/api/teachers/workflows?type=all', { headers })
      ]);

      const hwData = await hwRes.json();
      const campData = await campRes.json();
      const wfData = await wfRes.json();

      if (hwData.success) {
        assignments = hwData.assignments || [];
        submissions = hwData.submissions || [];
      }
      if (campData.success) {
        campuses = campData.campuses || [];
        streams = campData.streams || [];
      }
      if (wfData.success) {
        leaves = wfData.leaves || [];
        advances = wfData.advances || [];
        recruitment = wfData.recruitment || [];
      }
    } catch (e) {
      console.error('Failed to load leader data:', e);
      errorMessage = 'Lỗi kết nối máy chủ. Vui lòng tải lại trang.';
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

  let pendingLeaves = $derived(leaves.filter(l => l.admin_status === 'pending'));
  let pendingAdvances = $derived(advances.filter(a => a.status === 'pending' || a.status === 'approved'));

  function showMessage(msg, isSuccess = true) {
    actionToast = msg;
    if (isSuccess) playAudioFeedback(true);
    setTimeout(() => actionToast = '', 3500);
  }

  // ACTION: Leader approve/reject leave
  async function handleDecideLeave(leaveId, decision) {
    if (isProcessing) return;
    isProcessing = true;
    try {
      const token = localStorage.getItem('tienganh_token') || '';
      const res = await fetch('/api/teachers/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'approve_leave',
          leave_id: leaveId,
          decision: decision,
          admin_notes: decision === 'approved' ? 'Leader Cô Dung đã phê duyệt phân công ca học' : 'Từ chối đơn'
        })
      });
      const data = await res.json();
      if (data.success) {
        showMessage(data.message || 'Đã xử lý đơn nghỉ phép');
        loadData();
      } else {
        showMessage(data.error || 'Thao tác thất bại', false);
      }
    } catch (e) {
      showMessage('Lỗi kết nối: ' + e.message, false);
    } finally {
      isProcessing = false;
    }
  }

  // ACTION: Leader approve salary advance limit
  async function handleApproveAdvance(advanceId, decision) {
    if (isProcessing) return;
    isProcessing = true;
    try {
      const token = localStorage.getItem('tienganh_token') || '';
      const res = await fetch('/api/teachers/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'approve_salary_advance',
          advance_id: advanceId,
          decision: decision,
          admin_notes: 'Duyệt hạn mức tạm ứng từ Leader'
        })
      });
      const data = await res.json();
      if (data.success) {
        showMessage(data.message || 'Đã cập nhật duyệt hạn mức ứng lương');
        loadData();
      } else {
        showMessage(data.error || 'Duyệt ứng lương thất bại', false);
      }
    } catch (e) {
      showMessage('Lỗi: ' + e.message, false);
    } finally {
      isProcessing = false;
    }
  }

  // ACTION: Leader disburse salary advance (Thực chi kế toán)
  async function handleDisburseAdvance(advanceId) {
    if (isProcessing) return;
    isProcessing = true;
    try {
      const token = localStorage.getItem('tienganh_token') || '';
      const refCode = `UNC_${Date.now().toString().slice(-6)}`;
      const res = await fetch('/api/teachers/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'disburse_salary_advance',
          advance_id: advanceId,
          disbursement_ref: refCode,
          notes: 'Thực chi chuyển khoản ủy nhiệm chi'
        })
      });
      const data = await res.json();
      if (data.success) {
        showMessage(`Đã thực chi thành công mã lệnh ${refCode}`);
        loadData();
      } else {
        showMessage(data.error || 'Thực chi thất bại', false);
      }
    } catch (e) {
      showMessage('Lỗi: ' + e.message, false);
    } finally {
      isProcessing = false;
    }
  }

  // ACTION: Open Candidate Interview Modal
  function openInterviewModal(cand) {
    selectedCandidate = cand;
    interviewTime = cand.interview_time || '';
    interviewerName = cand.interviewer_name || currentUser?.name || 'Cô Dung';
    interviewNotes = cand.interview_notes || '';
    candidateStatus = cand.status || 'applied';
    trialFeedback = cand.trial_feedback || '';
    showInterviewModal = true;
  }

  // ACTION: Save Interview / Screening updates
  async function saveCandidateUpdates() {
    if (!selectedCandidate) return;
    isProcessing = true;
    try {
      const token = localStorage.getItem('tienganh_token') || '';
      const res = await fetch('/api/teachers/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'update_recruitment',
          id: selectedCandidate.id,
          status: candidateStatus,
          interview_time: interviewTime,
          interviewer_name: interviewerName,
          interview_notes: interviewNotes,
          trial_feedback: trialFeedback
        })
      });
      const data = await res.json();
      if (data.success) {
        showMessage('Đã cập nhật hồ sơ ứng viên thành công');
        showInterviewModal = false;
        loadData();
      } else {
        showMessage(data.error || 'Lỗi cập nhật ứng viên', false);
      }
    } catch (e) {
      showMessage('Lỗi: ' + e.message, false);
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Leader Banner (Academic Ledger Style: Firm Navy, 8px radius, Restrained Borders) -->
  <header class="bg-slate-900 border border-slate-800 rounded-lg p-6 text-slate-100 shadow-sm relative">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider">
          <span>Trung Tâm Điều Hành Chuyên Môn</span>
          <span>•</span>
          <span>Ban Giám Sát Sư Phạm</span>
        </div>
        <h1 class="text-2xl font-semibold text-white">Quản Trị Nghiệp Vụ Sư Phạm &amp; Nhân Sự</h1>
        <p class="text-slate-300 text-sm max-w-2xl leading-relaxed">
          Kiểm soát lộ trình giảng dạy theo Obsidian Second-Brain, tỷ lệ hoàn thành BTVN, ngân hàng Bài Test / Kiểm Tra, phê duyệt đơn xin nghỉ &amp; phân công dạy thay, duyệt hạn mức ứng lương và quy trình tuyển dụng giáo viên.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <a 
          href="/admincp" 
          class="px-4 py-2.5 rounded-md bg-white text-slate-900 font-semibold text-xs hover:bg-slate-100 transition-colors shadow-sm"
        >
          Mở AdminCP Tổng
        </a>
      </div>
    </div>
  </header>

  <!-- Notification Toast -->
  {#if actionToast}
    <div class="p-3 rounded-md text-xs font-semibold bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300">
      {actionToast}
    </div>
  {/if}

  <!-- Navigation Tabs -->
  <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
    <button 
      onclick={() => activeTab = 'overview'}
      class="px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 {activeTab === 'overview' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      Tổng Quan Sư Phạm &amp; Sự Kiện
    </button>
    <button 
      onclick={() => activeTab = 'leaves'}
      class="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 {activeTab === 'leaves' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      <span>Duyệt Nghỉ Phép &amp; Dạy Thay</span>
      {#if pendingLeaves.length > 0}
        <span class="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[11px] font-bold tabular-nums">
          {pendingLeaves.length}
        </span>
      {/if}
    </button>
    <button 
      onclick={() => activeTab = 'advances'}
      class="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 {activeTab === 'advances' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      <span>Duyệt &amp; Thực Chi Ứng Lương</span>
      {#if pendingAdvances.length > 0}
        <span class="px-1.5 py-0.2 rounded bg-amber-600 text-white text-[11px] font-bold tabular-nums">
          {pendingAdvances.length}
        </span>
      {/if}
    </button>
    <button 
      onclick={() => activeTab = 'recruitment'}
      class="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 {activeTab === 'recruitment' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      <span>Tuyển Dụng &amp; Phỏng Vấn</span>
      <span class="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-semibold tabular-nums">
        {recruitment.length}
      </span>
    </button>
  </div>

  <!-- STATE 1: LOADING SKELETON -->
  {#if loading}
    <div class="academic-loading-skeleton space-y-4" aria-busy="true">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
        <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4 animate-pulse"></div>
        <div class="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-1/2 animate-pulse"></div>
        <div class="h-20 bg-slate-50 dark:bg-slate-800/40 rounded animate-pulse"></div>
      </div>
    </div>

  <!-- STATE 2: ERROR STATE -->
  {:else if errorMessage}
    <div class="academic-error-state p-6 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-center space-y-3">
      <div class="text-sm font-semibold text-rose-800 dark:text-rose-300">Không thể tải dữ liệu điều hành</div>
      <p class="text-xs text-rose-700 dark:text-rose-400">{errorMessage}</p>
      <button onclick={loadData} class="btn-retry px-4 py-2 rounded-md text-xs font-semibold bg-rose-600 text-white">Thử lại</button>
    </div>

  <!-- TAB 1: OVERVIEW -->
  {:else if activeTab === 'overview'}
    <!-- Campus Selector Bar -->
    <div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-slate-600 dark:text-slate-400">Lọc cơ sở:</span>
        <select 
          bind:value={selectedCampus}
          class="text-xs font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <option value="all">Toàn bộ cơ sở (Nhà Cô Dung, Sunshine, Thầy Vũ)</option>
          {#each campuses as c}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      </div>

      <div class="text-xs text-slate-500 dark:text-slate-400">
        BTVN đang mở: <strong class="text-sky-600 tabular-nums">{totalAssignments}</strong>
      </div>
    </div>

    <!-- KPI Metrics Grid (Academic Ledger style) -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tổng Bài Tập Đã Giao</div>
        <div class="text-2xl font-semibold text-sky-600 dark:text-sky-400 mt-2 tabular-nums">{totalAssignments}</div>
        <div class="text-xs text-slate-500 mt-1">Gắn chặt ca học &amp; giáo án Obsidian</div>
      </div>

      <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bài Học Sinh Đã Nộp</div>
        <div class="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">{totalSubmissions}</div>
        <div class="text-xs text-slate-500 mt-1">Đã chấm điểm: <strong class="text-slate-800 dark:text-slate-200 tabular-nums">{totalGraded}</strong> bài</div>
      </div>

      <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kho Giáo Án Obsidian</div>
        <div class="text-2xl font-semibold text-indigo-600 dark:text-indigo-400 mt-2 tabular-nums">102 Notes</div>
        <div class="text-xs text-slate-500 mt-1">Đã đồng bộ D1 FTS5 &amp; Backlinks</div>
      </div>
    </div>

    <!-- Multi-location Event Stream Widget -->
    <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h2 class="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Dòng Hoạt Động Trực Tiếp Liên Cơ Sở</span>
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">Theo dõi luồng giao bài, nộp bài, điểm danh và dạy thay chéo giữa các điểm dạy.</p>
        </div>
      </div>

      {#if streams.length === 0}
        <div class="academic-empty-state text-center py-8 text-xs text-slate-500">
          Chưa có sự kiện mới nào được ghi nhận trong phiên hôm nay.
        </div>
      {:else}
        <div class="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {#each streams as stm}
            {@const campusObj = campuses.find(c => c.id === stm.campus_id)}
            <div class="p-3 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-start justify-between gap-3 text-xs">
              <div class="space-y-0.5">
                <div class="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>{stm.title}</span>
                  <span class="text-[11px] px-2 py-0.5 rounded font-medium bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    {campusObj?.short_code || stm.campus_id}
                  </span>
                </div>
                <p class="text-slate-600 dark:text-slate-400">{stm.detail}</p>
              </div>
              <span class="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                {new Date(stm.created_at).toLocaleTimeString('vi-VN')}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- TAB 2: LEAVE & SUBSTITUTE APPROVAL -->
  {:else if activeTab === 'leaves'}
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-base font-semibold text-slate-900 dark:text-white">Duyệt Đơn Xin Nghỉ &amp; Phân Công Ca Dạy Thay</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Quy trình: Giáo viên A xin nghỉ &rarr; Giáo viên B xác nhận nhận ca &rarr; Leader phê duyệt (atomic cập nhật ca học).
          </p>
        </div>
      </div>

      {#if leaves.length === 0}
        <div class="academic-empty-state text-center py-16 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
          <div class="text-sm font-semibold text-slate-700 dark:text-slate-300">Không có đơn xin nghỉ phép nào</div>
          <p class="text-xs text-slate-500 dark:text-slate-400">Tất cả giáo viên đang theo đúng lịch giảng dạy.</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each leaves as l}
            {@const isPending = l.admin_status === 'pending'}
            {@const subAccepted = l.substitute_status === 'accepted'}
            {@const statusColor = l.admin_status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : l.admin_status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}

            <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-slate-900 dark:text-white">
                    {l.teacher_name} xin nghỉ ca ngày <strong class="tabular-nums">{l.session_date}</strong>
                  </span>
                  <span class="text-[11px] px-2 py-0.5 rounded font-semibold border {statusColor}">
                    {l.admin_status === 'approved' ? 'Đã Phê Duyệt' : l.admin_status === 'rejected' ? 'Từ Chối' : 'Chờ Leader Duyệt'}
                  </span>
                </div>
                <div class="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                  <p>Lý do: <em>"{l.reason}"</em></p>
                  <p>
                    Giáo viên nhận dạy thay: <strong>{l.substitute_teacher_name || 'Chưa chỉ định'}</strong> 
                    ({l.substitute_status === 'accepted' ? 'Đã xác nhận nhận ca' : l.substitute_status === 'declined' ? 'Từ chối' : 'Chờ xác nhận'})
                  </p>
                </div>
              </div>

              {#if isPending}
                <div class="flex items-center gap-2">
                  <button 
                    onclick={() => handleDecideLeave(l.id, 'rejected')}
                    disabled={isProcessing}
                    class="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                  >
                    Từ Chối
                  </button>
                  <button 
                    onclick={() => handleDecideLeave(l.id, 'approved')}
                    disabled={isProcessing || (l.substitute_teacher_id && !subAccepted)}
                    title={l.substitute_teacher_id && !subAccepted ? 'Cần giáo viên dạy thay xác nhận trước khi duyệt' : 'Duyệt đơn và cập nhật phân công ca'}
                    class="px-4 py-1.5 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors"
                  >
                    Phê Duyệt Ca
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- TAB 3: SALARY ADVANCES APPROVAL & DISBURSEMENT -->
  {:else if activeTab === 'advances'}
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-base font-semibold text-slate-900 dark:text-white">Duyệt Hạn Mức &amp; Thực Chi Tạm Ứng Lương</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tiến trình: 1. Duyệt hạn mức (Leader) &rarr; 2. Thực chi kế toán ghi sổ (Disburse) &rarr; 3. Đối trừ quyết toán (Deduct).
          </p>
        </div>
      </div>

      {#if advances.length === 0}
        <div class="academic-empty-state text-center py-16 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
          <div class="text-sm font-semibold text-slate-700 dark:text-slate-300">Không có yêu cầu tạm ứng lương nào</div>
          <p class="text-xs text-slate-500 dark:text-slate-400">Chưa phát sinh yêu cầu ứng lương trong hệ thống.</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each advances as adv}
            {@const isPending = adv.status === 'pending'}
            {@const isApproved = adv.status === 'approved'}
            {@const statusColor = adv.status === 'deducted' ? 'bg-slate-100 text-slate-700 border-slate-200' : adv.status === 'disbursed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : adv.status === 'approved' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-amber-50 text-amber-700 border-amber-200'}
            {@const statusLabel = adv.status === 'deducted' ? 'Đã Quyết Toán' : adv.status === 'disbursed' ? 'Đã Thực Chi' : adv.status === 'approved' ? 'Đã Duyệt Hạn Mức' : 'Chờ Leader Duyệt'}

            <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-slate-900 dark:text-white">
                    {adv.teacher_name} xin ứng <strong class="tabular-nums">{Number(adv.amount_vnd).toLocaleString('vi-VN')} đ</strong>
                  </span>
                  <span class="text-[11px] px-2 py-0.5 rounded font-semibold border {statusColor}">
                    {statusLabel}
                  </span>
                </div>
                <div class="text-xs text-slate-600 dark:text-slate-400">
                  Lý do: <em>"{adv.reason}"</em> • Kỳ lương: <strong class="tabular-nums">{adv.billing_cycle}</strong>
                  {#if adv.disbursement_ref}
                    • Lệnh chi: <span class="font-mono text-slate-700 dark:text-slate-300">{adv.disbursement_ref}</span>
                  {/if}
                </div>
              </div>

              <div class="flex items-center gap-2">
                {#if isPending}
                  <button 
                    onclick={() => handleApproveAdvance(adv.id, 'reject')}
                    disabled={isProcessing}
                    class="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                  >
                    Từ Chối
                  </button>
                  <button 
                    onclick={() => handleApproveAdvance(adv.id, 'approve')}
                    disabled={isProcessing}
                    class="px-4 py-1.5 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors"
                  >
                    Duyệt Hạn Mức
                  </button>
                {:else if isApproved}
                  <button 
                    onclick={() => handleDisburseAdvance(adv.id)}
                    disabled={isProcessing}
                    class="px-4 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                  >
                    Thực Chi Kế Toán (UNC)
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- TAB 4: RECRUITMENT PIPELINE -->
  {:else if activeTab === 'recruitment'}
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-base font-semibold text-slate-900 dark:text-white">Quy Trình Tuyển Dụng Giáo Viên Cơ Hữu &amp; Thời Vụ</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ứng viên nộp hồ sơ trực tuyến, qua vòng sàng lọc hồ sơ, xếp lịch phỏng vấn và dạy thử trước khi cấp quyền giáo viên.
          </p>
        </div>
      </div>

      {#if recruitment.length === 0}
        <div class="academic-empty-state text-center py-16 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
          <div class="text-sm font-semibold text-slate-700 dark:text-slate-300">Chưa có hồ sơ ứng viên nào</div>
          <p class="text-xs text-slate-500 dark:text-slate-400">Hồ sơ ứng viên nộp qua cổng tuyển dụng sẽ xuất hiện tại đây.</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each recruitment as cand}
            {@const statusColor = cand.status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : cand.status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' : cand.status === 'interview_scheduled' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-amber-50 text-amber-700 border-amber-200'}
            {@const statusLabel = cand.status === 'accepted' ? 'Đã Tuyển Dụng' : cand.status === 'rejected' ? 'Không Phù Hợp' : cand.status === 'interview_scheduled' ? 'Đã Xếp Lịch Phỏng Vấn' : 'Mới Ứng Tuyển'}

            <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-slate-900 dark:text-white">{cand.candidate_name}</span>
                  <span class="text-[11px] px-2 py-0.5 rounded font-semibold border {statusColor}">
                    {statusLabel}
                  </span>
                  <span class="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {cand.role_type === 'contractor' ? 'Thời Vụ / Dạy Thay' : 'Giáo Viên Cơ Hữu'}
                  </span>
                </div>
                <div class="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                  <p>SĐT: <strong>{cand.phone}</strong> • Email: {cand.email || 'Không có'} • Kinh nghiệm: <strong class="tabular-nums">{cand.experience_years} năm</strong></p>
                  {#if cand.certificates}
                    <p>Chứng chỉ: <span class="font-medium text-slate-700 dark:text-slate-300">{cand.certificates}</span></p>
                  {/if}
                  {#if cand.interview_time}
                    <p class="text-sky-700 dark:text-sky-300 font-medium">Lịch phỏng vấn: <span class="tabular-nums">{cand.interview_time}</span> (Người PV: {cand.interviewer_name})</p>
                  {/if}
                  {#if cand.trial_feedback}
                    <p class="italic text-emerald-700 dark:text-emerald-400">Đánh giá dạy thử: "{cand.trial_feedback}"</p>
                  {/if}
                </div>
              </div>

              <div>
                <button 
                  onclick={() => openInterviewModal(cand)}
                  class="px-4 py-2 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors"
                >
                  Xử Lý Hồ Sơ / Phỏng Vấn
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- INTERVIEW / CANDIDATE PROCESSING MODAL -->
{#if showInterviewModal && selectedCandidate}
  <div class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-900 rounded-lg max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-4 text-xs">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <span class="font-semibold text-sky-600 uppercase tracking-wide">Quy Trình Tuyển Dụng</span>
          <h3 class="text-base font-semibold text-slate-900 dark:text-white">{selectedCandidate.candidate_name}</h3>
        </div>
        <button onclick={() => showInterviewModal = false} class="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
      </div>

      <div class="space-y-3">
        <!-- Status Select -->
        <div>
          <label for="cand-status" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Trạng thái hồ sơ:</label>
          <select 
            id="cand-status"
            bind:value={candidateStatus}
            class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="applied">Mới Ứng Tuyển (Sàng lọc hồ sơ)</option>
            <option value="interview_scheduled">Đã Xếp Lịch Phỏng Vấn</option>
            <option value="accepted">Chấp Thuận Tuyển Dụng</option>
            <option value="rejected">Không Phù Hợp / Từ Chối</option>
          </select>
        </div>

        <!-- Interview Time -->
        <div>
          <label for="cand-interview-time" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời gian phỏng vấn / Dạy thử:</label>
          <input 
            id="cand-interview-time"
            type="text" 
            bind:value={interviewTime}
            placeholder="VD: 14:30 Thứ 6, ngày 28/09/2026 tại Cơ sở Nhà Cô Dung"
            class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
          />
        </div>

        <!-- Interviewer -->
        <div>
          <label for="cand-interviewer" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Người phụ trách phỏng vấn:</label>
          <input 
            id="cand-interviewer"
            type="text" 
            bind:value={interviewerName}
            class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
          />
        </div>

        <!-- Trial Feedback -->
        <div>
          <label for="cand-feedback" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nhận xét buổi dạy thử (Trial feedback):</label>
          <textarea 
            id="cand-feedback"
            bind:value={trialFeedback}
            rows="2"
            placeholder="Nhận xét phát âm, phương pháp sư phạm, tương tác học sinh..."
            class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
          ></textarea>
        </div>

        <!-- Notes -->
        <div>
          <label for="cand-notes" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ghi chú tuyển dụng &amp; Link CV:</label>
          <textarea 
            id="cand-notes"
            bind:value={interviewNotes}
            rows="2"
            class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
          ></textarea>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onclick={() => showInterviewModal = false} class="px-4 py-2 rounded-md font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Đóng</button>
        <button 
          onclick={saveCandidateUpdates}
          disabled={isProcessing}
          class="px-5 py-2 rounded-md font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors"
        >
          {isProcessing ? 'Đang lưu...' : 'Lưu Kết Quả'}
        </button>
      </div>
    </div>
  </div>
{/if}
