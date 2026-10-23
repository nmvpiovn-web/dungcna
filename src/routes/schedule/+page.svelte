<script>
 import { onMount, onDestroy } from 'svelte';
 import { page } from '$app/state';
 import {
 getCurrentUser,
 getAuthToken,
 verifySessionWithServer,
 isTeacherOrAdmin,
 isSuperAdmin,
 getAllClassSessions,
 deleteClassSession,
 getSessionsForUser,
 getUserEnrolledGrades,
 triggerScheduleNotification,
 getAllAttendanceRecords,
 getAllUsers,
 getAllTeacherProfiles,
 upsertClassSessionInStore,
 getAllLeaderNotifications,
 markNotificationAsRead,
 markAllNotificationsAsRead,
 scanScheduleAndAttendanceForLeader,
 scanTuitionDueAlerts
 } from '$lib/unifiedStore';
 import { registerBusyState, unregisterBusyState } from '$lib/stores/appUpdate.js';
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

 let isScheduleBusy = $derived(
   Boolean(showRollCallModal || showEditModal || showStaffModal || showLeaveModal || showAdvanceModal)
 );

 $effect(() => {
   if (isScheduleBusy) {
     registerBusyState('schedule-modal-open');
   } else {
     unregisterBusyState('schedule-modal-open');
   }
   return () => {
     unregisterBusyState('schedule-modal-open');
   };
 });

 onDestroy(() => {
   unregisterBusyState('schedule-modal-open');
 });

 // Teacher Workflows
 let mySubstituteRequests = $state([]);
 let myRecentWorkflows = $state({ leaves: [], advances: [] });

 // Filters
 let scheduleViewMode = $state('all'); // 'all' | 'rollcall' | 'calendar' | 'sessions' | 'alerts'
 let activeTabFilter = $state('all'); // 'all' | 'my_schedule' | 'primary' | 'secondary' | 'high_school'
 let dayFilter = $state('all'); // 'all' | 1 | 2 | 3 | 4 | 5 | 6 | 0
 let classFilter = $state('all'); // 'all' | class_id
 let teacherFilter = $state('all'); // 'all' | teacher_id
 let attendanceFilter = $state('all'); // 'all' | 'complete' | 'incomplete' | 'unmarked' | 'has_late' | 'has_absent'
 let sessionAuditById = $state({});
 let weekOffset = $state(0);
 let selectedWeekDay = $state(null);
 let toastMsg = $state('');
 let sessionPreset = $state(null); // preset for quick-add from week grid cell
 let inlineLeaderNotifs = $state([]);
 let isScanningInline = $state(false);

 // Đồng bộ tự động với Sub-Menu Nghiệp Vụ Điểm Danh & Lịch Học (?view=)
 $effect(() => {
 const viewParam = page.url.searchParams.get('view');
 if (viewParam && ['all', 'rollcall', 'calendar', 'sessions', 'alerts'].includes(viewParam)) {
 scheduleViewMode = viewParam;
 if (viewParam === 'alerts' && typeof window !== 'undefined') {
 inlineLeaderNotifs = getAllLeaderNotifications();
 }
 } else if (!viewParam) {
 scheduleViewMode = 'all';
 }
 });

 function handleInlineLeaderScan() {
 isScanningInline = true;
 const sched = scanScheduleAndAttendanceForLeader();
 const tui = scanTuitionDueAlerts();
 inlineLeaderNotifs = getAllLeaderNotifications();
 isScanningInline = false;
 const totalFound = (sched?.length || 0) + (tui?.length || 0);
 showToast(totalFound > 0 ? `🔔 Đã quét và phát hiện ${totalFound} cảnh báo lịch học / điểm danh / học phí mới!` : '✨ Toàn bộ lịch học, điểm danh và học phí đã đồng bộ chuẩn xác.');
 }

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

 // Shift buckets: Sáng / Chiều / Tối (for the 7-day week grid)
 const SHIFTS = [
   { id: 'morning', label: '☀️ Sáng', sub: '05:00 – 11:59', defaultStart: '08:00', defaultEnd: '09:30' },
   { id: 'afternoon', label: '🌤️ Chiều', sub: '12:00 – 17:59', defaultStart: '14:00', defaultEnd: '15:30' },
   { id: 'evening', label: '🌙 Tối', sub: '18:00 – 23:59', defaultStart: '18:00', defaultEnd: '19:30' }
 ];
 function shiftOf(startTime) {
   if (!startTime) return 'evening';
   const h = Number(String(startTime).split(':')[0]);
   if (Number.isNaN(h)) return 'evening';
   if (h < 12) return 'morning';
   if (h < 18) return 'afternoon';
   return 'evening';
 }
 function sessionsForShiftCell(day, shiftId) {
   const weekIsos = new Set(calendarWeek.map((d) => d.iso));
   return filteredSessions
     .filter((session) => {
       const hasDateInThisWeek = session.session_date && weekIsos.has(session.session_date);
       const sameDay = hasDateInThisWeek
         ? session.session_date === day.iso
         : (!session.session_date || weekOffset === 0) && Number(session.day_of_week) === day.dayOfWeek;
       return sameDay && shiftOf(session.start_time) === shiftId;
     })
     .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
 }
 function quickAddSession(day, shift) {
   sessionPreset = {
     session_date: day.iso,
     day_of_week: day.dayOfWeek,
     day_name: ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][day.dayOfWeek],
     start_time: shift.defaultStart,
     end_time: shift.defaultEnd || '19:30'
   };
   handleOpenEdit(null);
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
 function resetWeek() {
   weekOffset = 0;
   selectedWeekDay = null;
   dayFilter = 'all';
 }

 onMount(() => {
 loadData();
 });

 async function loadData() {
 currentUser = getCurrentUser();
 const token = getAuthToken();
 if (!currentUser && token) {
   await verifySessionWithServer();
   currentUser = getCurrentUser();
 }
 allUsers = getAllUsers();
 if (sessions.length === 0) {
   sessions = getAllClassSessions();
 }
 attendanceRecords = getAllAttendanceRecords();
 teacherProfiles = getAllTeacherProfiles();
 if (currentUser?.role === 'student' || currentUser?.role === 'parent') {
 activeTabFilter = 'my_schedule';
 }

 const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
 fetch('/api/schedule', {
 headers,
 credentials: 'include'
 }).then(r => r.json()).then(data => {
 if (data.success && Array.isArray(data.sessions)) {
 sessions = data.sessions;
 }
 }).catch(err => console.error('Failed to load schedule from server:', err));

 if (currentUser && isTeacherOrAdmin(currentUser)) {
   fetch('/api/attendance', { headers, credentials: 'include' })
     .then(r => r.json())
     .then(data => {
       if (data.success && Array.isArray(data.records)) {
         attendanceRecords = data.records;
       }
     })
     .catch(() => {});

   fetch('/api/session-audit?include_catalog=0', { headers, credentials: 'include' })
     .then(r => r.json())
     .then(data => {
       if (data.success && Array.isArray(data.sessions)) {
         const map = {};
         for (const item of data.sessions) {
           if (item?.session?.id) map[item.session.id] = item;
         }
         sessionAuditById = map;
       }
     })
     .catch(() => {});
 }

 loadTeacherWorkflows();
 }

 async function handleSessionSaved(savedSession) {
   if (savedSession?.deleted && savedSession?.id) {
     try { deleteClassSession(savedSession.id, currentUser); } catch {}
     sessions = sessions.filter(s => s.id !== savedSession.id);
     showToast('🗑️ Đã xóa buổi học khỏi thời khóa biểu!');
     await loadData();
     return;
   }
   if (savedSession?.id) {
     try { upsertClassSessionInStore(savedSession); } catch {}
     const idx = sessions.findIndex(s => s.id === savedSession.id);
     if (idx >= 0) {
       const copy = [...sessions];
       copy[idx] = { ...copy[idx], ...savedSession };
       sessions = copy;
     } else {
       sessions = [savedSession, ...sessions];
     }
     showToast(`✅ Đã lưu buổi học "${savedSession.class_name}" (${savedSession.day_name || ''} ${savedSession.start_time}–${savedSession.end_time}) vào Cơ Sở Dữ Liệu!`);
   } else {
     showToast('✅ Đã lưu thời khóa biểu thành công!');
   }
   await loadData();
 }

 async function loadTeacherWorkflows() {
 if (typeof window === 'undefined') return;
 const token = getAuthToken();
 if (!currentUser || !isTeacherOrAdmin(currentUser)) return;
 try {
 const res = await fetch('/api/teachers/workflows', {
 headers: token ? { 'Authorization': `Bearer ${token}` } : {},
 credentials: 'include'
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
 const token = getAuthToken();
 try {
 const res = await fetch('/api/teachers/workflows', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...(token ? { 'Authorization': `Bearer ${token}` } : {})
 },
 credentials: 'include',
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
 setTimeout(() => toastMsg = '', 5000);
 }

 // Filtered Sessions
 let filteredSessions = $derived.by(() => {
 let list = sessions;

 if (currentUser && String(currentUser.role || '').toLowerCase() === 'student') {
 const uid = currentUser.id;
 const enrolledGrades = getUserEnrolledGrades(currentUser);
 list = list.filter(s =>
 (Array.isArray(s.student_ids) && s.student_ids.includes(uid)) ||
 (enrolledGrades.length > 0 && enrolledGrades.some(g =>
 s.grade_level === g ||
 String(s.class_name || '').toLowerCase().includes(String(g).toLowerCase())
 ))
 );
 } else if (activeTabFilter === 'my_schedule' && currentUser) {
 // Bước 3: "Lịch của tôi" lọc trên mảng sessions đã scope từ API (server đã lọc theo role).
 // Không dùng getSessionsForUser vì nó trả về mọi ca khi phụ huynh chưa liên kết con.
 const uid = currentUser.id;
 const role = String(currentUser.role || '').toLowerCase();
 if (role === 'teacher') {
 list = list.filter(s => [s.teacher_id, s.assistant_teacher_id, s.substitute_teacher_id].includes(uid));
 } else if (role === 'student') {
 list = list.filter(s => Array.isArray(s.student_ids) && s.student_ids.includes(uid));
 }
 // parent/manager: giữ nguyên list đã scope từ API
 } else if (activeTabFilter === 'primary') {
 list = list.filter(s => ['Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5'].includes(s.grade_level));
 } else if (activeTabFilter === 'secondary') {
 list = list.filter(s => ['Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9'].includes(s.grade_level));
 } else if (activeTabFilter === 'high_school') {
 list = list.filter(s => ['Lớp 10', 'Lớp 11', 'Lớp 12'].includes(s.grade_level) || String(s.class_id || '').includes('IELTS'));
 }

 if (dayFilter !== 'all') {
 list = list.filter(s => Number(s.day_of_week) === Number(dayFilter));
 }

 if (classFilter !== 'all') {
 list = list.filter(s => s.class_id === classFilter);
 }

 if (teacherFilter !== 'all') {
 list = list.filter(s => [s.teacher_id, s.assistant_teacher_id, s.substitute_teacher_id].includes(teacherFilter));
 }

 if (attendanceFilter !== 'all') {
 list = list.filter(s => {
   const att = getSessionAttendanceDetails(s);
   if (attendanceFilter === 'complete') return att.rollCallStatus === 'complete';
   if (attendanceFilter === 'incomplete') return att.rollCallStatus === 'incomplete';
   if (attendanceFilter === 'unmarked') return att.rollCallStatus === 'unmarked';
   if (attendanceFilter === 'has_late') return att.lateCount > 0;
   if (attendanceFilter === 'has_absent') return att.absentCount > 0;
   return true;
 });
 }

 // Sort by day of week then time
 return [...list].sort((a, b) => {
 const dayA = a.day_of_week === 0 ? 7 : a.day_of_week;
 const dayB = b.day_of_week === 0 ? 7 : b.day_of_week;
 if (dayA !== dayB) return dayA - dayB;
 return a.start_time.localeCompare(b.start_time);
 });
 });

 // Distinct classes / teachers for the filter dropdowns
 let classOptions = $derived.by(() => {
 const map = new Map();
 const source = currentUser?.role === 'student' ? filteredSessions : sessions;
 for (const s of source) {
 const id = s.class_id || s.class_name;
 if (!id) continue;
 if (!map.has(id)) map.set(id, { id, label: s.class_name || s.class_id });
 }
 return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
 });
 let teacherOptions = $derived.by(() => {
 const map = new Map();
 for (const s of sessions) {
 const pairs = [
 [s.teacher_id, s.teacher_name],
 [s.assistant_teacher_id, s.assistant_teacher_name],
 [s.substitute_teacher_id, s.substitute_teacher_name]
 ];
 for (const [id, name] of pairs) {
 if (!id || map.has(id)) continue;
 map.set(id, { id, label: name || id });
 }
 }
 return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
 });

 // Test schedule reminder notification via Zalo Bot Platform
 async function handleSendReminderNotification(session) {
 showToast(`🤖 Đang phát thông báo nhắc lịch học ca ${session.start_time} qua Zalo Bot (@bot.ynKabJAc)...`);
 const res = await triggerScheduleNotification(session.id);
 if (res.success) {
 const botMsg = res.dispatchResult?.message || '';
 showToast(`🚀 [Zalo Bot @bot.ynKabJAc • Đã Gửi Lúc ${res.notifyTime}]: Nhắc phụ huynh trước 10 phút ca "${session.class_name}" tại ${session.location}! ${botMsg}`);
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
 if (!id) return;
 const token = getAuthToken();
 if (token || currentUser) {
   try {
     const res = await fetch(`/api/schedule?id=${encodeURIComponent(id)}&force=1`, {
       method: 'DELETE',
       headers: token ? { 'Authorization': `Bearer ${token}` } : {},
       credentials: 'include'
     });
     const data = await res.json().catch(() => ({}));
     if (!res.ok && res.status !== 404 && !data.success) {
       showToast('Lỗi xóa: ' + (data.error || `mã ${res.status}`));
       return;
     }
   } catch (e) {
     showToast('Lỗi kết nối: ' + e.message);
     return;
   }
 }
 try { deleteClassSession(id, currentUser); } catch {}
 sessions = sessions.filter(s => s.id !== id);
 showToast(`🗑️ Đã xóa ca học "${name || id}" khỏi thời khóa biểu!`);
 await loadData();
 }

 function openStaffManagement(teacherId = null) {
 selectedTeacherId = teacherId || (currentUser?.role === 'teacher' ? currentUser.id : null);
 showStaffModal = true;
 }

 // Detailed attendance & roll-call completion status per session
 function getSessionAttendanceDetails(session) {
   if (!session) {
     return { enrolledCount: 0, markedCount: 0, presentCount: 0, lateCount: 0, absentCount: 0, rollCallStatus: 'unmarked' };
   }
   const auditItem = sessionAuditById[session.id];
   if (auditItem?.metrics) {
     const m = auditItem.metrics;
     return {
       enrolledCount: m.enrolled_count || (session.student_ids?.length || 0),
       markedCount: m.marked_count || 0,
       presentCount: m.present_count || 0,
       lateCount: m.late_count || 0,
       absentCount: m.total_absent_count || 0,
       rollCallStatus: m.roll_call_status || 'unmarked'
     };
   }
   const enrolledCount = session.student_ids?.length || 0;
   const sessRecords = attendanceRecords.filter(r => r.session_id === session.id);
   const targetDate = session.session_date || (sessRecords[0]?.session_date ?? new Date().toISOString().slice(0, 10));
   const scoped = sessRecords.filter(r => r.session_date === targetDate);
   const activeList = scoped.length > 0 ? scoped : sessRecords;
   const uniqueMap = new Map();
   for (const rec of activeList) {
     if (!uniqueMap.has(rec.student_id)) uniqueMap.set(rec.student_id, rec);
   }
   const list = Array.from(uniqueMap.values());
   const markedCount = list.length;
   const presentCount = list.filter(r => r.status === 'present').length;
   const lateCount = list.filter(r => r.status === 'late').length;
   const absentCount = list.filter(r => r.status === 'absent_excused' || r.status === 'absent_unexcused' || r.status === 'absent').length;
   let rollCallStatus = 'unmarked';
   if (markedCount > 0) {
     rollCallStatus = (enrolledCount > 0 && markedCount < enrolledCount) ? 'incomplete' : 'complete';
   }
   return { enrolledCount, markedCount, presentCount, lateCount, absentCount, rollCallStatus };
 }

 function getTodayAttendanceSummary(sessionId) {
 const sess = sessions.find(x => x.id === sessionId);
 const details = getSessionAttendanceDetails(sess);
 if (details.markedCount === 0) return null;
 return `${details.presentCount}/${details.markedCount} đúng giờ`;
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
 <button onclick={() => toastMsg = ''} class="text-emerald-500 hover:text-slate-900">✕</button>
 </div>
 {/if}

 <!-- Student Header Badge if logged in as student -->
 {#if currentUser?.role === 'student'}
 {@const isOfficial = currentUser.approval_status === 'official' || (currentUser.status === 'active' && !currentUser.is_trial && !currentUser.metadata?.includes('"is_trial":true'))}
 {@const primaryGrade = currentUser.grade || 'Chưa có lớp'}
 <div class="rounded-lg bg-indigo-50/80 border border-indigo-500/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
 <div class="flex items-center gap-3.5">
 <div class="w-11 h-11 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-700 font-bold flex items-center justify-center text-xl shadow-md">
 📅
 </div>
 <div class="space-y-0.5">
 <div class="text-sm font-bold text-slate-900 flex flex-wrap items-center gap-2">
 <span>Học Sinh: <strong class="text-indigo-700">{currentUser.name}</strong></span>
 {#if isOfficial}
 <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 font-bold border border-emerald-500/30">
 ✓ Học Sinh Chính Thức
 </span>
 {:else}
 <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 font-bold border border-amber-500/30">
 ⏳ Dùng Thử (Trial) • Chờ Cô Dung Duyệt
 </span>
 {/if}
 </div>
 <div class="text-xs text-slate-600">
 Tài khoản: <strong class="text-slate-900">@{currentUser.username}</strong> • Thời khóa biểu học trực tiếp tại nhà Cô Dung
 </div>
 </div>
 </div>
 <div class="sm:text-right bg-indigo-50/80 px-3.5 py-2 rounded-md border border-indigo-500/20">
 <div class="text-[10px] text-indigo-700 font-extrabold uppercase tracking-wider">Khối Lớp Đã Đăng Ký</div>
 <div class="text-sm font-semibold text-slate-900">{primaryGrade}</div>
 </div>
 </div>
 {/if}

 <!-- Compact Duolingo-Style Tactile Command Header -->
 <div class="rounded-2xl bg-white border-2 border-b-[3px] border-stone-200 p-4 sm:p-5 shadow-xs relative overflow-hidden">
 <div class="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
 <div class="space-y-1">
 <div class="flex flex-wrap items-center gap-1.5">
 <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-700 border border-emerald-500/30">
 THỜI KHÓA BIỂU &amp; ĐIỂM DANH LỚP HỌC
 </span>
 </div>
 <h1 class="text-xl sm:text-2xl font-heading font-extrabold text-slate-900">
 Lịch Học Tuần &amp; Sổ Điểm Danh 📅
 </h1>
 </div>

 <!-- Quick Action Buttons -->
 <div class="flex flex-wrap items-center gap-2">
 {#if currentUser && isTeacherOrAdmin(currentUser)}
 <button
 type="button"
 onclick={() => { sessionPreset = null; handleOpenEdit(null); }}
 class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-b-[3px] border-emerald-800 font-extrabold text-xs shadow-xs transition-all flex items-center gap-1.5"
 >
 <span>➕ Thêm Buổi Học Mới</span>
 </button>
 {/if}
 </div>
 </div>
 </div>

 <!-- Filter Ribbon -->
 {#if scheduleViewMode === 'all' || scheduleViewMode === 'calendar'}
 <section class="rounded-lg bg-white border border-slate-200 shadow-sm overflow-hidden" aria-label="Lịch tuần">
 <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
 <div>
 <div class="text-xs font-semibold uppercase tracking-wider text-emerald-700">Thời khóa biểu tuần — 7 ngày × ca Sáng / Chiều / Tối</div>
 <div class="text-sm font-semibold text-slate-900">
 {calendarWeek[0].date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – {calendarWeek[6].date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
 </div>
 </div>
 <div class="flex items-center gap-1">
 <button type="button" onclick={() => shiftWeek(-1)} class="w-9 h-9 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" aria-label="Tuần trước">‹</button>
 <button type="button" onclick={resetWeek} class="px-3 h-9 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold" aria-label="Tuần hiện tại">Hôm nay</button>
 <button type="button" onclick={() => shiftWeek(1)} class="w-9 h-9 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" aria-label="Tuần sau">›</button>
 </div>
 </div>
 <div class="overflow-x-auto">
 <div class="min-w-[760px]">
 <div class="grid grid-cols-[96px_repeat(7,minmax(96px,1fr))] border-b border-slate-200 bg-slate-50">
 <div class="p-2 text-[11px] font-semibold text-slate-500 self-center">Ca học</div>
 {#each calendarWeek as day}
 <button type="button" onclick={() => selectCalendarDay(day)} class="p-2 border-l border-slate-200 text-center {selectedWeekDay === day.iso ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-emerald-50'}">
 <span class="block text-[11px] font-semibold">{day.label}</span>
 <strong class="block text-sm">{day.date.getDate()}</strong>
 </button>
 {/each}
 </div>
 {#each SHIFTS as shift}
 <div class="grid grid-cols-[96px_repeat(7,minmax(96px,1fr))] min-h-24 border-b last:border-b-0 border-slate-100">
 <div class="p-2 bg-slate-50/70">
 <div class="text-xs font-bold text-slate-800">{shift.label}</div>
 <div class="text-[10px] text-slate-500">{shift.sub}</div>
 </div>
 {#each calendarWeek as day}
 {@const cellSessions = sessionsForShiftCell(day, shift.id)}
 <div class="p-1.5 border-l border-slate-100 group">
 {#each cellSessions as session}
 <div class="relative mb-1 group/sess">
 <button
 type="button"
 onclick={() => handleOpenEdit(session)}
 class="block w-full text-left rounded-md border border-emerald-200 bg-emerald-50 p-1.5 pr-6 text-[10px] leading-tight text-emerald-950 hover:bg-emerald-100"
 title="Sửa hoặc xóa buổi học này"
 >
 <strong class="block">{session.class_name}</strong>
 <span class="font-mono">{session.start_time}{#if session.end_time}–{session.end_time}{/if}</span>
 {#if session.teacher_name}<span class="block text-emerald-800">👩‍🏫 {session.teacher_name}</span>{/if}
 {#if session.location}<span class="block text-slate-500">📍 {session.location}</span>{/if}
 </button>
 {#if currentUser && isTeacherOrAdmin(currentUser)}
 <button
 type="button"
 onclick={(e) => { e.stopPropagation(); handleDelete(session.id, session.class_name); }}
 class="absolute top-1 right-1 w-5 h-5 rounded bg-rose-100 hover:bg-rose-600 text-rose-700 hover:text-white text-[10px] font-bold flex items-center justify-center transition-colors"
 title="Xóa nhanh buổi học này"
 aria-label="Xóa buổi học {session.class_name}"
 >
 ✕
 </button>
 {/if}
 </div>
 {/each}
 {#if currentUser && isTeacherOrAdmin(currentUser)}
 <button
 type="button"
 onclick={() => quickAddSession(day, shift)}
 class="w-full mt-0.5 rounded-md border border-dashed border-slate-300 text-slate-600 hover:text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50/60 text-[11px] font-bold py-2 min-h-[44px] md:opacity-0 md:group-hover:opacity-100 transition-opacity"
 title="Thêm buổi học ca {shift.label} ngày {day.label} {day.date.getDate()}"
 >
 ＋ Thêm
 </button>
 {/if}
 </div>
 {/each}
 </div>
 {/each}
 </div>
 </div>
 <div class="px-4 py-2 border-t border-slate-200 text-[11px] text-slate-500">Bấm vào buổi học để sửa • Bấm ngày trên đầu cột để lọc danh sách chi tiết bên dưới • Lịch phụ huynh chỉ gồm học sinh đã xác minh liên kết.</div>
 </section>
 {/if}

 <!-- Filter Ribbon -->
 <div class="rounded-lg bg-white border border-slate-200 p-4 shadow-sm space-y-3">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <!-- Tabs by Audience / Grade (Flex-Wrap, Zero Slide-Bar) -->
 <div class="flex flex-wrap items-center gap-1.5 pb-1 text-xs font-bold">
 {#if currentUser?.role === 'student'}
 <button
 onclick={() => activeTabFilter = 'my_schedule'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap bg-indigo-600 text-white shadow-sm"
 >
 👤 Lịch Học Của Tôi ({currentUser.grade || 'Đã Đăng Ký'})
 </button>
 {:else}
 <button
 onclick={() => activeTabFilter = 'all'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap {activeTabFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}"
 >
 🌟 Tất Cả Lớp ({sessions.length})
 </button>
 {#if currentUser}
 <button
 onclick={() => activeTabFilter = 'my_schedule'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap {activeTabFilter === 'my_schedule' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}"
 >
 👤 Lịch Học Của Tôi
 </button>
 {/if}
 <button
 onclick={() => activeTabFilter = 'primary'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap {activeTabFilter === 'primary' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}"
 >
 🎒 Tiểu Học (Lớp 1 - 5)
 </button>
 <button
 onclick={() => activeTabFilter = 'secondary'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap {activeTabFilter === 'secondary' ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}"
 >
 📚 THCS (Lớp 6 - 9)
 </button>
 <button
 onclick={() => activeTabFilter = 'high_school'}
 class="px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap {activeTabFilter === 'high_school' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}"
 >
 🎓 THPT &amp; IELTS (Lớp 10 - 12)
 </button>
 {/if}
 </div>

 <!-- Day Filter Pills (Flex-Wrap, Zero Slide-Bar) -->
 <div class="flex flex-wrap items-center gap-1 text-[11px] font-bold">
 <button
 onclick={() => dayFilter = 'all'}
 class="px-2.5 py-1 rounded-lg border {dayFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 Cả tuần
 </button>
 <button
 onclick={() => dayFilter = 1}
 class="px-2 py-1 rounded-lg border {dayFilter === 1 ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T2
 </button>
 <button
 onclick={() => dayFilter = 2}
 class="px-2 py-1 rounded-lg border {dayFilter === 2 ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T3
 </button>
 <button
 onclick={() => dayFilter = 3}
 class="px-2 py-1 rounded-lg border {dayFilter === 3 ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T4
 </button>
 <button
 onclick={() => dayFilter = 4}
 class="px-2 py-1 rounded-lg border {dayFilter === 4 ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T5
 </button>
 <button
 onclick={() => dayFilter = 5}
 class="px-2 py-1 rounded-lg border {dayFilter === 5 ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T6
 </button>
 <button
 onclick={() => dayFilter = 6}
 class="px-2 py-1 rounded-lg border {dayFilter === 6 ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 T7
 </button>
 <button
 onclick={() => dayFilter = 0}
 class="px-2 py-1 rounded-lg border {dayFilter === 0 ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600'}"
 >
 CN
 </button>
 </div>

 <!-- Class, Teacher & Attendance Status Filters -->
 <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs">
 <label class="flex items-center gap-2 flex-1">
 <span class="font-bold text-slate-600 whitespace-nowrap">🏫 Lớp:</span>
 <select
 bind:value={classFilter}
 class="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-semibold focus:outline-none focus:border-emerald-500"
 >
 <option value="all">Tất cả lớp ({classOptions.length})</option>
 {#each classOptions as c}
 <option value={c.id}>{c.label}</option>
 {/each}
 </select>
 </label>
 <label class="flex items-center gap-2 flex-1">
 <span class="font-bold text-slate-600 whitespace-nowrap">👩‍🏫 Giáo viên:</span>
 <select
 bind:value={teacherFilter}
 class="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-semibold focus:outline-none focus:border-emerald-500"
 >
 <option value="all">Tất cả giáo viên ({teacherOptions.length})</option>
 {#each teacherOptions as t}
 <option value={t.id}>{t.label}</option>
 {/each}
 </select>
 </label>
 {#if currentUser && isTeacherOrAdmin(currentUser)}
 <label class="flex items-center gap-2 flex-1">
 <span class="font-bold text-slate-600 whitespace-nowrap">📋 Điểm danh:</span>
 <select
 id="schedule-attendance-filter"
 bind:value={attendanceFilter}
 class="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-semibold focus:outline-none focus:border-emerald-500"
 >
 <option value="all">Tất cả trạng thái điểm danh</option>
 <option value="complete">✅ Đã điểm danh ĐỦ sĩ số</option>
 <option value="incomplete">⚠️ Điểm danh CHƯA ĐỦ sĩ số</option>
 <option value="unmarked">⏳ Chưa điểm danh</option>
 <option value="has_late">⏱️ Có học sinh Đi muộn</option>
 <option value="has_absent">❌ Có học sinh Vắng mặt</option>
 </select>
 </label>
 {/if}
 {#if classFilter !== 'all' || teacherFilter !== 'all' || attendanceFilter !== 'all'}
 <button
 type="button"
 onclick={() => { classFilter = 'all'; teacherFilter = 'all'; attendanceFilter = 'all'; }}
 class="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-bold hover:bg-rose-50 whitespace-nowrap"
 >
 ✕ Xóa lọc
 </button>
 {/if}
 </div>
 </div>
 </div>

 <!-- Sessions Grid -->
 <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {#each filteredSessions as s}
 {@const attDetails = getSessionAttendanceDetails(s)}
 {@const auditInfo = sessionAuditById[s.id]}
 {@const [startH, startM] = String(s.start_time || '00:00').split(':').map(Number)}
 {@const notifyMin = s.notify_minutes_before || 10}
 {@const notifyTotalMin = Math.max(0, startH * 60 + startM - notifyMin)}
 {@const notifyH = Math.floor(notifyTotalMin / 60)}
 {@const notifyM = notifyTotalMin % 60}
 {@const notifyTimeStr = `${String(notifyH).padStart(2, '0')}:${String(notifyM).padStart(2, '0')}`}

 <div class="rounded-lg bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">

 <!-- Header of Card -->
 <div class="space-y-2">
 <div class="flex items-center justify-between gap-2">
 <div class="flex items-center gap-1.5 flex-wrap">
 <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
 {s.grade_level}
 </span>
 {#if auditInfo?.metrics?.overall_suitability_pct !== undefined}
 <span class="px-2 py-0.5 rounded-full text-[10px] font-bold {auditInfo.metrics.overall_suitability_pct >= 80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : auditInfo.metrics.overall_suitability_pct >= 65 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
 🎯 {auditInfo.metrics.overall_suitability_pct}% phù hợp
 </span>
 {/if}
 </div>
 <div class="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-700">
 <span>{s.day_name}</span>
 <span>•</span>
 <span class="text-indigo-600">{s.start_time} - {s.end_time}</span>
 </div>
 </div>

 <h3 class="font-bold text-base text-slate-900 leading-snug">
 {s.class_name}
 </h3>

 <p class="text-xs text-slate-600 leading-relaxed">
 📖 <strong>Chủ đề:</strong> {s.subject_topic}
 </p>

 {#if auditInfo?.materials && (auditInfo.materials.vault_article_title || auditInfo.materials.drive_file_name || auditInfo.materials.drive_file_url)}
 <div class="p-2 rounded-xl bg-indigo-50/70 border border-indigo-200 text-[11px] text-indigo-950 space-y-1">
 {#if auditInfo.materials.drive_file_url}
 <div class="flex items-center justify-between gap-2">
   <span class="font-bold text-indigo-900 truncate">🔗 Bài giảng theo Link đã gắn</span>
   <a
     href={auditInfo.materials.drive_file_url}
     target="_blank"
     rel="noopener noreferrer"
     class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] whitespace-nowrap"
   >
     ↗ Mở Link
   </a>
 </div>
 {/if}
 {#if auditInfo.materials.vault_article_title}
 <div class="break-words">🧠 <strong>Kho Tri Thức:</strong> {auditInfo.materials.vault_article_title}</div>
 {/if}
 {#if auditInfo.materials.drive_file_name}
 <div class="break-words">📁 <strong>Drive:</strong> {auditInfo.materials.drive_file_name}</div>
 {/if}
 </div>
 {/if}

 <div class="text-[11px] text-slate-500 flex items-center gap-1.5">
 <span>📍</span>
 <span>{s.location}</span>
 </div>

 <div class="text-[11px] text-slate-500 flex items-center gap-1.5">
 <span>👩‍🏫</span>
 <span><strong>{s.teacher_name}</strong> &amp; {s.assistant_teacher_name || 'Trợ giảng'}</span>
 </div>
 </div>

 <!-- Detailed Attendance Roster -->
 <div class="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
 <div class="flex items-center justify-between text-[11px] text-slate-500">
 <span class="flex items-center gap-1 font-medium text-slate-700">
 <span>👥</span>
 <span>Sĩ số: <strong>{attDetails.enrolledCount}</strong> HS</span>
 </span>

 {#if attDetails.rollCallStatus === 'complete'}
 <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300">
 ✅ Điểm danh ĐỦ ({attDetails.markedCount}/{attDetails.enrolledCount || attDetails.markedCount})
 </span>
 {:else if attDetails.rollCallStatus === 'incomplete'}
 <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] border border-amber-300">
 ⚠️ Điểm danh THIẾU ({attDetails.markedCount}/{attDetails.enrolledCount})
 </span>
 {:else}
 <span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold text-[10px] border border-slate-200">
 ⏳ Chưa điểm danh
 </span>
 {/if}
 </div>

 {#if attDetails.markedCount > 0}
 <div class="flex items-center gap-1.5 flex-wrap text-[10px] font-bold">
 <span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
 ✓ Đúng giờ: {attDetails.presentCount}
 </span>
 <span class="px-2 py-0.5 rounded {attDetails.lateCount > 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-50 text-slate-500 border border-slate-200'}">
 ⏱️ Đi muộn: {attDetails.lateCount}
 </span>
 <span class="px-2 py-0.5 rounded {attDetails.absentCount > 0 ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-slate-50 text-slate-500 border border-slate-200'}">
 ✕ Vắng: {attDetails.absentCount}
 </span>
 </div>
 {/if}
 </div>

 <!-- Action Buttons -->
 <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
 {#if currentUser && isTeacherOrAdmin(currentUser)}
 <button
 type="button"
 onclick={() => handleOpenRollCall(s)}
 class="flex-1 py-2 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1"
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

 <button
 type="button"
 data-testid="schedule-delete-btn-{s.id}"
 onclick={() => handleDelete(s.id, s.class_name)}
 class="py-2 px-2.5 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-all flex items-center gap-1"
 title="Xóa buổi học"
 >
 <span>🗑️</span> <span>Xóa</span>
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
 preset={sessionPreset}
 existingSessions={sessions}
 onSaved={handleSessionSaved}
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
