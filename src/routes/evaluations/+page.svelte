<script>
 import { onMount } from 'svelte';
 import {
 getAllUsers,
 getCurrentUser,
 isTeacherOrAdmin,
 getAllEvaluations,
 saveEvaluation,
 calculateAptitude,
 formatParentReportCard,
 dispatchBotReport,
 addStudent,
 removeStudent,
 getAssignedTeachersForStudent,
 assignTeachersToStudent,
 getStudentsForTeacher,
 getAttendanceStatsForStudent,
 TEACHER_ROLES
 } from '$lib/unifiedStore';
 import EvaluationDiscussion from '$lib/components/EvaluationDiscussion.svelte';

 let currentUser = $state(null);
 let students = $state([]);
 let evaluations = $state([]);
 let selectedStudent = $state(null);
 let activeTab = $state('evaluations'); // 'evaluations' | 'students'
 let teacherRoleFilter = $state('all'); // 'all' | 'my_students' | 'lead' | 'native' | 'assistant'

 // Modals
 let showEvalModal = $state(false);
 let showReportModal = $state(false);
 let showAddStudentModal = $state(false);
 let showAssignTeacherModal = $state(false);
 let studentToAssign = $state(null);
 let assignLeadTeacher = $state('usr_super_2');
 let assignNativeTeacher = $state('usr_teach_1');
 let assignAssistantTeacher = $state('usr_teach_2');
 let currentReportText = $state('');
 let currentEvalTarget = $state(null);
 let alertMessage = $state('');

 // Evaluation Form State
 let evalForm = $state({
 id: '',
 student_id: '',
 student_name: '',
 grade_level: 'Lớp 7',
 listening_score: 7.0,
 reading_score: 7.0,
 writing_score: 7.0,
 speaking_score: 7.0,
 grammar_vocab_score: 7.0,
 strengths: '',
 weaknesses: '',
 teacher_feedback: '',
 teacher_direct_feedback: '',
 leader_codung_feedback: '',
 attendance_rate: 100,
 attendance_summary: '',
 in_class_attitude_summary: '',
 action_plan: '',
 recommended_materials: '',
 parent_name: '',
 parent_phone: '',
 parent_zalo_id: '',
 linked_parent_id: ''
 });

 // New Student Form State
 let newStudentForm = $state({
 name: '',
 email: '',
 grade: 'Lớp 7',
 school: '',
 target: '',
 parent_name: '',
 parent_phone: '',
 parent_zalo_id: '',
 class_id: 'GLOBAL_SUCCESS_7A'
 });

 // Search & Filters
 let searchQuery = $state('');
 let filterAptitude = $state('all');

 onMount(() => {
 loadData();
 });

 function loadData() {
 currentUser = getCurrentUser();
 const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
 if (!currentUser || !token) {
 students = [];
 evaluations = [];
 return;
 }
 const users = getAllUsers();
 students = users.filter(u => u.role === 'student');
 if (students.length === 0) {
 students = [{ id: 'usr_student_demo', name: 'Gate Student' }];
 }
 evaluations = getAllEvaluations();

 if (token) {
 fetch('/api/evaluations', {
 headers: { 'Authorization': `Bearer ${token}` }
 }).then(r => r.json()).then(data => {
 if (data.success && Array.isArray(data.evaluations)) {
 evaluations = data.evaluations;
 }
 }).catch(() => {});
 }
 }

 function showAlert(msg) {
 alertMessage = msg;
 setTimeout(() => alertMessage = '', 4000);
 }

 // Open modal to evaluate a student
 function openEvaluationModal(student, existingEval = null) {
 selectedStudent = student;
 const users = getAllUsers();
 const attStats = getAttendanceStatsForStudent(student.id);

 if (existingEval) {
 evalForm = {
 ...existingEval,
 attendance_rate: existingEval.attendance_rate !== undefined ? existingEval.attendance_rate : attStats.attendance_rate,
 attendance_summary: existingEval.attendance_summary || `Chuyên cần: ${attStats.attendance_rate}% (${attStats.attended_sessions}/${attStats.total_sessions} buổi)`,
 in_class_attitude_summary: existingEval.in_class_attitude_summary || (attStats.in_class_attitude_notes.slice(-2).join(' • ') || 'Thái độ học tập chuyên cần, tập trung'),
 teacher_direct_feedback: existingEval.teacher_direct_feedback || existingEval.teacher_feedback || '',
 leader_codung_feedback: existingEval.leader_codung_feedback || 'Cô Dung duyệt kế hoạch: Tiếp tục phát huy năng lực phản xạ, bổ trợ chuyên sâu các đề thi định kỳ.'
 };
 } else {
 let meta = {};
 try { meta = JSON.parse(student.metadata || '{}'); } catch {}

 // Auto link parent
 let pName = meta.parent_name || '';
 let pPhone = meta.parent_phone || '';
 let pZalo = meta.parent_zalo_id || '';
 let pId = '';

 if (!pName) {
 const parentUser = users.find(u => {
 if (u.role !== 'parent') return false;
 let pMeta = {};
 try { pMeta = JSON.parse(u.metadata || '{}'); } catch {}
 return pMeta.linked_student_id === student.id || pMeta.linked_student_name === student.name;
 });
 if (parentUser) {
 pId = parentUser.id;
 pName = parentUser.name;
 pPhone = parentUser.phone || '';
 }
 }

 evalForm = {
 id: '',
 student_id: student.id,
 student_name: student.name,
 grade_level: meta.grade || 'Lớp 7',
 listening_score: 7.0,
 reading_score: 7.0,
 writing_score: 7.0,
 speaking_score: 7.0,
 grammar_vocab_score: 7.0,
 attendance_rate: attStats.attendance_rate,
 attendance_summary: `Chuyên cần: ${attStats.attendance_rate}% (${attStats.attended_sessions}/${attStats.total_sessions} buổi)`,
 in_class_attitude_summary: attStats.in_class_attitude_notes.slice(-2).join(' • ') || 'Thái độ học tập chuyên cần, tập trung và phát biểu tích cực',
 strengths: '',
 weaknesses: '',
 teacher_feedback: '',
 teacher_direct_feedback: '',
 leader_codung_feedback: 'Cô Dung duyệt kế hoạch: Tiếp tục phát huy năng lực phản xạ, bổ trợ chuyên sâu các đề thi định kỳ.',
 action_plan: '1. Làm bài tập bổ trợ 15 phút mỗi ngày.\n2. Luyện tập phản xạ nghe nói theo lộ trình.\n3. Tổng kết tiến độ gửi phụ huynh hàng tuần.',
 recommended_materials: 'Bộ bài tập bổ trợ & Audio kèm script',
 parent_name: pName,
 parent_phone: pPhone,
 parent_zalo_id: pZalo,
 linked_parent_id: pId
 };
 }
 showEvalModal = true;
 }

 async function handleSaveEvaluation() {
 if (!currentUser) return;
 const teacherName = currentUser.name || 'Giáo viên phụ trách';
 const teacherId = currentUser.id || 'usr_teacher';

 const feedback = evalForm.teacher_direct_feedback || evalForm.teacher_feedback || '';
 const payload = {
 ...evalForm,
 id: evalForm.id || `eval_${Date.now()}`,
 student_id: evalForm.student_id || selectedStudent?.id || 'usr_student_demo',
 student_name: evalForm.student_name || selectedStudent?.name || 'Gate Student',
 teacher_id: teacherId,
 teacher_name: teacherName,
 teacher_feedback: feedback
 };

 const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
 if (token) {
 try {
 const res = await fetch('/api/evaluations', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${token}`
 },
 body: JSON.stringify(payload)
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.success) {
 showAlert(`Lỗi lưu đánh giá: ${data.error || 'Máy chủ trả về mã lỗi ' + res.status}`);
 return;
 }
 if (data.evaluation) {
 Object.assign(payload, data.evaluation);
 }
 } catch (err) {
 showAlert(`Lỗi kết nối: ${err.message || err}`);
 return;
 }
 }

 const saved = saveEvaluation(payload, currentUser);
 loadData();
 showEvalModal = false;
 showAlert(`Đã lưu đánh giá năng lực cho học sinh ${saved.student_name}!`);
 }

 // View & Copy/Send Parent Report Card
 function openReportModal(evaluation) {
 currentEvalTarget = evaluation;
 currentReportText = formatParentReportCard(evaluation);
 showReportModal = true;
 }

 function copyReportText() {
 navigator.clipboard.writeText(currentReportText);
 showAlert('Đã sao chép nội dung báo cáo! Bạn có thể dán trực tiếp vào Zalo hoặc tin nhắn gửi phụ huynh.');
 }

 async function sendToZaloBot() {
 if (!currentEvalTarget) return;
 try {
 await dispatchBotReport('PARENT_REPORT_DISPATCHED', {
 student_name: currentEvalTarget.student_name,
 parent_name: currentEvalTarget.parent_name,
 parent_phone: currentEvalTarget.parent_phone,
 parent_zalo_id: currentEvalTarget.parent_zalo_id,
 report_text: currentReportText,
 dispatched_by: currentUser?.name
 });
 showAlert('🚀 Đã kích hoạt lệnh gửi báo cáo tự động đến Bot Zalo / Telegram!');
 } catch (err) {
 showAlert('Lỗi kết nối bot: ' + err.message);
 }
 }

 // Add new student
 function handleAddStudent() {
 if (!newStudentForm.name.trim()) {
 alert('Vui lòng nhập họ tên học sinh!');
 return;
 }
 const created = addStudent(newStudentForm);
 loadData();
 showAddStudentModal = false;
 showAlert(`Đã thêm học sinh mới: ${created.name}`);
 newStudentForm = {
 name: '',
 email: '',
 grade: 'Lớp 7',
 school: '',
 target: '',
 parent_name: '',
 parent_phone: '',
 parent_zalo_id: '',
 class_id: 'GLOBAL_SUCCESS_7A'
 };
 }

 function handleDeleteStudent(id, name) {
 if (confirm(`Bạn có chắc chắn muốn xóa học sinh "${name}" khỏi hệ thống?`)) {
 removeStudent(id);
 loadData();
 showAlert(`Đã xóa học sinh ${name}`);
 }
 }

 // Derived filtered evaluations
 let filteredEvaluations = $derived(
 evaluations.filter(e => {
 // Role-based privacy scoping
 if (currentUser?.role === 'student') {
 const sId = (currentUser.id || '').toLowerCase();
 const sName = (currentUser.name || '').toLowerCase();
 const uName = (currentUser.username || '').toLowerCase();
 const evId = (e.student_id || '').toLowerCase();
 const evName = (e.student_name || '').toLowerCase();
 const isMine = evId === sId || evName === sName || (uName && evName.includes(uName));
 if (!isMine) return false;
 } else if (currentUser?.role === 'parent') {
 let meta = {};
 try { meta = typeof currentUser.metadata === 'string' ? JSON.parse(currentUser.metadata) : (currentUser.metadata || {}); } catch {}
 const linkedId = (currentUser.linked_student_id || meta.linked_student_id || '').toLowerCase();
 const linkedName = (currentUser.linked_student_name || meta.linked_student_name || '').toLowerCase();
 const parentPhone = (currentUser.phone || meta.phone || '').replace(/[^0-9]/g, '');
 const evId = (e.student_id || '').toLowerCase();
 const evName = (e.student_name || '').toLowerCase();
 const evParentPhone = (e.parent_phone || '').replace(/[^0-9]/g, '');
 const isChild = (linkedId && evId === linkedId) ||
 (linkedName && evName === linkedName) ||
 (parentPhone && evParentPhone && evParentPhone === parentPhone);
 if (!isChild) return false;
 }

 const matchSearch = !searchQuery || e.student_name.toLowerCase().includes(searchQuery.toLowerCase()) || e.teacher_name.toLowerCase().includes(searchQuery.toLowerCase());
 const matchAptitude = filterAptitude === 'all' || e.primary_aptitude === filterAptitude;
 return matchSearch && matchAptitude;
 })
 );

 // Live aptitude preview in modal
 let liveAptitude = $derived(
 calculateAptitude({
 listening: Number(evalForm.listening_score) || 0,
 reading: Number(evalForm.reading_score) || 0,
 writing: Number(evalForm.writing_score) || 0,
 speaking: Number(evalForm.speaking_score) || 0,
 grammar: Number(evalForm.grammar_vocab_score) || 0
 })
 );

 let allTeachers = $derived(getAllUsers().filter(u => u.role === 'teacher' || u.role === 'superadmin'));

 let filteredStudents = $derived.by(() => {
 let list = students.filter(s => {
 if (!searchQuery) return true;
 const q = searchQuery.toLowerCase();
 return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
 });

 if (teacherRoleFilter === 'my_students' && currentUser) {
 list = list.filter(st => {
 const assigned = getAssignedTeachersForStudent(st);
 return assigned.some(a => a.teacher_id === currentUser.id || a.teacher_name === currentUser.name);
 });
 } else if (teacherRoleFilter === 'lead' && currentUser) {
 list = list.filter(st => {
 const assigned = getAssignedTeachersForStudent(st);
 return assigned.some(a => (a.teacher_id === currentUser.id || a.teacher_name === currentUser.name) && a.teacher_role === 'lead');
 });
 } else if (teacherRoleFilter === 'native' && currentUser) {
 list = list.filter(st => {
 const assigned = getAssignedTeachersForStudent(st);
 return assigned.some(a => (a.teacher_id === currentUser.id || a.teacher_name === currentUser.name) && a.teacher_role === 'native');
 });
 } else if (teacherRoleFilter === 'assistant' && currentUser) {
 list = list.filter(st => {
 const assigned = getAssignedTeachersForStudent(st);
 return assigned.some(a => (a.teacher_id === currentUser.id || a.teacher_name === currentUser.name) && a.teacher_role === 'assistant');
 });
 }

 return list;
 });

 function openAssignTeacherModal(student) {
 studentToAssign = student;
 const assigned = getAssignedTeachersForStudent(student);
 const lead = assigned.find(a => a.teacher_role === 'lead');
 const native = assigned.find(a => a.teacher_role === 'native');
 const assistant = assigned.find(a => a.teacher_role === 'assistant');

 assignLeadTeacher = lead?.teacher_id || 'usr_super_2';
 assignNativeTeacher = native?.teacher_id || 'usr_teach_1';
 assignAssistantTeacher = assistant?.teacher_id || 'usr_teach_2';
 showAssignTeacherModal = true;
 }

 function handleSaveTeacherAssignments() {
 if (!studentToAssign) return;

 const leadObj = allTeachers.find(u => u.id === assignLeadTeacher) || { name: 'Ms. Dung' };
 const nativeObj = allTeachers.find(u => u.id === assignNativeTeacher) || { name: 'Mr. Johnathan Miller' };
 const assistantObj = allTeachers.find(u => u.id === assignAssistantTeacher) || { name: 'Cô Nguyễn Hương' };

 const newAssignments = [
 {
 teacher_id: assignLeadTeacher,
 teacher_name: leadObj.name,
 teacher_role: 'lead',
 role_title: 'Giáo Viên Chính Thức (Lead)',
 alias: `[GV_CHINH_${(leadObj.username || 'CODUNG').toUpperCase()}]`,
 assigned_at: new Date().toISOString()
 },
 {
 teacher_id: assignNativeTeacher,
 teacher_name: nativeObj.name,
 teacher_role: 'native',
 role_title: 'Giáo Viên Bản Ngữ (Native Trainer)',
 alias: `[GV_BANNGU_${(nativeObj.username || 'JOHN').toUpperCase()}]`,
 assigned_at: new Date().toISOString()
 },
 {
 teacher_id: assignAssistantTeacher,
 teacher_name: assistantObj.name,
 teacher_role: 'assistant',
 role_title: 'Giáo Viên Hỗ Trợ / Trợ Giảng',
 alias: `[TROGIANG_${(assistantObj.username || 'HUONG').toUpperCase()}]`,
 assigned_at: new Date().toISOString()
 }
 ];

 assignTeachersToStudent(studentToAssign.id, newAssignments);
 loadData();
 showAssignTeacherModal = false;
 showAlert(`Đã cập nhật phân công 3 giáo viên quản lý cho học sinh ${studentToAssign.name}!`);
 }
</script>

<div class="space-y-6">
 <!-- Toast Alert -->
 {#if alertMessage}
 <div class="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm flex items-center justify-between shadow-lg">
 <div class="flex items-center gap-2">
 <span>✅</span>
 <span>{alertMessage}</span>
 </div>
 <button onclick={() => alertMessage = ''} class="text-emerald-900 hover:text-emerald-950">✕</button>
 </div>
 {/if}

 <!-- Student Header Badge if logged in as student -->
 {#if currentUser?.role === 'student'}
 {@const isOfficial = currentUser.approval_status === 'official' || (currentUser.status === 'active' && !currentUser.is_trial && !currentUser.metadata?.includes('"is_trial":true'))}
 {@const primaryGrade = currentUser.grade || 'Lớp 7'}
 <div class="rounded-2xl bg-white border border-cx-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
 <div class="flex items-center gap-3.5">
 <div class="w-11 h-11 rounded-2xl bg-cx-100 border border-cx-300 text-cx-900 font-bold flex items-center justify-center text-xl shadow-md">
 📊
 </div>
 <div class="space-y-0.5">
 <div class="text-sm font-bold text-slate-950 flex flex-wrap items-center gap-2">
 <span>Học Sinh: <strong class="text-cx-800">{currentUser.name}</strong></span>
 {#if isOfficial}
 <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold border border-emerald-300">
 ✓ Học Sinh Chính Thức
 </span>
 {:else}
 <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 font-bold border border-amber-300">
 ⏳ Dùng Thử (Trial) • Chờ Cô Dung Duyệt
 </span>
 {/if}
 </div>
 <div class="text-xs text-slate-400">
 Tài khoản: <strong class="text-slate-900">@{currentUser.username}</strong> • Sổ theo dõi đánh giá năng lực &amp; chuyên cần
 </div>
 </div>
 </div>
 <div class="sm:text-right bg-cx-50 px-3.5 py-2 rounded-xl border border-indigo-500/20">
 <div class="text-[10px] text-cx-800 font-extrabold uppercase tracking-wider">Khối Lớp Đã Đăng Ký</div>
 <div class="text-sm font-black text-slate-950">{primaryGrade}</div>
 </div>
 </div>
 {/if}

 <!-- Header Banner -->
 <div class="rounded-3xl bg-gradient-to-r from-white via-cx-50 to-white border border-cx-200 p-6 md:p-8 shadow-2xl relative overflow-hidden">
 <div class="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
 <div>
 <div class="flex items-center gap-2 mb-2">
 <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300">
 TIẾNG ANH CÔ DUNG • KHUNG ĐÁNH GIÁ 2026
 </span>
 <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-300">
 Tích Hợp Bot Zalo Phụ Huynh
 </span>
 </div>
 <h1 class="text-2xl md:text-3xl font-black tracking-tight text-slate-950">
 Tiếng Anh Cô Dung — Đánh Giá Năng Lực &amp; Kế Hoạch Cá Nhân Hóa
 </h1>
 <p class="text-sm text-slate-700 mt-2 max-w-3xl leading-relaxed">
 Cùng Cô Dung phân tích thiên hướng học tập (Nghe - Nói phản xạ vs. Đọc - Viết học thuật), xác định điểm mạnh/yếu,
 lập kế hoạch hành động 1-3 tháng và xuất phiếu báo cáo tự động chuyển tiếp tới Zalo phụ huynh.
 </p>
 </div>

 <!-- Action Buttons -->
 {#if currentUser && isTeacherOrAdmin(currentUser)}
 <div class="flex flex-wrap items-center gap-3">
 <button
 onclick={() => showAddStudentModal = true}
 class="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 font-bold text-xs flex items-center gap-2 border border-slate-700 transition-all shadow-md"
 >
 <span>➕ Thêm Học Sinh</span>
 </button>
 <button
 onclick={() => {
 if (students.length > 0) openEvaluationModal(students[0]);
 else alert('Vui lòng thêm học sinh trước khi đánh giá!');
 }}
 class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cx-600 hover:from-indigo-500 hover:to-cx-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all hover:scale-105"
 >
 <span>✍️ Tạo Đánh Giá Năng Lực Mới</span>
 </button>
 </div>
 {/if}
 </div>
 </div>

 <!-- Tabs Navigation -->
 {#if !currentUser}
 <div class="rounded-xl border border-cx-200 bg-white p-8 text-center shadow-sm">
 <h2 class="text-lg font-black text-slate-950">Đăng nhập để xem phiếu đánh giá</h2>
 <p class="mt-2 text-sm text-slate-700">Phiếu năng lực và thông tin phụ huynh chỉ hiển thị cho tài khoản đã được xác thực.</p>
 <a href="/login" class="mt-5 inline-flex min-h-11 items-center rounded-lg bg-cx-700 px-5 font-bold text-white hover:bg-cx-800">Đăng nhập</a>
 </div>
 {:else}
 <div class="flex items-center justify-between border-b border-slate-200 pb-3">
 <div class="flex items-center gap-2">
 <button
 onclick={() => activeTab = 'evaluations'}
 class="px-4 py-2 rounded-xl text-xs font-bold transition-all {activeTab === 'evaluations' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-700 hover:bg-cx-50 hover:text-cx-900 border border-slate-300'}"
 >
 📑 {currentUser?.role === 'student' ? 'Phiếu Đánh Giá Của Em' : (currentUser?.role === 'parent' ? 'Phiếu Đánh Giá Của Con' : 'Danh Sách Đánh Giá Đã Lưu')} ({filteredEvaluations.length})
 </button>
 {#if currentUser && isTeacherOrAdmin(currentUser)}
 <button
 onclick={() => activeTab = 'students'}
 class="px-4 py-2 rounded-xl text-xs font-bold transition-all {activeTab === 'students' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-700 hover:bg-cx-50 hover:text-cx-900 border border-slate-300'}"
 >
 👥 Danh Sách Học Sinh ({students.length})
 </button>
 {/if}
 </div>

 <!-- Aptitude Filter (Only on evaluations tab) -->
 {#if activeTab === 'evaluations'}
 <div class="flex items-center gap-2">
 <select
 bind:value={filterAptitude}
 class="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
 >
 <option value="all">🔍 Tất Cả Thiên Hướng</option>
 <option value="listening_speaking">🎧 Thiên về Nghe - Nói</option>
 <option value="reading_writing">📖 Thiên về Đọc - Viết</option>
 <option value="analytical_grammar">🧠 Phân Tích Ngữ Pháp</option>
 <option value="polyglot_gifted">🌟 Năng Khiếu Toàn Diện</option>
 <option value="foundational_reinforce">🛡️ Cần Củng Cố Nền Tảng</option>
 </select>
 </div>
 {/if}
 </div>

 <!-- TAB 1: EVALUATIONS LIST -->
 {#if activeTab === 'evaluations'}
 {#if filteredEvaluations.length === 0}
 <div class="p-12 text-center rounded-2xl bg-white border border-slate-200 space-y-3">
 {#if currentUser?.role === 'student'}
 <div class="text-4xl">🌱</div>
 <h3 class="text-lg font-bold text-slate-900">Em chưa có bản đánh giá năng lực định kỳ nào</h3>
 <p class="text-xs text-slate-600 max-w-md mx-auto">Giáo viên phụ trách và Cô Dung sẽ cập nhật đánh giá 4 kỹ năng (Nghe - Nói - Đọc - Viết) và nhận xét sổ đầu bài sau buổi học hoặc bài kiểm tra.</p>
 <div class="pt-2">
 <a
 href="/exam"
 class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition-all"
 >
 <span>⚡ Làm Bài Đánh Giá Năng Lực Đầu Vào</span>
 </a>
 </div>
 {:else if currentUser?.role === 'parent'}
 <div class="text-4xl">👨‍👩‍👧</div>
 <h3 class="text-lg font-bold text-slate-900">Chưa có bản đánh giá của con em</h3>
 <p class="text-xs text-slate-600 max-w-md mx-auto">Giáo viên phụ trách đang tổng hợp kết quả học tập và nhận xét năng khiếu. Quý phụ huynh vui lòng quay lại sau ca học gần nhất.</p>
 {:else}
 <div class="text-4xl mb-3">📋</div>
 <h3 class="text-lg font-bold text-slate-900">Chưa có bản đánh giá nào phù hợp</h3>
 <p class="text-xs text-slate-600 mt-1">Hãy bấm "Tạo Đánh Giá Năng Lực Mới" để bắt đầu ghi nhận năng khiếu học sinh.</p>
 {/if}
 </div>
 {:else}
 <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {#each filteredEvaluations as ev}
 {@const apt = calculateAptitude({
 listening: ev.listening_score,
 reading: ev.reading_score,
 writing: ev.writing_score,
 speaking: ev.speaking_score,
 grammar: ev.grammar_vocab_score
 })}
 <div class="rounded-2xl bg-white border border-slate-200 p-6 flex flex-col justify-between shadow-xl hover:border-slate-700 transition-all">
 <div>
 <!-- Top Row: Student info & Aptitude Badge -->
 <div class="flex items-start justify-between gap-4 mb-4">
 <div>
 <div class="flex items-center gap-2">
 <h3 class="font-extrabold text-base text-slate-950">{ev.student_name}</h3>
 <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-semibold border border-slate-700">
 {ev.grade_level}
 </span>
 </div>
 <div class="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
 <span>👨‍🏫 GV: <strong class="text-slate-900">{ev.teacher_name}</strong></span>
 <span>•</span>
 <span>{new Date(ev.created_at).toLocaleDateString('vi-VN')}</span>
 </div>
 </div>

 <!-- Aptitude Badge -->
 <span class="text-[11px] font-bold px-2.5 py-1 rounded-xl border {apt.badgeColor} text-right">
 {apt.label}
 </span>
 </div>

 <!-- 5-Skill Score Radar Bars -->
 <div class="space-y-2 py-3 border-y border-slate-200 my-3">
 <div class="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
 Điểm số 5 Kỹ Năng Đo Lường (Thang điểm 10):
 </div>

 <div class="grid grid-cols-5 gap-2 text-center text-xs">
 <div class="p-2 rounded-xl bg-cx-50 border border-cx-200">
 <div class="text-[10px] text-slate-700">🎧 Nghe</div>
 <div class="font-black text-cx-400 text-sm">{ev.listening_score}</div>
 </div>
 <div class="p-2 rounded-xl bg-cx-50 border border-cx-200">
 <div class="text-[10px] text-slate-700">📖 Đọc</div>
 <div class="font-black text-cx-400 text-sm">{ev.reading_score}</div>
 </div>
 <div class="p-2 rounded-xl bg-cx-50 border border-cx-200">
 <div class="text-[10px] text-slate-700">✍️ Viết</div>
 <div class="font-black text-purple-400 text-sm">{ev.writing_score}</div>
 </div>
 <div class="p-2 rounded-xl bg-cx-50 border border-cx-200">
 <div class="text-[10px] text-slate-700">🗣️ Nói</div>
 <div class="font-black text-rose-400 text-sm">{ev.speaking_score}</div>
 </div>
 <div class="p-2 rounded-xl bg-cx-50 border border-cx-200">
 <div class="text-[10px] text-slate-700">🧠 Ngữ Pháp</div>
 <div class="font-black text-amber-400 text-sm">{ev.grammar_vocab_score}</div>
 </div>
 </div>
 </div>

 <!-- Strengths & Weaknesses Preview -->
 <div class="space-y-2 text-xs">
 {#if ev.strengths}
 <div class="text-slate-800">
 <strong class="text-emerald-800">💪 Điểm mạnh:</strong> {ev.strengths}
 </div>
 {/if}
 {#if ev.weaknesses}
 <div class="text-slate-800">
 <strong class="text-rose-400">⚠️ Điểm cần khắc phục:</strong> {ev.weaknesses}
 </div>
 {/if}
 {#if ev.action_plan}
 <div class="text-slate-800 bg-indigo-50 p-2.5 rounded-xl border border-indigo-500/20">
 <strong class="text-indigo-800">🚀 Kế hoạch hành động cụ thể:</strong>
 <div class="whitespace-pre-line text-slate-800 mt-1">{ev.action_plan}</div>
 </div>
 {/if}
 </div>

 <!-- Attendance & In-Class Log Pill -->
 <div class="p-3 rounded-2xl bg-white border border-slate-200 space-y-1.5 text-xs my-3">
 <div class="flex items-center justify-between text-[11px]">
 <span class="text-emerald-800 font-bold flex items-center gap-1">
 <span>⏱️</span>
 <span>{ev.attendance_summary || 'Chuyên cần: 100%'}</span>
 </span>
 <span class="text-slate-500 font-mono">Tỷ lệ: {ev.attendance_rate || 100}%</span>
 </div>
 {#if ev.in_class_attitude_summary}
 <div class="text-[11px] text-slate-400 italic">
 📓 <strong>Sổ đầu bài:</strong> {ev.in_class_attitude_summary}
 </div>
 {/if}
 </div>

 <!-- Leader Cô Dung & Teacher Dual Feedback -->
 <div class="space-y-2 text-xs mb-3">
 {#if ev.teacher_direct_feedback || ev.teacher_feedback}
 <div class="p-3 rounded-2xl bg-teal-50 border border-teal-200 text-slate-800">
 <strong class="text-teal-400 block mb-0.5">👩‍🏫 Nhận xét giáo viên ({ev.teacher_name}):</strong>
 {ev.teacher_direct_feedback || ev.teacher_feedback}
 </div>
 {/if}

 {#if ev.leader_codung_feedback}
 <div class="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950">
 <strong class="text-amber-400 block mb-0.5">👑 Định hướng chuyên môn từ Cô Dung Leader:</strong>
 {ev.leader_codung_feedback}
 </div>
 {/if}
 </div>

 <!-- Interactive Discussion & Rebuttal Area -->
 <EvaluationDiscussion evaluationId={ev.id} studentName={ev.student_name} />
 </div>

 <!-- Footer Actions -->
 <div class="mt-5 pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
 <div class="text-[11px] text-slate-400 flex items-center gap-1.5">
 <span>📱 Phụ huynh: <strong>{ev.parent_name || 'Chưa cập nhật'}</strong></span>
 {#if ev.parent_phone && currentUser?.role !== 'student'}
 <span class="text-slate-500">({ev.parent_phone})</span>
 {/if}
 </div>

 <div class="flex items-center gap-2">
 {#if currentUser && isTeacherOrAdmin(currentUser)}
 <button
 onclick={() => openEvaluationModal({ id: ev.student_id, name: ev.student_name }, ev)}
 class="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 text-xs font-semibold"
 >
 Sửa
 </button>
 {/if}
 <button
 onclick={() => openReportModal(ev)}
 class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
 >
 <span>📲 Phiếu Báo Cáo Zalo</span>
 </button>
 </div>
 </div>
 </div>
 {/each}
 </div>
 {/if}
 {/if}

 <!-- TAB 2: STUDENTS ROSTER -->
 {#if activeTab === 'students'}
 <div class="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xl">
 <!-- Filter Bar for Teachers -->
 <div class="p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
 <div class="flex items-center gap-1.5 overflow-x-auto">
 <span class="font-bold text-slate-700 uppercase text-[10px]">Phân Luồng Học Sinh:</span>
 <button
 onclick={() => teacherRoleFilter = 'all'}
 class="px-2.5 py-1 rounded-lg font-bold border transition-all {teacherRoleFilter === 'all' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}"
 >
 Tất Cả ({students.length})
 </button>
 <button
 onclick={() => teacherRoleFilter = 'my_students'}
 class="px-2.5 py-1 rounded-lg font-bold border transition-all {teacherRoleFilter === 'my_students' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}"
 >
 🎯 Thuộc Quản Lý Của Tôi
 </button>
 <button
 onclick={() => teacherRoleFilter = 'lead'}
 class="px-2.5 py-1 rounded-lg font-bold border transition-all {teacherRoleFilter === 'lead' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}"
 >
 👑 Phụ Trách Chính (Lead)
 </button>
 <button
 onclick={() => teacherRoleFilter = 'native'}
 class="px-2.5 py-1 rounded-lg font-bold border transition-all {teacherRoleFilter === 'native' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}"
 >
 🗣️ Bản Ngữ (Native)
 </button>
 <button
 onclick={() => teacherRoleFilter = 'assistant'}
 class="px-2.5 py-1 rounded-lg font-bold border transition-all {teacherRoleFilter === 'assistant' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}"
 >
 🤝 Trợ Giảng / Hỗ Trợ
 </button>
 </div>

 <button
 onclick={() => showAddStudentModal = true}
 class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
 >
 ➕ Thêm Học Sinh Mới
 </button>
 </div>

 <div class="overflow-x-auto">
 <table class="w-full text-left text-xs text-slate-700">
 <thead class="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
 <tr>
 <th class="p-3">Học Sinh</th>
 <th class="p-3">Khối Lớp &amp; Trường</th>
 <th class="p-3">Đội Ngũ Giáo Viên (1 HS = 2-3 GV)</th>
 <th class="p-3">Mục Tiêu Lộ Trình</th>
 <th class="p-3">Thông Tin Phụ Huynh</th>
 <th class="p-3 text-right">Thao Tác</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-slate-200">
 {#each filteredStudents as s}
 {@const meta = JSON.parse(s.metadata || '{}')}
 {@const assigned = getAssignedTeachersForStudent(s)}
 <tr class="hover:bg-slate-50 transition-colors">
 <td class="p-3 flex items-center gap-2.5 font-bold text-slate-900">
 <img src={s.avatar} alt="" class="w-8 h-8 rounded-full object-cover ring-1 ring-slate-300" />
 <div>
 <div>{s.name}</div>
 <div class="text-[10px] text-slate-700 font-normal">{s.email}</div>
 </div>
 </td>
 <td class="p-3">
 <span class="font-semibold text-slate-800">{meta.grade || 'Lớp 7'}</span>
 {#if meta.school}
 <div class="text-[10px] text-slate-700">{meta.school}</div>
 {/if}
 </td>
 <td class="p-3">
 <div class="space-y-1">
 {#each assigned as a}
 <div class="text-[10px] flex items-center gap-1">
 <span>{a.teacher_role === 'lead' ? '👑' : (a.teacher_role === 'native' ? '🗣️' : '🤝')}</span>
 <span class="font-semibold text-slate-800">{a.teacher_name}</span>
 <span class="text-indigo-600 font-mono text-[9px]">{a.alias}</span>
 </div>
 {/each}
 <button
 type="button"
 onclick={() => openAssignTeacherModal(s)}
 class="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-0.5 mt-0.5"
 >
 <span>⚙️ Phân công GV</span>
 </button>
 </div>
 </td>
 <td class="p-3">
 <span class="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-700 font-medium">
 {meta.target || 'Nâng cao toàn diện'}
 </span>
 </td>
 <td class="p-3">
 <div class="font-medium text-slate-800">{meta.parent_name || '—'}</div>
 <div class="text-[10px] text-slate-700">SĐT: {meta.parent_phone || '—'}</div>
 {#if meta.parent_zalo_id}
 <div class="text-[10px] text-emerald-600">Zalo: {meta.parent_zalo_id}</div>
 {/if}
 </td>
 <td class="p-3 text-right space-x-2">
 <button
 onclick={() => openEvaluationModal(s)}
 class="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
 >
 Đánh Giá
 </button>
 <button
 onclick={() => handleDeleteStudent(s.id, s.name)}
 class="px-2 py-1 rounded bg-rose-600/10 hover:bg-rose-600/20 text-rose-600 font-bold"
 >
 Xóa
 </button>
 </td>
 </tr>
 {/each}
 </tbody>
 </table>
 </div>
 </div>
 {/if}
 {/if}

 <!-- MODAL 1: EVALUATION EDITOR -->
 {#if showEvalModal}
 <div class="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" role="presentation" onclick={() => showEvalModal = false}>
 <div class="evaluation-modal bg-white border-2 border-cx-200 rounded-2xl w-full max-w-4xl shadow-2xl max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col text-slate-900" role="dialog" aria-modal="true" aria-labelledby="evaluation-modal-title" tabindex="-1" onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()}>
 <!-- Header -->
 <div class="flex items-start justify-between gap-4 border-b border-cx-200 bg-cx-50 p-4 sm:px-6 shrink-0">
 <div>
 <span class="text-xs font-extrabold text-cx-800">BIỂU MẪU ĐÁNH GIÁ NĂNG KHIẾU &amp; LẬP KẾ HOẠCH</span>
 <h2 id="evaluation-modal-title" class="text-lg sm:text-xl font-black text-slate-950 mt-1">Đánh Giá Học Sinh: {evalForm.student_name}</h2>
 </div>
 <button type="button" onclick={() => showEvalModal = false} class="min-h-11 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 text-sm font-extrabold shadow-sm" aria-label="Đóng bảng đánh giá">✕ Đóng</button>
 </div>

 <div class="overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">

 <!-- Live Aptitude Preview Banner -->
 <div class="p-4 rounded-xl border border-cx-300 bg-cx-50 text-cx-950 flex items-center justify-between gap-4">
 <div>
 <div class="text-xs font-bold uppercase tracking-wider">Hệ Thống Tự Động Định Hình Thiên Hướng:</div>
 <div class="text-base font-black mt-0.5">{liveAptitude.label}</div>
 <div class="text-xs mt-1 opacity-90">{liveAptitude.description}</div>
 </div>
 <div class="text-3xl">🎯</div>
 </div>

 <!-- 5-Skill Sliders -->
 <div class="space-y-4 bg-white p-4 sm:p-5 rounded-xl border-2 border-slate-200 shadow-sm">
 <div class="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
 Thang Điểm 5 Kỹ Năng Độc Lập (0.0 - 10.0):
 </div>

 <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
 <!-- Listening -->
 <div>
 <div class="flex justify-between font-bold text-slate-900 mb-1">
 <span>🎧 Kỹ năng Nghe (Listening)</span>
 <span class="text-cx-800 font-extrabold">{evalForm.listening_score}</span>
 </div>
 <input type="range" min="0" max="10" step="0.5" bind:value={evalForm.listening_score} class="w-full accent-cx-500" />
 </div>

 <!-- Reading -->
 <div>
 <div class="flex justify-between font-bold text-slate-900 mb-1">
 <span>📖 Kỹ năng Đọc (Reading)</span>
 <span class="text-cx-800 font-extrabold">{evalForm.reading_score}</span>
 </div>
 <input type="range" min="0" max="10" step="0.5" bind:value={evalForm.reading_score} class="w-full accent-cx-500" />
 </div>

 <!-- Writing -->
 <div>
 <div class="flex justify-between font-bold text-slate-900 mb-1">
 <span>✍️ Kỹ năng Viết (Writing)</span>
 <span class="text-purple-800 font-extrabold">{evalForm.writing_score}</span>
 </div>
 <input type="range" min="0" max="10" step="0.5" bind:value={evalForm.writing_score} class="w-full accent-purple-500" />
 </div>

 <!-- Speaking -->
 <div>
 <div class="flex justify-between font-bold text-slate-900 mb-1">
 <span>🗣️ Kỹ năng Nói (Speaking)</span>
 <span class="text-rose-800 font-extrabold">{evalForm.speaking_score}</span>
 </div>
 <input type="range" min="0" max="10" step="0.5" bind:value={evalForm.speaking_score} class="w-full accent-rose-500" />
 </div>

 <!-- Grammar -->
 <div class="md:col-span-2">
 <div class="flex justify-between font-bold text-slate-900 mb-1">
 <span>🧠 Ngữ Pháp &amp; Từ Vựng (Grammar &amp; Vocabulary)</span>
 <span class="text-amber-800 font-extrabold">{evalForm.grammar_vocab_score}</span>
 </div>
 <input type="range" min="0" max="10" step="0.5" bind:value={evalForm.grammar_vocab_score} class="w-full accent-amber-500" />
 </div>
 </div>
 </div>

 <!-- Qualitative Details -->
 <div class="space-y-4 text-xs">
 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label class="block font-extrabold text-slate-900 mb-1">💪 Điểm Mạnh Nổi Bật:</label>
 <textarea
 bind:value={evalForm.strengths}
 rows="2"
 placeholder="VD: Khả năng phản xạ âm thanh tốt, vốn từ vựng phong phú, tự tin giao tiếp..."
 class="w-full bg-white border-2 border-slate-300 rounded-lg p-3 text-slate-950 placeholder:text-slate-500 focus:outline-none focus:border-cx-600"
 ></textarea>
 </div>
 <div>
 <label class="block font-extrabold text-slate-900 mb-1">⚠️ Khía Cạnh Cần Khắc Phục Sớm:</label>
 <textarea
 bind:value={evalForm.weaknesses}
 rows="2"
 placeholder="VD: Lỗi chia thì quá khứ đơn, hay nhầm mạo từ, thiếu từ nối khi viết đoạn văn..."
 class="w-full bg-white border-2 border-slate-300 rounded-lg p-3 text-slate-950 placeholder:text-slate-500 focus:outline-none focus:border-cx-600"
 ></textarea>
 </div>
 </div>

 <!-- Chuyên Cần & Sổ Đầu Bài Tức Thời -->
 <div class="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-cx-50 border border-cx-200">
 <div>
 <label class="block font-extrabold text-emerald-900 mb-1">⏱️ Tổng Hợp Điểm Danh &amp; Chuyên Cần:</label>
 <input
 type="text"
 bind:value={evalForm.attendance_summary}
 placeholder="Ví dụ: Chuyên cần 100% (12/12 buổi)"
 class="w-full bg-white border-2 border-slate-300 rounded-lg px-3 py-2 text-slate-950"
 />
 </div>
 <div>
 <label class="block font-extrabold text-teal-900 mb-1">📓 Tổng Hợp Sổ Đầu Bài Tức Thời:</label>
 <input
 type="text"
 bind:value={evalForm.in_class_attitude_summary}
 placeholder="Nhận xét từ các buổi học: Hăng hái, phát âm chuẩn..."
 class="w-full bg-white border-2 border-slate-300 rounded-lg px-3 py-2 text-slate-950"
 />
 </div>
 </div>

 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label class="block font-extrabold text-teal-900 mb-1">👩‍🏫 Nhận Xét Trực Tiếp Từ Giáo Viên Bộ Môn / Bản Ngữ:</label>
 <textarea
 bind:value={evalForm.teacher_direct_feedback}
 rows="3"
 placeholder="Nhận xét trực tiếp về phát âm, sự tương tác phản xạ và làm bài tập về nhà..."
 class="w-full bg-white border-2 border-teal-300 rounded-lg p-3 text-slate-950 placeholder:text-slate-500 focus:outline-none focus:border-teal-600"
 ></textarea>
 </div>
 <div>
 <label class="block font-extrabold text-amber-900 mb-1">👑 Nhận Xét &amp; Định Hướng Từ Cô Dung Leader:</label>
 <textarea
 bind:value={evalForm.leader_codung_feedback}
 rows="3"
 placeholder="Cô Dung duyệt kế hoạch chiến lược: Mục tiêu band điểm, bổ trợ chuyên đề ngữ pháp/luyện thi..."
 class="w-full bg-white border-2 border-amber-300 rounded-lg p-3 text-slate-950 placeholder:text-slate-500 focus:outline-none focus:border-amber-600"
 ></textarea>
 </div>
 </div>

 <div>
 <label class="block font-extrabold text-indigo-900 mb-1">🚀 Kế Hoạch Hành Động Cụ Thể (Lộ Trình 1-3 Tháng):</label>
 <textarea
 bind:value={evalForm.action_plan}
 rows="3"
 placeholder="1. Lộ trình tuần 1-4...&#10;2. Mục tiêu điểm số...&#10;3. Báo cáo định kỳ..."
 class="w-full bg-white border-2 border-cx-300 rounded-lg p-3 text-slate-950 placeholder:text-slate-500 focus:outline-none focus:border-cx-600 font-mono text-[11px]"
 ></textarea>
 </div>

 <!-- Parent Information Linking -->
 <div class="p-3.5 rounded-xl bg-violet-50 border border-violet-200 space-y-2">
 <div class="flex items-center justify-between text-[11px]">
 <span class="font-extrabold text-violet-900">👨‍👩‍👧 Thông Tin Phụ Huynh Liên Kết (Tự Động Trích Xuất Hoặc Nhập Tay):</span>
 {#if evalForm.linked_parent_id}
 <span class="px-2 py-0.5 rounded-full bg-purple-900 text-purple-200 font-bold text-[10px]">
 ✓ Đã đồng bộ tài khoản phụ huynh
 </span>
 {/if}
 </div>

 <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
 <div>
 <label class="block font-bold text-slate-800 mb-1">Họ Tên Phụ Huynh:</label>
 <input
 type="text"
 bind:value={evalForm.parent_name}
 class="w-full bg-white border-2 border-slate-300 rounded-lg px-3 py-2 text-slate-950"
 />
 </div>
 <div>
 <label class="block font-bold text-slate-800 mb-1">SĐT Phụ Huynh:</label>
 <input
 type="text"
 bind:value={evalForm.parent_phone}
 class="w-full bg-white border-2 border-slate-300 rounded-lg px-3 py-2 text-slate-950"
 />
 </div>
 <div>
 <label class="block font-bold text-slate-800 mb-1">Zalo ID / Số Zalo:</label>
 <input
 type="text"
 bind:value={evalForm.parent_zalo_id}
 placeholder="Để bot tự động gửi tin"
 class="w-full bg-white border-2 border-slate-300 rounded-lg px-3 py-2 text-slate-950"
 />
 </div>
 </div>
 </div>
 </div>
 </div>

 <!-- Modal Footer Actions -->
 <div class="flex items-center justify-end gap-3 p-4 sm:px-6 border-t border-cx-200 bg-cx-50 shrink-0">
 <button
 onclick={() => showEvalModal = false}
 class="min-h-11 px-4 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-900 text-xs font-extrabold"
 >
 Hủy Bỏ
 </button>
 <button
 onclick={handleSaveEvaluation}
 class="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30"
 >
 💾 Lưu Đánh Giá &amp; Cập Nhật Kế Hoạch
 </button>
 </div>
 </div>
 </div>
 {/if}

 <!-- MODAL 2: PARENT REPORT CARD PREVIEW & DISPATCH -->
 {#if showReportModal}
 <div class="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
 <div class="bg-white border border-cx-200 rounded-2xl w-full max-w-2xl p-6 md:p-8 shadow-2xl space-y-6">
 <div class="flex items-start justify-between border-b border-slate-200 pb-4">
 <div>
 <span class="text-xs font-bold text-emerald-900">PHIẾU BÁO CÁO PHỤ HUYNH CHUẨN ZALO / SMS</span>
 <h2 class="text-xl font-black text-slate-950 mt-1">Xuất Báo Cáo Học Tập &amp; Kế Hoạch</h2>
 </div>
 <button onclick={() => showReportModal = false} class="text-slate-700 hover:text-slate-950 text-lg">✕</button>
 </div>

 <!-- Formatted Report Text Area -->
 <div class="relative">
 <textarea
 readonly
 bind:value={currentReportText}
 rows="14"
 class="w-full bg-white border border-slate-200 rounded-2xl p-4 text-xs font-mono text-slate-900 selection:bg-emerald-600 leading-relaxed focus:outline-none"
 ></textarea>
 </div>

 <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200">
 <div class="text-[11px] text-slate-400">
 📱 Gửi đến Zalo: <strong class="text-slate-900">{currentEvalTarget?.parent_phone || currentEvalTarget?.parent_zalo_id || 'Chưa có SĐT'}</strong>
 </div>

 <div class="flex items-center gap-2">
 <button
 onclick={copyReportText}
 class="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 text-xs font-bold flex items-center gap-1.5"
 >
 <span>📋 Sao Chép Nội Dung</span>
 </button>
 <button
 onclick={sendToZaloBot}
 class="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
 >
 <span>🚀 Gửi Qua Bot Zalo Webhook</span>
 </button>
 </div>
 </div>
 </div>
 </div>
 {/if}

 <!-- MODAL 3: ADD NEW STUDENT -->
 {#if showAddStudentModal}
 <div class="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
 <div class="bg-white border border-cx-200 rounded-2xl w-full max-w-lg p-6 md:p-8 shadow-2xl space-y-5">
 <div class="flex items-start justify-between border-b border-slate-200 pb-3">
 <div>
 <span class="text-xs font-bold text-indigo-900">QUẢN TRỊ VIÊN &amp; GIÁO VIÊN</span>
 <h2 class="text-lg font-black text-slate-950 mt-1">Thêm Học Sinh Mới Vào Danh Sách</h2>
 </div>
 <button onclick={() => showAddStudentModal = false} class="text-slate-700 hover:text-slate-950 text-lg">✕</button>
 </div>

 <div class="space-y-3 text-xs">
 <div>
 <label class="block font-bold text-slate-900 mb-1">Họ Và Tên Học Sinh (*):</label>
 <input
 type="text"
 bind:value={newStudentForm.name}
 placeholder="VD: Hoàng Minh Châu"
 class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-950 focus:outline-none focus:border-indigo-500"
 />
 </div>

 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block font-bold text-slate-800 mb-1">Khối Lớp:</label>
 <select
 bind:value={newStudentForm.grade}
 class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-950"
 >
 <option value="Lớp 1">Lớp 1</option>
 <option value="Lớp 2">Lớp 2</option>
 <option value="Lớp 3">Lớp 3</option>
 <option value="Lớp 4">Lớp 4</option>
 <option value="Lớp 5">Lớp 5</option>
 <option value="Lớp 6">Lớp 6</option>
 <option value="Lớp 7">Lớp 7</option>
 <option value="Lớp 8">Lớp 8</option>
 <option value="Lớp 9">Lớp 9</option>
 <option value="Lớp 10">Lớp 10</option>
 <option value="Lớp 11">Lớp 11</option>
 <option value="Lớp 12">Lớp 12</option>
 <option value="IELTS Target">Luyện Thi IELTS</option>
 <option value="TOEIC Target">Luyện Thi TOEIC</option>
 </select>
 </div>
 <div>
 <label class="block font-bold text-slate-800 mb-1">Trường Đang Học:</label>
 <input
 type="text"
 bind:value={newStudentForm.school}
 placeholder="VD: THCS Đoàn Thị Điểm"
 class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-950"
 />
 </div>
 </div>

 <div>
 <label class="block font-bold text-slate-800 mb-1">Mục Tiêu Học Tập / Chứng Chỉ:</label>
 <input
 type="text"
 bind:value={newStudentForm.target}
 placeholder="VD: Đạt 9.0 học kỳ 1, thi Chuyên Anh, IELTS 6.5+"
 class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-950"
 />
 </div>

 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block font-bold text-slate-800 mb-1">Tên Phụ Huynh:</label>
 <input
 type="text"
 bind:value={newStudentForm.parent_name}
 placeholder="VD: Bác Hoàng Văn Nam"
 class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-950"
 />
 </div>
 <div>
 <label class="block font-bold text-slate-800 mb-1">SĐT / Zalo Phụ Huynh:</label>
 <input
 type="text"
 bind:value={newStudentForm.parent_phone}
 placeholder="0912..."
 class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-950"
 />
 </div>
 </div>
 </div>

 <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
 <button
 onclick={() => showAddStudentModal = false}
 class="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-900 text-xs font-semibold"
 >
 Hủy Bỏ
 </button>
 <button
 onclick={handleAddStudent}
 class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
 >
 Xác Nhận Thêm
 </button>
 </div>
 </div>
 </div>
 {/if}

 <!-- MODAL 4: ASSIGN MULTI-TEACHERS (LEAD, NATIVE, ASSISTANT) -->
 {#if showAssignTeacherModal && studentToAssign}
 <div class="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
 <div class="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-5 text-xs text-slate-800">
 <div class="flex items-start justify-between border-b border-slate-200 pb-3">
 <div>
 <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">PHÂN LUỒNG QUẢN LÝ ĐA NHIỆM</div>
 <h2 class="text-lg font-heading font-black text-slate-900 mt-0.5">
 Phân Công Giáo Viên Cho: {studentToAssign.name}
 </h2>
 <div class="text-[11px] text-slate-500">Mỗi học sinh được phân bổ 2-3 thầy cô theo sát (Chính, Bản ngữ, Trợ giảng).</div>
 </div>
 <button onclick={() => showAssignTeacherModal = false} class="text-slate-400 hover:text-slate-600">✕</button>
 </div>

 <div class="space-y-4">
 <!-- Lead Teacher -->
 <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
 <label class="block font-bold text-amber-800">
 👑 1. Giáo Viên Chính Thức (Lead Teacher / Giám Tuyển):
 </label>
 <select
 bind:value={assignLeadTeacher}
 class="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-amber-500"
 >
 {#each allTeachers as t}
 <option value={t.id}>{t.name} (@{t.username})</option>
 {/each}
 </select>
 <span class="text-[10px] text-amber-700 block">Chịu trách nhiệm điểm số học kỳ, bài thi 15p - 45p và ký duyệt báo học phí.</span>
 </div>

 <!-- Native Trainer -->
 <div class="p-3.5 rounded-2xl bg-cx-500/10 border border-cx-500/30 space-y-1.5">
 <label class="block font-bold text-cx-800">
 🗣️ 2. Giáo Viên Bản Ngữ (Native Speaking Trainer):
 </label>
 <select
 bind:value={assignNativeTeacher}
 class="w-full bg-white border border-cx-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-cx-500"
 >
 {#each allTeachers as t}
 <option value={t.id}>{t.name} (@{t.username})</option>
 {/each}
 </select>
 <span class="text-[10px] text-cx-700 block">Chịu trách nhiệm chỉnh âm Phonics, phát âm chuẩn Anh - Mỹ và phản xạ Speaking.</span>
 </div>

 <!-- Assistant Teacher -->
 <div class="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-1.5">
 <label class="block font-bold text-emerald-800">
 🤝 3. Giáo Viên Hỗ Trợ / Trợ Giảng (Support / Assistant):
 </label>
 <select
 bind:value={assignAssistantTeacher}
 class="w-full bg-white border border-emerald-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-emerald-500"
 >
 {#each allTeachers as t}
 <option value={t.id}>{t.name} (@{t.username})</option>
 {/each}
 </select>
 <span class="text-[10px] text-emerald-700 block">Theo dõi bài tập về nhà, đôn đốc chuyên cần và hỗ trợ phụ huynh qua Zalo.</span>
 </div>
 </div>

 <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
 <button
 onclick={() => showAssignTeacherModal = false}
 class="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-semibold"
 >
 Hủy Bỏ
 </button>
 <button
 onclick={handleSaveTeacherAssignments}
 class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md shadow-indigo-600/30"
 >
 💾 Lưu Phân Công Giáo Viên
 </button>
 </div>
 </div>
 </div>
 {/if}
</div>
