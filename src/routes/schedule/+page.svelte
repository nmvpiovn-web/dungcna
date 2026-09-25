<script>
  import { onMount } from 'svelte';
  import { 
    getCurrentUser, 
    isTeacherOrAdmin, 
    isSuperAdmin,
    getAllClassSessions, 
    deleteClassSession, 
    getSessionsForUser,
    triggerScheduleNotification,
    getAllAttendanceRecords,
    getAllUsers,
    getAllTeacherProfiles
  } from '$lib/unifiedStore';
  import SessionRollCallModal from '$lib/components/SessionRollCallModal.svelte';
  import SessionEditModal from '$lib/components/SessionEditModal.svelte';
  import TeacherStaffModal from '$lib/components/TeacherStaffModal.svelte';

  let currentUser = $state(null);
  let sessions = $state([]);
  let attendanceRecords = $state([]);
  let allUsers = $state([]);
  let teacherProfiles = $state([]);

  // Modals state
  let showRollCallModal = $state(false);
  let showEditModal = $state(false);
  let showStaffModal = $state(false);
  let selectedSession = $state(null);
  let selectedTeacherId = $state(null);

  // Filters
  let activeTabFilter = $state('all'); // 'all' | 'my_schedule' | 'primary' | 'secondary' | 'high_school'
  let dayFilter = $state('all'); // 'all' | 1 | 2 | 3 | 4 | 5 | 6 | 0
  let toastMsg = $state('');

  onMount(() => {
    loadData();
  });

  function loadData() {
    currentUser = getCurrentUser();
    allUsers = getAllUsers();
    sessions = getAllClassSessions();
    attendanceRecords = getAllAttendanceRecords();
    teacherProfiles = getAllTeacherProfiles();
  }

  function showToast(msg) {
    toastMsg = msg;
    setTimeout(() => toastMsg = '', 4000);
  }

  // Filtered Sessions
  let filteredSessions = $derived.by(() => {
    let list = sessions;

    if (activeTabFilter === 'my_schedule' && currentUser) {
      list = getSessionsForUser(currentUser);
    } else if (activeTabFilter === 'primary') {
      list = list.filter(s => ['Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5'].includes(s.grade_level));
    } else if (activeTabFilter === 'secondary') {
      list = list.filter(s => ['Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9'].includes(s.grade_level));
    } else if (activeTabFilter === 'high_school') {
      list = list.filter(s => ['Lớp 10', 'Lớp 11', 'Lớp 12'].includes(s.grade_level) || s.class_id.includes('IELTS'));
    }

    if (dayFilter !== 'all') {
      list = list.filter(s => Number(s.day_of_week) === Number(dayFilter));
    }

    // Sort by day of week then time
    return [...list].sort((a, b) => {
      const dayA = a.day_of_week === 0 ? 7 : a.day_of_week;
      const dayB = b.day_of_week === 0 ? 7 : b.day_of_week;
      if (dayA !== dayB) return dayA - dayB;
      return a.start_time.localeCompare(b.start_time);
    });
  });

  // Test schedule reminder notification
  async function handleSendReminderNotification(session) {
    showToast(`Đang gửi thông báo nhắc lịch học ca ${session.start_time} tới Zalo phụ huynh...`);
    const res = await triggerScheduleNotification(session.id);
    if (res.success) {
      showToast(`🚀 [Thông Báo Phụ Huynh Đã Gửi Lúc ${res.notifyTime}]: 10 phút nữa con bắt đầu ca học tại ${session.location}`);
    } else {
      showToast('Lỗi: ' + res.error);
    }
  }

  function handleOpenRollCall(session) {
    selectedSession = session;
    showRollCallModal = true;
  }

  function handleOpenEdit(session = null) {
    selectedSession = session;
    showEditModal = true;
  }

  function handleDelete(id, name) {
    if (confirm(`Bạn có chắc muốn xóa ca học "${name}" khỏi thời khóa biểu?`)) {
      deleteClassSession(id, currentUser);
      loadData();
      showToast('Đã xóa ca học khỏi thời khóa biểu');
    }
  }

  function openStaffManagement(teacherId = null) {
    selectedTeacherId = teacherId || (currentUser?.role === 'teacher' ? currentUser.id : null);
    showStaffModal = true;
  }

  // Count attendance status for today
  function getTodayAttendanceSummary(sessionId) {
    const today = new Date().toISOString().slice(0, 10);
    const records = attendanceRecords.filter(r => r.session_id === sessionId && r.session_date === today);
    if (records.length === 0) return null;
    const present = records.filter(r => r.status === 'present').length;
    return `${present}/${records.length} có mặt`;
  }
</script>

