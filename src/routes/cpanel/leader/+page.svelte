<svelte:head>
  <title>Ban Điều Hành Chuyên Môn • Cpanel Leader • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getCurrentUser, getAuthToken } from '$lib/unifiedStore';
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
  let parentLinks = $state([]);
  let loading = $state(true);
  let errorMessage = $state('');
  let activeTab = $state('overview');
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

      const [hwRes, campRes, wfRes, staffRes, parentLinksRes] = await Promise.all([
        fetch('/api/homework', { headers }),
        fetch('/api/campuses?streams=true', { headers }),
        fetch('/api/teachers/workflows?type=all', { headers }),
        fetch('/api/teachers/staff', { headers }),
        fetch('/api/parents/children?status=pending', { headers })
      ]);

      const hwData = await hwRes.json();
      const campData = await campRes.json();
      const wfData = await wfRes.json();
      const staffData = await staffRes.json();
      const parentLinksData = await parentLinksRes.json();

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
      if (staffData.success) {
        knownTeachers = (staffData.profiles || []).map(profile => ({
          id: profile.teacher_id,
          name: `${profile.teacher_name} (@${profile.username})`,
          profile
        }));
        if (knownTeachers.length > 0 && !knownTeachers.some(t => t.id === payrollTeacherId)) {
          payrollTeacherId = knownTeachers[0].id;
        }
        syncSelectedTeacherSalary();
      }
      if (parentLinksData.success) parentLinks = parentLinksData.links || [];
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

  // Leader Payroll Management state
  let payrollTeacherId = $state('');
  let payrollCycle = $state('2026-09');
  let leaderPayrollData = $state(null);
  let isFetchingPayroll = $state(false);
  let isLockingPayroll = $state(false);

  let knownTeachers = $state([]);
  let salaryBaseVnd = $state(0);
  let salaryRatePerSessionVnd = $state(0);
  let salaryType = $state('per_session');
  let isSavingSalary = $state(false);

  function syncSelectedTeacherSalary() {
    const selected = knownTeachers.find(t => t.id === payrollTeacherId)?.profile;
    if (!selected) return;
    salaryBaseVnd = Number(selected.base_salary_vnd) || 0;
    salaryRatePerSessionVnd = Number(selected.rate_per_session_vnd) || 0;
    salaryType = selected.salary_type || 'per_session';
  }

  async function saveSelectedTeacherSalary() {
    const selected = knownTeachers.find(t => t.id === payrollTeacherId)?.profile;
    if (!selected) {
      showMessage('Không tìm thấy hồ sơ giáo viên thật trên D1', false);
      return;
    }
    isSavingSalary = true;
    try {
      const token = getAuthToken();
      const res = await fetch('/api/teachers/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'update_role_salary',
          teacher_id: selected.teacher_id,
          teacher_name: selected.teacher_name,
          username: selected.username,
          role_type: selected.role_type,
          role_title: selected.role_title,
          salary_type: salaryType,
          base_salary_vnd: Number(salaryBaseVnd),
          rate_per_session_vnd: Number(salaryRatePerSessionVnd),
          leader_rating: selected.leader_rating
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.persisted) throw new Error(data.error || 'D1 không xác nhận lưu dữ liệu');
      knownTeachers = knownTeachers.map(t => t.id === payrollTeacherId ? { ...t, profile: data.profile } : t);
      showMessage('Đã cập nhật mức lương giáo viên trên D1');
      await fetchLeaderPayroll();
    } catch (error) {
      showMessage('Không cập nhật được lương: ' + error.message, false);
    } finally {
      isSavingSalary = false;
    }
  }

  async function fetchLeaderPayroll() {
    isFetchingPayroll = true;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/teachers/payroll?teacher_id=${encodeURIComponent(payrollTeacherId)}&billing_cycle=${encodeURIComponent(payrollCycle)}`, { headers });
      const data = await res.json();
      if (res.ok && data.success) {
        leaderPayrollData = data.payroll;
      } else {
        showMessage(data.error || 'Lỗi tải thông tin bảng lương', false);
      }
    } catch (e) {
      showMessage('Lỗi: ' + e.message, false);
    } finally {
      isFetchingPayroll = false;
    }
  }

  async function handlePayrollAction(action, extraPayload = {}) {
    if (!payrollTeacherId || !payrollCycle) return;

    if (action === 'adjust') {
      const reason = window.prompt('Nhập lý do mở lại bảng lương để điều chỉnh (Audit Trail):');
      if (!reason || !reason.trim()) {
        showMessage('Thao tác hủy: Cần nhập lý do điều chỉnh hợp lệ', false);
        return;
      }
      extraPayload.adjustment_reason = reason.trim();
    } else if (action === 'create_adjustment') {
      const amountStr = window.prompt('Nhập số tiền chênh lệch cần điều chỉnh (VNĐ, có thể âm hoặc dương):');
      if (!amountStr || isNaN(Number(amountStr)) || Number(amountStr) === 0) {
        showMessage('Thao tác hủy: Số tiền điều chỉnh phải là số hợp lệ khác 0', false);
        return;
      }
      const reason = window.prompt('Nhập lý do tạo chứng từ điều chỉnh chênh lệch:');
      if (!reason || !reason.trim()) {
        showMessage('Thao tác hủy: Cần nhập lý do điều chỉnh hợp lệ', false);
        return;
      }
      extraPayload.adjustment_amount = Number(amountStr);
      extraPayload.adjustment_reason = reason.trim();
    }

    isLockingPayroll = true;
    try {
      const token = getAuthToken() || (typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const res = await fetch('/api/teachers/payroll', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action,
          teacher_id: payrollTeacherId,
          billing_cycle: payrollCycle,
          ...extraPayload
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showMessage(data.message || `Thực hiện ${action} thành công!`);
        if (data.payroll) {
          leaderPayrollData = data.payroll;
        } else {
          await fetchLeaderPayroll();
        }
      } else {
        showMessage(data.error || `Lỗi: Không thể thực hiện thao tác ${action}`, false);
      }
    } catch (e) {
      showMessage('Lỗi kết nối: ' + e.message, false);
    } finally {
      isLockingPayroll = false;
    }
  }

  async function decideParentLink(linkId, verificationStatus) {
    if (isProcessing) return;
    isProcessing = true;
    try {
      const token = getAuthToken();
      const res = await fetch('/api/parents/children', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ link_id: linkId, verification_status: verificationStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Không thể cập nhật liên kết');
      parentLinks = parentLinks.filter(link => link.link_id !== linkId);
      showMessage(verificationStatus === 'verified' ? 'Đã xác minh liên kết phụ huynh–học sinh' : 'Đã từ chối yêu cầu liên kết');
    } catch (error) {
      showMessage(error.message, false);
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="space-y-6 max-w-full overflow-x-hidden">
  <!-- Leader Banner (Academic Ledger Style: Firm Navy, 8px radius, Restrained Borders) -->
  <header class="bg-slate-900 border border-slate-800 rounded-lg p-4 sm:p-6 text-slate-100 shadow-sm relative overflow-hidden min-w-0">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
      <div class="space-y-2 min-w-0">
        <div class="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider">
          <span>Trung Tâm Điều Hành Chuyên Môn</span>
          <span>•</span>
          <span>Ban Giám Sát Sư Phạm</span>
        </div>
        <h1 class="text-xl sm:text-2xl font-semibold text-white tracking-tight">Quản Trị Nghiệp Vụ Sư Phạm &amp; Nhân Sự</h1>
        <p class="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
          Kiểm soát lộ trình giảng dạy theo Obsidian Second-Brain, tỷ lệ hoàn thành BTVN, ngân hàng Bài Test / Kiểm Tra, phê duyệt đơn xin nghỉ &amp; phân công dạy thay, duyệt hạn mức ứng lương và quy trình tuyển dụng giáo viên.
        </p>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <a 
          href="/admincp" 
          class="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-md bg-white text-slate-900 font-semibold text-xs hover:bg-slate-100 transition-colors shadow-sm"
        >
          Mở AdminCP Tổng
        </a>
      </div>
    </div>
  </header>

  <!-- Notification Toast -->
  {#if actionToast}
    <div class="p-3 rounded-md text-xs font-semibold bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-300">
      {actionToast}
    </div>
  {/if}

  <!-- Navigation Tabs -->
  <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto max-w-full">
    <button 
      onclick={() => activeTab = 'overview'}
      class="whitespace-nowrap shrink-0 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 {activeTab === 'overview' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      Tổng Quan Sư Phạm &amp; Sự Kiện
    </button>
    <button 
      onclick={() => activeTab = 'leaves'}
      class="whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 {activeTab === 'leaves' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
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
      class="whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 {activeTab === 'advances' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
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
      class="whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 {activeTab === 'recruitment' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      <span>Tuyển Dụng &amp; Phỏng Vấn</span>
      <span class="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-semibold tabular-nums">
        {recruitment.length}
      </span>
    </button>
    <button 
      onclick={() => activeTab = 'parent-links'}
      class="whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 {activeTab === 'parent-links' ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-100'}"
    >
      <span>Liên Kết Phụ Huynh</span>
      {#if parentLinks.length > 0}
        <span class="px-1.5 py-0.5 rounded bg-amber-600 text-white text-[11px] font-bold tabular-nums">{parentLinks.length}</span>
      {/if}
    </button>
    <button 
      onclick={() => { activeTab = 'payroll'; if (!leaderPayrollData) fetchLeaderPayroll(); }}
      class="whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 {activeTab === 'payroll' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      <span>Khóa Sổ &amp; Bảng Lương</span>
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
          class="text-xs font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          <option value="all">Toàn bộ cơ sở (Nhà Cô Dung, Sunshine, Thầy Vũ)</option>
          {#each campuses as c}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      </div>

      <div class="text-xs text-slate-500 dark:text-slate-400">
        BTVN đang mở: <strong class="text-cyan-600 tabular-nums">{totalAssignments}</strong>
      </div>
    </div>

    <!-- KPI Metrics Grid (Academic Ledger style) -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tổng Bài Tập Đã Giao</div>
        <div class="text-2xl font-semibold text-cyan-600 dark:text-cyan-400 mt-2 tabular-nums">{totalAssignments}</div>
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
                  <span class="text-[11px] px-2 py-0.5 rounded font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
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
                    class="px-4 py-1.5 rounded-md text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 transition-colors"
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
            {@const statusColor = adv.status === 'deducted' ? 'bg-slate-100 text-slate-700 border-slate-200' : adv.status === 'disbursed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : adv.status === 'approved' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-amber-50 text-amber-700 border-amber-200'}
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
                    class="px-4 py-1.5 rounded-md text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors"
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

  {:else if activeTab === 'parent-links'}
    <section class="space-y-4" aria-labelledby="parent-links-heading">
      <div>
        <h2 id="parent-links-heading" class="text-base font-bold text-slate-900">Xác Minh Liên Kết Phụ Huynh – Học Sinh</h2>
        <p class="text-xs text-slate-600 mt-1">Chỉ sau khi được duyệt, phụ huynh mới xem được hồ sơ và tiến độ của học sinh.</p>
      </div>
      {#if parentLinks.length === 0}
        <div class="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <p class="font-semibold text-slate-800">Không có yêu cầu đang chờ duyệt</p>
          <p class="mt-1 text-xs text-slate-600">Các liên kết đã xác minh sẽ không còn xuất hiện trong danh sách này.</p>
        </div>
      {:else}
        <div class="grid gap-3">
          {#each parentLinks as link}
            <article class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div class="min-w-0">
                <div class="font-bold text-slate-900">{link.parent_name || link.parent_username || link.parent_user_id}</div>
                <div class="mt-1 text-sm text-slate-700">
                  Yêu cầu liên kết với <strong>{link.student_name || link.student_username || link.student_user_id}</strong>
                  {#if link.student_grade}<span class="text-slate-500"> • {link.student_grade}</span>{/if}
                </div>
                <div class="mt-1 text-xs text-slate-500">Mã yêu cầu: {link.link_id}</div>
              </div>
              <div class="flex gap-2 shrink-0">
                <button type="button" onclick={() => decideParentLink(link.link_id, 'rejected')} disabled={isProcessing} class="min-h-11 px-4 rounded-md border border-rose-300 bg-white text-rose-800 font-bold hover:bg-rose-50 disabled:opacity-50">Từ chối</button>
                <button type="button" onclick={() => decideParentLink(link.link_id, 'verified')} disabled={isProcessing} class="min-h-11 px-4 rounded-md bg-cyan-700 text-white font-bold hover:bg-cyan-800 disabled:opacity-50">Xác minh</button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

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
            {@const statusColor = cand.status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : cand.status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' : cand.status === 'interview_scheduled' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-amber-50 text-amber-700 border-amber-200'}
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
                    <p class="text-cyan-700 dark:text-cyan-300 font-medium">Lịch phỏng vấn: <span class="tabular-nums">{cand.interview_time}</span> (Người PV: {cand.interviewer_name})</p>
                  {/if}
                  {#if cand.trial_feedback}
                    <p class="italic text-emerald-700 dark:text-emerald-400">Đánh giá dạy thử: "{cand.trial_feedback}"</p>
                  {/if}
                </div>
              </div>

              <div>
                <button 
                  onclick={() => openInterviewModal(cand)}
                  class="px-4 py-2 rounded-md text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition-colors"
                >
                  Xử Lý Hồ Sơ / Phỏng Vấn
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- TAB 5: PAYROLL REVIEW & SETTLEMENT -->
  {:else if activeTab === 'payroll'}
    <div class="space-y-6">
      <!-- Filter & Selection Bar -->
      <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 class="text-base font-semibold text-slate-900 dark:text-white">Kiểm Duyệt &amp; Khóa Sổ Bảng Lương Giáo Viên</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Thẩm quyền Ban Quản Lý: Tính toán thù lao, đối soát tạm ứng thực chi, kết chuyển nợ âm và khóa sổ kỳ bảo vệ.
            </p>
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400 font-mono">
            ENGINE: D1 PAYROLL v2026.09
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <!-- Select Teacher -->
          <div>
            <label for="leader-payroll-teacher-select" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Giáo viên thụ hưởng:</label>
            <select
              id="leader-payroll-teacher-select"
              bind:value={payrollTeacherId}
              onchange={() => { syncSelectedTeacherSalary(); leaderPayrollData = null; }}
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-medium text-slate-800 dark:text-slate-200"
            >
              {#each knownTeachers as t}
                <option value={t.id}>{t.name}</option>
              {/each}
            </select>
          </div>

          <!-- Select Cycle -->
          <div>
            <label for="leader-payroll-cycle-select" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Kỳ tính lương (Billing Cycle):</label>
            <select
              id="leader-payroll-cycle-select"
              bind:value={payrollCycle}
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-medium text-slate-800 dark:text-slate-200"
            >
              <option value="2026-07">Kỳ 07/2026</option>
              <option value="2026-08">Kỳ 08/2026</option>
              <option value="2026-09">Kỳ 09/2026 (Hiện tại)</option>
              <option value="2026-10">Kỳ 10/2026</option>
              <option value="2026-11">Kỳ 11/2026</option>
              <option value="2026-12">Kỳ 12/2026</option>
            </select>
          </div>

          <!-- Trigger Fetch Button -->
          <div class="flex items-end">
            <button
              onclick={fetchLeaderPayroll}
              disabled={isFetchingPayroll}
              class="w-full py-2.5 px-4 rounded-md font-semibold bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 transition-colors shadow-sm"
            >
              {isFetchingPayroll ? 'Đang tính toán...' : 'Đối Soát &amp; Tính Bảng Lương'}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 rounded-lg bg-cyan-50 border border-cyan-200 text-xs">
          <div>
            <label for="leader-salary-base" class="block font-bold text-slate-800 mb-1">Lương cơ bản (VNĐ)</label>
            <input id="leader-salary-base" type="number" min="0" step="10000" bind:value={salaryBaseVnd} class="w-full p-2.5 rounded-md bg-white border border-slate-300 text-slate-950 font-semibold" />
          </div>
          <div>
            <label for="leader-salary-rate" class="block font-bold text-slate-800 mb-1">Đơn giá/ca (VNĐ)</label>
            <input id="leader-salary-rate" type="number" min="0" step="10000" bind:value={salaryRatePerSessionVnd} class="w-full p-2.5 rounded-md bg-white border border-slate-300 text-slate-950 font-semibold" />
          </div>
          <div>
            <label for="leader-salary-type" class="block font-bold text-slate-800 mb-1">Cách tính</label>
            <select id="leader-salary-type" bind:value={salaryType} class="w-full p-2.5 rounded-md bg-white border border-slate-300 text-slate-950 font-semibold">
              <option value="per_session">Theo ca dạy</option>
              <option value="monthly">Lương tháng</option>
              <option value="monthly_lead">Lương tháng Leader</option>
              <option value="monthly_with_allowance">Lương tháng + phụ cấp</option>
              <option value="hourly_temp">Theo giờ/thời vụ</option>
            </select>
          </div>
          <div class="flex items-end">
            <button type="button" onclick={saveSelectedTeacherSalary} disabled={isSavingSalary || !payrollTeacherId} class="w-full min-h-11 px-4 rounded-md bg-cyan-700 hover:bg-cyan-800 text-white font-bold disabled:opacity-50">
              {isSavingSalary ? 'Đang lưu D1...' : 'Lưu Mức Lương'}
            </button>
          </div>
        </div>
      </div>

      <!-- PAYROLL COMPUTATION RESULT -->
      {#if leaderPayrollData}
        <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-0">
          <!-- Card Header & Status Badge -->
          <div class="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-cyan-600 uppercase tracking-wider">Hồ Sơ Lương Học Vụ</span>
                <span class="text-xs text-slate-400">•</span>
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200">Kỳ: {leaderPayrollData.billing_cycle}</span>
                <span class="text-xs text-slate-400">•</span>
                <span class="text-xs font-mono text-slate-600 dark:text-slate-400">{leaderPayrollData.teacher_id}</span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Chế độ tính: <strong>{leaderPayrollData.rate_mode === 'per_session' ? 'Theo ca dạy' : (leaderPayrollData.rate_mode === 'hourly' ? 'Theo giờ' : leaderPayrollData.rate_mode)}</strong> • Đơn giá: <span class="tabular-nums font-semibold">{Number(leaderPayrollData.base_rate).toLocaleString('vi-VN')} đ</span>
              </p>
            </div>

            <div class="flex items-center gap-2">
              {#if leaderPayrollData.is_locked || leaderPayrollData.status === 'locked' || leaderPayrollData.status === 'paid'}
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                  ĐÃ KHÓA SỔ BẢO VỆ ({leaderPayrollData.status.toUpperCase()})
                </span>
              {:else if leaderPayrollData.status === 'approved'}
                <span class="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800">
                  ĐÃ PHÊ DUYỆT (CHỜ KHÓA SỔ)
                </span>
              {:else}
                <span class="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  DỰ THẢO HỌC VỤ (DRAFT)
                </span>
              {/if}
            </div>
          </div>

          <!-- Financial 4-Box Grid -->
          <div class="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <!-- Box 1 -->
            <div class="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3.5 border border-slate-200/80 dark:border-slate-800">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ca Học Hợp Lệ</div>
              <div class="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {leaderPayrollData.summary.total_sessions} <span class="text-xs font-normal text-slate-500">ca</span>
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                Thời lượng: <strong>{leaderPayrollData.summary.total_hours}</strong> giờ
              </div>
            </div>

            <!-- Box 2 -->
            <div class="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3.5 border border-slate-200/80 dark:border-slate-800">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Thu Nhập Gộp (Gross)</div>
              <div class="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {Number(leaderPayrollData.summary.gross_income).toLocaleString('vi-VN')} <span class="text-xs font-normal text-slate-500">đ</span>
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Chưa khấu trừ các khoản
              </div>
            </div>

            <!-- Box 3 -->
            <div class="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3.5 border border-slate-200/80 dark:border-slate-800">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Khấu Trừ Ứng &amp; Nợ Cũ</div>
              <div class="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                - {Number(leaderPayrollData.summary.disbursed_advances_deducted + leaderPayrollData.summary.prior_debt_deducted).toLocaleString('vi-VN')} <span class="text-xs font-normal text-slate-500">đ</span>
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                Ứng: {Number(leaderPayrollData.summary.disbursed_advances_deducted).toLocaleString('vi-VN')}đ | Nợ: {Number(leaderPayrollData.summary.prior_debt_deducted).toLocaleString('vi-VN')}đ
              </div>
            </div>

            <!-- Box 4 -->
            <div class="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3.5 border border-slate-200/80 dark:border-slate-800">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Thực Lĩnh (Net Pay)</div>
              <div class="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                {Number(leaderPayrollData.summary.net_pay).toLocaleString('vi-VN')} <span class="text-xs font-normal text-slate-500">đ</span>
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Chuyển khoản cuối kỳ
              </div>
            </div>
          </div>

          <!-- Carried-Over Debt Alert -->
          {#if leaderPayrollData.summary.carried_over_debt > 0}
            <div class="mx-5 mb-5 p-3.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <span>Tạm ứng đã chi vượt quá thu nhập ca dạy trong kỳ. Số dư nợ <strong>{Number(leaderPayrollData.summary.carried_over_debt).toLocaleString('vi-VN')} đ</strong> đã được ghi nhận vào D1 để tự động kết chuyển khấu trừ vào kỳ kế tiếp.</span>
              </div>
              <span class="font-bold tabular-nums">Carried-Over Debt</span>
            </div>
          {/if}

          <!-- Leader Action Toolbar -->
          <div class="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/10 flex flex-wrap items-center justify-between gap-4">
            <div class="text-xs text-slate-500 dark:text-slate-400">
              {#if leaderPayrollData.status === 'paid' || leaderPayrollData.status === 'closed'}
                <span class="text-emerald-700 dark:text-emerald-400 font-semibold">🔒 Kỳ lương đã chi trả hoàn tất. Quản lý có thể tạo chứng từ điều chỉnh chênh lệch liên kết bản gốc.</span>
              {:else if leaderPayrollData.is_locked || leaderPayrollData.status === 'locked'}
                <span class="text-rose-700 dark:text-rose-400 font-semibold">🔒 Kỳ lương đã khóa sổ. Quản lý có thể mở lại (Adjust) để điều chỉnh có lưu vết audit.</span>
              {:else if leaderPayrollData.status === 'approved'}
                <span class="text-cyan-700 dark:text-cyan-400 font-semibold">📋 Kỳ lương đã duyệt. Quản lý có thể khóa sổ, chi trả, hoặc mở lại để điều chỉnh.</span>
              {:else}
                <span>Bấm <strong>Phê Duyệt</strong> hoặc <strong>Khóa Sổ</strong> để chốt số liệu học vụ lên D1 Cloudflare.</span>
              {/if}
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              {#if leaderPayrollData.status === 'paid' || leaderPayrollData.status === 'closed'}
                <button
                  type="button"
                  id="leader-payroll-adjust-voucher-btn"
                  onclick={() => handlePayrollAction('create_adjustment')}
                  disabled={isLockingPayroll}
                  class="px-3.5 py-2 rounded-md text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  Tạo Chứng Từ Điều Chỉnh (Adjustment Voucher)
                </button>
              {:else if leaderPayrollData.status === 'locked'}
                <button
                  type="button"
                  id="leader-payroll-disburse-btn"
                  onclick={() => handlePayrollAction('disburse')}
                  disabled={isLockingPayroll}
                  class="px-3.5 py-2 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  Xác Nhận Đã Chi Trả (Paid)
                </button>
                <button
                  type="button"
                  id="leader-payroll-adjust-btn"
                  onclick={() => handlePayrollAction('adjust')}
                  disabled={isLockingPayroll}
                  class="px-3.5 py-2 rounded-md text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  Mở Lại Để Điều Chỉnh (Adjust)
                </button>
              {:else if leaderPayrollData.status === 'approved'}
                <button
                  type="button"
                  id="leader-payroll-lock-btn"
                  onclick={() => handlePayrollAction('lock')}
                  disabled={isLockingPayroll}
                  class="px-3.5 py-2 rounded-md text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  Khóa Sổ Kỳ Này (Lock)
                </button>
                <button
                  type="button"
                  id="leader-payroll-disburse-btn"
                  onclick={() => handlePayrollAction('disburse')}
                  disabled={isLockingPayroll}
                  class="px-3.5 py-2 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  Xác Nhận Đã Chi Trả (Paid)
                </button>
                <button
                  type="button"
                  id="leader-payroll-adjust-btn"
                  onclick={() => handlePayrollAction('adjust')}
                  disabled={isLockingPayroll}
                  class="px-3.5 py-2 rounded-md text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  Mở Lại Để Điều Chỉnh (Adjust)
                </button>
              {:else}
                <button
                  type="button"
                  id="leader-payroll-approve-btn"
                  onclick={() => handlePayrollAction('approve')}
                  disabled={isLockingPayroll}
                  class="px-3.5 py-2 rounded-md text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  Phê Duyệt Bảng Lương
                </button>
                <button
                  type="button"
                  id="leader-payroll-lock-btn"
                  onclick={() => handlePayrollAction('lock')}
                  disabled={isLockingPayroll}
                  class="px-3.5 py-2 rounded-md text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  Khóa Sổ Kỳ Này (Lock)
                </button>
              {/if}
            </div>
          </div>

          <!-- Sessions Detail Table -->
          <div class="p-5 border-t border-slate-200 dark:border-slate-800">
            <h3 class="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Danh Sách Ca Dạy Tính Lương ({leaderPayrollData.payable_sessions.length} ca)</h3>
            {#if leaderPayrollData.payable_sessions.length === 0}
              <div class="text-center py-6 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded border border-slate-200 dark:border-slate-800">
                Không có ca dạy nào hoàn thành trong kỳ này cho giáo viên {leaderPayrollData.teacher_id}.
              </div>
            {:else}
              <div class="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
                <table class="w-full text-xs text-left">
                  <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th class="py-2.5 px-3 font-semibold">Mã Ca</th>
                      <th class="py-2.5 px-3 font-semibold">Lớp Học</th>
                      <th class="py-2.5 px-3 font-semibold">Ngày Giảng Dạy</th>
                      <th class="py-2.5 px-3 font-semibold text-center">Thời Lượng</th>
                      <th class="py-2.5 px-3 font-semibold text-right">Thù Lao Dự Tính</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                    {#each leaderPayrollData.payable_sessions as s}
                      <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td class="py-2 px-3 font-mono text-[11px] text-slate-500">{s.session_id}</td>
                        <td class="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{s.class_name}</td>
                        <td class="py-2 px-3 text-slate-600 dark:text-slate-400">{s.session_date}</td>
                        <td class="py-2 px-3 text-center tabular-nums">{s.duration_hours} giờ</td>
                        <td class="py-2 px-3 text-right font-semibold text-slate-900 dark:text-white tabular-nums">{Number(s.session_pay_vnd).toLocaleString('vi-VN')} đ</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
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
          <span class="font-semibold text-cyan-600 uppercase tracking-wide">Quy Trình Tuyển Dụng</span>
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
          class="px-5 py-2 rounded-md font-semibold bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 transition-colors"
        >
          {isProcessing ? 'Đang lưu...' : 'Lưu Kết Quả'}
        </button>
      </div>
    </div>
  </div>
{/if}
