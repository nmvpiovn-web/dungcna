<script>
  import { onMount } from 'svelte';
  import {
    getAllUsers,
    getCurrentUser,
    isTeacherOrAdmin,
    saveClassSession
  } from '$lib/unifiedStore';

  let { isOpen = $bindable(false), session = null, onSaved = () => {} } = $props();

  let currentUser = $state(null);
  let allStudents = $state([]);
  let allTeachers = $state([]);

  let form = $state({
    id: '',
    class_id: 'L7_GLOBAL_SUCCESS_A1',
    class_name: 'Lớp 7 - Global Success & KET A2',
    grade_level: 'Lớp 7',
    subject_topic: '',
    teacher_id: 'usr_super_2',
    teacher_name: 'Ms. Dung',
    teacher_role: 'lead',
    assistant_teacher_id: 'usr_teach_1',
    assistant_teacher_name: 'Mr. Johnathan Miller',
    location: 'Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội)',
    day_of_week: 1,
    day_name: 'Thứ Hai',
    start_time: '18:00',
    end_time: '19:30',
    notify_minutes_before: 10,
    room_notes: 'Phòng VIP 201',
    status: 'active',
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

  let wasOpen = false;

  $effect(() => {
    if (isOpen) {
      if (!wasOpen) {
        wasOpen = true;
        currentUser = getCurrentUser();
        const users = getAllUsers();
        allStudents = users.filter(u => u.role === 'student');
        allTeachers = users.filter(u => u.role === 'teacher' || u.role === 'superadmin');

        if (session) {
          form = {
            ...session,
            student_ids: session.student_ids ? [...session.student_ids] : []
          };
        } else {
          form = {
            id: '',
            class_id: 'L7_GLOBAL_SUCCESS_A1',
            class_name: 'Lớp 7 - Global Success & KET A2',
            grade_level: 'Lớp 7',
            subject_topic: 'Chuyên đề Ngữ pháp & Giao tiếp phản xạ',
            teacher_id: 'usr_super_2',
            teacher_name: 'Ms. Dung',
            teacher_role: 'lead',
            assistant_teacher_id: 'usr_teach_1',
            assistant_teacher_name: 'Mr. Johnathan Miller',
            location: 'Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội)',
            day_of_week: 1,
            day_name: 'Thứ Hai',
            start_time: '18:00',
            end_time: '19:30',
            notify_minutes_before: 10,
            room_notes: 'Phòng VIP 201',
            status: 'active',
            student_ids: allStudents.slice(0, 3).map(s => s.id)
          };
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

  async function handleSave() {
    errorMessage = '';
    if (!form.class_name.trim() || !form.start_time) {
      alert('Vui lòng điền đầy đủ tên lớp và giờ học!');
      return;
    }

    const dayObj = DAY_OPTIONS.find(d => d.value === Number(form.day_of_week));
    if (dayObj) form.day_name = dayObj.label;

    const tObj = allTeachers.find(t => t.id === form.teacher_id);
    if (tObj) form.teacher_name = tObj.name;

    const aObj = allTeachers.find(t => t.id === form.assistant_teacher_id);
    if (aObj) form.assistant_teacher_name = aObj.name;

    const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
    let savedData = { ...form };

    if (token) {
      try {
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
      } catch (err) {
        errorMessage = err.message || 'Lỗi kết nối';
        return;
      }
    }

    const saved = saveClassSession(savedData, currentUser);
    onSaved(saved);
    isOpen = false;
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
    <div class="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 md:p-8 space-y-5 max-h-[90vh] overflow-y-auto">

      <!-- Header -->
      <div class="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
            {form.id ? 'CẬP NHẬT THỜI KHÓA BIỂU' : 'THÊM BUỔI HỌC MỚI'}
          </span>
          <h2 class="text-xl font-black text-slate-900 dark:text-white mt-0.5">
            Thiết Lập Lịch Học &amp; Danh Sách Học Sinh
          </h2>
        </div>
        <button
          onclick={() => isOpen = false}
          class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center font-bold"
        >
          ✕
        </button>
      </div>

      {#if errorMessage}
        <div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold">
          ⚠️ {errorMessage}
        </div>
      {/if}

      <!-- Form Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tên Khóa / Lớp Học *</label>
          <input
            type="text"
            bind:value={form.class_name}
            placeholder="Ví dụ: Lớp 7 - Global Success & KET A2"
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Khối Lớp (Role Học Sinh)</label>
          <select
            bind:value={form.grade_level}
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
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
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Chủ Đề / Nội Dung Bài Học</label>
          <input
            type="text"
            bind:value={form.subject_topic}
            placeholder="Ví dụ: Unit 7: Traffic & Phonics /θ/ - /ð/ - Ngữ pháp Used to"
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Giáo Viên Phụ Trách Chính</label>
          <select
            bind:value={form.teacher_id}
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-semibold"
          >
            {#each allTeachers as t}
              <option value={t.id}>{t.name} ({t.role === 'superadmin' ? 'Leader' : 'Giáo viên'})</option>
            {/each}
          </select>
        </div>

        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Giáo Viên Hỗ Trợ / Bản Ngữ / Trợ Giảng</label>
          <select
            bind:value={form.assistant_teacher_id}
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
          >
            {#each allTeachers as t}
              <option value={t.id}>{t.name}</option>
            {/each}
          </select>
        </div>

        <div class="sm:col-span-2">
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Địa Điểm Học *</label>
          <input
            type="text"
            bind:value={form.location}
            placeholder="Ví dụ: Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội) hoặc Online Zoom VIP"
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-medium"
          />
        </div>

        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Thứ Trong Tuần</label>
          <select
            bind:value={form.day_of_week}
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-semibold"
          >
            {#each DAY_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bắt Đầu</label>
            <input
              type="time"
              bind:value={form.start_time}
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Kết Thúc</label>
            <input
              type="time"
              bind:value={form.end_time}
              class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">
            ⏰ Thông Báo Cho Phụ Huynh Trước:
          </label>
          <select
            bind:value={form.notify_minutes_before}
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-semibold"
          >
            <option value={5}>5 phút trước giờ học</option>
            <option value={10}>10 phút trước giờ học (Chuẩn đưa đón)</option>
            <option value={15}>15 phút trước giờ học</option>
            <option value={30}>30 phút trước giờ học</option>
            <option value={60}>1 tiếng trước giờ học</option>
          </select>
        </div>

        <div>
          <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ghi Chú Phòng Học</label>
          <input
            type="text"
            bind:value={form.room_notes}
            placeholder="Ví dụ: Phòng VIP 201 - Có máy chiếu & loa kiểm âm"
            class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <!-- Thêm / Bớt Học Sinh Vào Lớp Học Này -->
      <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div class="flex items-center justify-between">
          <label class="font-bold text-xs text-slate-800 dark:text-slate-200">
            👥 Danh Sách Học Sinh Gán Vào Ca Học Này ({form.student_ids.length} học sinh):
          </label>
          <div class="flex items-center gap-2 text-[11px]">
            <button
              type="button"
              onclick={() => form.student_ids = allStudents.map(s => s.id)}
              class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
            >
              Chọn tất cả
            </button>
            <span>•</span>
            <button
              type="button"
              onclick={() => form.student_ids = []}
              class="text-rose-500 hover:underline"
            >
              Bỏ chọn
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
          {#each allStudents as student}
            {@const isSelected = form.student_ids.includes(student.id)}
            <button
              type="button"
              onclick={() => toggleStudent(student.id)}
              class="p-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-all {isSelected ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'}"
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
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onclick={() => isOpen = false}
          class="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Hủy
        </button>
        <button
          type="button"
          onclick={handleSave}
          class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all hover:scale-105"
        >
          💾 Lưu Buổi Học &amp; Thời Khóa Biểu
        </button>
      </div>
    </div>
  </div>
{/if}