<div class="space-y-6">
  <!-- Toast Alert -->
  {#if toastMsg}
    <div class="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between shadow-lg">
      <div class="flex items-center gap-2">
        <span>✅</span>
        <span>{toastMsg}</span>
      </div>
      <button onclick={() => toastMsg = ''} class="text-emerald-500 hover:text-white">✕</button>
    </div>
  {/if}

  <!-- Header Banner -->
  <div class="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-800 p-6 md:p-8 shadow-2xl relative overflow-hidden">
    <div class="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            HỆ THỐNG THỜI KHÓA BIỂU &amp; ĐIỂM DANH 2026
          </span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            Thông Báo Phụ Huynh 10 Phút Trước Ca Học
          </span>
        </div>
        <h1 class="text-2xl md:text-3xl font-heading font-black text-white">
          Lịch Học, Thời Khóa Biểu &amp; Sổ Đầu Bài Tức Thời 📅
        </h1>
        <p class="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
          Quản lý toàn bộ ca học tại nhà Cô Dung và trực tuyến. Tự động gửi tin nhắn Zalo cho phụ huynh đưa đón trước 10 phút,
          giáo viên điểm danh trực tiếp và gán học sinh vào bài kiểm tra theo sĩ số có mặt thực tế.
        </p>
      </div>

      <!-- Quick Action Buttons -->
      <div class="flex flex-wrap items-center gap-2.5">
        {#if currentUser && isTeacherOrAdmin(currentUser)}
          <button
            type="button"
            onclick={() => openStaffManagement()}
            class="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
          >
            <span>👨‍🏫 Phân Quyền Leader &amp; Lương</span>
          </button>

          <button
            type="button"
            onclick={() => handleOpenEdit(null)}
            class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
          >
            <span>➕ Thêm Buổi Học Mới</span>
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Role Notification Callout (Example: 6h học -> 5h50 thông báo) -->
  <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xl font-bold flex-shrink-0">
        ⏰
      </div>
      <div>
        <div class="font-bold text-slate-900 dark:text-white">
          Cơ Chế Báo Lịch Đưa Đón Tự Động (API Schedule Webhook):
        </div>
        <div class="text-slate-600 dark:text-slate-300 mt-0.5">
          Ví dụ ca học <strong>18:00 tại nhà Cô Dung</strong> sẽ tự động bắn tin nhắn Zalo lúc <strong>17:50 (trước 10 phút)</strong> để bố mẹ chuẩn bị đưa đón các con đúng giờ!
        </div>
      </div>
    </div>
    <span class="px-3 py-1 rounded-xl bg-amber-500 text-white font-bold text-[11px] whitespace-nowrap shadow-sm">
      Đang Hoạt Động (10m Lead Time)
    </span>
  </div>

  <!-- Filter Ribbon -->
  <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <!-- Tabs by Audience / Grade -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold">
        <button
          onclick={() => activeTabFilter = 'all'}
          class="px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap {activeTabFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          🌟 Tất Cả Lớp ({sessions.length})
        </button>
        {#if currentUser}
          <button
            onclick={() => activeTabFilter = 'my_schedule'}
            class="px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap {activeTabFilter === 'my_schedule' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
          >
            👤 Lịch Học Của Tôi
          </button>
        {/if}
        <button
          onclick={() => activeTabFilter = 'primary'}
          class="px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap {activeTabFilter === 'primary' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          🎒 Tiểu Học (Lớp 1 - 5)
        </button>
        <button
          onclick={() => activeTabFilter = 'secondary'}
          class="px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap {activeTabFilter === 'secondary' ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          📚 THCS (Lớp 6 - 9)
        </button>
        <button
          onclick={() => activeTabFilter = 'high_school'}
          class="px-3.5 py-1.5 rounded-xl transition-all whitespace-nowrap {activeTabFilter === 'high_school' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-white'}"
        >
          🎓 THPT &amp; IELTS (Lớp 10 - 12)
        </button>
      </div>

      <!-- Day Filter Pills -->
      <div class="flex items-center gap-1 overflow-x-auto text-[11px] font-bold">
        <button
          onclick={() => dayFilter = 'all'}
          class="px-2.5 py-1 rounded-lg border {dayFilter === 'all' ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'}"
        >
          Cả tuần
        </button>
        <button
          onclick={() => dayFilter = 1}
          class="px-2 py-1 rounded-lg border {dayFilter === 1 ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'}"
        >
          T2
        </button>
        <button
          onclick={() => dayFilter = 2}
          class="px-2 py-1 rounded-lg border {dayFilter === 2 ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'}"
        >
          T3
        </button>
        <button
          onclick={() => dayFilter = 3}
          class="px-2 py-1 rounded-lg border {dayFilter === 3 ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'}"
        >
          T4
        </button>
        <button
          onclick={() => dayFilter = 4}
          class="px-2 py-1 rounded-lg border {dayFilter === 4 ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'}"
        >
          T5
        </button>
        <button
          onclick={() => dayFilter = 5}
          class="px-2 py-1 rounded-lg border {dayFilter === 5 ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'}"
        >
          T6
        </button>
        <button
          onclick={() => dayFilter = 6}
          class="px-2 py-1 rounded-lg border {dayFilter === 6 ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'}"
        >
          T7
        </button>
        <button
          onclick={() => dayFilter = 0}
          class="px-2 py-1 rounded-lg border {dayFilter === 0 ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'}"
        >
          CN
        </button>
      </div>
    </div>
  </div>

  <!-- Sessions Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each filteredSessions as s}
      {@const todayAtt = getTodayAttendanceSummary(s.id)}
      {@const [startH, startM] = s.start_time.split(':').map(Number)}
      {@const notifyMin = s.notify_minutes_before || 10}
      {@const notifyH = Math.floor((startH * 60 + startM - notifyMin) / 60)}
      {@const notifyM = (startH * 60 + startM - notifyMin) % 60}
      {@const notifyTimeStr = `${String(notifyH).padStart(2, '0')}:${String(notifyM).padStart(2, '0')}`}

      <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
        
        <!-- Header of Card -->
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {s.grade_level}
            </span>
            <div class="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>{s.day_name}</span>
              <span>•</span>
              <span class="text-indigo-600 dark:text-indigo-400">{s.start_time} - {s.end_time}</span>
            </div>
          </div>

          <h3 class="font-bold text-base text-slate-900 dark:text-white leading-snug">
            {s.class_name}
          </h3>

          <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
            📖 <strong>Chủ đề:</strong> {s.subject_topic}
          </p>

          <div class="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>📍</span>
            <span class="truncate">{s.location}</span>
          </div>

          <div class="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>👩‍🏫</span>
            <span><strong>{s.teacher_name}</strong> &amp; {s.assistant_teacher_name || 'Trợ giảng'}</span>
          </div>
        </div>

        <!-- Notification Banner & Students Roster -->
        <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <!-- Notification Pill -->
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <div class="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <span>⏰</span> <span>Nhắc phụ huynh đưa đón:</span>
              </div>
              <div class="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                {notifyTimeStr} ({notifyMin}p trước giờ học)
              </div>
            </div>

            <button
              type="button"
              onclick={() => handleSendReminderNotification(s)}
              class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] shadow-sm transition-all"
              title="Gửi tin nhắn thử nghiệm tới Zalo phụ huynh"
            >
              🔔 Test Bot
            </button>
          </div>

          <!-- Attendance indicator & Student Count -->
          <div class="flex items-center justify-between text-[11px] text-slate-500">
            <span class="flex items-center gap-1">
              <span>👥</span>
              <span>{s.student_ids?.length || 0} học sinh trong lớp</span>
            </span>

            {#if todayAtt}
              <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[10px]">
                ✓ Hôm nay: {todayAtt}
              </span>
            {:else}
              <span class="text-[10px] text-slate-400">
                Hôm nay: Chưa điểm danh
              </span>
            {/if}
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          {#if currentUser && isTeacherOrAdmin(currentUser)}
            <button
              type="button"
              onclick={() => handleOpenRollCall(s)}
              class="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1"
            >
              <span>📋 Điểm Danh</span>
            </button>

            <button
              type="button"
              onclick={() => handleOpenEdit(s)}
              class="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all"
              title="Điều chỉnh ca học & gán học sinh"
            >
              ✏️ Sửa
            </button>

            {#if isSuperAdmin(currentUser)}
              <button
                type="button"
                onclick={() => handleDelete(s.id, s.class_name)}
                class="py-2 px-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 font-bold text-xs transition-all"
                title="Xóa buổi học"
              >
                🗑️
              </button>
            {/if}
          {:else}
            <button
              type="button"
              onclick={() => handleSendReminderNotification(s)}
              class="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1"
            >
              <span>🔔 Đăng Ký Nhắc Lịch Học (Zalo)</span>
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<!-- Roll Call Modal -->
<SessionRollCallModal
  bind:isOpen={showRollCallModal}
  session={selectedSession}
  onSaved={loadData}
/>

<!-- Session Edit & Student Assignment Modal -->
<SessionEditModal
  bind:isOpen={showEditModal}
  session={selectedSession}
  onSaved={loadData}
/>

<!-- Teacher Staff & Leader Appraisal Modal -->
<TeacherStaffModal
  bind:isOpen={showStaffModal}
  teacherId={selectedTeacherId}
  onUpdated={loadData}
/>
