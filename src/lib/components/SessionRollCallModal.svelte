<script>
  import { onMount } from 'svelte';
  import { 
    getAllUsers, 
    getCurrentUser, 
    getAttendanceForSession, 
    saveSessionAttendanceBatch 
  } from '$lib/unifiedStore';

  let { isOpen = $bindable(false), session = null, onSaved = () => {} } = $props();

  let currentUser = $state(null);
  let sessionDate = $state(new Date().toISOString().slice(0, 10));
  let studentAttendanceList = $state([]);
  let isSaving = $state(false);
  let successMsg = $state('');

  $effect(() => {
    if (isOpen && session) {
      currentUser = getCurrentUser();
      loadSessionStudents();
    }
  });

  function loadSessionStudents() {
    if (!session) return;
    const allUsers = getAllUsers();
    const existingRecords = getAttendanceForSession(session.id, sessionDate);

    // Get students in this session or of this class
    let enrolledStudents = [];
    if (session.student_ids && session.student_ids.length > 0) {
      enrolledStudents = allUsers.filter(u => session.student_ids.includes(u.id));
    } else {
      enrolledStudents = allUsers.filter(u => u.role === 'student');
    }

    studentAttendanceList = enrolledStudents.map(student => {
      const rec = existingRecords.find(r => r.student_id === student.id);
      return {
        student_id: student.id,
        student_name: student.name,
        avatar: student.avatar,
        class_id: session.class_id,
        status: rec?.status || 'present',
        notes: rec?.notes || '',
        in_class_attitude: rec?.in_class_attitude || 'Tập trung học tập tốt, phát biểu tích cực',
        instant_stars_rewarded: rec?.instant_stars_rewarded !== undefined ? rec.instant_stars_rewarded : 5
      };
    });
  }

  function handleSaveRollCall() {
    isSaving = true;
    try {
      saveSessionAttendanceBatch(session.id, sessionDate, studentAttendanceList, currentUser);
      successMsg = `Đã lưu điểm danh & sổ đầu bài cho ${studentAttendanceList.length} học sinh thành công!`;
      onSaved();
      setTimeout(() => {
        successMsg = '';
        isOpen = false;
      }, 1500);
    } catch (err) {
      alert('Lỗi lưu điểm danh: ' + err.message);
    } finally {
      isSaving = false;
    }
  }

  function close() {
    isOpen = false;
  }
</script>

{#if isOpen && session}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
    <div class="w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
      
      <!-- Header -->
      <div class="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
              SỔ ĐẦU BÀI &amp; ĐIỂM DANH
            </span>
            <span class="text-xs text-slate-500 font-mono">{session.day_name} • {session.start_time} - {session.end_time}</span>
          </div>
          <h2 class="text-xl font-black text-slate-900 dark:text-white mt-1">
            {session.class_name}
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Chủ đề: <strong>{session.subject_topic}</strong> • Địa điểm: {session.location}
          </p>
        </div>
        <button
          onclick={close}
          class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center font-bold"
        >
          ✕
        </button>
      </div>

      <!-- Date & Quick Actions -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
        <div class="flex items-center gap-2">
          <span class="font-bold text-slate-700 dark:text-slate-300">📅 Ngày Điểm Danh:</span>
          <input
            type="date"
            bind:value={sessionDate}
            onchange={loadSessionStudents}
            class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={() => studentAttendanceList.forEach(s => s.status = 'present')}
            class="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[11px] hover:bg-emerald-200"
          >
            ✓ Tất Cả Có Mặt
          </button>
        </div>
      </div>

      {#if successMsg}
        <div class="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <span>✅</span>
          <span>{successMsg}</span>
        </div>
      {/if}

      <!-- Students Attendance Table -->
      <div class="space-y-3">
        <div class="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Danh Sách Học Sinh Trong Ca Học ({studentAttendanceList.length}):
        </div>

        {#each studentAttendanceList as item}
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <!-- Student Info -->
              <div class="flex items-center gap-3">
                <img
                  src={item.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'}
                  alt=""
                  class="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500/50"
                />
                <div>
                  <div class="font-bold text-sm text-slate-900 dark:text-white">{item.student_name}</div>
                  <div class="text-[11px] text-slate-500">Mã: {item.student_id}</div>
                </div>
              </div>

              <!-- Status Radio Buttons -->
              <div class="flex items-center gap-1.5 flex-wrap">
                <label class="px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 {item.status === 'present' ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                  <input type="radio" bind:group={item.status} value="present" class="hidden" />
                  <span>✓ Có Mặt</span>
                </label>
                <label class="px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 {item.status === 'late' ? 'bg-amber-600 border-amber-500 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                  <input type="radio" bind:group={item.status} value="late" class="hidden" />
                  <span>⏱️ Đi Muộn</span>
                </label>
                <label class="px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 {item.status === 'absent_excused' ? 'bg-cx-600 border-cx-500 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                  <input type="radio" bind:group={item.status} value="absent_excused" class="hidden" />
                  <span>✉️ Có Phép</span>
                </label>
                <label class="px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 {item.status === 'absent_unexcused' ? 'bg-rose-600 border-rose-500 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                  <input type="radio" bind:group={item.status} value="absent_unexcused" class="hidden" />
                  <span>✕ Không Phép</span>
                </label>
              </div>
            </div>

            <!-- In-class Log & Stars -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div class="sm:col-span-2">
                <input
                  type="text"
                  bind:value={item.in_class_attitude}
                  placeholder="Nhận xét sổ đầu bài (Thái độ, mức độ tập trung, phát biểu...)"
                  class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[11px] text-amber-500 font-bold whitespace-nowrap">⭐ Thưởng Sao:</span>
                <select
                  bind:value={item.instant_stars_rewarded}
                  class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 focus:outline-none"
                >
                  <option value={0}>0 ⭐</option>
                  <option value={5}>+5 ⭐ (Đúng giờ)</option>
                  <option value={10}>+10 ⭐ (Phát biểu hay)</option>
                  <option value={15}>+15 ⭐ (Xuất sắc)</option>
                  <option value={20}>+20 ⭐ (Điểm 10)</option>
                </select>
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Footer Buttons -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <a
          href="/exam"
          class="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
        >
          <span>📝 Tạo bài kiểm tra trực tiếp cho học sinh có mặt ➔</span>
        </a>

        <div class="flex items-center gap-3">
          <button
            type="button"
            onclick={close}
            class="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={isSaving}
            onclick={handleSaveRollCall}
            class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all hover:scale-105"
          >
            {isSaving ? 'Đang lưu...' : '💾 Lưu Điểm Danh & Sổ Đầu Bài'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
