<svelte:head>
  <title>Bàn Làm Việc Giáo Viên • Cpanel GV • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
  import { onMount } from 'svelte';
  import { getCurrentUser } from '$lib/unifiedStore';
  import { playAudioFeedback } from '$lib/speech';

  let currentUser = $state(null);
  let assignments = $state([]);
  let submissions = $state([]);
  let campuses = $state([]);
  let loading = $state(true);
  let activeTab = $state('grading'); // 'grading' | 'assign' | 'sessions'

  // Filter
  let gradingFilter = $state('pending'); // 'pending' | 'graded' | 'all'

  // Grading Modal State
  let showGradeModal = $state(false);
  let selectedSubmission = $state(null);
  let gradingScore = $state(9.0);
  let teacherFeedback = $state('');
  let isGrading = $state(false);
  let gradeToast = $state('');

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
    currentUser = getCurrentUser();
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const [hwRes, campRes] = await Promise.all([
        fetch('/api/homework', { headers }),
        fetch('/api/campuses', { headers })
      ]);

      const hwData = await hwRes.json();
      const campData = await campRes.json();

      if (hwData.success) {
        assignments = hwData.assignments || [];
        submissions = hwData.submissions || [];
      }
      if (campData.success) {
        campuses = campData.campuses || [];
      }
    } catch (e) {
      console.error('Failed to load teacher data:', e);
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
        gradeToast = data.message;
        playAudioFeedback(true);
        setTimeout(() => {
          showGradeModal = false;
          loadData();
        }, 1200);
      } else {
        gradeToast = data.error || 'Chấm bài thất bại';
      }
    } catch (e) {
      gradeToast = 'Lỗi kết nối server: ' + e.message;
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
        assignToast = '🎉 Đã giao BTVN thành công & gửi thông báo tới phụ huynh!';
        playAudioFeedback(true);
        assignForm.title = '';
        assignForm.description = '';
        setTimeout(() => {
          activeTab = 'grading';
          loadData();
        }, 1500);
      } else {
        assignToast = data.error || 'Giao bài thất bại';
      }
    } catch (e) {
      assignToast = 'Lỗi kết nối server: ' + e.message;
    } finally {
      isAssigning = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Teacher Banner -->
  <div class="bg-gradient-to-r from-indigo-700 via-sky-700 to-teal-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
    <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-sky-200 text-xs font-bold uppercase tracking-wider mb-1">
          <span>👩‍🏫 Không Gian Sư Phạm Giáo Viên</span>
          <span>•</span>
          <span>{currentUser?.title || 'Giáo Viên Chuyên Sâu'}</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-black">Chào Cô, {currentUser?.name || currentUser?.username || 'Giáo Viên'}! 📚</h1>
        <p class="text-sky-100 text-sm mt-1 max-w-xl">
          Quản lý ca dạy, giao bài tập về nhà theo chuẩn giáo án Obsidian, nghe lại bản ghi âm nói của học sinh và phê duyệt sao thưởng.
        </p>
      </div>

      <!-- Quick Metrics -->
      <div class="flex items-center gap-3">
        <div class="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 text-center min-w-[120px]">
          <div class="text-2xl font-black text-amber-300">
            {pendingSubmissions.length}
          </div>
          <div class="text-[11px] text-sky-100 font-medium mt-0.5">Bài Chờ Chấm</div>
        </div>
        <div class="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 text-center min-w-[120px]">
          <div class="text-2xl font-black text-emerald-300">
            {assignments.length}
          </div>
          <div class="text-[11px] text-sky-100 font-medium mt-0.5">BTVN Đã Giao</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Main Tabs Switcher -->
  <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
    <button 
      onclick={() => activeTab = 'grading'}
      class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all {activeTab === 'grading' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      <span>✍️ Chấm Điểm BTVN</span>
      {#if pendingSubmissions.length > 0}
        <span class="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-black">
          {pendingSubmissions.length}
        </span>
      {/if}
    </button>
    <button 
      onclick={() => activeTab = 'assign'}
      class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all {activeTab === 'assign' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
    >
      <span>➕ Giao BTVN Mới (Theo Ca Học)</span>
    </button>
  </div>

  <!-- TAB 1: GRADING HOMEWORK -->
  {#if activeTab === 'grading'}
    <div class="space-y-4">
      <!-- Sub-filter -->
      <div class="flex items-center gap-2">
        <button 
          onclick={() => gradingFilter = 'pending'}
          class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all {gradingFilter === 'pending' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}"
        >
          ⏳ Chờ Chấm ({pendingSubmissions.length})
        </button>
        <button 
          onclick={() => gradingFilter = 'graded'}
          class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all {gradingFilter === 'graded' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}"
        >
          ✅ Đã Chấm ({gradedSubmissions.length})
        </button>
        <button 
          onclick={() => gradingFilter = 'all'}
          class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all {gradingFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}"
        >
          Tất Cả ({submissions.length})
        </button>
      </div>

      {#if loading}
        <div class="text-center py-12 text-slate-400">
          <div class="inline-block animate-spin w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full mb-3"></div>
          <p class="text-sm font-medium">Đang tải danh sách bài nộp...</p>
        </div>
      {:else if displayedSubmissions.length === 0}
        <div class="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <p class="text-sm font-bold text-slate-600 dark:text-slate-400">Không có bài nộp nào trong mục này.</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each displayedSubmissions as sub}
            {@const assignment = assignments.find(a => a.id === sub.assignment_id)}
            {@const isGraded = sub.status === 'graded'}

            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3 flex flex-col justify-between">
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center font-black text-xs">
                      {sub.student_name[0]}
                    </div>
                    <div>
                      <div class="text-sm font-black text-slate-900 dark:text-white">{sub.student_name}</div>
                      <div class="text-[11px] text-slate-400">{assignment?.title || 'Bài tập Tiếng Anh'}</div>
                    </div>
                  </div>

                  <span class="text-xs font-bold px-2.5 py-1 rounded-lg {isGraded ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'}">
                    {isGraded ? `⭐ ${sub.score}/10` : 'Chờ Chấm'}
                  </span>
                </div>

                <!-- Submission Content Preview -->
                <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-xs space-y-2">
                  <div class="text-slate-500 flex items-center justify-between">
                    <span>Kỹ năng: <strong>{sub.submission_type.toUpperCase()}</strong></span>
                    <span>Nộp: {new Date(sub.submitted_at).toLocaleTimeString('vi-VN')} ({sub.is_on_time ? 'Đúng hạn' : 'Nộp muộn'})</span>
                  </div>

                  {#if sub.content_text}
                    <div class="bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] line-clamp-3">
                      "{sub.content_text}"
                    </div>
                  {/if}

                  {#if sub.audio_url}
                    <div class="space-y-1 pt-1">
                      <span class="font-bold text-sky-600">🎙️ Bản thu âm của học sinh:</span>
                      <audio controls src={sub.audio_url} class="w-full mt-1"></audio>
                    </div>
                  {/if}

                  {#if isGraded && sub.teacher_feedback}
                    <div class="pt-2 border-t border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 italic">
                      "Nhận xét: {sub.teacher_feedback}"
                    </div>
                  {/if}
                </div>
              </div>

              <!-- Action button -->
              <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span class="text-[11px] text-slate-400">
                  {sub.is_on_time ? '✨ Đủ điều kiện thưởng sao' : '⚠️ Nộp muộn (không thưởng sao)'}
                </span>
                <button 
                  onclick={() => openGradeModal(sub)}
                  class="px-4 py-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-sm transition-all"
                >
                  {isGraded ? 'Sửa Điểm / Nhận Xét' : 'Chấm Bài Ngay →'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  <!-- TAB 2: ASSIGN HOMEWORK -->
  {:else if activeTab === 'assign'}
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm max-w-3xl mx-auto space-y-6">
      <div class="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h2 class="text-lg font-black text-slate-900 dark:text-white">➕ Giao Bài Tập Về Nhà Sau Ca Học</h2>
        <p class="text-xs text-slate-500 mt-1">Liên kết trực tiếp với ca học vừa diễn ra, giáo án Obsidian và tự động thông báo phụ huynh.</p>
      </div>

      <form onsubmit={handleAssignHomework} class="space-y-4">
        <!-- Campus & Class -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="assign-campus-select" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">📍 Cơ sở diễn ra buổi học:</label>
            <select 
              id="assign-campus-select"
              bind:value={assignForm.campus_id}
              class="w-full text-xs font-semibold p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none"
            >
              {#each campuses as c}
                <option value={c.id}>{c.name}</option>
              {/each}
            </select>
          </div>

          <div>
            <label for="assign-skill-select" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">🎯 Kỹ năng giao bài (1 trong 3):</label>
            <select 
              id="assign-skill-select"
              bind:value={assignForm.skill_type}
              class="w-full text-xs font-bold p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none"
            >
              <option value="writing">✍️ Viết luận (Writing)</option>
              <option value="reading">📖 Đọc hiểu (Reading)</option>
              <option value="speaking">🎙️ Nói & Phát âm (Speaking)</option>
            </select>
          </div>
        </div>

        <!-- Title -->
        <div>
          <label for="assign-title-input" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tiêu đề bài tập:</label>
          <input 
            id="assign-title-input"
            type="text" 
            bind:value={assignForm.title}
            placeholder="VD: Luyện viết đoạn văn 100 từ về Bảo vệ môi trường..."
            class="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500 font-bold"
            required
          />
        </div>

        <!-- Description -->
        <div>
          <label for="assign-desc-textarea" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Yêu cầu chi tiết & Từ khóa gợi ý:</label>
          <textarea 
            id="assign-desc-textarea"
            bind:value={assignForm.description}
            placeholder="Mô tả cụ thể yêu cầu học sinh làm gì, các từ vựng cần sử dụng..."
            rows="4"
            class="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
          ></textarea>
        </div>

        <!-- Obsidian Note link -->
        <div>
          <label for="assign-obsidian-input" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">🧠 Liên kết Note Giáo Án Obsidian:</label>
          <input 
            id="assign-obsidian-input"
            type="text" 
            bind:value={assignForm.obsidian_note_title}
            placeholder="VD: Unit 10: Energy Sources & Environmental Impact"
            class="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none"
          />
        </div>

        <!-- Deadline -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="assign-deadline-date" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">⏰ Hạn nộp (Ngày):</label>
            <input 
              id="assign-deadline-date"
              type="date" 
              bind:value={assignForm.deadline_date}
              class="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none"
              required
            />
          </div>
          <div>
            <label for="assign-deadline-time" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Giờ khóa hạn (trước ca học kế tiếp):</label>
            <input 
              id="assign-deadline-time"
              type="time" 
              bind:value={assignForm.deadline_time}
              class="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none"
              required
            />
          </div>
        </div>

        {#if assignToast}
          <div class="p-3 rounded-xl text-xs font-bold text-center {assignToast.includes('thành công') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">
            {assignToast}
          </div>
        {/if}

        <div class="pt-4 flex justify-end">
          <button 
            type="submit"
            disabled={isAssigning}
            class="px-6 py-2.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20 disabled:opacity-50"
          >
            {isAssigning ? 'Đang giao...' : 'Phát Hành BTVN & Thông Báo Phụ Huynh 🚀'}
          </button>
        </div>
      </form>
    </div>
  {/if}
</div>

<!-- GRADING MODAL -->
{#if showGradeModal && selectedSubmission}
  <div class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <span class="text-xs font-bold text-sky-500 uppercase tracking-wide">Chấm Bài Về Nhà</span>
          <h3 class="text-base font-black text-slate-900 dark:text-white">
            {selectedSubmission.student_name}
          </h3>
        </div>
        <button onclick={() => showGradeModal = false} class="text-slate-400 hover:text-slate-600 font-bold">✕</button>
      </div>

      <!-- Submission Artifacts Preview -->
      <div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-3 max-h-72 overflow-y-auto">
        {#if selectedSubmission.handwritten_image_url}
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span>📸</span>
                <span>Ảnh bài viết tay trên giấy của học sinh:</span>
              </span>
              <a 
                href={selectedSubmission.handwritten_image_url} 
                target="_blank" 
                class="text-[11px] text-sky-500 font-bold hover:underline"
              >
                🔍 Xem Ảnh Toàn Màn Hình
              </a>
            </div>
            <img 
              src={selectedSubmission.handwritten_image_url} 
              alt="Bài viết tay của học sinh"
              class="w-full rounded-xl border border-slate-300 dark:border-slate-600 max-h-56 object-contain bg-white mx-auto shadow-sm"
            />
          </div>
        {/if}

        {#if selectedSubmission.content_text}
          <div>
            <div class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Văn bản bài nộp:</div>
            <div class="p-2.5 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono whitespace-pre-line text-slate-800 dark:text-slate-200">
              {selectedSubmission.content_text}
            </div>
          </div>
        {/if}

        {#if selectedSubmission.audio_url}
          <div>
            <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">🎙️ Bản ghi âm phát âm của học sinh:</div>
            <audio controls src={selectedSubmission.audio_url} class="w-full"></audio>
          </div>
        {/if}
      </div>

      <!-- Score Input -->
      <div>
        <div class="flex items-center justify-between text-xs mb-1">
          <label for="grade-score-input" class="font-bold text-slate-700 dark:text-slate-300">Điểm số (thang 10):</label>
          <span class="font-black text-sky-500 text-sm">{gradingScore} / 10</span>
        </div>
        <input 
          id="grade-score-input"
          type="number" 
          step="0.5" 
          min="0" 
          max="10" 
          bind:value={gradingScore}
          class="w-full text-center text-xl font-black p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none"
        />
        <!-- Star preview -->
        <div class="text-[11px] text-amber-500 font-bold mt-1 text-center">
          {#if selectedSubmission.is_on_time}
            {#if gradingScore >= 10.0}
              🎉 Thưởng tối đa +100 sao (Điểm tuyệt đối & đúng hạn)!
            {:else if gradingScore >= 8.5}
              ⭐ Thưởng +50 sao (Điểm giỏi & đúng hạn)!
            {:else}
              Không thưởng sao (Điểm dưới 8.5)
            {/if}
          {:else}
            ⚠️ Không thưởng sao (Nộp muộn hạn)
          {/if}
        </div>
      </div>

      <!-- Feedback Input -->
      <div>
        <label for="grade-feedback-textarea" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Lời nhận xét của cô giáo:</label>
        <textarea 
          id="grade-feedback-textarea"
          bind:value={teacherFeedback}
          rows="4"
          placeholder="Nhận xét cụ thể bài làm của học sinh..."
          class="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:outline-none"
        ></textarea>
      </div>

      {#if gradeToast}
        <div class="p-2.5 rounded-xl text-xs font-bold text-center {gradeToast.includes('thành công') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">
          {gradeToast}
        </div>
      {/if}

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onclick={() => showGradeModal = false} class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600">Hủy</button>
        <button 
          onclick={submitGrade}
          disabled={isGrading}
          class="px-5 py-2.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20 disabled:opacity-50"
        >
          {isGrading ? 'Đang lưu...' : 'Lưu Điểm & Gửi Báo Cáo 🌟'}
        </button>
      </div>
    </div>
  </div>
{/if}
