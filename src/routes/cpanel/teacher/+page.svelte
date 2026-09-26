<svelte:head>
  <title>Sổ Giáo Viên • Bàn Làm Việc Sư Phạm • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getCurrentUser } from '$lib/unifiedStore';
  import { playAudioFeedback } from '$lib/speech';
  import TeacherLeaveModal from '$lib/components/TeacherLeaveModal.svelte';
  import TeacherAdvanceModal from '$lib/components/TeacherAdvanceModal.svelte';

  let currentUser = $state(null);
  let assignments = $state([]);
  let submissions = $state([]);
  let campuses = $state([]);
  let mySessions = $state([]);
  let myLeaves = $state([]);
  let myAdvances = $state([]);
  let otherTeachers = $state([]);
  let loading = $state(true);
  let errorMessage = $state('');
  let activeTab = $state('grading'); // 'grading' | 'assign' | 'sessions' | 'salary'

  // Sub-filter for grading
  let gradingFilter = $state('pending'); // 'pending' | 'graded' | 'all'

  // Modals state
  let showGradeModal = $state(false);
  let selectedSubmission = $state(null);
  let gradingScore = $state(9.0);
  let teacherFeedback = $state('');
  let isGrading = $state(false);
  let gradeToast = $state('');

  let showLeaveModal = $state(false);
  let selectedSessionForLeave = $state(null);
  let showAdvanceModal = $state(false);

  // Assign Homework Form State
  let assignForm = $state({
    session_id: 'sess_g7_thu',
    class_id: 'cls_g7',
    class_name: 'Tiếng Anh Lớp 7 - Chuyên Sâu',
    campus_id: 'loc_codung',
    skill_type: 'writing',
    title: '',
    description: '',
    obsidian_note_id: 'UNIT_10_ENERGY_SOURCES',
    obsidian_note_title: 'Unit 10: Energy Sources & Environmental Impact',
    deadline_date: '',
    deadline_time: '18:00',
    star_reward_on_time: 50
  });
  let isAssigning = $state(false);
  let assignToast = $state('');

  async function loadData() {
    loading = true;
    errorMessage = '';
    currentUser = getCurrentUser();

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const [hwRes, campRes, wfRes] = await Promise.all([
        fetch('/api/homework', { headers }),
        fetch('/api/campuses', { headers }),
        fetch('/api/teachers/workflows?type=all', { headers })
      ]);

      if (!hwRes.ok && hwRes.status === 401) {
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }

      const hwData = await hwRes.json();
      const campData = await campRes.json();
      const wfData = await wfRes.json();

      if (hwData.success) {
        assignments = hwData.assignments || [];
        submissions = hwData.submissions || [];
      }
      if (campData.success) {
        campuses = campData.campuses || [];
      }
      if (wfData.success) {
        mySessions = wfData.sessions || [];
        myLeaves = wfData.leaves || [];
        myAdvances = wfData.advances || [];
      }
    } catch (e) {
      console.error('Failed to load teacher data:', e);
      errorMessage = e.message || 'Lỗi kết nối máy chủ. Vui lòng thử lại sau.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();

    // Default deadline to +3 days
    const d = new Date();
    d.setDate(d.getDate() + 3);
    assignForm.deadline_date = d.toISOString().split('T')[0];
  });

  let pendingSubmissions = $derived(submissions.filter(s => s.status !== 'graded'));
  let gradedSubmissions = $derived(submissions.filter(s => s.status === 'graded'));

  let displayedSubmissions = $derived.by(() => {
    if (gradingFilter === 'pending') return pendingSubmissions;
    if (gradingFilter === 'graded') return gradedSubmissions;
    return submissions;
  });

  function openGradeModal(sub) {
    selectedSubmission = sub;
    gradingScore = sub.score !== null ? Number(sub.score) : 9.0;
    teacherFeedback = sub.teacher_feedback || 'Em làm bài rất tốt, tiếp tục phát huy con nhé!';
    gradeToast = '';
    showGradeModal = true;
  }

  async function submitGrade() {
    if (!selectedSubmission) return;
    isGrading = true;
    gradeToast = '';

    try {
      const token = localStorage.getItem('tienganh_token') || '';
      const res = await fetch('/api/homework', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'grade',
          submission_id: selectedSubmission.id,
          score: gradingScore,
          teacher_feedback: teacherFeedback
        })
      });
      const data = await res.json();
      if (data.success) {
        gradeToast = data.message || 'Đã lưu điểm thành công';
        playAudioFeedback(true);
        setTimeout(() => {
          showGradeModal = false;
          loadData();
        }, 1000);
      } else {
        gradeToast = data.error || 'Chấm bài thất bại';
      }
    } catch (e) {
      gradeToast = 'Lỗi kết nối: ' + e.message;
    } finally {
      isGrading = false;
    }
  }

  async function handleAssignHomework(e) {
    e.preventDefault();
    if (!assignForm.title.trim()) {
      alert('Vui lòng nhập tiêu đề bài tập!');
      return;
    }
    isAssigning = true;
    assignToast = '';

    try {
      const token = localStorage.getItem('tienganh_token') || '';
      const res = await fetch('/api/homework', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'assign',
          ...assignForm
        })
      });
      const data = await res.json();
      if (data.success) {
        assignToast = 'Đã giao bài tập về nhà thành công và thông báo phụ huynh!';
        playAudioFeedback(true);
        assignForm.title = '';
        assignForm.description = '';
        setTimeout(() => {
          activeTab = 'grading';
          loadData();
        }, 1200);
      } else {
        assignToast = data.error || 'Giao bài thất bại';
      }
    } catch (e) {
      assignToast = 'Lỗi kết nối server: ' + e.message;
    } finally {
      isAssigning = false;
    }
  }

  function handleOpenLeaveForSession(sess) {
    selectedSessionForLeave = sess;
    showLeaveModal = true;
  }
