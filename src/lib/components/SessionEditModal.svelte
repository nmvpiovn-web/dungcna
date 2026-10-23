<script>
 import { onMount, onDestroy } from 'svelte';
 import {
 getAllUsers,
 getCurrentUser,
 getAuthToken,
 getAllClassSessions,
 isTeacherOrAdmin,
 saveClassSession,
 deleteClassSession,
 upsertClassSessionInStore
 } from '$lib/unifiedStore';
 import { registerBusyState, unregisterBusyState } from '$lib/stores/appUpdate.js';

 let {
   isOpen = $bindable(false),
   session = null,
   preset = null,
   existingSessions = [],
   onSaved = () => {},
   onDeleted = () => {}
 } = $props();

 let currentUser = $state(null);
 let allStudents = $state([]);
 let allTeachers = $state([]);
 let isManager = $derived(['admin', 'superadmin', 'leader'].includes(String(currentUser?.role || '').toLowerCase()));
 let activeModalTab = $state('schedule'); // 'schedule' | 'materials' | 'summary' | 'all'
 let driveCatalog = $state([]);
 let vaultCatalog = $state([]);
 const DEFAULT_CAMPUSES = [
   { id: 'loc_codung', name: 'Nhà Cô Dung (42 Hiệp Bình)', address: '42 Hiệp Bình' },
   { id: 'loc_sunshine', name: 'Trung Tâm Tiếng Anh Sunshine (KDC Thanh Niên)', address: 'KDC Thanh Niên' },
   { id: 'loc_thayvu', name: 'Nhà Thầy Vũ (KDC Hồng Long)', address: 'KDC Hồng Long' }
 ];
 let campusesList = $state([...DEFAULT_CAMPUSES]);

 function formatCampusLabel(c) {
   if (!c) return 'Nhà Cô Dung (42 Hiệp Bình)';
   const name = String(c.name || '').trim();
   const addr = String(c.address || '').trim();
   if (!addr || name.includes('(') || name.toLowerCase().includes(addr.toLowerCase())) {
     return name;
   }
   return `${name} (${addr})`;
 }

 function normalizeLocationName(loc) {
   const raw = String(loc || '').trim();
   if (!raw || raw.includes('123 Phố Vọng')) return 'Nhà Cô Dung (42 Hiệp Bình)';
   if (raw.includes('Sunshine Academy') || raw.includes('Tây Hồ')) return 'Trung Tâm Tiếng Anh Sunshine (KDC Thanh Niên)';
   if (raw.includes('Học Liệu & Luyện Thi Thầy Vũ') || raw.includes('Cầu Giấy')) return 'Nhà Thầy Vũ (KDC Hồng Long)';
   return raw;
 }

 let auditForm = $state({
   vault_article_id: '',
   vault_article_title: '',
   drive_file_id: '',
   drive_file_name: '',
   drive_file_url: '',
   lesson_plan_content: '',
   manual_suitability_pct: 85,
   effectiveness_rating: 'good',
   effectiveness_notes: '',
   parent_interaction_notes: '',
   internal_interaction_notes: '',
   roadmap_recommendation: '',
   notify_internal: true
 });

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
 location: 'Nhà Cô Dung (42 Hiệp Bình)',
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
 const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
 return Number.isNaN(date.getTime()) ? null : date;
 }

 function defaultEndForStart(startTime) {
   const m = /^(\d{1,2}):(\d{2})$/.exec(String(startTime || '18:00').trim());
   if (!m) return '19:30';
   const totalMin = Math.min(23 * 60 + 50, Number(m[1]) * 60 + Number(m[2]) + 90);
   const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
   const mm = String(totalMin % 60).padStart(2, '0');
   return `${hh}:${mm}`;
 }

 function deriveClassId(gradeLevel, className, currentClassId) {
   if (currentClassId && String(currentClassId).trim()) return String(currentClassId).trim();
   const m = String(gradeLevel || className || '').match(/(\d{1,2})/);
   if (m) {
     const g = Number(m[1]);
     if (g === 12 && /ielts/i.test(String(className || ''))) return 'cls_g12_ielts';
     if (g >= 1 && g <= 12) return `cls_g${g}`;
   }
   return 'cls_g7';
 }

 function syncDateFromDay() {
 const dayOfWeek = Number(form.day_of_week);
 if (Number.isNaN(dayOfWeek)) return;
 const base = parseLocalDate(form.session_date) || new Date();
 base.setHours(12, 0, 0, 0);
 const mondayDistance = (base.getDay() + 6) % 7;
 base.setDate(base.getDate() - mondayDistance);
 const offsetFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
 base.setDate(base.getDate() + offsetFromMonday);
 form.session_date = formatLocalDate(base);
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

 function hasSlotConflict(candidateDate, candidateStart, candidateEnd, candidateRoom, candidateTeacherId, ignoreId = '') {
   const pool = (Array.isArray(existingSessions) && existingSessions.length > 0)
     ? existingSessions
     : getAllClassSessions();
   for (const s of pool) {
     if (!s || (ignoreId && s.id === ignoreId)) continue;
     if (s.status === 'cancelled') continue;
     if (s.session_date !== candidateDate) continue;
     const sStart = String(s.start_time || '00:00');
     const sEnd = String(s.end_time || '23:59');
     if (!(sStart < candidateEnd && sEnd > candidateStart)) continue;
     const sameTeacher = candidateTeacherId && [s.teacher_id, s.assistant_teacher_id, s.substitute_teacher_id].includes(candidateTeacherId);
     const sRoom = String(s.room_notes || s.room || '').trim().toLowerCase();
     const cRoom = String(candidateRoom || '').trim().toLowerCase();
     const sameRoom = cRoom && sRoom && cRoom === sRoom;
     if (sameTeacher || sameRoom) return true;
   }
   return false;
 }

 function pickNonConflictingSlot() {
   const candidateSlots = [
     ['18:00', '19:30', 'Phòng VIP 201'],
     ['19:35', '21:05', 'Phòng VIP 202'],
     ['16:00', '17:30', 'Phòng VIP 203'],
     ['14:00', '15:30', 'Phòng VIP 204'],
     ['08:00', '09:30', 'Phòng VIP 205'],
     ['09:45', '11:15', 'Phòng VIP 206'],
     ['21:10', '22:30', 'Phòng Online Zoom VIP']
   ];
   const dateStr = form.session_date;
   if (!dateStr) return;
   if (!hasSlotConflict(dateStr, form.start_time, form.end_time, form.room_notes, form.teacher_id, form.id)) {
     return;
   }
   for (const [st, et, rm] of candidateSlots) {
     if (!hasSlotConflict(dateStr, st, et, rm, form.teacher_id, form.id)) {
       form.start_time = st;
       form.end_time = et;
       form.room_notes = rm;
       return;
     }
   }
 }

 let wasOpen = false;

 $effect(() => {
 if (isOpen) {
 if (!wasOpen) {
 wasOpen = true;
 errorMessage = '';
 activeModalTab = 'schedule';
 currentUser = getCurrentUser();
 const users = getAllUsers();
 allTeachers = users.filter(u => ['teacher', 'superadmin', 'admin', 'leader'].includes(String(u.role || '').toLowerCase()));
 allStudents = users.filter(u => u.role === 'student');
 const token = getAuthToken();
 const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

 auditForm = {
   vault_article_id: session?.vault_article_id || '',
   vault_article_title: session?.vault_article_title || '',
   drive_file_id: session?.drive_file_id || '',
   drive_file_name: session?.drive_file_name || '',
   drive_file_url: session?.drive_file_url || '',
   lesson_plan_content: session?.lesson_plan_content || '',
   manual_suitability_pct: 85,
   effectiveness_rating: 'good',
   effectiveness_notes: '',
   parent_interaction_notes: '',
   internal_interaction_notes: '',
   roadmap_recommendation: '',
   notify_internal: true
 };

 fetch('/api/session-audit', { headers: authHeaders, credentials: 'include' })
 .then(r => r.json())
 .then(data => {
   if (data.success) {
     if (data.catalogs) {
       vaultCatalog = data.catalogs.vault_articles || [];
       driveCatalog = data.catalogs.drive_files || [];
     }
     if (session?.id && Array.isArray(data.sessions)) {
       const rep = data.sessions.find(item => item?.session?.id === session.id);
       if (rep) {
         auditForm = {
           vault_article_id: rep.materials?.vault_article_id || '',
           vault_article_title: rep.materials?.vault_article_title || '',
           drive_file_id: rep.materials?.drive_file_id || '',
           drive_file_name: rep.materials?.drive_file_name || '',
           drive_file_url: rep.materials?.drive_file_url || '',
           lesson_plan_content: rep.materials?.lesson_plan_content || '',
           manual_suitability_pct: rep.metrics?.manual_suitability_pct ?? rep.metrics?.overall_suitability_pct ?? 85,
           effectiveness_rating: rep.dossier?.effectiveness_evaluation?.rating || 'good',
           effectiveness_notes: rep.dossier?.effectiveness_evaluation?.notes || '',
           parent_interaction_notes: rep.dossier?.parent_interaction?.notes || '',
           internal_interaction_notes: rep.dossier?.internal_interaction_and_roadmap?.internal_notes || '',
           roadmap_recommendation: rep.dossier?.internal_interaction_and_roadmap?.roadmap_recommendation || '',
           notify_internal: true
         };
       }
     }
   }
 })
 .catch(() => {});

 fetch('/api/campuses', { headers: authHeaders, credentials: 'include' })
 .then(r => r.json())
 .then(data => {
  if (data.success && Array.isArray(data.campuses) && data.campuses.length > 0) {
   campusesList = data.campuses.map(c => ({
    ...c,
    name: normalizeLocationName(c.name)
   }));
  }
 })
 .catch(() => {});

 fetch('/api/students', { headers: authHeaders, credentials: 'include' })
 .then(r => r.json())
 .then(data => {
 if (data.success && Array.isArray(data.students)) {
 allStudents = data.students;
 }
 })
 .catch(() => {});

 fetch('/api/teachers/staff', { headers: authHeaders, credentials: 'include' })
 .then(r => r.json())
 .then(data => {
 if (data.success && Array.isArray(data.profiles) && data.profiles.length > 0) {
  const map = new Map(allTeachers.map(t => [t.id, t]));
  for (const p of data.profiles) {
   const tid = p.teacher_id || p.user_id || p.id;
   if (tid) {
    map.set(tid, {
     ...(map.get(tid) || {}),
     id: tid,
     name: p.teacher_name || p.username,
     username: p.username,
     role: 'teacher',
     role_title: p.role_title
    });
   }
  }
  allTeachers = Array.from(map.values());
 }
 })
 .catch(() => {});

 if (session) {
 const startT = session.start_time || '18:00';
 const endT = session.end_time || defaultEndForStart(startT);
 form = {
 ...session,
 location: normalizeLocationName(session.location),
 class_id: deriveClassId(session.grade_level, session.class_name, session.class_id),
 start_time: startT,
 end_time: endT,
 room_notes: session.room_notes || session.room || 'Phòng VIP 201',
 subject_topic: session.subject_topic || session.topic || 'Chuyên đề Ngữ pháp & Giao tiếp',
 student_ids: Array.isArray(session.student_ids) ? [...session.student_ids] : []
 };
 if (!form.session_date) {
   syncDateFromDay();
 } else {
   syncDayFromDate();
 }
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
 const presetStart = preset?.start_time || '18:00';
 const presetEnd = preset?.end_time || defaultEndForStart(presetStart);

 form = {
 id: '',
 class_id: 'cls_g7',
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
 location: 'Nhà Cô Dung (42 Hiệp Bình)',
 day_of_week: 1,
 day_name: 'Thứ Hai',
 session_date: '',
 start_time: presetStart,
 end_time: presetEnd,
 notify_minutes_before: 10,
 room_notes: 'Phòng VIP 201',
 status: 'scheduled',
 student_ids: [],
 ...(preset || {}),
 start_time: presetStart,
 end_time: presetEnd
 };
 if (!form.session_date) {
 syncDateFromDay();
 } else {
 syncDayFromDate();
 }
 pickNonConflictingSlot();
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

 function handleModalSelectVaultArticle(e) {
   const vid = e.currentTarget.value;
   auditForm.vault_article_id = vid;
   const found = vaultCatalog.find(v => v.id === vid);
   if (found) {
     auditForm.vault_article_title = found.title;
     if (!auditForm.lesson_plan_content.includes(found.title)) {
       auditForm.lesson_plan_content = `[Kho Tri Thức: ${found.title}]\n${auditForm.lesson_plan_content || ''}`.trim();
     }
   }
 }

 function handleModalSelectDriveFile(e) {
   const fid = e.currentTarget.value;
   auditForm.drive_file_id = fid;
   const found = driveCatalog.find(f => f.id === fid);
   if (found) {
     auditForm.drive_file_name = found.title_vi || found.name;
     if (found.webViewLink) {
       auditForm.drive_file_url = found.webViewLink;
     }
   }
 }

 let errorMessage = $state('');
 let saving = $state(false);
 let deleting = $state(false);

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

 async function resolveConflictAndSave() {
   pickNonConflictingSlot();
   await handleSave();
 }

 async function handleSave() {
 errorMessage = '';
 if (saving) return;
 if (!form.class_name || !form.class_name.trim()) {
 errorMessage = 'Vui lòng nhập tên khóa / lớp học.';
 return;
 }
 if (!form.start_time) {
 form.start_time = '18:00';
 }
 if (!form.end_time) {
 form.end_time = defaultEndForStart(form.start_time);
 }
 if (form.start_time >= form.end_time) {
 errorMessage = 'Giờ kết thúc phải sau giờ bắt đầu.';
 return;
 }

 if (!form.session_date) {
 syncDateFromDay();
 } else {
 syncDayFromDate();
 }

 form.class_id = deriveClassId(form.grade_level, form.class_name, form.class_id);

 const tObj = allTeachers.find(t => t.id === form.teacher_id);
 if (tObj) form.teacher_name = tObj.name;

 const aObj = allTeachers.find(t => t.id === form.assistant_teacher_id);
 if (aObj) form.assistant_teacher_name = aObj.name;
 else if (!form.assistant_teacher_id) form.assistant_teacher_name = '';

 const sObj = allTeachers.find(t => t.id === form.substitute_teacher_id);
 if (sObj) form.substitute_teacher_name = sObj.name;
 else if (!form.substitute_teacher_id) form.substitute_teacher_name = '';

 const token = getAuthToken();
 let savedData = { ...form };

 saving = true;
 try {
 if (token || currentUser) {
 let res = null;
 let lastNetErr = null;
 for (let attempt = 0; attempt < 2; attempt++) {
   try {
     res = await fetch('/api/schedule', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         ...(token ? { 'Authorization': `Bearer ${token}` } : {})
       },
       credentials: 'include',
       body: JSON.stringify({
         action: 'save_session',
         allow_upsert: true,
         ...form
       })
     });
     lastNetErr = null;
     break;
   } catch (netErr) {
     lastNetErr = netErr;
     if (attempt === 0) {
       await new Promise(r => setTimeout(r, 350));
     }
   }
 }
 if (lastNetErr || !res) {
   const savedFallback = saveClassSession(savedData, currentUser);
   try { upsertClassSessionInStore(savedFallback || savedData); } catch {}
   onSaved(savedFallback || savedData);
   isOpen = false;
   return;
 }
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.success) {
 errorMessage = data.error || `Lỗi máy chủ (${res.status})`;
 return;
 }
 if (data.session) {
   savedData = data.session;
 }

 const hasAuditInput = Boolean(
   form.id ||
   auditForm.drive_file_url ||
   auditForm.drive_file_id ||
   auditForm.drive_file_name ||
   auditForm.vault_article_id ||
   auditForm.vault_article_title ||
   auditForm.lesson_plan_content ||
   auditForm.effectiveness_notes ||
   auditForm.parent_interaction_notes ||
   auditForm.internal_interaction_notes ||
   auditForm.roadmap_recommendation
 );
 if (savedData?.id && hasAuditInput) {
   try {
     await fetch('/api/session-audit', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         ...(token ? { 'Authorization': `Bearer ${token}` } : {})
       },
       credentials: 'include',
       body: JSON.stringify({
         action: 'save_audit',
         session_id: savedData.id,
         ...auditForm
       })
     });
   } catch (auditErr) {
     console.warn('Session audit sync ignored:', auditErr);
   }
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

 async function handleDeleteSession() {
   if (!form.id || deleting || saving) return;
   errorMessage = '';
   deleting = true;
   const targetId = form.id;
   const token = getAuthToken();
   try {
     if (token || currentUser) {
       const res = await fetch(`/api/schedule?id=${encodeURIComponent(targetId)}&force=1`, {
         method: 'DELETE',
         headers: token ? { 'Authorization': `Bearer ${token}` } : {},
         credentials: 'include'
       });
       const data = await res.json().catch(() => ({}));
       if (!res.ok && res.status !== 404 && !data.success) {
         errorMessage = data.error || `Không thể xóa buổi học (${res.status})`;
         return;
       }
     }
     try { deleteClassSession(targetId, currentUser); } catch {}
     onDeleted(targetId);
     onSaved({ deleted: true, id: targetId });
     isOpen = false;
   } catch (err) {
     errorMessage = err.message || 'Lỗi kết nối khi xóa buổi học';
   } finally {
     deleting = false;
   }
 }
</script>

{#if isOpen}
 <div
 role="dialog"
 aria-modal="true"
 aria-labelledby="session-modal-title"
 class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-500/25 backdrop-blur-sm animate-in fade-in duration-200"
 >
 <div class="w-full max-w-2xl rounded-2xl bg-[#fdfbf7] border border-stone-200 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">

 <!-- Sticky Header -->
 <div class="shrink-0 border-b border-stone-200/80 px-6 py-3.5 bg-[#fdfbf7] space-y-3">
 <div class="flex items-start justify-between">
 <div>
 <span class="text-xs font-bold text-emerald-700 uppercase tracking-wider">
 {form.id ? 'CẬP NHẬT / XÓA THỜI KHÓA BIỂU' : 'THÊM BUỔI HỌC MỚI'}
 </span>
 <h2 id="session-modal-title" class="text-lg sm:text-xl font-black text-stone-900 mt-0.5">
 Thiết Lập Ca Học • Bài Giảng &amp; Tổng Kết Ca Dạy
 </h2>
 </div>
 <button
 onclick={() => isOpen = false}
 aria-label="Đóng"
 class="min-w-[40px] min-h-[40px] w-10 h-10 rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900 flex items-center justify-center font-bold transition-colors"
 >
 ✕
 </button>
 </div>

 <!-- Duolingo Tactile 3-Tab Segmented Switcher -->
 <div data-testid="session-modal-tabs" class="grid grid-cols-3 gap-2 text-xs font-extrabold">
   <button
     type="button"
     data-testid="session-modal-tab-schedule"
     onclick={() => activeModalTab = 'schedule'}
     class="px-3 py-2 rounded-xl border-2 border-b-[3px] transition-all flex items-center justify-center gap-1.5 {activeModalTab === 'schedule' ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs' : 'bg-white border-stone-200 text-stone-700 hover:border-emerald-300'}"
   >
     <span>📅</span>
     <span class="truncate">1. Ca Học &amp; Sĩ Số</span>
   </button>
   <button
     type="button"
     data-testid="session-modal-tab-materials"
     onclick={() => activeModalTab = 'materials'}
     class="px-3 py-2 rounded-xl border-2 border-b-[3px] transition-all flex items-center justify-center gap-1.5 {activeModalTab === 'materials' ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs' : 'bg-white border-stone-200 text-stone-700 hover:border-indigo-300'}"
   >
     <span>📚</span>
     <span class="truncate">2. Bài Giảng (Link/Drive)</span>
   </button>
   <button
     type="button"
     data-testid="session-modal-tab-summary"
     onclick={() => activeModalTab = 'summary'}
     class="px-3 py-2 rounded-xl border-2 border-b-[3px] transition-all flex items-center justify-center gap-1.5 {activeModalTab === 'summary' ? 'bg-amber-500 border-amber-600 text-stone-950 shadow-xs' : 'bg-white border-stone-200 text-stone-700 hover:border-amber-300'}"
   >
     <span>📊</span>
     <span class="truncate">3. Tổng Kết Ca Dạy</span>
   </button>
 </div>
 </div>

 <!-- Scrollable Modal Body -->
 <div class="flex-1 overflow-y-auto px-6 py-4 space-y-5">

 {#if errorMessage}
 <div data-testid="session-modal-error" role="alert" class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold space-y-2">
 <div>⚠️ {errorMessage}</div>
 {#if errorMessage.includes('Trùng lịch') || errorMessage.includes('Xung đột')}
 <button
   type="button"
   onclick={resolveConflictAndSave}
   class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm transition-all"
 >
   ⚡ Tự động xếp sang khung giờ/phòng trống kế tiếp &amp; Lưu ngay
 </button>
 {/if}
 </div>
 {/if}

 <!-- TAB 1: Form Grid (Ca Học & Sĩ Số) -->
 <div class:hidden={activeModalTab !== 'schedule'} class="space-y-5">
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

 <div class="sm:col-span-2 space-y-2">
 <label for="session-location" class="block font-bold text-stone-700 mb-1">Cơ Sở / Địa Điểm Học * (Đồng bộ D1)</label>
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
  <select
   id="session-location-select"
   data-testid="session-location-select"
   value={campusesList.some(c => formatCampusLabel(c) === form.location) ? form.location : '__custom__'}
   onchange={(e) => {
    if (e.currentTarget.value !== '__custom__') {
     form.location = e.currentTarget.value;
    }
   }}
   class="w-full bg-emerald-50/70 border border-emerald-300 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600 font-bold"
  >
   {#each campusesList as c (c.id)}
    {@const label = formatCampusLabel(c)}
    <option value={label}>📍 {label}</option>
   {/each}
   <option value="Online Zoom VIP">💻 Online Zoom VIP</option>
   <option value="__custom__">✏️ Nhập địa điểm tùy chỉnh...</option>
  </select>
  <input
   id="session-location"
   type="text"
   list="d1-campuses-datalist"
   bind:value={form.location}
   placeholder="Nhà Cô Dung (42 Hiệp Bình)..."
   class="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600 font-medium"
  />
 </div>
 <datalist id="d1-campuses-datalist">
  {#each campusesList as c (c.id)}
   <option value={formatCampusLabel(c)}></option>
  {/each}
 </datalist>
 {#if campusesList.length > 0}
  <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
   <span class="text-[10px] font-bold text-stone-500">Chọn nhanh Cơ sở:</span>
   {#each campusesList as c (c.id)}
    {@const label = formatCampusLabel(c)}
    <button
     type="button"
     data-testid="quick-campus-{c.id}"
     onclick={() => form.location = label}
     class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all {form.location === label || form.location.includes(c.name) ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-stone-700 border-stone-200 hover:border-emerald-400'}"
    >
     📍 {label}
    </button>
   {/each}
  </div>
 {/if}
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
 </div>

 <!-- TAB 2: Bài Giảng Theo Link, Nguồn Dán Thêm, Google Drive & Kho Tri Thức -->
 <div class:hidden={activeModalTab !== 'materials'} class="space-y-4 text-xs" data-testid="session-modal-materials-pane">
   <div class="p-3.5 rounded-2xl bg-indigo-50/70 border-2 border-indigo-200 space-y-3">
     <div class="flex items-center justify-between gap-2">
       <label for="session-lesson-link" class="font-extrabold text-indigo-950 flex items-center gap-1.5">
         <span>🔗</span>
         <span>1. Bài Giảng Theo Link (Google Docs/Slides, Canva, PDF, Video...):</span>
       </label>
       {#if auditForm.drive_file_url}
         <a
           href={auditForm.drive_file_url}
           target="_blank"
           rel="noopener noreferrer"
           class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-xs"
         >
           ↗ Mở Link Bài Giảng
         </a>
       {/if}
     </div>
     <input
       id="session-lesson-link"
       type="url"
       bind:value={auditForm.drive_file_url}
       placeholder="https://docs.google.com/presentation/... hoặc link bài giảng bất kỳ"
       class="w-full bg-white border border-indigo-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-indigo-600 font-medium"
     />
   </div>

   <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
     <div class="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-2">
       <label for="session-drive-select" class="block font-extrabold text-sky-950">
         📁 2. Chọn Bài Giảng Trên Google Drive ({driveCatalog.length}):
       </label>
       <select
         id="session-drive-select"
         value={auditForm.drive_file_id}
         onchange={handleModalSelectDriveFile}
         class="w-full bg-white border border-sky-200 rounded-xl px-3 py-2 text-stone-900 font-semibold focus:outline-none focus:border-sky-600"
       >
         <option value="">-- Chọn file từ Google Drive --</option>
         {#each driveCatalog as f}
           <option value={f.id}>{f.title_vi || f.name}</option>
         {/each}
       </select>
       <input
         id="session-drive-name"
         type="text"
         bind:value={auditForm.drive_file_name}
         placeholder="Tên hiển thị tài liệu Drive / Phiếu in..."
         class="w-full bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-stone-900"
       />
     </div>

     <div class="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
       <label for="session-vault-select" class="block font-extrabold text-purple-950">
         🧠 3. Chọn Giáo Án Kho Tri Thức ({vaultCatalog.length}):
       </label>
       <select
         id="session-vault-select"
         value={auditForm.vault_article_id}
         onchange={handleModalSelectVaultArticle}
         class="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-stone-900 font-semibold focus:outline-none focus:border-purple-600"
       >
         <option value="">-- Chọn bài giảng Kho Tri Thức --</option>
         {#each vaultCatalog as v}
           <option value={v.id}>{v.title} ({v.category || 'Chuyên đề'})</option>
         {/each}
       </select>
       <input
         id="session-vault-title"
         type="text"
         bind:value={auditForm.vault_article_title}
         placeholder="Tên chuyên đề / bài giảng chính..."
         class="w-full bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-stone-900"
       />
     </div>
   </div>

   <div class="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-2">
     <label for="session-lesson-source" class="block font-extrabold text-emerald-950">
       📋 4. Nguồn Bài Giảng Dán Thêm &amp; Nội Dung Giáo Án Chi Tiết:
     </label>
     <textarea
       id="session-lesson-source"
       rows="4"
       bind:value={auditForm.lesson_plan_content}
       placeholder="Dán trực tiếp nội dung bài giảng, từ vựng, cấu trúc ngữ pháp, kịch bản dạy hoặc ghi chú học liệu cho ca học này..."
       class="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:border-emerald-600"
     ></textarea>
   </div>
 </div>

 <!-- TAB 3: Tổng Kết Ca Dạy & Đánh Giá Chất Lượng -->
 <div class:hidden={activeModalTab !== 'summary'} class="space-y-4 text-xs" data-testid="session-modal-summary-pane">
   <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200">
     <div>
       <label for="session-suitability-pct" class="block font-extrabold text-stone-900 mb-1">
         🎯 Độ phù hợp học liệu &amp; đáp ứng ca dạy: <strong class="text-emerald-700 text-sm">{auditForm.manual_suitability_pct}%</strong>
       </label>
       <input
         id="session-suitability-pct"
         type="range"
         min="0"
         max="100"
         step="5"
         bind:value={auditForm.manual_suitability_pct}
         class="w-full accent-emerald-600"
       />
     </div>
     <div>
       <label for="session-effectiveness-rating" class="block font-extrabold text-stone-900 mb-1">
         ⭐ Xếp loại tổng kết ca dạy:
       </label>
       <select
         id="session-effectiveness-rating"
         bind:value={auditForm.effectiveness_rating}
         class="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-stone-900 font-bold"
       >
         <option value="excellent">🌟 Xuất sắc (Hiểu sâu &amp; hoàn thành tốt)</option>
         <option value="good">👍 Tốt (Đạt chuẩn mục tiêu bài giảng)</option>
         <option value="needs_improvement">🔧 Cần điều chỉnh (Cần củng cố thêm)</option>
         <option value="critical">🚨 Báo động (Cần dạy bù / kèm sát)</option>
       </select>
     </div>
   </div>

   <div>
     <label for="session-effectiveness-notes" class="block font-extrabold text-stone-800 mb-1">
       📝 Nhận Xét Tổng Kết Sau Ca Dạy (Mức độ tiếp thu của học sinh):
     </label>
     <textarea
       id="session-effectiveness-notes"
       rows="3"
       bind:value={auditForm.effectiveness_notes}
       placeholder="Ghi nhận kết quả sau ca dạy: Học sinh nắm bài tới đâu, phần nào làm tốt, phần nào cần lưu ý..."
       class="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
     ></textarea>
   </div>

   <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
     <div>
       <label for="session-parent-notes" class="block font-extrabold text-stone-800 mb-1">
         💬 Tương Tác Phụ Huynh:
       </label>
       <textarea
         id="session-parent-notes"
         rows="2"
         bind:value={auditForm.parent_interaction_notes}
         placeholder="Phản hồi với phụ huynh về chuyên cần, BTVN..."
         class="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
       ></textarea>
     </div>
     <div>
       <label for="session-roadmap-notes" class="block font-extrabold text-stone-800 mb-1">
         🚀 Đề Xuất Lộ Trình Buổi Tiếp Theo:
       </label>
       <textarea
         id="session-roadmap-notes"
         rows="2"
         bind:value={auditForm.roadmap_recommendation}
         placeholder="Hướng nâng cấp bài giảng / giao BTVN buổi tới..."
         class="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
       ></textarea>
     </div>
   </div>
 </div>

 </div>

 <!-- Sticky Bottom Call-to-Action Footer (Xóa / Thêm / Lưu luôn hiện ở cuối Popup) -->
 <div data-testid="modal-cta-footer" class="sticky bottom-0 z-20 shrink-0 px-6 py-3.5 border-t border-stone-200 bg-[#fdfbf7] shadow-[0_-4px_12px_rgba(28,25,23,0.06)] space-y-2.5">
    {#if errorMessage}
      <div role="alert" class="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span>⚠️ {errorMessage}</span>
        {#if errorMessage.includes('Trùng lịch') || errorMessage.includes('Xung đột')}
          <button
            type="button"
            onclick={resolveConflictAndSave}
            class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm transition-all whitespace-nowrap"
          >
            ⚡ Tự động đổi giờ/phòng trống &amp; Lưu ngay
          </button>
        {/if}
      </div>
    {/if}
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        {#if form.id}
          <button
            type="button"
            data-testid="session-modal-delete-btn"
            onclick={handleDeleteSession}
            disabled={saving || deleting}
            class="min-h-[42px] px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>🗑️</span>
            <span>{deleting ? 'Đang xóa...' : 'Xóa Buổi Học'}</span>
          </button>
        {/if}
      </div>
      <div class="flex items-center gap-2.5 ml-auto">
        <button
          type="button"
          onclick={() => isOpen = false}
          disabled={saving || deleting}
          class="min-h-[42px] px-4 py-2 rounded-xl border border-stone-300 text-stone-700 font-bold text-xs hover:bg-stone-100 disabled:opacity-50 transition-colors"
        >
          Hủy
        </button>
        <button
          type="button"
          data-testid="session-modal-save-btn"
          onclick={handleSave}
          disabled={saving || deleting}
          class="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-700/20 transition-all hover:scale-[1.01] disabled:opacity-50"
        >
          {saving ? '⏳ Đang lưu...' : (form.id ? '💾 Lưu Thay Đổi' : '➕ Thêm & Lưu Buổi Học')}
        </button>
      </div>
    </div>
 </div>
 </div>
 </div>
{/if}
