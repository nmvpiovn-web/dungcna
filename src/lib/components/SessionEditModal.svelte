<script>
 import { onMount, onDestroy } from 'svelte';
 import {
 getAllUsers,
 getCurrentUser,
 isTeacherOrAdmin,
 saveClassSession,
 upsertClassSessionInStore
 } from '$lib/unifiedStore';
 import { registerBusyState, unregisterBusyState } from '$lib/stores/appUpdate.js';

 let { isOpen = $bindable(false), session = null, preset = null, onSaved = () => {} } = $props();

 let currentUser = $state(null);
 let allStudents = $state([]);
 let allTeachers = $state([]);
 let isManager = $derived(['admin', 'superadmin', 'leader'].includes(String(currentUser?.role || '').toLowerCase()));

 let form = $state({
 id: '',
 class_id: '',
 class_name: 'Lớp 7 - Global Success & KET A2',
 grade_level: 'Lớp 7',
 subject_topic: '',
 teacher_id: '',
 teacher_name: '',
 teacher_role: 'lead',
 assistant_teacher_id: '',
 assistant_teacher_name: '',
    substitute_teacher_id: '',
    substitute_teacher_name: '',
 location: 'Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội)',
 day_of_week: 1,
 day_name: 'Thứ Hai',
 session_date: '',
 start_time: '18:00',
 end_time: '19:30',
 notify_minutes_before: 10,
 room_notes: 'Phòng VIP 201',
 status: 'scheduled',
 student_ids: []
 });

 const DAY_OPTIONS = [
 { value: 1, label: 'Thứ Hai' },
 { value: 2, label: 'Thứ Ba' },
 { value: 3, label: 'Thứ Tư' },
 { value: 4, label: 'Thứ Năm' },
 { value: 5, label: 'Thứ Sáu' },
 { value: 6, label: 'Thứ Bảy' },
 { value: 0, label: 'Chủ Nhật' }
 ];

 function formatLocalDate(date) {
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2, '0');
 const day = String(date.getDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
 }

 function parseLocalDate(value) {
 const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
 if (!match) return null;
 const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
 return Number.isNaN(date.getTime()) ? null : date;
 }

 function syncDateFromDay() {
 const dayOfWeek = Number(form.day_of_week);
 if (Number.isNaN(dayOfWeek)) return;
 const date = parseLocalDate(form.session_date) || new Date();
 date.setDate(date.getDate() + ((dayOfWeek - date.getDay() + 7) % 7));
 form.session_date = formatLocalDate(date);
 const day = DAY_OPTIONS.find(option => option.value === dayOfWeek);
 if (day) form.day_name = day.label;
 }

 function syncDayFromDate() {
 const date = parseLocalDate(form.session_date);
 if (!date) return;
 form.day_of_week = date.getDay();
 const day = DAY_OPTIONS.find(option => option.value === form.day_of_week);
 if (day) form.day_name = day.label;
 }

 let wasOpen = false;

 $effect(() => {
 if (isOpen) {
 if (!wasOpen) {
 wasOpen = true;
 errorMessage = '';
 currentUser = getCurrentUser();
 const users = getAllUsers();
 allTeachers = users.filter(u => ['teacher', 'superadmin', 'admin', 'leader'].includes(String(u.role || '').toLowerCase()));
 // Bước 4: picker học sinh từ API, không dùng local
 allStudents = users.filter(u => u.role === 'student');
 const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
 if (token) {
 fetch('/api/students', { headers: { 'Authorization': `Bearer ${token}` } })
 .then(r => r.json())
 .then(data => {
 if (data.success && Array.isArray(data.students)) {
 allStudents = data.students;
 }
 })
 .catch(() => {});
 }

 if (session) {
 form = {
 ...session,
 student_ids: session.student_ids ? [...session.student_ids] : []
 };
 } else {
 const defaultTeacherId = preset?.teacher_id || (currentUser ? currentUser.id : (allTeachers[0]?.id || ''));
 const defaultTeacher = allTeachers.find(t => t.id === defaultTeacherId);
 const defaultTeacherName = preset?.teacher_name || defaultTeacher?.name || currentUser?.name || currentUser?.username || '';
 const defaultAssistantId = preset?.assistant_teacher_id || '';
 const defaultAssistant = allTeachers.find(t => t.id === defaultAssistantId);
 const defaultAssistantName = preset?.assistant_teacher_name || defaultAssistant?.name || '';
        const defaultSubstituteId = preset?.substitute_teacher_id || '';
        const defaultSubstitute = allTeachers.find(t => t.id === defaultSubstituteId);
        const defaultSubstituteName = preset?.substitute_teacher_name || defaultSubstitute?.name || '';

 form = {
 id: '',
 class_id: '',
 class_name: 'Lớp 7 - Global Success & KET A2',
 grade_level: 'Lớp 7',
 subject_topic: 'Chuyên đề Ngữ pháp & Giao tiếp phản xạ',
 teacher_id: defaultTeacherId,
 teacher_name: defaultTeacherName,
 teacher_role: 'lead',
 assistant_teacher_id: defaultAssistantId,
 assistant_teacher_name: defaultAssistantName,
          substitute_teacher_id: defaultSubstituteId,
          substitute_teacher_name: defaultSubstituteName,
 location: 'Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội)',
 day_of_week: 1,
 day_name: 'Thứ Hai',
 session_date: '',
 start_time: '18:00',
 end_time: '19:30',
 notify_minutes_before: 10,
 room_notes: 'Phòng VIP 201',
 status: 'scheduled',
 student_ids: [],
 ...(preset || {})
 };
 // Buổi mới không có preset ngày -> tự điền ngày gần nhất khớp thứ đã chọn
 if (!form.session_date) {
 syncDateFromDay();
 } else {
 syncDayFromDate();
 }
 }
 }
 } else {
 wasOpen = false;
 }
 });

 function toggleStudent(studentId) {
 if (form.student_ids.includes(studentId)) {
 form.student_ids = form.student_ids.filter(id => id !== studentId);
 } else {
 form.student_ids = [...form.student_ids, studentId];
 }
 }

 let errorMessage = $state('');
 let saving = $state(false);

 $effect(() => {
   if (isOpen || saving) {
     registerBusyState('schedule-session-edit-modal');
   } else {
     unregisterBusyState('schedule-session-edit-modal');
   }
   return () => {
     unregisterBusyState('schedule-session-edit-modal');
   };
 });

 onDestroy(() => {
   unregisterBusyState('schedule-session-edit-modal');
 });

 async function handleSave() {
 errorMessage = '';
 if (saving) return;
 if (!form.class_name.trim() || !form.start_time) {
 alert('Vui lòng điền đầy đủ tên lớp và giờ học!');
 return;
 }
 if (form.end_time && form.start_time >= form.end_time) {
 errorMessage = 'Giờ kết thúc phải sau giờ bắt đầu.';
 return;
 }

 // Tự điền session_date cho buổi mới: lấy ngày gần nhất khớp thứ đã chọn
 // (nút "Thêm Buổi Học Mới" không truyền preset nên thiếu field này -> API 400)
 if (!form.session_date) {
 syncDateFromDay();
 } else {
 // Ngày cụ thể là nguồn chuẩn; tránh lưu ngày Thứ Ba nhưng metadata lại là Thứ Hai.
 syncDayFromDate();
 }

 const tObj = allTeachers.find(t => t.id === form.teacher_id);
 if (tObj) form.teacher_name = tObj.name;

 const aObj = allTeachers.find(t => t.id === form.assistant_teacher_id);
 if (aObj) form.assistant_teacher_name = aObj.name;
    else if (!form.assistant_teacher_id) form.assistant_teacher_name = '';

    const sObj = allTeachers.find(t => t.id === form.substitute_teacher_id);
    if (sObj) form.substitute_teacher_name = sObj.name;
    else if (!form.substitute_teacher_id) form.substitute_teacher_name = '';

 const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
 let savedData = { ...form };

 saving = true;
 try {
 if (token) {
 const res = await fetch('/api/schedule', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${token}`
 },
 body: JSON.stringify({
 action: 'save_session',
 ...form
 })
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.success) {
 errorMessage = data.error || `Lỗi máy chủ (${res.status})`;
 return;
 }
 if (data.session) {
   savedData = data.session;
 }
 try {
   upsertClassSessionInStore(savedData);
 } catch (cacheErr) {
   console.warn('Local cache update ignored on successful save:', cacheErr);
 }
 onSaved(savedData);
 isOpen = false;
 return;
 }

 const saved = saveClassSession(savedData, currentUser);
 onSaved(saved);
 isOpen = false;
 } catch (err) {
 errorMessage = err.message || 'Lỗi kết nối';
 } finally {
 saving = false;
 }
 }
</script>

{#if isOpen}
 <div
 role="dialog"
 aria-modal="true"
 aria-labelledby="session-modal-title"
 class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200"
 >
 <div class="w-full max-w-2xl rounded-3xl bg-[#fdfbf7] border border-stone-200 shadow-2xl p-6 md:p-8 space-y-5 max-h-[90vh] overflow-y-auto">

 <!-- Header -->
 <div class="flex items-start justify-between border-b border-stone-200/70 pb-3">
 <div>
 <span class="text-xs font-bold text-emerald-700 uppercase tracking-wider">
 {form.id ? 'CẬP NHẬT THỜI KHÓA BIỂU' : 'THÊM BUỔI HỌC MỚI'}
 </span>
 <h2 id="session-modal-title" class="text-xl font-black text-stone-900 mt-0.5">
 Thiết Lập Lịch Học &amp; Danh Sách Học Sinh
 </h2>
 </div>
 <button
 onclick={() => isOpen = false}
 aria-label="Đóng"
 class="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900 flex items-center justify-center font-bold transition-colors"
 >
 ✕
 </button>
 </div>

 {#if errorMessage}
 <div data-testid="session-modal-error" role="alert" class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
 ⚠️ {errorMessage}
 </div>
 {/if}

 <!-- Form Grid -->
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
 <div>
 <label for="session-class-name" class="block font-bold text-stone-700 mb-1">Tên Khóa / Lớp Học *</label>
 <input
 id="session-class-name"
 type="text"
 bind:value={form.class_name}
 placeholder="Ví dụ: Lớp 7 - Global Success & KET A2"
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600"
 />
 </div>

 <div>
 <label for="session-grade-level" class="block font-bold text-stone-700 mb-1">Khối Lớp (Role Học Sinh)</label>
 <select
 id="session-grade-level"
 bind:value={form.grade_level}
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600"
 >
 <option value="Lớp 1">Lớp 1 (Tiểu Học / Phonics)</option>
 <option value="Lớp 2">Lớp 2 (Tiểu Học)</option>
 <option value="Lớp 3">Lớp 3 (Starters)</option>
 <option value="Lớp 4">Lớp 4 (Movers)</option>
 <option value="Lớp 5">Lớp 5 (Flyers)</option>
 <option value="Lớp 6">Lớp 6 (THCS Global Success)</option>
 <option value="Lớp 7">Lớp 7 (THCS Global Success)</option>
 <option value="Lớp 8">Lớp 8 (THCS Global Success)</option>
 <option value="Lớp 9">Lớp 9 (Ôn Chuyên Vào 10)</option>
 <option value="Lớp 10">Lớp 10 (THPT)</option>
 <option value="Lớp 11">Lớp 11 (IELTS Foundation)</option>
 <option value="Lớp 12">Lớp 12 (Ôn Thi ĐH &amp; IELTS 7.5+)</option>
 </select>
 </div>

 <div class="sm:col-span-2">
 <label for="session-subject-topic" class="block font-bold text-stone-700 mb-1">Chủ Đề / Nội Dung Bài Học</label>
 <input
 id="session-subject-topic"
 type="text"
 bind:value={form.subject_topic}
 placeholder="Ví dụ: Unit 7: Traffic & Phonics /θ/ - /ð/ - Ngữ pháp Used to"
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600"
 />
 </div>

 <div>
 <label for="session-teacher-id" class="block font-bold text-stone-700 mb-1">Giáo Viên Phụ Trách Chính</label>
 <select
 id="session-teacher-id"
 bind:value={form.teacher_id}
 disabled={!isManager}
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600 font-semibold disabled:opacity-75 disabled:cursor-not-allowed"
 >
 {#each allTeachers as t}
 <option value={t.id}>{t.name} ({t.role === 'superadmin' ? 'Leader' : 'Giáo viên'})</option>
 {/each}
 </select>
 {#if !isManager && form.id}
 <p class="text-[10px] text-stone-500 mt-0.5">Chỉ quản lý mới có quyền thay đổi giáo viên phụ trách chính.</p>
 {/if}
 </div>

      <div>
        <label for="session-assistant-id" class="block font-bold text-stone-700 mb-1">Giáo Viên Hỗ Trợ / Bản Ngữ / Trợ Giảng</label>
        <select
          id="session-assistant-id"
          bind:value={form.assistant_teacher_id}
          disabled={!isManager && Boolean(form.id)}
          class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600 disabled:opacity-75 disabled:cursor-not-allowed"
        >
          <option value="">-- Không có trợ giảng --</option>
          {#each allTeachers.filter(t => t.id !== form.teacher_id) as t}
            <option value={t.id}>{t.name} ({t.role === 'superadmin' ? 'Leader' : 'Giáo viên'})</option>
          {/each}
        </select>
        {#if !isManager && form.id}
          <p class="text-[10px] text-stone-500 mt-0.5">Chỉ quản lý mới có quyền thay đổi trợ giảng của buổi học đã tạo.</p>
        {/if}
      </div>

      <div class="sm:col-span-2">
        <label for="session-substitute-id" class="block font-bold text-stone-700 mb-1">Giáo Viên Dạy Thay (Nếu có)</label>
        <select
          id="session-substitute-id"
          bind:value={form.substitute_teacher_id}
          disabled={!isManager && Boolean(form.id)}
          class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600 disabled:opacity-75 disabled:cursor-not-allowed"
        >
          <option value="">-- Không có giáo viên dạy thay --</option>
          {#each allTeachers.filter(t => t.id !== form.teacher_id) as t}
            <option value={t.id}>{t.name} ({t.role === 'superadmin' ? 'Leader' : 'Giáo viên'})</option>
          {/each}
        </select>
        {#if !isManager && form.id}
          <p class="text-[10px] text-stone-500 mt-0.5">Chỉ quản lý mới có quyền phân công giáo viên dạy thay của buổi học đã tạo.</p>
        {/if}
      </div>

 <div class="sm:col-span-2">
 <label for="session-location" class="block font-bold text-stone-700 mb-1">Địa Điểm Học *</label>
 <input
 id="session-location"
 type="text"
 bind:value={form.location}
 placeholder="Ví dụ: Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội) hoặc Online Zoom VIP"
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600 font-medium"
 />
 </div>

 <div class="grid grid-cols-2 gap-2">
 <div>
 <label for="session-day-of-week" class="block font-bold text-stone-700 mb-1">Thứ Trong Tuần</label>
 <select
 id="session-day-of-week"
 bind:value={form.day_of_week}
 onchange={syncDateFromDay}
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600 font-semibold"
 >
 {#each DAY_OPTIONS as opt}
 <option value={opt.value}>{opt.label}</option>
 {/each}
 </select>
 </div>
 <div>
 <label for="session-date" class="block font-bold text-stone-700 mb-1">Ngày Học *</label>
 <input
 id="session-date"
 type="date"
 bind:value={form.session_date}
 onchange={syncDayFromDate}
 required
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600 font-semibold"
 />
 </div>
 </div>

 <div class="grid grid-cols-2 gap-2">
 <div>
 <label for="session-start-time" class="block font-bold text-stone-700 mb-1">Bắt Đầu</label>
 <input
 id="session-start-time"
 type="time"
 bind:value={form.start_time}
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono text-stone-900 focus:outline-none focus:border-emerald-600"
 />
 </div>
 <div>
 <label for="session-end-time" class="block font-bold text-stone-700 mb-1">Kết Thúc</label>
 <input
 id="session-end-time"
 type="time"
 bind:value={form.end_time}
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono text-stone-900 focus:outline-none focus:border-emerald-600"
 />
 </div>
 </div>

 <div>
 <label for="session-notify" class="block font-bold text-stone-700 mb-1">
 ⏰ Thông Báo Cho Phụ Huynh Trước:
 </label>
 <select
 id="session-notify"
 bind:value={form.notify_minutes_before}
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600 font-semibold"
 >
 <option value={5}>5 phút trước giờ học</option>
 <option value={10}>10 phút trước giờ học (Chuẩn đưa đón)</option>
 <option value={15}>15 phút trước giờ học</option>
 <option value={30}>30 phút trước giờ học</option>
 <option value={60}>1 tiếng trước giờ học</option>
 </select>
 </div>

 <div>
 <label for="session-room-notes" class="block font-bold text-stone-700 mb-1">Ghi Chú Phòng Học</label>
 <input
 id="session-room-notes"
 type="text"
 bind:value={form.room_notes}
 placeholder="Ví dụ: Phòng VIP 201 - Có máy chiếu & loa kiểm âm"
 class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600"
 />
 </div>
 </div>

 <!-- Thêm / Bớt Học Sinh Vào Lớp Học Này -->
    <fieldset class="space-y-2 pt-2 border-t border-stone-200/70 border-0 p-0 m-0">
      <div class="flex items-center justify-between">
        <legend class="font-bold text-xs text-stone-800">
          👥 Danh Sách Học Sinh Gán Vào Ca Học Này ({form.student_ids.length} học sinh):
        </legend>
        <div class="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onclick={() => form.student_ids = allStudents.map(s => s.id)}
            class="text-emerald-700 font-bold hover:underline min-h-[44px] px-2 py-1 flex items-center"
          >
            Chọn tất cả
          </button>
          <span>•</span>
          <button
            type="button"
            onclick={() => form.student_ids = []}
            class="text-rose-600 font-bold hover:underline min-h-[44px] px-2 py-1 flex items-center"
          >
            Bỏ chọn
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-stone-50 rounded-2xl border border-stone-200">
        {#each allStudents as student}
          {@const isSelected = form.student_ids.includes(student.id)}
          <button
            type="button"
            onclick={() => toggleStudent(student.id)}
            class="min-h-[44px] p-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-all {isSelected ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'}"
          >
            <div class="flex items-center gap-2 min-w-0">
              <img src={student.avatar} alt="" class="w-6 h-6 rounded-full object-cover" />
              <div class="truncate">
                <div class="font-bold text-xs truncate">{student.name}</div>
                <div class="text-[10px] opacity-75">{student.username}</div>
              </div>
            </div>
            <span class="text-xs font-bold">{isSelected ? '✓' : '+'}</span>
          </button>
        {/each}
      </div>
    </fieldset>

 <!-- Action Buttons -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-3 border-t border-stone-200/70 bg-[#fdfbf7] -mx-6 md:-mx-8 px-6 md:px-8 pb-1">
      <button
        type="button"
        onclick={() => isOpen = false}
        disabled={saving}
        class="min-h-[44px] px-5 py-2.5 rounded-xl border border-stone-300 text-stone-700 font-bold text-xs hover:bg-stone-100 disabled:opacity-50 transition-colors"
      >
        Hủy
      </button>
      <button
        type="button"
        data-testid="session-modal-save-btn"
        onclick={handleSave}
        disabled={saving}
        class="min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-700/20 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 w-full sm:w-auto"
      >
        {saving ? '⏳ Đang lưu...' : '💾 Lưu Buổi Học & Thời Khóa Biểu'}
      </button>
    </div>
 </div>
 </div>
{/if}