</script>

<div class="space-y-6">
  <!-- Teacher Banner (Academic Ledger Style: Firm Navy, 8px radius, Restrained Borders) -->
  <header class="bg-slate-900 border border-slate-800 rounded-lg p-6 text-slate-100 shadow-sm relative">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider">
          <span>Sổ Giáo Viên</span>
          <span>•</span>
          <span>Không Gian Sư Phạm &amp; Nghiệp Vụ</span>
        </div>
        <h1 class="text-2xl font-semibold text-white">
          Bàn Làm Việc Giảng Dạy — {currentUser?.name || currentUser?.username || 'Giáo Viên'}
        </h1>
        <p class="text-slate-300 text-sm max-w-2xl leading-relaxed">
          Quản lý ca dạy thực tế, chấm bài tập về nhà (viết tay &amp; thu âm), gửi đề nghị dạy thay theo ca và theo dõi tạm ứng lương.
        </p>
      </div>

      <!-- Quick Actions & Metrics -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="bg-slate-800/80 border border-slate-700/60 rounded-md p-3 text-center min-w-[110px]">
          <div class="text-xl font-semibold text-amber-400 tabular-nums">{pendingSubmissions.length}</div>
          <div class="text-xs text-slate-400 mt-0.5">Bài Chờ Chấm</div>
        </div>
        <div class="bg-slate-800/80 border border-slate-700/60 rounded-md p-3 text-center min-w-[110px]">
          <div class="text-xl font-semibold text-sky-400 tabular-nums">{assignments.length}</div>
          <div class="text-xs text-slate-400 mt-0.5">BTVN Đã Giao</div>
        </div>
        <button 
          onclick={() => showAdvanceModal = true}
          class="px-3.5 py-2.5 rounded-md text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          Ứng Lương
        </button>
      </div>
    </div>
  </header>

  <!-- Main Navigation Tabs -->
  <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
    <button 
      onclick={() => activeTab = 'grading'}
      class="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 {activeTab === 'grading' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      <span>Chấm Điểm BTVN</span>
      {#if pendingSubmissions.length > 0}
        <span class="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[11px] font-bold tabular-nums">
          {pendingSubmissions.length}
        </span>
      {/if}
    </button>
    <button 
      onclick={() => activeTab = 'assign'}
      class="px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 {activeTab === 'assign' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      Giao BTVN Mới (Theo Ca Học)
    </button>
    <button 
      onclick={() => activeTab = 'sessions'}
      class="px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 {activeTab === 'sessions' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      Lịch Ca Dạy &amp; Dạy Thay ({mySessions.length})
    </button>
    <button 
      onclick={() => activeTab = 'salary'}
      class="px-4 py-2 rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 {activeTab === 'salary' ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      Sổ Lương &amp; Đơn Ứng Lương ({myAdvances.length})
    </button>
  </div>

  <!-- STATE 1: LOADING SKELETON -->
  {#if loading}
    <div class="academic-loading-skeleton space-y-4" aria-busy="true" aria-label="Đang tải dữ liệu nghiệp vụ giáo viên">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
        <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4 animate-pulse"></div>
        <div class="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-1/2 animate-pulse"></div>
        <div class="h-20 bg-slate-50 dark:bg-slate-800/40 rounded animate-pulse"></div>
      </div>
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
        <div class="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3 animate-pulse"></div>
        <div class="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-2/3 animate-pulse"></div>
        <div class="h-20 bg-slate-50 dark:bg-slate-800/40 rounded animate-pulse"></div>
      </div>
    </div>

  <!-- STATE 2: ERROR STATE WITH RETRY -->
  {:else if errorMessage}
    <div class="academic-error-state p-6 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-center space-y-3" role="alert">
      <div class="text-sm font-semibold text-rose-800 dark:text-rose-300">
        Không thể tải dữ liệu giáo viên
      </div>
      <p class="text-xs text-rose-700 dark:text-rose-400 max-w-md mx-auto">
        {errorMessage}
      </p>
      <div>
        <button 
          onclick={loadData}
          class="btn-retry px-4 py-2 rounded-md text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          Thử lại
        </button>
      </div>
    </div>

  <!-- TAB 1: GRADING HOMEWORK -->
  {:else if activeTab === 'grading'}
    <div class="space-y-4">
      <!-- Sub-filter -->
      <div class="flex items-center gap-2">
        <button 
          onclick={() => gradingFilter = 'pending'}
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors {gradingFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}"
        >
          Chờ Chấm ({pendingSubmissions.length})
        </button>
        <button 
          onclick={() => gradingFilter = 'graded'}
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors {gradingFilter === 'graded' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}"
        >
          Đã Chấm ({gradedSubmissions.length})
        </button>
        <button 
          onclick={() => gradingFilter = 'all'}
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors {gradingFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}"
        >
          Tất Cả ({submissions.length})
        </button>
      </div>

      {#if displayedSubmissions.length === 0}
        <div class="academic-empty-state text-center py-16 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
          <div class="text-sm font-semibold text-slate-700 dark:text-slate-300">Không có bài nộp nào trong mục này</div>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {gradingFilter === 'pending' ? 'Hiện không có bài tập nào đang chờ chấm điểm.' : 'Chưa có dữ liệu bài nộp.'}
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each displayedSubmissions as sub}
            {@const assignment = assignments.find(a => a.id === sub.assignment_id)}
            {@const isGraded = sub.status === 'graded'}

            <article class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3 flex flex-col justify-between">
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-md bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 flex items-center justify-center font-semibold text-xs border border-sky-200 dark:border-sky-800">
                      {sub.student_name ? sub.student_name[0] : 'H'}
                    </div>
                    <div>
                      <div class="text-sm font-semibold text-slate-900 dark:text-white">{sub.student_name}</div>
                      <div class="text-xs text-slate-500 dark:text-slate-400">{assignment?.title || 'Bài tập Tiếng Anh'}</div>
                    </div>
                  </div>

                  <span class="text-xs font-semibold px-2.5 py-1 rounded-md {isGraded ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'}">
                    {isGraded ? `Điểm: ${sub.score}/10` : 'Chờ Chấm'}
                  </span>
                </div>

                <!-- Submission Content Preview -->
                <div class="bg-slate-50 dark:bg-slate-800/40 rounded-md p-3 text-xs space-y-2 border border-slate-100 dark:border-slate-800">
                  <div class="text-slate-500 flex items-center justify-between">
                    <span>Kỹ năng: <strong class="uppercase text-slate-700 dark:text-slate-300">{sub.submission_type}</strong></span>
                    <span class="tabular-nums">Nộp: {new Date(sub.submitted_at).toLocaleTimeString('vi-VN')} ({sub.is_on_time ? 'Đúng hạn' : 'Nộp muộn'})</span>
                  </div>

                  {#if sub.content_text}
                    <div class="bg-white dark:bg-slate-950 p-2.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] line-clamp-3">
                      "{sub.content_text}"
                    </div>
                  {/if}

                  {#if sub.audio_url}
                    <div class="space-y-1 pt-1">
                      <span class="font-medium text-sky-700 dark:text-sky-300">File ghi âm học sinh:</span>
                      <audio controls src={sub.audio_url} class="w-full mt-1"></audio>
                    </div>
                  {/if}

                  {#if isGraded && sub.teacher_feedback}
                    <div class="pt-2 border-t border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-300 italic">
                      "Nhận xét: {sub.teacher_feedback}"
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Action button -->
              <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span class="text-[11px] text-slate-400">
                  {sub.is_on_time ? 'Đủ điều kiện thưởng sao' : 'Nộp muộn (không cộng sao)'}
                </span>
                <button 
                  onclick={() => openGradeModal(sub)}
                  class="px-4 py-2 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                >
                  {isGraded ? 'Sửa Điểm & Nhận Xét' : 'Chấm Bài Ngay'}
                </button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </div>

  <!-- TAB 2: ASSIGN HOMEWORK -->
  {:else if activeTab === 'assign'}
    <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm max-w-3xl mx-auto space-y-6">
      <div class="border-b border-slate-200 dark:border-slate-800 pb-3">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white">Giao Bài Tập Về Nhà Sau Ca Học</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Liên kết trực tiếp với ca học đã diễn ra, giáo án Obsidian và tự động thông báo phụ huynh.</p>
      </div>

      <form onsubmit={handleAssignHomework} class="space-y-4">
        <!-- Campus & Skill -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="assign-campus-select" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Cơ sở giảng dạy:</label>
            <select 
              id="assign-campus-select"
              bind:value={assignForm.campus_id}
              class="w-full text-xs font-medium p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {#each campuses as c}
                <option value={c.id}>{c.name}</option>
              {/each}
            </select>
          </div>

          <div>
            <label for="assign-skill-select" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Kỹ năng giao bài:</label>
            <select 
              id="assign-skill-select"
              bind:value={assignForm.skill_type}
              class="w-full text-xs font-medium p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <option value="writing">Viết luận (Writing)</option>
              <option value="reading">Đọc hiểu (Reading)</option>
              <option value="speaking">Nói &amp; Phát âm (Speaking)</option>
            </select>
          </div>
        </div>

        <!-- Title -->
        <div>
          <label for="assign-title-input" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Tiêu đề bài tập:</label>
          <input 
            id="assign-title-input"
            type="text" 
            bind:value={assignForm.title}
            placeholder="VD: Luyện viết đoạn văn 100 từ về Bảo vệ môi trường..."
            class="w-full text-xs p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            required
          />
        </div>

        <!-- Description -->
        <div>
          <label for="assign-desc-textarea" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Yêu cầu chi tiết &amp; Từ khóa gợi ý:</label>
          <textarea 
            id="assign-desc-textarea"
            bind:value={assignForm.description}
            placeholder="Mô tả cụ thể yêu cầu học sinh làm gì, các từ vựng cần sử dụng..."
            rows="4"
            class="w-full text-xs p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          ></textarea>
        </div>

        <!-- Obsidian Note link -->
        <div>
          <label for="assign-obsidian-input" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Liên kết Note Giáo Án Obsidian:</label>
          <input 
            id="assign-obsidian-input"
            type="text" 
            bind:value={assignForm.obsidian_note_title}
            placeholder="VD: Unit 10: Energy Sources & Environmental Impact"
            class="w-full text-xs p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          />
        </div>

        <!-- Deadline -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="assign-deadline-date" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Hạn nộp (Ngày):</label>
            <input 
              id="assign-deadline-date"
              type="date" 
              bind:value={assignForm.deadline_date}
              class="w-full text-xs p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              required
            />
          </div>
          <div>
            <label for="assign-deadline-time" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Giờ khóa hạn:</label>
            <input 
              id="assign-deadline-time"
              type="time" 
              bind:value={assignForm.deadline_time}
              class="w-full text-xs p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              required
            />
          </div>
        </div>

        {#if assignToast}
          <div class="p-3 rounded-md text-xs font-semibold text-center {assignToast.includes('thành công') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
            {assignToast}
          </div>
        {/if}

        <div class="pt-3 flex justify-end">
          <button 
            type="submit"
            disabled={isAssigning}
            class="px-5 py-2.5 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            {isAssigning ? 'Đang phát hành...' : 'Phát Hành BTVN Cho Học Sinh'}
          </button>
        </div>
      </form>
    </div>

  <!-- TAB 3: CLASS SESSIONS & LEAVE REQUESTS -->
  {:else if activeTab === 'sessions'}
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white">Lịch Ca Giảng Dạy &amp; Nghiệp Vụ Xin Nghỉ</h2>
        <span class="text-xs text-slate-500 dark:text-slate-400">Đơn nghỉ phép gắn chặt 1 ca sở hữu duy nhất</span>
      </div>

      {#if mySessions.length === 0}
        <div class="academic-empty-state text-center py-16 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
          <div class="text-sm font-semibold text-slate-700 dark:text-slate-300">Chưa có lịch ca dạy được phân công</div>
          <p class="text-xs text-slate-500 dark:text-slate-400">Ban Quản Lý chưa xếp lịch giảng dạy cho tài khoản giáo viên này.</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each mySessions as sess}
            <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Mã: {sess.id}
                  </span>
                  <h3 class="text-sm font-semibold text-slate-900 dark:text-white">{sess.class_name}</h3>
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <span>Ngày: <strong class="text-slate-700 dark:text-slate-300">{sess.session_date}</strong></span>
                  <span>•</span>
                  <span>Giờ: <span class="tabular-nums">{sess.start_time} - {sess.end_time}</span></span>
                  {#if sess.substitute_teacher_id}
                    <span>•</span>
                    <span class="text-amber-600 dark:text-amber-400 font-medium">Dạy thay: {sess.substitute_teacher_name}</span>
                  {/if}
                </div>
              </div>

              <div>
                <button 
                  onclick={() => handleOpenLeaveForSession(sess)}
                  class="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 transition-colors"
                >
                  Xin Nghỉ Ca Này
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- TAB 4: SALARY ADVANCE & HISTORY -->
  {:else if activeTab === 'salary'}
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-base font-semibold text-slate-900 dark:text-white">Lịch Sử Tạm Ứng Lương &amp; Trạng Thái</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Tiến trình: Pending &rarr; Approved &rarr; Disbursed &rarr; Deducted</p>
        </div>
        <button 
          onclick={() => showAdvanceModal = true}
          class="px-4 py-2 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors"
        >
          + Tạo Yêu Cầu Ứng Lương
        </button>
      </div>

      {#if myAdvances.length === 0}
        <div class="academic-empty-state text-center py-16 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
          <div class="text-sm font-semibold text-slate-700 dark:text-slate-300">Chưa có yêu cầu ứng lương nào</div>
          <p class="text-xs text-slate-500 dark:text-slate-400">Bạn chưa phát sinh đơn xin tạm ứng lương trong các kỳ gần đây.</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each myAdvances as adv}
            {@const statusColor = adv.status === 'deducted' ? 'bg-slate-100 text-slate-700 border-slate-200' : adv.status === 'disbursed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : adv.status === 'approved' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-amber-50 text-amber-700 border-amber-200'}
            {@const statusLabel = adv.status === 'deducted' ? 'Đã Quyết Toán' : adv.status === 'disbursed' ? 'Đã Thực Chi' : adv.status === 'approved' ? 'Đã Duyệt Hạn Mức' : 'Chờ Leader Duyệt'}

            <div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                    {Number(adv.amount_vnd).toLocaleString('vi-VN')} đ
                  </span>
                  <span class="text-[11px] px-2 py-0.5 rounded font-semibold border {statusColor}">
                    {statusLabel}
                  </span>
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  Lý do: <em>"{adv.reason}"</em> • Kỳ lương: <strong class="tabular-nums">{adv.billing_cycle}</strong>
                  {#if adv.disbursement_ref}
                    • Mã lệnh chi: <span class="font-mono text-slate-700 dark:text-slate-300">{adv.disbursement_ref}</span>
                  {/if}
                </div>
              </div>

              <div class="text-xs text-slate-400 tabular-nums">
                {new Date(adv.created_at || Date.now()).toLocaleDateString('vi-VN')}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- GRADING MODAL -->
{#if showGradeModal && selectedSubmission}
  <div class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-900 rounded-lg max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <span class="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wide">Chấm Bài Về Nhà</span>
          <h3 class="text-base font-semibold text-slate-900 dark:text-white">
            {selectedSubmission.student_name}
          </h3>
        </div>
        <button onclick={() => showGradeModal = false} class="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
      </div>

      <!-- Submission Artifacts Preview -->
      <div class="bg-slate-50 dark:bg-slate-800/40 rounded-md p-4 border border-slate-200 dark:border-slate-700 space-y-3 max-h-72 overflow-y-auto text-xs">
        {#if selectedSubmission.handwritten_image_url}
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-700 dark:text-slate-300">Ảnh bài viết tay trên giấy:</span>
              <a href={selectedSubmission.handwritten_image_url} target="_blank" rel="noopener noreferrer" class="text-sky-600 dark:text-sky-400 font-semibold hover:underline">Xem ảnh gốc</a>
            </div>
            <img 
              src={selectedSubmission.handwritten_image_url} 
              alt="Bài viết tay của học sinh"
              class="w-full rounded border border-slate-300 dark:border-slate-600 max-h-56 object-contain bg-white mx-auto shadow-sm"
            />
          </div>
        {/if}

        {#if selectedSubmission.content_text}
          <div>
            <div class="font-semibold text-slate-700 dark:text-slate-300 mb-1">Văn bản bài nộp:</div>
            <div class="p-2.5 bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-700 font-mono whitespace-pre-line text-slate-800 dark:text-slate-200">
              {selectedSubmission.content_text}
            </div>
          </div>
        {/if}

        {#if selectedSubmission.audio_url}
          <div>
            <div class="font-semibold text-slate-700 dark:text-slate-300 mb-1">Bản ghi âm giọng đọc:</div>
            <audio controls src={selectedSubmission.audio_url} class="w-full"></audio>
          </div>
        {/if}
      </div>

      <!-- Score Input -->
      <div>
        <div class="flex items-center justify-between text-xs mb-1">
          <label for="grade-score-input" class="font-semibold text-slate-700 dark:text-slate-300">Điểm số (thang 10):</label>
          <span class="font-semibold text-sky-600 text-sm tabular-nums">{gradingScore} / 10</span>
        </div>
        <input 
          id="grade-score-input"
          type="number" 
          step="0.5" 
          min="0" 
          max="10" 
          bind:value={gradingScore}
          class="w-full text-center text-xl font-semibold p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        />
        <div class="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1 text-center">
          {#if selectedSubmission.is_on_time}
            {#if gradingScore >= 10.0}
              Thưởng tối đa +100 sao (Điểm tuyệt đối &amp; đúng hạn)!
            {:else if gradingScore >= 8.5}
              Thưởng +50 sao (Điểm giỏi &amp; đúng hạn)!
            {:else}
              Không thưởng sao (Điểm dưới 8.5)
            {/if}
          {:else}
            Không thưởng sao (Nộp muộn hạn)
          {/if}
        </div>
      </div>

      <!-- Feedback Input -->
      <div>
        <label for="grade-feedback-textarea" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Lời nhận xét sư phạm:</label>
        <textarea 
          id="grade-feedback-textarea"
          bind:value={teacherFeedback}
          rows="3"
          placeholder="Nhận xét cụ thể bài làm của học sinh..."
          class="w-full text-xs p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        ></textarea>
      </div>

      {#if gradeToast}
        <div class="p-2.5 rounded-md text-xs font-semibold text-center {gradeToast.includes('thành công') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
          {gradeToast}
        </div>
      {/if}

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onclick={() => showGradeModal = false} class="px-4 py-2 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Hủy</button>
        <button 
          onclick={submitGrade}
          disabled={isGrading}
          class="px-5 py-2 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          {isGrading ? 'Đang lưu...' : 'Lưu Điểm & Báo Cáo'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- TEACHER LEAVE MODAL -->
<TeacherLeaveModal 
  bind:isOpen={showLeaveModal}
  session={selectedSessionForLeave}
  teachers={otherTeachers}
  onSubmitted={() => {
    loadData();
  }}
/>

<!-- TEACHER ADVANCE MODAL -->
<TeacherAdvanceModal
  bind:isOpen={showAdvanceModal}
  onSubmitted={() => {
    loadData();
  }}
/>
