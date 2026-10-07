<script>
 import { onMount } from 'svelte';
 import {
 getCurrentUser,
 verifySessionWithServer,
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
 import TeacherLeaveModal from '$lib/components/TeacherLeaveModal.svelte';
 import TeacherAdvanceModal from '$lib/components/TeacherAdvanceModal.svelte';

 let currentUser = $state(null);
 let sessions = $state([]);
 let attendanceRecords = $state([]);
 let allUsers = $state([]);
 let teacherProfiles = $state([]);

 // Modals state
 let showRollCallModal = $state(false);
 let showEditModal = $state(false);
 let showStaffModal = $state(false);
 let showLeaveModal = $state(false);
 let showAdvanceModal = $state(false);
 let selectedSession = $state(null);
 let selectedTeacherId = $state(null);

 // Teacher Workflows
 let mySubstituteRequests = $state([]);
 let myRecentWorkflows = $state({ leaves: [], advances: [] });

 // Filters
 let activeTabFilter = $state('all'); // 'all' | 'my_schedule' | 'primary' | 'secondary' | 'high_school'
 let dayFilter = $state('all'); // 'all' | 1 | 2 | 3 | 4 | 5 | 6 | 0
 let weekOffset = $state(0);
 let selectedWeekDay = $state(null);
 let toastMsg = $state('');

 const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
 function toIsoDate(date) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, '0');
   const day = String(date.getDate()).padStart(2, '0');
   return `${year}-${month}-${day}`;
 }
 function buildWeek(offset = 0) {
   const now = new Date();
   now.setHours(12, 0, 0, 0);
   const mondayDistance = (now.getDay() + 6) % 7;
   now.setDate(now.getDate() - mondayDistance + offset * 7);
   return dayLabels.map((label, index) => {
     const date = new Date(now);
     date.setDate(now.getDate() + index);
     return { label, date, iso: toIsoDate(date), dayOfWeek: index === 6 ? 0 : index + 1 };
   });
 }
 let calendarWeek = $derived(buildWeek(weekOffset));
 function sessionsForCell(day, time) {
   return filteredSessions.filter((session) => {
     const sameDay = session.session_date ? session.session_date === day.iso : Number(session.day_of_week) === day.dayOfWeek;
     return sameDay && session.start_time === time;
   });
 }
 function selectCalendarDay(day) {
   selectedWeekDay = day.iso;
   dayFilter = day.dayOfWeek;
 }
 function shiftWeek(step) {
   weekOffset += step;
   selectedWeekDay = null;
   dayFilter = 'all';
 }

 onMount(() => {
 loadData();
 });

 async function loadData() {
 currentUser = getCurrentUser();
 const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
 if (!currentUser && token) {
   await verifySessionWithServer();
   currentUser = getCurrentUser();
 }
 allUsers = getAllUsers();
 sessions = getAllClassSessions();
 attendanceRecords = getAllAttendanceRecords();
 teacherProfiles = getAllTeacherProfiles();
 if (currentUser?.role === 'student' || currentUser?.role === 'parent') {
 activeTabFilter = 'my_schedule';
 }

 if (token) {
 fetch('/api/schedule', {
 headers: { 'Authorization': `Bearer ${token}` }
 }).then(r => r.json()).then(data => {
 if (data.success && Array.isArray(data.sessions)) {
 sessions = data.sessions;
 }
 }).catch(err => console.error('Failed to load schedule from server:', err));
 }

 loadTeacherWorkflows();
 }

 async function loadTeacherWorkflows() {
 if (typeof window === 'undefined') return;
 const token = localStorage.getItem('tienganh_token');
 if (!token || !currentUser || !isTeacherOrAdmin(currentUser)) return;
 try {
 const res = await fetch('/api/teachers/workflows', {
 headers: { 'Authorization': `Bearer ${token}` }
 });
 const data = await res.json();
 if (data.success) {
 mySubstituteRequests = (data.leaves || []).filter(l =>
 l.substitute_teacher_id === currentUser.id && l.substitute_status === 'pending'
 );
 myRecentWorkflows = {
 leaves: data.leaves || [],
 advances: data.advances || []
 };
 }
 } catch {}
 }

 async function handleRespondSubstitute(leaveId, decision) {
 const token = localStorage.getItem('tienganh_token');
 if (!token) return;
 try {
 const res = await fetch('/api/teachers/workflows', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${token}`
 },
 body: JSON.stringify({
 action: 'respond_substitute',
 leave_id: leaveId,
 decision
 })
 });
 const data = await res.json();
 if (data.success) {
 showToast(decision === 'accept' ? '✅ Bạn đã đồng ý dạy thay! Đơn đã chuyển sang hàng đợi Leader duyệt.' : 'Đã từ chối lời mời dạy thay.');
 loadTeacherWorkflows();
 } else {
 showToast('Lỗi: ' + data.error);
 }
 } catch (e) {
 showToast('Lỗi kết nối: ' + e.message);
 }
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

 let calendarTimes = $derived.by(() => {
 const values = filteredSessions.map((session) => session.start_time).filter(Boolean);
 return [...new Set(values)].sort().slice(0, 8);
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

 async function handleDelete(id, name) {
 if (confirm(`Bạn có chắc muốn xóa ca học "${name}" khỏi thời khóa biểu?`)) {
 const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
 if (token) {
 try {
 const res = await fetch(`/api/schedule?id=${encodeURIComponent(id)}`, {
 method: 'DELETE',
 headers: { 'Authorization': `Bearer ${token}` }
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.success) {
 showToast('Lỗi xóa: ' + (data.error || `mã ${res.status}`));
 return;
 }
 } catch (e) {
 showToast('Lỗi kết nối: ' + e.message);
 return;
 }
 } else {
 deleteClassSession(id, currentUser);
 }
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
 <div class="p-4 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-sm">
 <div class="flex items-center gap-2">
 <span>✅</span>
 <span>{toastMsg}</span>
 </div>
 <button onclick={() => toastMsg = ''} class="text-emerald-500 hover:text-white">✕</button>
 </div>
 {/if}

 <!-- Student Header Badge if logged in as student -->
 {#if currentUser?.role === 'student'}
 {@const isOfficial = currentUser.approval_status === 'official' || (currentUser.status === 'active' && !currentUser.is_trial && !currentUser.metadata?.includes('"is_trial":true'))}
 {@const primaryGrade = currentUser.grade || 'Chưa có lớp'}
 <div class="rounded-lg bg-indigo-950/40 border border-indigo-500/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
 <div class="flex items-center gap-3.5">
 <div class="w-11 h-11 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold flex items-center justify-center text-xl shadow-md">
 📅
 </div>
 <div class="space-y-0.5">
 <div class="text-sm font-bold text-white flex flex-wrap items-center gap-2">
 <span>Học Sinh: <strong class="text-indigo-200">{currentUser.name}</strong></span>
 {#if isOfficial}
 <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
 ✓ Học Sinh Chính Thức
 </span>
 {:else}
 <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
 ⏳ Dùng Thử (Trial) • Chờ Cô Dung Duyệt
 </span>
 {/if}
 </div>
 <div class="text-xs text-slate-400">
 Tài khoản: <strong class="text-slate-200">@{currentUser.username}</strong> • Thời khóa biểu học trực tiếp tại nhà Cô Dung
 </div>
 </div>
 </div>
 <div class="sm:text-right bg-indigo-900/30 px-3.5 py-2 rounded-md border border-indigo-500/20">
 <div class="text-[10px] text-indigo-300 font-extrabold uppercase tracking-wider">Khối Lớp Đã Đăng Ký</div>
 <div class="text-sm font-semibold text-white">{primaryGrade}</div>
 </div>
 </div>
 {/if}

 <!-- Header Banner -->
 <div class="rounded-lg bg-slate-900 border border-slate-800 p-6 md:p-8 shadow-sm relative overflow-hidden">
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
 <h1 class="text-2xl md:text-3xl font-heading font-semibold text-white">
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
 onclick={() => showLeaveModal = true}
 class="px-3.5 py-2.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
 title="Đăng ký xin nghỉ và đề nghị đồng nghiệp dạy thay 2 bước"
 >
 <span>📝</span> <span>Xin Nghỉ &amp; Dạy Thay</span>
 </button>

 <button
 type="button"
 onclick={() => showAdvanceModal = true}
 class="px-3.5 py-2.5 rounded-md bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
 title="Đề nghị ứng lương cho kỳ hiện tại"
 >
 <span>💰</span> <span>Đề Nghị Ứng Lương</span>
 </button>

 <button
 type="button"
 onclick={() => openStaffManagement()}
 class="px-3.5 py-2.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
 >
 <span>👨‍🏫 Phân Quyền Leader &amp; Lương</span>
 </button>

 <button
 type="button"
 onclick={() => handleOpenEdit(null)}
 class="px-3.5 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
 >
 <span>➕ Thêm Buổi Học Mới</span>
 </button>
 {/if}
 </div>
 </div>
 </div>

 <!-- Substitute Requests Alert Deck (If Teacher has pending substitute requests) -->
 {#if mySubstituteRequests.length > 0}
 <div class="p-4 sm:p-5 rounded-lg bg-amber-500/10 border-2 border-amber-500/40 space-y-3 shadow-sm animate-in slide-in-from-top-2">
 <div class="flex items-center gap-2 text-amber-800 font-semibold text-sm">
 <span class="text-xl">⚠️</span>
 <span>BẠN CÓ {mySubstituteRequests.length} ĐỀ NGHỊ DẠY THAY CẦN PHẢN HỒI (QUY TRÌNH 2 BƯỚC)</span>
 </div>
 <div class="space-y-2">
 {#each mySubstituteRequests as req}
 <div class="p-3 rounded-md bg-white border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
 <div class="space-y-1">
 <div class="font-bold text-slate-900 flex items-center gap-2">
 <span>Giáo viên: <strong class="text-emerald-600">{req.teacher_name}</strong></span>
 <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">Chờ bạn xác nhận</span>
 </div>
 <div class="text-slate-600">
 Ca học: <strong>{req.session_date} ({req.start_time} - {req.end_time})</strong> • Lớp: <strong>{req.class_id}</strong>
 </div>
 <div class="text-slate-500 text-[11px] italic">
 Lý do nghỉ: "{req.reason}"
 </div>
 </div>
 <div class="flex items-center gap-2 flex-shrink-0">
 <button
 type="button"
 onclick={() => handleRespondSubstitute(req.id, 'accept')}
 class="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all"
 >
 ✓ Đồng Ý Dạy Thay
 </button>
 <button
 type="button"
 onclick={() => handleRespondSubstitute(req.id, 'reject')}
 class="px-3 py-1.5 rounded-md bg-slate-200 hover:bg-rose-600 hover:text-white text-slate-700 font-bold text-xs transition-all"
 >
 ✕ Từ Chối
 </button>
 </div>
 </div>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Role Notification Callout (Example: 6h học -> 5h50 thông báo) -->
 <div class="p-4 rounded-lg bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
 <div class="flex items-center gap-3">
 <div class="w-10 h-10 rounded-md bg-amber-500/20 text-amber-700 flex items-center justify-center text-xl font-bold flex-shrink-0">
 ⏰
 </div>
 <div>
 <div class="font-bold text-slate-900">
 Cơ Chế Báo Lịch Đưa Đón Tự Động (API Schedule Webhook):
 </div>
 <div class="text-slate-600 mt-0.5">
 Ví dụ ca học <strong>18:00 tại nhà Cô Dung</strong> sẽ tự động bắn tin nhắn Zalo lúc <strong>17:50 (trước 10 phút)</strong> để bố mẹ chuẩn bị đưa đón các con đúng giờ!
 </div>
 </div>
 </div>
 <span class="px-3 py-1 rounded-md bg-amber-500 text-white font-bold text-[11px] whitespace-nowrap shadow-sm">
 Đang Hoạt Động (10m Lead Time)
 </span>
 </div>

 <!-- Filter Ribbon -->
 <section class="rounded-lg bg-white border border-slate-200 shadow-sm overflow-hidden" aria-label="Lịch tuần">
 <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
 <div>
 <div class="text-xs font-semibold uppercase tracking-wider text-sky-700">Ma trận lịch tuần</div>
 <div class="text-sm font-semibold text-slate-900">
 {calendarWeek[0].date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – {calendarWeek[6].date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
 </div>
 </div>
 <div class="flex items-center gap-1">
 <button type="button" onclick={() => shiftWeek(-1)} class="w-9 h-9 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" aria-label="Tuần trước">‹</button>
 <button type="button" onclick={() => shiftWeek(1)} class="w-9 h-9 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" aria-label="Tuần sau">›</button>
 </div>
 </div>
 <div class="overflow-x-auto">
 <div class="min-w-[720px]">
 <div class="grid grid-cols-[72px_repeat(7,minmax(88px,1fr))] border-b border-slate-200 bg-slate-50">
 <div class="p-2 text-[11px] font-semibold text-slate-500">Giờ</div>
 {#each calendarWeek as day}
 <button type="button" onclick={() => selectCalendarDay(day)} class="p-2 border-l border-slate-200 text-center {selectedWeekDay === day.iso ? 'bg-sky-600 text-white' : 'text-slate-700 hover:bg-sky-50'}">
 <span class="block text-[11px] font-semibold">{day.label}</span>
 <strong class="block text-sm">{day.date.getDate()}</strong>
 </button>
 {/each}
 </div>
 {#if calendarTimes.length === 0}
 <div class="p-8 text-center text-sm text-slate-500">Chưa có ca học trong bộ lọc hiện tại.</div>
 {:else}
 {#each calendarTimes as time}
 <div class="grid grid-cols-[72px_repeat(7,minmax(88px,1fr))] min-h-20 border-b last:border-b-0 border-slate-100">
 <div class="p-2 text-xs font-semibold text-slate-600 bg-slate-50/70">{time}</div>
 {#each calendarWeek as day}
 {@const cellSessions = sessionsForCell(day, time)}
 <button type="button" onclick={() => selectCalendarDay(day)} class="p-1.5 border-l border-slate-100 text-left hover:bg-sky-50/60">
 {#each cellSessions as session}
 <span class="block rounded-md border border-sky-200 bg-sky-50 p-1.5 text-[10px] leading-tight text-sky-900 mb-1">
 <strong class="block line-clamp-2">{session.class_name}</strong>
 <span>{session.start_time}–{session.end_time}</span>
 </span>
 {/each}
 </button>
 {/each}
 </div>
 {/each}
 {/if}
 </div>
 </div>
 <div class="px-4 py-2 border-t border-slate-200 text-[11px] text-slate-500">Chọn một ngày để lọc danh sách chi tiết bên dưới. Lịch phụ huynh chỉ gồm học sinh đã xác minh liên kết.</div>
 </section>

 <!-- Filter Ribbon -->
 <div class="rounded-lg bg-white border border-slate-200 p-4 shadow-sm space-y-3">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <!-- Tabs by Audience / Grade -->
 <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold">
 <button
 onclick={() => activeTabFilter = 'all'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap {activeTabFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-white'}"
 >
 🌟 Tất Cả Lớp ({sessions.length})
 </button>
 {#if currentUser}
 <button
 onclick={() => activeTabFilter = 'my_schedule'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap {activeTabFilter === 'my_schedule' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-white'}"
 >
 👤 Lịch Học Của Tôi
 </button>
 {/if}
 <button
 onclick={() => activeTabFilter = 'primary'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap {activeTabFilter === 'primary' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-white'}"
 >
 🎒 Tiểu Học (Lớp 1 - 5)
 </button>
 <button
 onclick={() => activeTabFilter = 'secondary'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap {activeTabFilter === 'secondary' ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-white'}"
 >
 📚 THCS (Lớp 6 - 9)
 </button>
 <button
 onclick={() => activeTabFilter = 'high_school'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap {activeTabFilter === 'high_school' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-white'}"
 >
 🎓 THPT &amp; IELTS (Lớp 10 - 12)
 </button>
 </div>

 <!-- Day Filter Pills -->
 <div class="flex items-center gap-1 overflow-x-auto text-[11px] font-bold">
 <button
 onclick={() => dayFilter = 'all'}
 class="px-2.5 py-1 rounded-lg border {dayFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 Cả tuần
 </button>
 <button
 onclick={() => dayFilter = 1}
 class="px-2 py-1 rounded-lg border {dayFilter === 1 ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T2
 </button>
 <button
 onclick={() => dayFilter = 2}
 class="px-2 py-1 rounded-lg border {dayFilter === 2 ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T3
 </button>
 <button
 onclick={() => dayFilter = 3}
 class="px-2 py-1 rounded-lg border {dayFilter === 3 ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T4
 </button>
 <button
 onclick={() => dayFilter = 4}
 class="px-2 py-1 rounded-lg border {dayFilter === 4 ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T5
 </button>
 <button
 onclick={() => dayFilter = 5}
 class="px-2 py-1 rounded-lg border {dayFilter === 5 ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T6
 </button>
 <button
 onclick={() => dayFilter = 6}
 class="px-2 py-1 rounded-lg border {dayFilter === 6 ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T7
 </button>
 <button
 onclick={() => dayFilter = 0}
 class="px-2 py-1 rounded-lg border {dayFilter === 0 ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}"
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

 <div class="rounded-lg bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">

 <!-- Header of Card -->
 <div class="space-y-2">
 <div class="flex items-center justify-between gap-2">
 <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
 {s.grade_level}
 </span>
 <div class="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-700">
 <span>{s.day_name}</span>
 <span>•</span>
 <span class="text-indigo-600">{s.start_time} - {s.end_time}</span>
 </div>
 </div>

 <h3 class="font-bold text-base text-slate-900 leading-snug">
 {s.class_name}
 </h3>

 <p class="text-xs text-slate-600 line-clamp-2">
 📖 <strong>Chủ đề:</strong> {s.subject_topic}
 </p>

 <div class="text-[11px] text-slate-500 flex items-center gap-1.5">
 <span>📍</span>
 <span class="truncate">{s.location}</span>
 </div>

 <div class="text-[11px] text-slate-500 flex items-center gap-1.5">
 <span>👩‍🏫</span>
 <span><strong>{s.teacher_name}</strong> &amp; {s.assistant_teacher_name || 'Trợ giảng'}</span>
 </div>
 </div>

 <!-- Notification Banner & Students Roster -->
 <div class="space-y-2 pt-2 border-t border-slate-100 text-xs">
 <!-- Notification Pill -->
 <div class="p-2.5 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
 <div>
 <div class="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
 <span>⏰</span> <span>Nhắc phụ huynh đưa đón:</span>
 </div>
 <div class="text-[11px] font-bold text-slate-800">
 {notifyTimeStr} ({notifyMin}p trước giờ học)
 </div>
 </div>

 {#if currentUser && isTeacherOrAdmin(currentUser)}
 <button
 type="button"
 onclick={() => handleSendReminderNotification(s)}
 class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] shadow-sm transition-all"
 title="Gửi tin nhắn thử nghiệm tới Zalo phụ huynh"
 >
 🔔 Test Bot
 </button>
 {/if}
 </div>

 <!-- Attendance indicator & Student Count -->
 <div class="flex items-center justify-between text-[11px] text-slate-500">
 <span class="flex items-center gap-1">
 <span>👥</span>
 <span>{s.student_ids?.length || 0} học sinh trong lớp</span>
 </span>

 {#if todayAtt}
 <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
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
 <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
 {#if currentUser && isTeacherOrAdmin(currentUser)}
 <button
 type="button"
 onclick={() => handleOpenRollCall(s)}
 class="flex-1 py-2 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1"
 >
 <span>📋 Điểm Danh</span>
 </button>

 <button
 type="button"
 onclick={() => handleOpenEdit(s)}
 class="py-2 px-3 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all"
 title="Điều chỉnh ca học & gán học sinh"
 >
 ✏️ Sửa
 </button>

 {#if isSuperAdmin(currentUser)}
 <button
 type="button"
 onclick={() => handleDelete(s.id, s.class_name)}
 class="py-2 px-2.5 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs transition-all"
 title="Xóa buổi học"
 >
 🗑️
 </button>
 {/if}
 {:else}
 <button
 type="button"
 onclick={() => handleSendReminderNotification(s)}
 class="w-full py-2 px-3 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1"
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
 currentUser={currentUser}
 onUpdated={loadData}
/>

<!-- Teacher Leave & Substitute Modal (2-Step Workflow) -->
<TeacherLeaveModal
 bind:isOpen={showLeaveModal}
 on:success={loadTeacherWorkflows}
/>

<!-- Teacher Salary Advance Modal -->
<TeacherAdvanceModal
 bind:isOpen={showAdvanceModal}
 on:success={loadTeacherWorkflows}
/>
