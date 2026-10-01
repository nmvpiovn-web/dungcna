<svelte:head>
 <title>Bảng Điều Hành Admin CP &amp; Leader • Tiếng Anh Cô Dung</title>
 <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<script>
 import { onMount } from 'svelte';
 import { page } from '$app/stores';
 import { 
 getAllUsers, 
 getCurrentUser, 
 isSuperAdmin, 
 isTeacherOrAdmin,
 addTeacher, 
 removeTeacher,
 addStudent,
 removeStudent,
 approveUserToOfficial,
 rejectOrBlockUser,
 updateUserGradeAndClass,
 getUserEnrolledGrades,
 enrollStudentAdditionalGrade,
 removeStudentEnrolledGrade,
 updateUserStarAdjustment,
 logTeacherAction,
 getAllClassSessions,
 saveClassSession,
 deleteClassSession,
 triggerScheduleNotification,
 getAllAttendanceRecords,
 getAttendedStudentsForSession,
 getAllTeacherProfiles,
 updateTeacherRoleAndSalary,
 addTeacherAppraisalAndRating,
 addTeacherBonus,
 addTeacherPrivateReminder,
 acknowledgeTeacherReminder,
 getAllSnapshots, 
 getAllWebhooks, 
 saveWebhook, 
 dispatchBotReport,
 getAllTuitionBills,
 saveTuitionBill,
 TUITION_TEMPLATES,
 exportTuitionToCSV,
 getStudentStars,
 getGameArenaSettings,
 saveGameArenaSettings,
 toggleMasterGamePortal,
 toggleIndividualGame,
 getAllLeaderNotifications,
 markNotificationAsRead,
 markAllNotificationsAsRead,
 deleteLeaderNotification,
 clearAllLeaderNotifications,
 scanScheduleAndAttendanceForLeader,
 scanTuitionDueAlerts,
 simulateLeaderNotification,
 requestPwaNotificationPermission,
 SUPERADMIN_EMAILS 
 } from '$lib/unifiedStore';
 import { playAudioFeedback } from '$lib/speech.js';
 import TuitionBillReport from '$lib/components/TuitionBillReport.svelte';
 import SessionRollCallModal from '$lib/components/SessionRollCallModal.svelte';
 import SessionEditModal from '$lib/components/SessionEditModal.svelte';
 import TeacherStaffModal from '$lib/components/TeacherStaffModal.svelte';

 let currentUser = $state(null);
 let allUsers = $state([]);
 let snapshots = $state([]);
 let webhooks = $state([]);
 let tuitionBills = $state([]);
 let classSessions = $state([]);
 let teacherProfiles = $state([]);
 let gameSettings = $state(getGameArenaSettings());
 
 // Navigation Tabs: 'leader_notifications' | 'students' | 'teachers' | 'schedule' | 'tuition' | 'teacher_cp' | 'games' | 'webhooks' | 'snapshots'
 let activeTab = $state('students');

 // Leader Notifications State
 let leaderNotifications = $state([]);
 let notifFilter = $state('all');
 let adminScanMsg = $state('');
 let pwaStatus = $state('default');
 let teacherReminderToast = $state('');

 let unreadLeaderCount = $derived(leaderNotifications.filter(n => !n.is_read).length);

 let filteredLeaderNotifs = $derived.by(() => {
 if (notifFilter === 'all') return leaderNotifications;
 if (notifFilter === 'schedule') {
 return leaderNotifications.filter(n => n.type === 'schedule_reminder_1h' || n.type === 'schedule_reminder_10m');
 }
 return leaderNotifications.filter(n => n.type === notifFilter);
 });

 // Filter States
 let studentSearchTerm = $state('');
 let studentStatusFilter = $state('all'); // 'all' | 'trial' | 'official'
 let studentGradeFilter = $state('all');

 // Teacher Form State
 let showAddTeacherModal = $state(false);
 let newTeacher = $state({
 name: '',
 username: '',
 phone: '',
 password: '123',
 email: '',
 title: 'Giáo viên Tiếng Anh',
 certs: 'TESOL / IELTS 8.0+',
 avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
 });

 // Student Form State
 let showAddStudentModal = $state(false);
 let newStudentForm = $state({
 name: '',
 username: '',
 phone: '',
 password: '123',
 grade: 'Lớp 7',
 school: '',
 parent_name: '',
 parent_phone: '',
 parent_zalo_id: ''
 });

 // Star Adjustment Modal State
 let showStarModal = $state(false);
 let selectedStudentForStar = $state(null);
 let starDelta = $state(50);
 let starReason = $state('Thưởng hoàn thành bài tập xuất sắc');

 // Grade/Class Change Modal State
 let showClassModal = $state(false);
 let selectedStudentForClass = $state(null);
 let targetGrade = $state('Lớp 7');
 let targetClassId = $state('L7_GLOBAL_SUCCESS_A1');
 let additionalGradeToEnroll = $state('Luyện Thi IELTS');
 let currentStudentEnrolledList = $state([]);

 // Timetable Modals State
 let showSessionEditModal = $state(false);
 let editingSession = $state(null);
 let showRollCallModal = $state(false);
 let activeRollCallSession = $state(null);

 // Teacher Staff Management Modal State
 let showStaffModal = $state(false);
 let editingStaffProfile = $state(null);

 // Webhook Form State
 let webhookForm = $state({
 id: '',
 name: 'Telegram & Zalo Central Bot Reporter',
 url: 'https://api.timbk.io.vn/api/webhook',
 secret: '',
 event_types: 'student_evaluated, test_submitted, daily_report, system_alert, teacher_operation',
 is_active: 1
 });

 // Tuition Bill Editor & PDF Preview Modal
 let showBillModal = $state(false);
 let showPdfPreviewModal = $state(false);
 let previewBill = $state(null);
 let previewTemplateId = $state(1);

 let billForm = $state({
 id: '',
 student_id: '',
 student_name: '',
 age: 13,
 grade_level: 'Lớp 7',
 program_name: 'Tiếng Anh K12 Toàn Diện & IELTS Foundation',
 billing_period: 'Tháng 10/2026',
 base_tuition_vnd: 1800000,
 attendance_total_sessions: 12,
 attendance_attended_sessions: 12,
 stars_available: 5000,
 stars_deducted: 5000,
 template_id: 1,
 bank_name: 'MBBank (Ngân Hàng Quân Đội)',
 bank_account: '0901234567',
 account_holder: 'NGUYEN MINH VU',
 growth_status: 'breakthrough_growth',
 growth_percentage: 15,
 growth_notes: 'Tăng trưởng xuất sắc so với kỳ trước, khả năng phản xạ và điểm test nâng cao rõ rệt.',
 eval_listening: 8.5,
 eval_reading: 8.5,
 eval_writing: 8.0,
 eval_speaking: 8.0,
 eval_grammar: 8.5,
 test_score_15m: 9.0,
 test_score_45m: 8.5,
 superadmin_notes: 'Học sinh rất tiến bộ, trừ sao tích lũy vào học phí.',
 parent_name: '',
 parent_phone: '',
 parent_zalo_id: ''
 });

 // Snapshot Detail Modal
 let selectedSnapshot = $state(null);
 let toastMsg = $state('');

 onMount(() => {
 loadData();

 if (typeof window !== 'undefined' && 'Notification' in window) {
 pwaStatus = Notification.permission;
 }

 const queryTab = $page.url.searchParams.get('tab');
 if (queryTab && ['leader_notifications', 'workflows', 'students', 'teachers', 'schedule', 'tuition', 'teacher_cp', 'games', 'webhooks', 'snapshots'].includes(queryTab)) {
 activeTab = queryTab;
 }

 const handleLeaderEvent = (e) => {
 leaderNotifications = e.detail || getAllLeaderNotifications();
 };

 const handleAuthEvent = (e) => {
 currentUser = e.detail || getCurrentUser();
 loadData();
 };

 window.addEventListener('tienganh:leader-notifications-change', handleLeaderEvent);
 window.addEventListener('tienganh:leader-notification-new', handleLeaderEvent);
 window.addEventListener('tienganh:auth-change', handleAuthEvent);

 return () => {
 window.removeEventListener('tienganh:leader-notifications-change', handleLeaderEvent);
 window.removeEventListener('tienganh:leader-notification-new', handleLeaderEvent);
 window.removeEventListener('tienganh:auth-change', handleAuthEvent);
 };
 });

 // Manager Workflows State
 let adminWorkflows = $state({ leaves: [], advances: [], recruitment: [] });
 let workflowLoading = $state(false);
 let showAddRecruitModal = $state(false);
 let newRecruit = $state({
 candidate_name: '',
 phone: '',
 email: '',
 position_type: 'contractor',
 interview_time: '',
 cv_link: '',
 notes: ''
 });

 async function loadAdminWorkflows() {
 if (typeof window === 'undefined') return;
 const token = localStorage.getItem('tienganh_token');
 if (!token) return;
 workflowLoading = true;
 try {
 const res = await fetch('/api/teachers/workflows?type=all', {
 headers: { 'Authorization': `Bearer ${token}` }
 });
 const data = await res.json();
 if (data.success) {
 adminWorkflows = {
 leaves: data.leaves || [],
 advances: data.advances || [],
 recruitment: data.recruitment || []
 };
 }
 } catch {}
 finally {
 workflowLoading = false;
 }
 }

 async function handleAdminLeaveDecision(leaveId, decision) {
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
 action: 'admin_decision',
 leave_id: leaveId,
 decision
 })
 });
 const data = await res.json();
 if (data.success) {
 showToast(decision === 'approve' ? '✅ Đã phê duyệt đơn nghỉ và xác nhận ca dạy thay!' : 'Đã từ chối đơn xin nghỉ.');
 loadAdminWorkflows();
 } else {
 showToast('Lỗi: ' + data.error);
 }
 } catch (e) {
 showToast('Lỗi kết nối: ' + e.message);
 }
 }

 async function handleAdminAdvanceDecision(advanceId, decision) {
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
 action: 'advance_decision',
 advance_id: advanceId,
 decision
 })
 });
 const data = await res.json();
 if (data.success) {
 showToast(decision === 'approve' ? '✅ Đã phê duyệt ứng lương và ghi nhận vào bảng đối trừ!' : 'Đã từ chối đơn ứng lương.');
 loadAdminWorkflows();
 } else {
 showToast('Lỗi: ' + data.error);
 }
 } catch (e) {
 showToast('Lỗi kết nối: ' + e.message);
 }
 }

 async function handleSaveRecruitment() {
 const token = localStorage.getItem('tienganh_token');
 if (!token) return;
 if (!newRecruit.candidate_name.trim()) {
 alert('Vui lòng nhập họ tên ứng viên');
 return;
 }
 try {
 const res = await fetch('/api/teachers/workflows', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${token}`
 },
 body: JSON.stringify({
 action: 'upsert_recruitment',
 ...newRecruit
 })
 });
 const data = await res.json();
 if (data.success) {
 showToast('✅ Đã lưu hồ sơ ứng viên tuyển dụng & lịch phỏng vấn!');
 showAddRecruitModal = false;
 newRecruit = { candidate_name: '', phone: '', email: '', position_type: 'contractor', interview_time: '', cv_link: '', notes: '' };
 loadAdminWorkflows();
 } else {
 showToast('Lỗi: ' + data.error);
 }
 } catch (e) {
 showToast('Lỗi kết nối: ' + e.message);
 }
 }

 function loadData() {
 currentUser = getCurrentUser();
 allUsers = getAllUsers();
 snapshots = getAllSnapshots();
 webhooks = getAllWebhooks();
 tuitionBills = getAllTuitionBills();
 classSessions = getAllClassSessions();
 teacherProfiles = getAllTeacherProfiles();
 gameSettings = getGameArenaSettings();
 leaderNotifications = getAllLeaderNotifications();
 if (webhooks.length > 0) {
 webhookForm = { ...webhooks[0] };
 }
 loadAdminWorkflows();
 loadTeacherProfilesFromServer();
 }

 async function loadTeacherProfilesFromServer() {
 try {
 const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
 if (!token) return;
 const res = await fetch('/api/teachers/staff', { headers: { 'Authorization': `Bearer ${token}` } });
 const data = await res.json();
 if (res.ok && data.success && Array.isArray(data.profiles)) {
 teacherProfiles = data.profiles;
 }
 } catch (error) {
 console.error('Không tải được hồ sơ lương D1:', error);
 }
 }

 async function handleAdminRequestPwa() {
 const res = await requestPwaNotificationPermission();
 pwaStatus = res.status;
 if (res.granted) {
 showToast('✅ Đã kích hoạt quyền nhận thông báo PWA trên thiết bị của Cô Dung!');
 } else {
 showToast('⚠️ Quyền thông báo trình duyệt chưa được cấp hoặc bị chặn.');
 }
 }

 function handleAdminScanNow() {
 adminScanMsg = '🔍 Đang kiểm tra lịch học, điểm danh và hạn học phí...';
 setTimeout(() => {
 const sched = scanScheduleAndAttendanceForLeader();
 const tui = scanTuitionDueAlerts();
 leaderNotifications = getAllLeaderNotifications();
 const total = (sched?.length || 0) + (tui?.length || 0);
 adminScanMsg = total > 0 
 ? `🔔 Đã phát hiện ${total} cảnh báo mới cho Leader!`
 : '✨ Toàn bộ lịch học, điểm danh và học phí đã được đồng bộ chuẩn xác.';
 showToast(adminScanMsg);
 setTimeout(() => { adminScanMsg = ''; }, 4000);
 }, 500);
 }

 function handleAdminSimulate(type) {
 simulateLeaderNotification(type);
 leaderNotifications = getAllLeaderNotifications();
 showToast('🧪 Đã phát sinh sự kiện mô phỏng thành công!');
 }

 function handleRemindTeacherDirectly(notif) {
 const teacherId = notif.meta?.teacherId || 'usr_teach_1';
 const teacherName = notif.meta?.teacherName || 'Giáo viên phụ trách';
 const content = `[Khẩn từ Leader Cô Dung] ${notif.title}: Vui lòng kiểm tra và hoàn thành sổ điểm danh cho lớp "${notif.meta?.className || ''}" ngay!`;

 addTeacherPrivateReminder(teacherId, {
 content,
 urgency: 'high'
 });

 markNotificationAsRead(notif.id);
 leaderNotifications = getAllLeaderNotifications();
 showToast(`Đã gửi lời nhắc khẩn cấp trực tiếp tới ${teacherName}!`);
 }

 function handleAdminToggleMasterGames(isOpen) {
 gameSettings = toggleMasterGamePortal(isOpen, currentUser);
 playAudioFeedback(isOpen);
 showToast(isOpen ? '🟢 Đã mở cổng đấu trường game cho học sinh!' : '🔒 Đã khóa cổng đấu trường game đối với học sinh!');
 }

 function handleAdminToggleGame(gameKey) {
 const next = !gameSettings.active_games[gameKey];
 gameSettings = toggleIndividualGame(gameKey, next, currentUser);
 showToast(`Đã ${next ? 'bật' : 'tắt'} trò chơi: ${gameKey}`);
 }

 function handleAdminSaveRewardStars(stars) {
 gameSettings = saveGameArenaSettings({ reward_stars_per_game: parseInt(stars) || 20 }, currentUser);
 showToast(`Đã cập nhật mức thưởng: ${stars} ⭐ / trận thắng`);
 }

 function showToast(msg) {
 toastMsg = msg;
 setTimeout(() => toastMsg = '', 4000);
 }

 // Derived metrics
 let studentsList = $derived(allUsers.filter(u => u.role === 'student'));
 let teachersList = $derived(allUsers.filter(u => u.role === 'teacher' || isSuperAdmin(u)));
 
 let trialStudents = $derived(
 studentsList.filter(u => u.status === 'trial' || u.approval_status === 'trial')
 );
 let officialStudents = $derived(
 studentsList.filter(u => u.status === 'active' && u.approval_status !== 'trial')
 );

 let totalStudentStars = $derived.by(() => {
 return studentsList.reduce((sum, st) => {
 const s = getStudentStars(st.id);
 return sum + (s.stars_balance || 0);
 }, 0);
 });

 let filteredStudents = $derived.by(() => {
 let list = [...studentsList];
 if (studentSearchTerm.trim()) {
 const q = studentSearchTerm.trim().toLowerCase();
 list = list.filter(s => 
 (s.name && s.name.toLowerCase().includes(q)) ||
 (s.username && s.username.toLowerCase().includes(q)) ||
 (s.phone && s.phone.includes(q))
 );
 }
 if (studentStatusFilter === 'trial') {
 list = list.filter(u => u.status === 'trial' || u.approval_status === 'trial');
 } else if (studentStatusFilter === 'official') {
 list = list.filter(u => u.status === 'active' && u.approval_status !== 'trial');
 }
 if (studentGradeFilter !== 'all') {
 list = list.filter(s => {
 let meta = {};
 try { meta = typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata || {}); } catch {}
 return (meta.grade || '').includes(studentGradeFilter) || (s.grade || '').includes(studentGradeFilter);
 });
 }
 return list;
 });

 // Teacher CP sessions for current teacher
 let teacherManagedSessions = $derived.by(() => {
 if (!currentUser) return classSessions;
 if (isSuperAdmin(currentUser)) return classSessions;
 return classSessions.filter(s => 
 s.teacher_id === currentUser.id || 
 s.assistant_teacher_id === currentUser.id ||
 s.teacher_name === currentUser.name
 );
 });

 // Recent teacher actions log
 let recentTeacherActions = $derived(
 snapshots.filter(s => s.action === 'TEACHER_ACTION' || s.action === 'SAVE_ATTENDANCE_RECORD').slice(0, 10)
 );

 // Student Actions
 function handleApproveOfficial(student) {
 const res = approveUserToOfficial(student.id, currentUser);
 if (res.success) {
 loadData();
 playAudioFeedback(true);
 showToast(`🎉 Đã phê duyệt chính thức cho học sinh: ${student.name}!`);
 } else {
 alert(res.error || 'Lỗi phê duyệt!');
 }
 }

 function handleToggleBlockUser(user) {
 const res = rejectOrBlockUser(user.id, currentUser);
 if (res.success) {
 loadData();
 showToast(`${res.user.status === 'blocked' ? '🔒 Đã khóa tài khoản' : '🔓 Đã mở khóa tài khoản'} ${user.name}`);
 } else {
 alert(res.error || 'Lỗi xử lý!');
 }
 }

 function handleRemoveStudent(studentId, name) {
 if (confirm(`Bạn có chắc muốn xóa học sinh "${name}" khỏi hệ thống?`)) {
 removeStudent(studentId);
 loadData();
 showToast(`Đã xóa học sinh ${name}`);
 }
 }

 function openStarModal(student) {
 selectedStudentForStar = student;
 starDelta = 50;
 starReason = 'Thưởng hoàn thành xuất sắc bài tập & chuyên cần';
 showStarModal = true;
 }

 function handleSaveStarAdjustment() {
 if (!selectedStudentForStar) return;
 const res = updateUserStarAdjustment(selectedStudentForStar.id, starDelta, starReason, currentUser);
 if (res.success) {
 loadData();
 playAudioFeedback(starDelta > 0);
 showToast(`${starDelta > 0 ? '⭐ Đã thưởng +' : '⚠️ Đã phạt '}${Math.abs(starDelta)} Sao cho ${selectedStudentForStar.name}!`);
 showStarModal = false;
 }
 }

 function openClassModal(student) {
 selectedStudentForClass = student;
 let meta = {};
 try { meta = typeof student.metadata === 'string' ? JSON.parse(student.metadata) : (student.metadata || {}); } catch {}
 targetGrade = meta.grade || student.grade || 'Lớp 7';
 targetClassId = meta.class_id || 'L7_GLOBAL_SUCCESS_A1';
 currentStudentEnrolledList = getUserEnrolledGrades(student);
 additionalGradeToEnroll = 'Luyện Thi IELTS';
 showClassModal = true;
 }

 function handleSaveClassChange() {
 if (!selectedStudentForClass) return;
 const res = updateUserGradeAndClass(selectedStudentForClass.id, targetGrade, targetClassId, currentUser);
 if (res.success) {
 loadData();
 playAudioFeedback(true);
 showToast(`✅ Đã chuyển khối lớp chính của ${selectedStudentForClass.name} sang ${targetGrade}!`);
 showClassModal = false;
 }
 }

 function handleAddAdditionalGrade() {
 if (!selectedStudentForClass || !additionalGradeToEnroll) return;
 const res = enrollStudentAdditionalGrade(selectedStudentForClass.id, additionalGradeToEnroll, currentUser);
 if (res.success) {
 loadData();
 selectedStudentForClass = res.user;
 currentStudentEnrolledList = res.enrolled_grades;
 playAudioFeedback(true);
 showToast(`✅ Đã set thêm lớp "${additionalGradeToEnroll}" cho ${selectedStudentForClass.name}!`);
 }
 }

 function handleRemoveAdditionalGrade(grade) {
 if (!selectedStudentForClass) return;
 const res = removeStudentEnrolledGrade(selectedStudentForClass.id, grade, currentUser);
 if (res.success) {
 loadData();
 selectedStudentForClass = res.user;
 currentStudentEnrolledList = res.enrolled_grades;
 showToast(`Đã gỡ lớp "${grade}" khỏi tài khoản ${selectedStudentForClass.name}.`);
 }
 }

 function handleAddStudent() {
 if (!newStudentForm.name.trim()) {
 alert('Vui lòng nhập họ và tên học sinh!');
 return;
 }
 const created = addStudent({
 name: newStudentForm.name,
 username: newStudentForm.username,
 phone: newStudentForm.phone,
 password: newStudentForm.password,
 grade: newStudentForm.grade,
 school: newStudentForm.school,
 parent_name: newStudentForm.parent_name,
 parent_phone: newStudentForm.parent_phone,
 parent_zalo_id: newStudentForm.parent_zalo_id
 });
 loadData();
 showAddStudentModal = false;
 showToast(`Đã thêm học sinh: ${created.name}`);
 newStudentForm = {
 name: '',
 username: '',
 phone: '',
 password: '123',
 grade: 'Lớp 7',
 school: '',
 parent_name: '',
 parent_phone: '',
 parent_zalo_id: ''
 };
 }

 // Teacher Handlers
 function handleAddTeacher() {
 if (!newTeacher.name.trim()) {
 alert('Vui lòng nhập họ và tên giáo viên!');
 return;
 }
 try {
 const created = addTeacher(newTeacher);
 loadData();
 showAddTeacherModal = false;
 showToast(`Đã thêm thành công giáo viên: ${created.name} (Tài khoản: ${created.username})`);
 newTeacher = {
 name: '',
 username: '',
 phone: '',
 password: '123',
 email: '',
 title: 'Giáo viên Tiếng Anh',
 certs: 'TESOL / IELTS 8.0+',
 avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
 };
 } catch (err) {
 alert(err.message);
 }
 }

 function handleRemoveTeacher(id, email, name) {
 if (SUPERADMIN_EMAILS.includes(email)) {
 alert('Không thể xóa tài khoản SuperAdmin tối cao!');
 return;
 }
 if (confirm(`Bạn có chắc muốn xóa quyền giáo viên của "${name}"?`)) {
 try {
 removeTeacher(id);
 loadData();
 showToast(`Đã xóa giáo viên ${name}`);
 } catch (err) {
 alert(err.message);
 }
 }
 }

 function openEditStaff(teacher) {
 const existing = teacherProfiles.find(p => p.teacher_id === teacher.id);
 const profile = existing ? {
 ...existing,
 teacher_id: teacher.id,
 teacher_name: teacher.name,
 username: teacher.username || existing.username,
 teacher_email: teacher.email || existing.teacher_email,
 role_type: existing.role_type || existing.role_level || 'assistant_fixed',
 role_title: existing.role_title || existing.role_label || 'Trợ Giảng',
 rate_per_session_vnd: existing.rate_per_session_vnd || existing.per_session_rate_vnd || 200000,
 per_session_rate_vnd: existing.rate_per_session_vnd || existing.per_session_rate_vnd || 200000,
 base_salary_vnd: existing.base_salary_vnd || 5000000,
 total_sessions_taught: existing.total_sessions_taught || existing.monthly_completed_sessions || 0
 } : {
 teacher_id: teacher.id,
 teacher_name: teacher.name,
 teacher_email: teacher.email,
 username: teacher.username,
 role_level: 'assistant_fixed',
 role_type: 'assistant_fixed',
 role_label: 'Trợ Giảng Cố Định',
 role_title: 'Trợ Giảng Cố Định',
 base_salary_vnd: 5000000,
 rate_per_session_vnd: 200000,
 per_session_rate_vnd: 200000,
 total_sessions_taught: 8,
 monthly_completed_sessions: 8,
 leader_rating: 5.0,
 rating_stars: 5,
 private_reminders: []
 };
 editingStaffProfile = profile;
 showStaffModal = true;
 }

 function handleStaffSaved() {
 showStaffModal = false;
 loadData();
 showToast('Đã lưu cấu hình nhân sự & mức lương thành công!');
 }

 // Schedule Handlers
 function openCreateSessionModal() {
 editingSession = null;
 showSessionEditModal = true;
 }

 function openEditSession(session) {
 editingSession = session;
 showSessionEditModal = true;
 }

 function handleSessionSaved() {
 showSessionEditModal = false;
 loadData();
 showToast('Đã cập nhật thời khóa biểu buổi học!');
 }

 function handleDeleteSession(id, name) {
 if (confirm(`Bạn có chắc muốn xóa buổi học "${name}"?`)) {
 deleteClassSession(id, currentUser);
 loadData();
 showToast('Đã xóa buổi học khỏi thời khóa biểu!');
 }
 }

 async function handleTriggerNotification(session) {
 showToast(`Đang gửi thông báo nhắc đón con (10 phút trước giờ học) cho lớp ${session.class_name}...`);
 const res = await triggerScheduleNotification(session.id, 10);
 if (res.success) {
 loadData();
 showToast(`⏰ Đã kích hoạt thông báo phụ huynh: Bắt đầu lúc ${res.notifyTime}!`);
 } else {
 alert(res.error || 'Lỗi gửi thông báo!');
 }
 }

 function openRollCall(session) {
 activeRollCallSession = session;
 showRollCallModal = true;
 }

 function handleRollCallCompleted() {
 showRollCallModal = false;
 loadData();
 showToast('Điểm danh & Sổ đầu bài tức thời đã được lưu thành công!');
 }

 // Teacher CP Operation Logs
 function handleTeacherLogQuickAction(action, note) {
 logTeacherAction(currentUser, action, { note, timestamp: new Date().toISOString() });
 loadData();
 showToast(`Đã gửi báo cáo tức thời "${action}" đến Leader Cô Dung!`);
 }

 // Tuition Bill Handlers
 function openCreateBillModal() {
 const students = allUsers.filter(u => u.role === 'student');
 const firstStudent = students[0];
 const stars = firstStudent ? getStudentStars(firstStudent.id) : { stars_balance: 5000 };

 billForm = {
 id: '',
 student_id: firstStudent?.id || 'usr_student_1',
 student_name: firstStudent?.name || 'Lê Bảo Anh',
 age: 13,
 grade_level: 'Lớp 7',
 program_name: 'Tiếng Anh K12 Toàn Diện & IELTS Foundation',
 billing_period: 'Tháng 10/2026',
 base_tuition_vnd: 1800000,
 attendance_total_sessions: 12,
 attendance_attended_sessions: 12,
 stars_available: stars.stars_balance || 5000,
 stars_deducted: Math.min(stars.stars_balance || 5000, 10000),
 template_id: 1,
 bank_name: 'MBBank (Ngân Hàng Quân Đội)',
 bank_account: '0901234567',
 account_holder: 'NGUYEN MINH VU',
 growth_status: 'breakthrough_growth',
 growth_percentage: 15,
 growth_notes: 'Tăng trưởng xuất sắc so với kỳ trước, khả năng phản xạ và điểm test nâng cao rõ rệt.',
 eval_listening: 8.5,
 eval_reading: 8.5,
 eval_writing: 8.0,
 eval_speaking: 8.0,
 eval_grammar: 8.5,
 test_score_15m: 9.0,
 test_score_45m: 8.5,
 superadmin_notes: 'Học sinh rất tiến bộ, trừ sao tích lũy vào học phí.',
 parent_name: '',
 parent_phone: '',
 parent_zalo_id: ''
 };
 showBillModal = true;
 }

 function handleSaveBill() {
 const saved = saveTuitionBill(billForm);
 loadData();
 showBillModal = false;
 showToast(`Đã lập hóa đơn học phí cho học sinh ${saved.student_name} (Đã trừ ${saved.stars_deducted} sao = ${saved.discount_vnd.toLocaleString()}đ)`);
 previewBill = saved;
 previewTemplateId = saved.template_id || 1;
 showPdfPreviewModal = true;
 }

 function openPreview(bill, templateId = null) {
 previewBill = bill;
 previewTemplateId = templateId || bill.template_id || 1;
 showPdfPreviewModal = true;
 }

 function handleExportGoogleSheetCSV() {
 const csvContent = exportTuitionToCSV();
 const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.setAttribute('href', url);
 link.setAttribute('download', `Bao_Cao_Hoc_Phi_TiengAnh_${new Date().toISOString().slice(0, 10)}.csv`);
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 showToast('Đã xuất file CSV sẵn sàng mở bằng Google Sheets / Excel!');
 }

 async function handleSendBillToZalo(bill) {
 showToast('Đang gửi thông báo học phí & mã QR tới Zalo phụ huynh...');
 await dispatchBotReport('TUITION_BILL_DISPATCHED', {
 student_name: bill.student_name,
 period: bill.billing_period,
 base_tuition: bill.base_tuition_vnd,
 stars_deducted: bill.stars_deducted,
 final_amount: bill.final_amount_vnd,
 qr_url: bill.vietqr_url,
 parent_phone: bill.parent_phone,
 parent_zalo_id: bill.parent_zalo_id
 });
 showToast('🚀 Đã gửi thông báo học phí và QR thanh toán đến Zalo thành công!');
 }

 // Webhook Handlers
 function generateWebhookSecret() {
 const bytes = new Uint8Array(24);
 crypto.getRandomValues(bytes);
 webhookForm.secret = 'wh_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
 showToast('Đã tạo secret ngẫu nhiên mới — nhớ lưu cấu hình!');
 }

 function handleSaveWebhook() {
 saveWebhook(webhookForm);
 loadData();
 showToast('Đã lưu cấu hình Webhook Bot thành công!');
 }

 async function handleTestWebhook() {
 showToast('Đang gửi tín hiệu thử nghiệm đến Webhook Bot...');
 const result = await dispatchBotReport('TEST_ALERT', {
 time: new Date().toISOString(),
 sender: currentUser?.email || 'admin@tienganhcodung.edu.vn',
 message: 'Kiểm tra tín hiệu kết nối bot webhook thành công!'
 });
 loadData();
 if (result.success) {
 showToast('✅ Tín hiệu Webhook đã được phát đi thành công!');
 } else {
 showToast('⚠️ Đã gửi tín hiệu nhưng máy chủ webhook đích chưa phản hồi.');
 }
 }
</script>

<div class="space-y-6">
 <!-- Toast Alert -->
 {#if toastMsg}
 <div class="fixed top-20 right-5 z-50 p-4 rounded-2xl bg-emerald-600 text-white font-bold text-xs shadow-2xl animate-in slide-in-from-top-3 flex items-center gap-3">
 <span>🔔</span>
 <span>{toastMsg}</span>
 </div>
 {/if}

 {#if currentUser?.role === 'student'}
 <!-- Polite Gate for Students Attempting to Access Admin CP -->
 <div class="max-w-xl mx-auto my-12 p-8 rounded-3xl bg-white border border-slate-200 shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200">
 <div class="w-16 h-16 mx-auto rounded-3xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-3xl shadow-inner">
 🎒
 </div>
 <div class="space-y-2">
 <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs font-bold">
 <span>Tài Khoản Học Sinh: <strong>{currentUser.name}</strong></span>
 </div>
 <h2 class="text-xl font-heading font-black text-slate-900">
 Khu Vực Dành Riêng Cho Giáo Viên &amp; Ban Quản Lý
 </h2>
 <p class="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
 Trang Admin CP này được bảo mật cho Giáo viên và Leader Cô Dung để quản lý thời khóa biểu, điểm danh và học phí. Học sinh vui lòng làm bài tại Phòng Thi hoặc luyện tập từ vựng nhé!
 </p>
 </div>

 <div class="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
 <a
 href="/"
 class="w-full sm:w-auto px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/25 transition-all hover:scale-105 flex items-center justify-center gap-2"
 >
 <span>🏠 Về Góc Học Tập Của Bạn</span>
 </a>
 <a
 href="/exam"
 class="w-full sm:w-auto px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-600/25 transition-all hover:scale-105 flex items-center justify-center gap-2"
 >
 <span>⚡ Vào Phòng Thi 15p - 45p</span>
 </a>
 </div>
 </div>
 {:else if currentUser?.role === 'parent'}
 <!-- Polite Gate for Parents Attempting to Access Admin CP -->
 <div class="max-w-xl mx-auto my-12 p-8 rounded-3xl bg-white border border-slate-200 shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200">
 <div class="w-16 h-16 mx-auto rounded-3xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center text-3xl shadow-inner">
 👨‍👩‍👧
 </div>
 <div class="space-y-2">
 <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 text-xs font-bold">
 <span>Tài Khoản Phụ Huynh: <strong>{currentUser.name}</strong></span>
 </div>
 <h2 class="text-xl font-heading font-black text-slate-900">
 Khu Vực Quản Lý Giảng Dạy &amp; Điều Hành
 </h2>
 <p class="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
 Trang Admin CP dành riêng cho Đội ngũ Giáo viên và Ban Quản Lý Cô Dung. Quý phụ huynh vui lòng theo dõi thời khóa biểu và phiếu đánh giá năng lực của con tại các mục dành cho Phụ huynh.
 </p>
 </div>

 <div class="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
 <a
 href="/schedule"
 class="w-full sm:w-auto px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/25 transition-all hover:scale-105 flex items-center justify-center gap-2"
 >
 <span>📅 Xem Thời Khóa Biểu &amp; Giờ Đưa Đón</span>
 </a>
 <a
 href="/evaluations"
 class="w-full sm:w-auto px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-600/25 transition-all hover:scale-105 flex items-center justify-center gap-2"
 >
 <span>📑 Xem Phiếu Đánh Giá Của Con</span>
 </a>
 </div>
 </div>
 {:else if !currentUser || (!isTeacherOrAdmin(currentUser) && currentUser?.role !== 'teacher' && !isSuperAdmin(currentUser))}
 <!-- Unauthorized Guest Gate -->
 <div class="max-w-xl mx-auto my-12 p-8 rounded-3xl bg-white border border-slate-200 shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200">
 <div class="w-16 h-16 mx-auto rounded-3xl bg-rose-500/10 text-rose-600 flex items-center justify-center text-3xl shadow-inner">
 🔒
 </div>
 <div class="space-y-2">
 <h2 class="text-xl font-heading font-black text-slate-900">
 Yêu Cầu Đăng Nhập Tài Khoản Giáo Viên / Quản Lý
 </h2>
 <p class="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
 Bạn cần đăng nhập bằng tài khoản Giáo viên hoặc Leader Cô Dung để truy cập bảng điều khiển Admin CP.
 </p>
 </div>

 <div class="pt-2 flex items-center justify-center gap-3">
 <a
 href="/"
 class="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
 >
 <span>🏠 Về Trang Chủ</span>
 </a>
 </div>
 </div>
 {:else}
 <!-- Header Banner -->
 <div class="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 shadow-2xl relative overflow-hidden">
 <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

 <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
 <div class="space-y-2">
 <div class="flex flex-wrap items-center gap-2">
 <span class="px-3 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider flex items-center gap-1.5">
 <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
 <span>HỆ THỐNG ĐIỀU HÀNH ADMIN CP &amp; TEACHER PORTAL</span>
 </span>
 {#if isSuperAdmin(currentUser)}
 <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
 👑 SuperAdmin Tối Cao
 </span>
 {:else}
 <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-400 border border-teal-500/30">
 👩‍🏫 Cổng Giáo Viên &amp; Trợ Giảng
 </span>
 {/if}
 </div>

 <h1 class="text-2xl md:text-3xl font-black text-white tracking-tight">
 Bảng Điều Khiển Quản Trị Toàn Diện Tiếng Anh Cô Dung
 </h1>
 <p class="text-xs text-slate-300 max-w-3xl leading-relaxed">
 Đồng bộ tức thời giữa <strong>Học sinh (Duyệt Trial)</strong> • <strong>Giáo viên &amp; Lương ca dạy</strong> • <strong>Thời khóa biểu &amp; Nhắc đón 10p</strong> • <strong>Học phí trừ Sao thưởng</strong> • <strong>Báo cáo Webhook Bot</strong>.
 </p>
 </div>

 <!-- Quick Metrics Ribbon -->
 <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-shrink-0">
 <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center min-w-[100px]">
 <div class="text-[10px] font-bold text-slate-400 uppercase">Học Sinh</div>
 <div class="text-xl font-black text-white mt-0.5">{studentsList.length}</div>
 {#if trialStudents.length > 0}
 <span class="text-[9px] font-bold text-amber-400 animate-pulse">{trialStudents.length} chờ duyệt</span>
 {/if}
 </div>

 <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center min-w-[100px]">
 <div class="text-[10px] font-bold text-slate-400 uppercase">Giáo Viên</div>
 <div class="text-xl font-black text-teal-400 mt-0.5">{teachersList.length}</div>
 <span class="text-[9px] text-slate-400 font-semibold">4 Phân cấp</span>
 </div>

 <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center min-w-[100px]">
 <div class="text-[10px] font-bold text-slate-400 uppercase">Buổi Học</div>
 <div class="text-xl font-black text-indigo-400 mt-0.5">{classSessions.length}</div>
 <span class="text-[9px] text-slate-400 font-semibold">Nhắc đón 10p</span>
 </div>

 <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center min-w-[100px]">
 <div class="text-[10px] font-bold text-slate-400 uppercase">Quỹ Sao</div>
 <div class="text-xl font-black text-amber-400 mt-0.5">{totalStudentStars.toLocaleString()}</div>
 <span class="text-[9px] text-slate-400 font-semibold">{(totalStudentStars * 10).toLocaleString()}đ</span>
 </div>
 </div>
 </div>

 <!-- Navigation Tabs Ribbon -->
 <div class="mt-6 pt-4 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold">
 <button
 onclick={() => activeTab = 'leader_notifications'}
 class="px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-2 {activeTab === 'leader_notifications' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30' : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span>🔔 Cảnh Báo Leader</span>
 {#if unreadLeaderCount > 0}
 <span class="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] animate-pulse">
 {unreadLeaderCount} mới
 </span>
 {/if}
 </button>

 <button
 onclick={() => activeTab = 'workflows'}
 class="px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-2 {activeTab === 'workflows' ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-600/30' : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span>📋 Hàng Đợi Duyệt &amp; Tuyển Dụng</span>
 {#if (adminWorkflows.leaves.filter(l => l.admin_status === 'pending').length + adminWorkflows.advances.filter(a => a.status === 'pending').length) > 0}
 <span class="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] animate-pulse">
 {adminWorkflows.leaves.filter(l => l.admin_status === 'pending').length + adminWorkflows.advances.filter(a => a.status === 'pending').length} chờ
 </span>
 {/if}
 </button>

 <button
 onclick={() => activeTab = 'students'}
 class="px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-2 {activeTab === 'students' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span>🎒 Quản Lý Học Sinh</span>
 {#if trialStudents.length > 0}
 <span class="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] animate-pulse">
 {trialStudents.length} Trial
 </span>
 {/if}
 </button>

 <button
 onclick={() => activeTab = 'teachers'}
 class="px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 {activeTab === 'teachers' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span>👨‍🏫 Giáo Viên &amp; Lương Ca Dạy</span>
 </button>

 <button
 onclick={() => activeTab = 'schedule'}
 class="px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 {activeTab === 'schedule' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span>📅 Thời Khóa Biểu &amp; Ca Học</span>
 </button>

 <button
 onclick={() => activeTab = 'tuition'}
 class="px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 {activeTab === 'tuition' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span>💰 Học Phí &amp; Đổi Sao (VietQR)</span>
 </button>

 <button
 onclick={() => activeTab = 'teacher_cp'}
 class="px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 {activeTab === 'teacher_cp' ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30' : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span>👩‍🏫 Giáo Viên CP (Teacher Portal)</span>
 </button>

 <button
 onclick={() => activeTab = 'games'}
 class="px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 {activeTab === 'games' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span>🎮 Đấu Trường Game</span>
 <span class="px-1.5 py-0.5 rounded text-[9px] font-black {gameSettings.is_portal_open ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'}">
 {gameSettings.is_portal_open ? 'MỞ' : 'KHÓA'}
 </span>
 </button>

 <button
 onclick={() => activeTab = 'webhooks'}
 class="px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 {activeTab === 'webhooks' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span>📡 Webhook Bot</span>
 </button>

 <button
 onclick={() => activeTab = 'snapshots'}
 class="px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 {activeTab === 'snapshots' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span>📜 Kiểm Toán ({snapshots.length})</span>
 </button>
 </div>
 </div>

 <!-- ================= TAB 0: TRUNG TÂM BÁO CÁO & CẢNH BÁO LEADER (CÔ DUNG) ================= -->
 {#if activeTab === 'leader_notifications'}
 <div class="space-y-6 animate-in fade-in duration-200">
 <!-- Header Banner & Action Deck -->
 <div class="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-emerald-500/30 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
 <div class="space-y-1.5">
 <div class="flex items-center gap-2">
 <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
 <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
 <span>CƠ CHẾ GIÁM SÁT SỰ KIỆN THỜI GIAN THỰC (REAL-TIME EVENT HUB)</span>
 </span>
 {#if pwaStatus === 'granted'}
 <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
 📲 PWA Push: Sẵn Sàng
 </span>
 {/if}
 </div>
 <h2 class="text-xl md:text-2xl font-black text-white flex items-center gap-2.5">
 <span>🔔</span>
 <span>Trung Tâm Báo Cáo &amp; Cảnh Báo Cho Leader Cô Dung</span>
 {#if unreadLeaderCount > 0}
 <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white animate-pulse">
 {unreadLeaderCount} chưa đọc
 </span>
 {/if}
 </h2>
 <p class="text-xs text-slate-300 max-w-2xl leading-relaxed">
 Hệ thống tự động thông báo trước lịch học 1h &amp; 10p, cảnh báo khi giáo viên chưa điểm danh quá 15 phút, tổng hợp học sinh vắng, bài thi hoàn thành và học phí đến hạn.
 </p>
 </div>

 <!-- Action Buttons -->
 <div class="flex flex-wrap items-center gap-2">
 <button
 onclick={handleAdminScanNow}
 class="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all hover:scale-105"
 >
 <span>⚡</span>
 <span>Quét Lập Tức Toàn Bộ</span>
 </button>

 {#if pwaStatus !== 'granted'}
 <button
 onclick={handleAdminRequestPwa}
 class="px-3.5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
 >
 <span>📲</span>
 <span>Bật PWA Push</span>
 </button>
 {/if}

 <button
 onclick={() => { markAllNotificationsAsRead(); leaderNotifications = getAllLeaderNotifications(); showToast('Đã đánh dấu tất cả thông báo là đã đọc!'); }}
 disabled={unreadLeaderCount === 0}
 class="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-bold text-xs border border-slate-700 transition-colors"
 >
 ✓ Đọc Tất Cả
 </button>

 <button
 onclick={() => {
 if (confirm('Cô Dung có chắc chắn muốn xóa toàn bộ lịch sử thông báo?')) {
 clearAllLeaderNotifications();
 leaderNotifications = [];
 showToast('Đã xóa toàn bộ lịch sử thông báo!');
 }
 }}
 disabled={leaderNotifications.length === 0}
 class="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-rose-900/50 hover:border-rose-700 disabled:opacity-40 text-rose-400 font-bold text-xs border border-slate-700 transition-colors"
 >
 🗑️ Xóa Hết
 </button>
 </div>
 </div>

 <!-- Live Stat Cards Deck -->
 <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
 <div class="p-4 rounded-2xl bg-slate-900 border border-rose-500/40 shadow-xl">
 <div class="flex items-center justify-between text-slate-400 font-bold text-[11px] mb-1">
 <span>GV CHƯA ĐIỂM DANH</span>
 <span>⚠️</span>
 </div>
 <div class="text-2xl font-black text-rose-400">
 {leaderNotifications.filter(n => n.type === 'teacher_missing_attendance' && !n.is_read).length}
 </div>
 <div class="text-[10px] text-slate-400 mt-1">Cảnh báo khẩn sau 15p</div>
 </div>

 <div class="p-4 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-xl">
 <div class="flex items-center justify-between text-slate-400 font-bold text-[11px] mb-1">
 <span>ĐĂNG KÝ MỚI (TRIAL)</span>
 <span>🔔</span>
 </div>
 <div class="text-2xl font-black text-emerald-400">
 {leaderNotifications.filter(n => n.type === 'new_registration' && !n.is_read).length}
 </div>
 <div class="text-[10px] text-slate-400 mt-1">Chờ Cô Dung duyệt</div>
 </div>

 <div class="p-4 rounded-2xl bg-slate-900 border border-cx-500/40 shadow-xl">
 <div class="flex items-center justify-between text-slate-400 font-bold text-[11px] mb-1">
 <span>BÁO CÁO ĐIỂM DANH</span>
 <span>📋</span>
 </div>
 <div class="text-2xl font-black text-cx-400">
 {leaderNotifications.filter(n => n.type === 'attendance_summary').length}
 </div>
 <div class="text-[10px] text-slate-400 mt-1">Đủ &amp; vắng học sinh</div>
 </div>

 <div class="p-4 rounded-2xl bg-slate-900 border border-amber-500/40 shadow-xl">
 <div class="flex items-center justify-between text-slate-400 font-bold text-[11px] mb-1">
 <span>LỊCH HỌC 1H &amp; 10P</span>
 <span>⏰</span>
 </div>
 <div class="text-2xl font-black text-amber-400">
 {leaderNotifications.filter(n => n.type === 'schedule_reminder_1h' || n.type === 'schedule_reminder_10m').length}
 </div>
 <div class="text-[10px] text-slate-400 mt-1">Chuông đón học sinh</div>
 </div>

 <div class="p-4 rounded-2xl bg-slate-900 border border-teal-500/40 shadow-xl">
 <div class="flex items-center justify-between text-slate-400 font-bold text-[11px] mb-1">
 <span>HẠN HỌC PHÍ</span>
 <span>💰</span>
 </div>
 <div class="text-2xl font-black text-teal-400">
 {leaderNotifications.filter(n => n.type === 'tuition_due').length}
 </div>
 <div class="text-[10px] text-slate-400 mt-1">Đến hạn &amp; quá hạn</div>
 </div>
 </div>

 <!-- Test Deck / Simulation Controls -->
 <div class="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-2">
 <span class="text-sm">🧪</span>
 <span class="font-bold text-xs text-white">Khung Giả Lập Tình Huống Cảnh Báo Cho Leader (Simulation Deck)</span>
 </div>
 <span class="text-[10px] text-slate-400 font-normal">Nhấn để phát sinh sự kiện thử nghiệm</span>
 </div>
 <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
 <button
 onclick={() => handleAdminSimulate('teacher_missing_attendance')}
 class="p-2.5 rounded-xl bg-slate-950 border border-rose-500/40 text-rose-400 hover:bg-rose-950/40 font-bold text-left transition-all truncate"
 title="Mô phỏng: Buổi học diễn ra hơn 15 phút nhưng giáo viên chưa điểm danh"
 >
 ⚠️ GV Quên Điểm Danh
 </button>
 <button
 onclick={() => handleAdminSimulate('attendance_summary_absent')}
 class="p-2.5 rounded-xl bg-slate-950 border border-cx-500/40 text-cx-400 hover:bg-cx-950/40 font-bold text-left transition-all truncate"
 title="Mô phỏng: Điểm danh lớp thiếu học sinh"
 >
 📋 Điểm Danh Thiếu 2 Em
 </button>
 <button
 onclick={() => handleAdminSimulate('schedule_reminder_10m')}
 class="p-2.5 rounded-xl bg-slate-950 border border-amber-500/40 text-amber-400 hover:bg-amber-950/40 font-bold text-left transition-all truncate"
 title="Mô phỏng: Nhắc nhở lịch học trước 10 phút"
 >
 🚨 Nhắc Lịch Học 10 Phút
 </button>
 <button
 onclick={() => handleAdminSimulate('new_registration')}
 class="p-2.5 rounded-xl bg-slate-950 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/40 font-bold text-left transition-all truncate"
 title="Mô phỏng: Học sinh mới đăng ký tài khoản"
 >
 🔔 Đăng Ký Mới (Trial)
 </button>
 <button
 onclick={() => handleAdminSimulate('test_completed')}
 class="p-2.5 rounded-xl bg-slate-950 border border-purple-500/40 text-purple-400 hover:bg-purple-950/40 font-bold text-left transition-all truncate"
 title="Mô phỏng: Học sinh vừa hoàn thành bài test"
 >
 📝 Học Sinh Nộp Bài Test
 </button>
 <button
 onclick={() => handleAdminSimulate('tuition_due')}
 class="p-2.5 rounded-xl bg-slate-950 border border-teal-500/40 text-teal-400 hover:bg-teal-950/40 font-bold text-left transition-all truncate"
 title="Mô phỏng: Học phí đến hạn nộp"
 >
 💰 Tới Hạn Học Phí
 </button>
 </div>
 </div>

 <!-- Filter Chips -->
 <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
 <button
 onclick={() => notifFilter = 'all'}
 class="px-3 py-1.5 rounded-xl font-bold shrink-0 transition-colors {notifFilter === 'all' ? 'bg-white text-slate-900 font-black' : 'bg-slate-900 text-slate-400 hover:text-white'}"
 >
 Tất cả ({leaderNotifications.length})
 </button>
 <button
 onclick={() => notifFilter = 'teacher_missing_attendance'}
 class="px-3 py-1.5 rounded-xl font-bold shrink-0 transition-colors {notifFilter === 'teacher_missing_attendance' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-rose-400 hover:bg-rose-950/40'}"
 >
 ⚠️ GV Chưa Điểm Danh
 </button>
 <button
 onclick={() => notifFilter = 'attendance_summary'}
 class="px-3 py-1.5 rounded-xl font-bold shrink-0 transition-colors {notifFilter === 'attendance_summary' ? 'bg-cx-600 text-white' : 'bg-slate-900 text-cx-400 hover:bg-cx-950/40'}"
 >
 📋 Điểm Danh &amp; Vắng
 </button>
 <button
 onclick={() => notifFilter = 'schedule'}
 class="px-3 py-1.5 rounded-xl font-bold shrink-0 transition-colors {notifFilter === 'schedule' ? 'bg-amber-600 text-white' : 'bg-slate-900 text-amber-400 hover:bg-amber-950/40'}"
 >
 ⏰ Lịch Học 1h / 10p
 </button>
 <button
 onclick={() => notifFilter = 'new_registration'}
 class="px-3 py-1.5 rounded-xl font-bold shrink-0 transition-colors {notifFilter === 'new_registration' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-emerald-400 hover:bg-emerald-950/40'}"
 >
 🔔 Đăng Ký Mới
 </button>
 <button
 onclick={() => notifFilter = 'test_completed'}
 class="px-3 py-1.5 rounded-xl font-bold shrink-0 transition-colors {notifFilter === 'test_completed' ? 'bg-purple-600 text-white' : 'bg-slate-900 text-purple-400 hover:bg-purple-950/40'}"
 >
 📝 Bài Thi Xong
 </button>
 <button
 onclick={() => notifFilter = 'tuition_due'}
 class="px-3 py-1.5 rounded-xl font-bold shrink-0 transition-colors {notifFilter === 'tuition_due' ? 'bg-teal-600 text-white' : 'bg-slate-900 text-teal-400 hover:bg-teal-950/40'}"
 >
 💰 Hạn Học Phí
 </button>
 </div>

 <!-- Notification Feed List -->
 <div class="space-y-3">
 {#if filteredLeaderNotifs.length === 0}
 <div class="p-12 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-3">
 <div class="text-5xl">✨</div>
 <div class="text-base font-bold text-white">Không có thông báo nào trong bộ lọc này</div>
 <p class="text-xs text-slate-400 max-w-sm mx-auto">
 Mọi lịch học, sổ điểm danh và học phí thuộc danh mục này đều đang ở trạng thái chuẩn xác.
 </p>
 </div>
 {:else}
 {#each filteredLeaderNotifs as notif (notif.id)}
 <div class="p-4 sm:p-5 rounded-3xl border transition-all duration-200 {notif.is_read ? 'bg-slate-900/60 border-slate-800 opacity-75' : 'bg-slate-900 border-emerald-500/50 shadow-xl shadow-emerald-950/20 ring-1 ring-emerald-500/20'}">
 <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
 <div class="flex flex-wrap items-center gap-2">
 <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border {notif.priority === 'urgent' ? 'bg-rose-950/80 text-rose-300 border-rose-700' : notif.priority === 'high' ? 'bg-amber-950/80 text-amber-300 border-amber-700' : 'bg-emerald-950/80 text-emerald-300 border-emerald-700'}">
 {#if notif.priority === 'urgent'}
 🚨 KHẨN CẤP
 {:else if notif.type === 'teacher_missing_attendance'}
 ⚠️ GV CHƯA ĐIỂM DANH
 {:else if notif.type === 'attendance_summary'}
 📋 ĐIỂM DANH LỚP
 {:else if notif.type === 'schedule_reminder_10m'}
 ⏰ SẮP VÀO HỌC (10P)
 {:else if notif.type === 'schedule_reminder_1h'}
 ⏰ LỊCH HỌC (1H)
 {:else if notif.type === 'new_registration'}
 🔔 ĐĂNG KÝ MỚI
 {:else if notif.type === 'test_completed'}
 📝 BÀI TEST XONG
 {:else if notif.type === 'tuition_due'}
 💰 HẠN HỌC PHÍ
 {:else}
 📢 HỆ THỐNG
 {/if}
 </span>

 {#if !notif.is_read}
 <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" title="Thông báo mới chưa đọc"></span>
 {/if}

 <h3 class="text-sm font-bold text-white">
 {notif.title}
 </h3>
 </div>

 <div class="flex items-center gap-3 text-xs text-slate-400 self-end sm:self-auto">
 <span>{new Date(notif.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} • {new Date(notif.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
 <button
 onclick={() => { deleteLeaderNotification(notif.id); leaderNotifications = getAllLeaderNotifications(); }}
 class="text-slate-500 hover:text-rose-400 p-1 transition-colors"
 title="Xóa thông báo"
 >
 ✕
 </button>
 </div>
 </div>

 <p class="text-xs text-slate-300 leading-relaxed whitespace-pre-line mb-3">
 {notif.message}
 </p>

 <!-- Action Bar -->
 <div class="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800/80 text-xs">
 {#if notif.type === 'teacher_missing_attendance'}
 <button
 onclick={() => handleRemindTeacherDirectly(notif)}
 class="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/30 transition-all hover:scale-105"
 >
 <span>📨</span>
 <span>Gửi Nhắc Nhở Riêng Giáo Viên</span>
 </button>
 <button
 onclick={() => activeTab = 'schedule'}
 class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-colors"
 >
 Xem Ca Học &amp; Điểm Danh
 </button>
 {:else if notif.type === 'new_registration'}
 <button
 onclick={() => activeTab = 'students'}
 class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all hover:scale-105"
 >
 <span>✓</span>
 <span>Chuyển Sang Duyệt Học Viên Này</span>
 </button>
 {:else if notif.type === 'attendance_summary'}
 <a
 href="/schedule?tab=attendance"
 class="px-3.5 py-1.5 rounded-xl bg-cx-600 hover:bg-cx-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-cx-600/30 transition-all hover:scale-105"
 >
 <span>👁️</span>
 <span>Mở Sổ Điểm Danh Lớp</span>
 </a>
 {:else if notif.type === 'test_completed'}
 <a
 href="/evaluations"
 class="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-purple-600/30 transition-all hover:scale-105"
 >
 <span>📊</span>
 <span>Xem Đánh Giá &amp; Điểm Số</span>
 </a>
 {:else if notif.type === 'tuition_due'}
 <button
 onclick={() => activeTab = 'tuition'}
 class="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-teal-600/30 transition-all hover:scale-105"
 >
 <span>💳</span>
 <span>Mở Bảng Thu Học Phí (VietQR)</span>
 </button>
 {:else if notif.type.startsWith('schedule_reminder')}
 <button
 onclick={() => activeTab = 'schedule'}
 class="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5 shadow-md shadow-amber-600/30 transition-all hover:scale-105"
 >
 <span>📅</span>
 <span>Mở Lịch Học Hôm Nay</span>
 </button>
 {/if}

 {#if !notif.is_read}
 <button
 onclick={() => { markNotificationAsRead(notif.id); leaderNotifications = getAllLeaderNotifications(); }}
 class="px-3 py-1.5 rounded-xl text-slate-400 hover:text-white font-medium ml-auto transition-colors"
 >
 Đánh dấu đã đọc
 </button>
 {/if}
 </div>
 </div>
 {/each}
 {/if}
 </div>
 </div>

 <!-- ================= TAB WORKFLOWS: HÀNG ĐỢI DUYỆT & TUYỂN DỤNG ================= -->
 {:else if activeTab === 'workflows'}
 <div class="space-y-6 animate-in fade-in duration-200">
 <!-- Header Deck -->
 <div class="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 border border-amber-500/30 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div class="space-y-1">
 <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
 <span>📋 HÀNG ĐỢI NGHIỆP VỤ NHÂN SỰ &amp; ĐIỀU HÀNH GIẢNG DẠY</span>
 </div>
 <h2 class="text-xl sm:text-2xl font-black text-white">
 Phê Duyệt Dạy Thay, Ứng Lương &amp; Tuyển Dụng Giáo Viên 👩‍🏫
 </h2>
 <p class="text-xs text-slate-300 max-w-2xl leading-relaxed">
 Quy trình dạy thay 2 bước chuẩn hóa (Đồng nghiệp nhận ca → Leader Cô Dung duyệt). Ứng lương tự động đối trừ vào kỳ tính lương cuối tháng. Quản lý ứng viên tuyển dụng giáo viên thời vụ/cố định và lịch phỏng vấn.
 </p>
 </div>
 <div class="flex items-center gap-2.5">
 <button
 type="button"
 onclick={() => showAddRecruitModal = true}
 class="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-600/20 transition-all flex items-center gap-1.5"
 >
 <span>➕ Thêm Ứng Viên Tuyển Dụng</span>
 </button>
 <button
 type="button"
 onclick={loadAdminWorkflows}
 class="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition-all"
 title="Tải lại dữ liệu hàng đợi"
 >
 🔄
 </button>
 </div>
 </div>

 <!-- SECTION 1: PHÊ DUYỆT NGHỈ & DẠY THAY (2 BƯỚC) -->
 <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-2.5">
 <span class="text-lg">📝</span>
 <div>
 <h3 class="font-black text-sm text-white">Đơn Xin Nghỉ &amp; Đề Nghị Dạy Thay ({adminWorkflows.leaves.length})</h3>
 <p class="text-[11px] text-slate-400">Yêu cầu giáo viên thay thế đồng ý trước khi Leader phê duyệt chính thức</p>
 </div>
 </div>
 <span class="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
 {adminWorkflows.leaves.filter(l => l.admin_status === 'pending').length} đơn chờ duyệt
 </span>
 </div>

 {#if adminWorkflows.leaves.length === 0}
 <div class="p-8 text-center text-xs text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800/80">
 Hiện không có đơn xin nghỉ hoặc đề nghị dạy thay nào.
 </div>
 {:else}
 <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
 {#each adminWorkflows.leaves as req}
 <div class="p-4 rounded-2xl bg-slate-950 border {req.admin_status === 'approved' ? 'border-emerald-500/40' : req.admin_status === 'rejected' ? 'border-rose-500/30' : 'border-amber-500/40'} space-y-3">
 <div class="flex items-start justify-between gap-2">
 <div>
 <div class="font-bold text-xs text-white flex items-center gap-1.5">
 <span>👨‍🏫 {req.teacher_name}</span>
 <span class="text-[10px] text-slate-400">xin nghỉ ca dạy</span>
 </div>
 <div class="text-[11px] text-amber-300 font-semibold mt-0.5">
 Ca học: {req.session_date} ({req.start_time} - {req.end_time}) • Lớp {req.class_id}
 </div>
 </div>
 <span class="text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider {req.admin_status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : req.admin_status === 'rejected' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}">
 {req.admin_status === 'approved' ? '✓ Đã Duyệt' : req.admin_status === 'rejected' ? '✕ Từ Chối' : '⏳ Chờ Duyệt'}
 </span>
 </div>

 <div class="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 italic">
 "{req.reason}"
 </div>

 <!-- 2-Step Substitute Status -->
 <div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between">
 <div>
 <span class="text-slate-400 text-[10px]">Giáo viên dạy thay:</span>
 <div class="font-bold text-slate-200">
 {req.substitute_teacher_name || 'Chưa chỉ định'}
 </div>
 </div>
 <div>
 {#if req.substitute_status === 'accepted'}
 <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
 ✓ Đồng nghiệp đã đồng ý
 </span>
 {:else if req.substitute_status === 'rejected'}
 <span class="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold text-[10px]">
 ✕ Đồng nghiệp từ chối
 </span>
 {:else}
 <span class="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold text-[10px]">
 ⏳ Chờ đồng nghiệp xác nhận
 </span>
 {/if}
 </div>
 </div>

 <!-- Admin Action Buttons -->
 {#if req.admin_status === 'pending'}
 <div class="flex items-center gap-2 pt-1">
 <button
 type="button"
 disabled={req.substitute_status !== 'accepted'}
 onclick={() => handleAdminLeaveDecision(req.id, 'approve')}
 class="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1"
 >
 <span>✓ Phê Duyệt Ca Dạy Thay</span>
 </button>
 <button
 type="button"
 onclick={() => handleAdminLeaveDecision(req.id, 'reject')}
 class="py-2 px-3 rounded-xl bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-300 font-bold text-xs transition-all"
 >
 Từ Chối
 </button>
 </div>
 {#if req.substitute_status !== 'accepted'}
 <p class="text-[10px] text-amber-400/80 italic text-center">
 * Cần giáo viên dạy thay bấm đồng ý nhận ca trước khi Leader duyệt
 </p>
 {/if}
 {/if}
 </div>
 {/each}
 </div>
 {/if}
 </div>

 <!-- SECTION 2: DUYỆT ỨNG LƯƠNG & ĐỐI TRỪ KỲ LƯƠNG -->
 <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-2.5">
 <span class="text-lg">💰</span>
 <div>
 <h3 class="font-black text-sm text-white">Đơn Xin Ứng Lương &amp; Khấu Trừ Kỳ Lương ({adminWorkflows.advances.length})</h3>
 <p class="text-[11px] text-slate-400">Số tiền được duyệt sẽ tự động đối trừ vào bảng tính lương cuối tháng</p>
 </div>
 </div>
 <span class="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30">
 {adminWorkflows.advances.filter(a => a.status === 'pending').length} đơn chờ duyệt
 </span>
 </div>

 {#if adminWorkflows.advances.length === 0}
 <div class="p-8 text-center text-xs text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800/80">
 Chưa có yêu cầu ứng lương nào trong hệ thống.
 </div>
 {:else}
 <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
 {#each adminWorkflows.advances as adv}
 <div class="p-4 rounded-2xl bg-slate-950 border {adv.status === 'approved' ? 'border-emerald-500/40' : adv.status === 'rejected' ? 'border-rose-500/30' : 'border-teal-500/40'} space-y-3">
 <div class="flex items-start justify-between gap-2">
 <div>
 <div class="font-bold text-xs text-white">
 👨‍🏫 {adv.teacher_name}
 </div>
 <div class="text-base font-black text-emerald-400 mt-0.5">
 {Number(adv.amount_vnd).toLocaleString('vi-VN')} đ
 </div>
 <div class="text-[10px] text-slate-400">
 Kỳ lương đối trừ: <strong class="text-slate-200">{adv.billing_cycle}</strong>
 </div>
 </div>
 <span class="text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider {adv.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : adv.status === 'rejected' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}">
 {adv.status === 'approved' ? '✓ Đã Chi Ứng' : adv.status === 'rejected' ? '✕ Từ Chối' : '⏳ Chờ Duyệt'}
 </span>
 </div>

 <div class="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 italic">
 Lý do: "{adv.reason}"
 </div>

 {#if adv.status === 'pending'}
 <div class="flex items-center gap-2 pt-1">
 <button
 type="button"
 onclick={() => handleAdminAdvanceDecision(adv.id, 'approve')}
 class="flex-1 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1"
 >
 <span>✓ Duyệt Ứng Lương &amp; Ghi Đối Trừ</span>
 </button>
 <button
 type="button"
 onclick={() => handleAdminAdvanceDecision(adv.id, 'reject')}
 class="py-2 px-3 rounded-xl bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-300 font-bold text-xs transition-all"
 >
 Từ Chối
 </button>
 </div>
 {/if}
 </div>
 {/each}
 </div>
 {/if}
 </div>

 <!-- SECTION 3: TUYỂN DỤNG GIÁO VIÊN & LỊCH PHỎNG VẤN -->
 <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-2.5">
 <span class="text-lg">🎯</span>
 <div>
 <h3 class="font-black text-sm text-white">Quản Lý Tuyển Dụng Giáo Viên Thời Vụ / Cố Định ({adminWorkflows.recruitment.length})</h3>
 <p class="text-[11px] text-slate-400">Theo dõi hồ sơ ứng viên, lịch phỏng vấn và kết quả tuyển chọn đội ngũ</p>
 </div>
 </div>
 <button
 type="button"
 onclick={() => showAddRecruitModal = true}
 class="text-xs px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-sm transition-all"
 >
 ➕ Thêm Ứng Viên
 </button>
 </div>

 {#if adminWorkflows.recruitment.length === 0}
 <div class="p-8 text-center text-xs text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800/80">
 Chưa có hồ sơ ứng viên tuyển dụng nào.
 </div>
 {:else}
 <div class="overflow-x-auto">
 <table class="w-full text-left text-xs">
 <thead class="bg-slate-950/80 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
 <tr>
 <th class="p-3 rounded-l-xl">Ứng Viên</th>
 <th class="p-3">Vị Trí</th>
 <th class="p-3">Liên Hệ</th>
 <th class="p-3">Lịch Phỏng Vấn</th>
 <th class="p-3">Hồ Sơ / Ghi Chú</th>
 <th class="p-3 rounded-r-xl text-right">Trạng Thái</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-slate-800/60">
 {#each adminWorkflows.recruitment as rec}
 <tr class="hover:bg-slate-800/30 transition-all">
 <td class="p-3 font-bold text-white">
 {rec.candidate_name}
 </td>
 <td class="p-3">
 <span class="px-2 py-0.5 rounded-md font-bold text-[10px] {rec.position_type === 'permanent' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-amber-500/20 text-amber-300'}">
 {rec.position_type === 'permanent' ? 'Cố Định (Full-time)' : 'Thời Vụ (Contractor)'}
 </span>
 </td>
 <td class="p-3 text-slate-300">
 <div>📞 {rec.phone || 'Chưa có'}</div>
 <div class="text-[10px] text-slate-400">✉️ {rec.email || 'Chưa có'}</div>
 </td>
 <td class="p-3 text-amber-300 font-semibold">
 {rec.interview_time || 'Chưa xếp lịch'}
 </td>
 <td class="p-3 text-slate-300 max-w-[200px] truncate">
 {#if rec.cv_link}
 <a href={rec.cv_link} target="_blank" class="text-cx-400 hover:underline">📄 Xem CV</a>
 {/if}
 <div class="text-[11px] text-slate-400 italic truncate">{rec.notes || 'Không có ghi chú'}</div>
 </td>
 <td class="p-3 text-right">
 <span class="px-2.5 py-1 rounded-full text-[10px] font-bold {rec.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-400' : rec.status === 'rejected' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-300'}">
 {rec.status === 'accepted' ? '✓ Trúng Tuyển' : rec.status === 'rejected' ? '✕ Không Đạt' : '⏳ Đang Phỏng Vấn'}
 </span>
 </td>
 </tr>
 {/each}
 </tbody>
 </table>
 </div>
 {/if}
 </div>
 </div>

 <!-- Modal Thêm Ứng Viên Tuyển Dụng -->
 {#if showAddRecruitModal}
 <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
 <div class="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl text-xs">
 <div class="flex items-center justify-between">
 <h3 class="font-black text-base text-white">Thêm Hồ Sơ Ứng Viên Tuyển Dụng</h3>
 <button onclick={() => showAddRecruitModal = false} class="text-slate-400 hover:text-white">✕</button>
 </div>

 <div class="space-y-3">
 <div>
 <label class="block text-slate-400 font-bold mb-1">Họ và tên ứng viên *</label>
 <input type="text" bind:value={newRecruit.candidate_name} placeholder="VD: Thầy Nguyễn Hoàng Nam" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
 </div>

 <div class="grid grid-cols-2 gap-3">
 <div>
 <label class="block text-slate-400 font-bold mb-1">Số điện thoại</label>
 <input type="text" bind:value={newRecruit.phone} placeholder="0912345678" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
 </div>
 <div>
 <label class="block text-slate-400 font-bold mb-1">Loại hợp đồng</label>
 <select bind:value={newRecruit.position_type} class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white">
 <option value="contractor">Thời Vụ (Contractor)</option>
 <option value="permanent">Cố Định (Full-time)</option>
 </select>
 </div>
 </div>

 <div>
 <label class="block text-slate-400 font-bold mb-1">Lịch phỏng vấn dự kiến</label>
 <input type="datetime-local" bind:value={newRecruit.interview_time} class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
 </div>

 <div>
 <label class="block text-slate-400 font-bold mb-1">Link CV / Google Drive</label>
 <input type="url" bind:value={newRecruit.cv_link} placeholder="https://drive.google.com/..." class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
 </div>

 <div>
 <label class="block text-slate-400 font-bold mb-1">Ghi chú bằng cấp / kinh nghiệm</label>
 <textarea bind:value={newRecruit.notes} rows="2" placeholder="IELTS 8.0, 3 năm kinh nghiệm dạy GDPT Lớp 10-12..." class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"></textarea>
 </div>
 </div>

 <div class="flex items-center justify-end gap-2 pt-2">
 <button type="button" onclick={() => showAddRecruitModal = false} class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold">Hủy</button>
 <button type="button" onclick={handleSaveRecruitment} class="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold">Lưu Hồ Sơ</button>
 </div>
 </div>
 </div>
 {/if}

 <!-- ================= TAB 1: QUẢN LÝ HỌC SINH & DUYỆT TRIAL ================= -->
 {:else if activeTab === 'students'}
 <div class="space-y-4">
 <!-- Action & Filter Ribbon -->
 <div class="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
 <div class="flex flex-wrap items-center gap-2">
 <!-- Search -->
 <div class="relative min-w-[200px]">
 <input
 type="text"
 bind:value={studentSearchTerm}
 placeholder="Tìm theo tên, username, SĐT..."
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
 />
 <span class="absolute right-3 top-2 text-slate-500">🔍</span>
 </div>

 <!-- Status Filter -->
 <select
 bind:value={studentStatusFilter}
 class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
 >
 <option value="all">Tất cả trạng thái ({studentsList.length})</option>
 <option value="trial">⏳ Chờ duyệt (Trial - {trialStudents.length})</option>
 <option value="official">✅ Chính thức ({officialStudents.length})</option>
 </select>

 <!-- Grade Filter -->
 <select
 bind:value={studentGradeFilter}
 class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
 >
 <option value="all">Tất cả khối lớp</option>
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
 <option value="IELTS">IELTS</option>
 <option value="TOEIC">TOEIC</option>
 </select>
 </div>

 <button
 onclick={() => showAddStudentModal = true}
 class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all hover:scale-105"
 >
 <span>➕ Thêm Học Sinh Mới</span>
 </button>
 </div>

 <!-- Students Table -->
 <div class="rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
 <div class="overflow-x-auto">
 <table class="w-full text-left text-xs text-slate-300">
 <thead class="bg-slate-950/80 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-extrabold">
 <tr>
 <th class="p-4">Học Sinh</th>
 <th class="p-4">Khối Lớp</th>
 <th class="p-4">Trạng Thái Tài Khoản</th>
 <th class="p-4">Quỹ Sao Thưởng (⭐)</th>
 <th class="p-4">Phụ Huynh Liên Kết</th>
 <th class="p-4 text-right">Thao Tác Quản Trị</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-slate-800">
 {#each filteredStudents as st}
 {@const isTrial = st.status === 'trial' || st.approval_status === 'trial'}
 {@const stars = getStudentStars(st.id)}
 {@const meta = typeof st.metadata === 'string' ? JSON.parse(st.metadata || '{}') : (st.metadata || {})}

 <tr class="hover:bg-slate-800/40 transition-colors">
 <!-- Name & Avatar -->
 <td class="p-4">
 <div class="flex items-center gap-3">
 <img
 src={st.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${st.username}`}
 alt={st.name}
 class="w-10 h-10 rounded-2xl bg-slate-800 object-cover border border-slate-700 shadow-md"
 />
 <div>
 <div class="font-extrabold text-sm text-white flex items-center gap-1.5">
 <span>{st.name}</span>
 {#if st.status === 'blocked'}
 <span class="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold">Đã Khóa</span>
 {/if}
 </div>
 <div class="text-[11px] text-slate-400 font-mono">@{st.username || st.phone}</div>
 {#if st.phone}
 <div class="text-[10px] text-slate-500">📞 {st.phone}</div>
 {/if}
 </div>
 </div>
 </td>

 <!-- Grade -->
 <td class="p-4">
 <div class="flex flex-wrap items-center gap-1.5">
 {#each getUserEnrolledGrades(st) as g}
 <span class="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-300 font-bold border border-indigo-500/20 text-xs">
 {g}
 </span>
 {/each}
 <button
 onclick={() => openClassModal(st)}
 class="text-[10px] text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 font-bold transition-all"
 title="Đổi hoặc gán thêm khối lớp"
 >
 ✏️ Set Lớp
 </button>
 </div>
 {#if meta.school}
 <div class="text-[10px] text-slate-500 mt-0.5 truncate max-w-[120px]">{meta.school}</div>
 {/if}
 </td>

 <!-- Status -->
 <td class="p-4">
 {#if isTrial}
 <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-extrabold border border-amber-500/40 text-[11px] animate-pulse">
 <span>⏳ Dùng Thử (Trial)</span>
 </span>
 {:else}
 <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 text-[11px]">
 <span>✓ Chính Thức</span>
 </span>
 {/if}
 </td>

 <!-- Stars -->
 <td class="p-4">
 <div class="flex items-center gap-2">
 <span class="font-extrabold text-sm text-amber-400 font-mono">
 {stars.stars_balance || 0} ⭐
 </span>
 <button
 onclick={() => openStarModal(st)}
 class="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 text-[10px] font-bold"
 title="Thưởng / Phạt sao"
 >
 + / -
 </button>
 </div>
 <div class="text-[10px] text-slate-500 mt-0.5">
 Quy đổi: {((stars.stars_balance || 0) * 10).toLocaleString()}đ
 </div>
 </td>

 <!-- Parent -->
 <td class="p-4">
 {#if meta.parent_name || meta.linked_student_name}
 <div class="font-bold text-xs text-white">{meta.parent_name || 'Phụ huynh'}</div>
 <div class="text-[10px] text-slate-400">{meta.parent_phone || 'Chưa có SĐT'}</div>
 {:else}
 <span class="text-slate-500 text-[11px] italic">Chưa liên kết</span>
 {/if}
 </td>

 <!-- Actions -->
 <td class="p-4 text-right">
 <div class="flex items-center justify-end gap-1.5">
 {#if isTrial}
 <button
 onclick={() => handleApproveOfficial(st)}
 class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all hover:scale-105"
 title="Duyệt tài khoản chính thức"
 >
 ✅ Duyệt Ngay
 </button>
 {/if}

 <button
 onclick={() => openStarModal(st)}
 class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs"
 title="Thưởng/phạt Sao"
 >
 ⭐
 </button>

 <button
 onclick={() => handleToggleBlockUser(st)}
 class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 {st.status === 'blocked' ? 'text-emerald-400' : 'text-slate-400'} text-xs"
 title={st.status === 'blocked' ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
 >
 {st.status === 'blocked' ? '🔓' : '🔒'}
 </button>

 <button
 onclick={() => handleRemoveStudent(st.id, st.name)}
 class="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/50 text-rose-400 text-xs"
 title="Xóa học sinh"
 >
 🗑️
 </button>
 </div>
 </td>
 </tr>
 {/each}
 {#if filteredStudents.length === 0}
 <tr>
 <td colspan="6" class="p-8 text-center text-slate-500 italic">
 Không tìm thấy học sinh nào phù hợp với bộ lọc tìm kiếm.
 </td>
 </tr>
 {/if}
 </tbody>
 </table>
 </div>
 </div>
 </div>

 <!-- ================= TAB 2: ĐỘI NGŨ GIÁO VIÊN & LƯƠNG CA DẠY ================= -->
 {:else if activeTab === 'teachers'}
 <div class="space-y-4">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-slate-900 border border-slate-800">
 <div>
 <h2 class="text-base font-extrabold text-white">Đội Ngũ Nhân Sự &amp; Bảng Lương Ca Dạy</h2>
 <p class="text-xs text-slate-400">Phân cấp 4 role: Leader Cô Dung • Bản Ngữ • Trợ Giảng Cố Định • Trợ Giảng Part-time</p>
 </div>
 <button
 onclick={() => showAddTeacherModal = true}
 class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-teal-600/30 flex items-center justify-center gap-1.5"
 >
 <span>➕ Thêm Giáo Viên Mới</span>
 </button>
 </div>

 <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {#each teachersList as t}
 {@const profile = teacherProfiles.find(p => p.teacher_id === t.id) || {}}
 {@const isLeader = isSuperAdmin(t) || t.username === 'msdung' || profile.role_level === 'lead'}
 {@const pendingReminders = (profile.private_reminders || []).filter(r => r.status === 'pending')}

 <div class="rounded-3xl bg-slate-900 border {isLeader ? 'border-amber-500/40' : 'border-slate-800'} p-5 space-y-4 shadow-xl flex flex-col justify-between">
 <div class="space-y-3">
 <div class="flex items-start justify-between gap-3">
 <div class="flex items-center gap-3">
 <img
 src={t.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'}
 alt={t.name}
 class="w-12 h-12 rounded-2xl bg-slate-800 object-cover border border-slate-700 shadow-md"
 />
 <div>
 <div class="font-extrabold text-sm text-white flex items-center gap-1.5">
 <span>{t.name}</span>
 {#if isLeader}
 <span class="text-amber-400" title="Leader">👑</span>
 {/if}
 </div>
 <div class="text-[11px] text-teal-400 font-mono">@{t.username}</div>
 <div class="text-[10px] text-slate-400">{t.email}</div>
 </div>
 </div>

 <span class="px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase border {isLeader ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : (profile.role_type === 'native' || profile.role_level === 'native') ? 'bg-teal-500/20 text-teal-300 border-teal-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'}">
 {profile.role_title || profile.role_label || (isLeader ? 'Leader Cô Dung' : 'Giáo Viên')}
 </span>
 </div>

 <!-- Compensation & Ratings -->
 <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2 text-xs">
 <div class="flex justify-between items-center text-slate-400">
 <span>Lương Cứng:</span>
 <span class="font-bold text-white">{(profile.base_salary_vnd || 5000000).toLocaleString('vi-VN')}đ / tháng</span>
 </div>
 <div class="flex justify-between items-center text-slate-400">
 <span>Thù Lao Ca Dạy:</span>
 <span class="font-bold text-emerald-400">{(profile.rate_per_session_vnd || profile.per_session_rate_vnd || 200000).toLocaleString('vi-VN')}đ / ca</span>
 </div>
 <div class="flex justify-between items-center text-slate-400">
 <span>Ca Đã Dạy Tháng:</span>
 <span class="font-bold text-indigo-400">{profile.total_sessions_taught || profile.monthly_completed_sessions || 0} ca</span>
 </div>
 <div class="flex justify-between items-center text-slate-300">
 <span>Đánh Giá Leader:</span>
 <span class="font-bold text-amber-400">{'⭐'.repeat(Math.min(5, Math.max(1, Math.round(profile.leader_rating || profile.rating_stars || 5))))} ({profile.leader_rating || profile.rating_stars || 5.0})</span>
 </div>
 <div class="flex justify-between items-center border-t border-slate-800/80 pt-1.5 text-xs font-bold">
 <span class="text-teal-300">💰 Tổng Thu Nhập Dự Kiến:</span>
 <span class="text-emerald-400 font-black text-sm">
 {((profile.base_salary_vnd || 5000000) + ((profile.total_sessions_taught || profile.monthly_completed_sessions || 0) * (profile.rate_per_session_vnd || profile.per_session_rate_vnd || 200000))).toLocaleString('vi-VN')} đ
 </span>
 </div>
 </div>

 {#if pendingReminders.length > 0}
 <div class="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center justify-between">
 <span>⚠️ Có {pendingReminders.length} nhắc nhở riêng chưa xem</span>
 </div>
 {/if}
 </div>

 <div class="flex items-center justify-between pt-2 border-t border-slate-800">
 <button
 onclick={() => openEditStaff(t)}
 class="px-3.5 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/30 font-bold text-xs transition-all"
 >
 ⚙️ Cấu Hình Lương &amp; Nhắc Nhở
 </button>

 {#if !SUPERADMIN_EMAILS.includes(t.email)}
 <button
 onclick={() => handleRemoveTeacher(t.id, t.email, t.name)}
 class="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/50 text-rose-400 text-xs"
 title="Xóa quyền giáo viên"
 >
 🗑️
 </button>
 {/if}
 </div>
 </div>
 {/each}
 </div>
 </div>

 <!-- ================= TAB 3: THỜI KHÓA BIỂU ĐỒNG BỘ ================= -->
 {:else if activeTab === 'schedule'}
 <div class="space-y-4">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-slate-900 border border-slate-800">
 <div>
 <h2 class="text-base font-extrabold text-white">Thời Khóa Biểu &amp; Ca Học Toàn Hệ Thống</h2>
 <p class="text-xs text-slate-400">Đồng bộ với phân quyền lớp, danh sách học sinh và giáo viên phụ trách</p>
 </div>
 <button
 onclick={openCreateSessionModal}
 class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5"
 >
 <span>➕ Thêm Buổi Học Mới</span>
 </button>
 </div>

 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 {#each classSessions as sess}
 <div class="rounded-3xl bg-slate-900 border border-slate-800 p-5 space-y-4 shadow-xl flex flex-col justify-between">
 <div class="space-y-3">
 <div class="flex items-start justify-between gap-3">
 <div>
 <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase">
 {sess.grade_level || 'Lớp 7'}
 </span>
 <h3 class="text-base font-black text-white mt-1">{sess.class_name}</h3>
 <div class="text-xs text-slate-400 mt-0.5">{sess.subject_topic}</div>
 </div>

 <div class="text-right">
 <div class="text-xs font-bold text-emerald-400">{sess.day_name}</div>
 <div class="text-sm font-black font-mono text-white">{sess.start_time} - {sess.end_time}</div>
 </div>
 </div>

 <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs text-slate-300">
 <div class="flex items-center gap-2">
 <span class="text-slate-400">👩‍🏫 Phụ trách:</span>
 <span class="font-bold text-white">{sess.teacher_name}</span>
 {#if sess.assistant_teacher_name}
 <span class="text-slate-500">• Trợ giảng: {sess.assistant_teacher_name}</span>
 {/if}
 </div>
 <div class="flex items-center gap-2">
 <span class="text-slate-400">📍 Địa điểm:</span>
 <span class="text-slate-200 line-clamp-1">{sess.location}</span>
 </div>
 <div class="flex items-center justify-between pt-1 border-t border-slate-800">
 <span class="text-slate-400">👥 Học sinh theo lớp:</span>
 <span class="font-bold text-indigo-300">{(sess.student_ids || []).length} em</span>
 </div>
 </div>
 </div>

 <!-- Actions Bar -->
 <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
 <button
 onclick={() => handleTriggerNotification(sess)}
 class="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white border border-amber-500/30 font-bold text-xs transition-all flex items-center gap-1"
 title="Bắn thông báo nhắc đón 10 phút trước giờ học"
 >
 <span>🔔 Bắn Nhắc Đón 10p</span>
 </button>

 <div class="flex items-center gap-1.5">
 <button
 onclick={() => openRollCall(sess)}
 class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
 >
 📋 Điểm Danh
 </button>
 <button
 onclick={() => openEditSession(sess)}
 class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
 title="Sửa lịch học"
 >
 ✏️
 </button>
 <button
 onclick={() => handleDeleteSession(sess.id, sess.class_name)}
 class="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/50 text-rose-400 text-xs"
 title="Xóa buổi học"
 >
 🗑️
 </button>
 </div>
 </div>
 </div>
 {/each}
 </div>
 </div>

 <!-- ================= TAB 4: HỌC PHÍ & ĐỔI SAO TRỪ TIỀN (VIETQR) ================= -->
 {:else if activeTab === 'tuition'}
 <div class="space-y-4">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-slate-900 border border-slate-800">
 <div>
 <h2 class="text-base font-extrabold text-white">Quản Lý Học Phí &amp; Khấu Trừ Sao Thưởng (100 Sao = 1.000đ)</h2>
 <p class="text-xs text-slate-400">Xuất hóa đơn VietQR thông minh, kiểm toán tăng trưởng &amp; 5 mẫu PDF xanh lá dễ thương</p>
 </div>
 <div class="flex items-center gap-2">
 <button
 onclick={handleExportGoogleSheetCSV}
 class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 border border-slate-700"
 >
 <span>📊 Xuất CSV Google Sheets</span>
 </button>
 <button
 onclick={openCreateBillModal}
 class="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-1.5"
 >
 <span>➕ Lập Hóa Đơn Mới</span>
 </button>
 </div>
 </div>

 <div class="rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
 <div class="overflow-x-auto">
 <table class="w-full text-left text-xs text-slate-300">
 <thead class="bg-slate-950/80 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-extrabold">
 <tr>
 <th class="p-4">Học Sinh</th>
 <th class="p-4">Kỳ Học Phí</th>
 <th class="p-4">Học Phí Gốc</th>
 <th class="p-4">Sao Trừ (⭐)</th>
 <th class="p-4">Thực Thu (VNĐ)</th>
 <th class="p-4">Tăng Trưởng</th>
 <th class="p-4 text-right">Xem &amp; Gửi QR</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-slate-800">
 {#each tuitionBills as bill}
 <tr class="hover:bg-slate-800/40 transition-colors">
 <td class="p-4">
 <div class="font-extrabold text-white text-sm">{bill.student_name}</div>
 <div class="text-[10px] text-slate-400">{bill.grade_level} • {bill.age} tuổi</div>
 </td>
 <td class="p-4 font-bold text-slate-200">{bill.billing_period}</td>
 <td class="p-4 font-mono font-bold">{bill.base_tuition_vnd.toLocaleString()}đ</td>
 <td class="p-4">
 <span class="text-amber-400 font-bold font-mono">-{bill.stars_deducted} ⭐</span>
 <div class="text-[10px] text-emerald-400">(-{bill.discount_vnd.toLocaleString()}đ)</div>
 </td>
 <td class="p-4">
 <span class="text-emerald-400 font-black text-sm font-mono">
 {bill.final_amount_vnd.toLocaleString()}đ
 </span>
 </td>
 <td class="p-4">
 <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
 +{bill.growth_percentage}% Bứt phá
 </span>
 </td>
 <td class="p-4 text-right">
 <div class="flex items-center justify-end gap-1.5">
 <button
 onclick={() => openPreview(bill)}
 class="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
 title="Xem trước 5 mẫu PDF"
 >
 📄 Preview
 </button>
 <button
 onclick={() => handleSendBillToZalo(bill)}
 class="px-2.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs"
 title="Bắn QR sang Zalo"
 >
 💬 Gửi Zalo
 </button>
 </div>
 </td>
 </tr>
 {/each}
 {#if tuitionBills.length === 0}
 <tr>
 <td colspan="7" class="p-8 text-center text-slate-500 italic">
 Chưa có hóa đơn học phí nào được tạo. Bấm "+ Lập Hóa Đơn Mới" để bắt đầu.
 </td>
 </tr>
 {/if}
 </tbody>
 </table>
 </div>
 </div>
 </div>

 <!-- ================= TAB 5: GIÁO VIÊN CP (TEACHER PORTAL) ================= -->
 {:else if activeTab === 'teacher_cp'}
 <div class="space-y-4">
 <div class="p-5 rounded-3xl bg-gradient-to-r from-teal-950/60 via-slate-900 to-slate-900 border border-teal-500/30 shadow-xl space-y-2">
 <div class="flex items-center justify-between">
 <span class="text-xs font-extrabold text-teal-400 uppercase tracking-wider flex items-center gap-2">
 <span class="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse"></span>
 <span>KHÔNG GIAN ĐIỀU HÀNH DÀNH RIÊNG CHO GIÁO VIÊN &amp; TRỢ GIẢNG</span>
 </span>
 <span class="text-xs text-slate-400 font-mono">Đang thao tác: <strong>{currentUser?.name}</strong></span>
 </div>
 <h2 class="text-lg font-black text-white">Quản Lý Lớp Học, Điểm Danh &amp; Gửi Báo Cáo Tức Thời Đến Leader Cô Dung</h2>
 <p class="text-xs text-slate-300 leading-relaxed">
 Mỗi khi giáo viên thực hiện chỉnh sửa lịch học, điểm danh, ghi nhận xét sổ đầu bài hoặc chấm bài thi, hệ thống sẽ tự động lưu Snapshot kiểm toán và bắn thông báo trực tiếp đến tài khoản SuperAdmin của Cô Dung!
 </p>
 </div>

 <!-- Quick Action Dispatch Bar for Teacher -->
 <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
 <button
 onclick={() => handleTeacherLogQuickAction('BÁO_CÁO_TIẾN_ĐỘ', 'Đã hoàn thành giảng dạy chuyên đề ngữ pháp theo kế hoạch')}
 class="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-teal-500 text-left transition-all group"
 >
 <div class="text-xl mb-1">📢</div>
 <div class="font-extrabold text-white group-hover:text-teal-400">Báo Cáo Tiến Độ Hôm Nay</div>
 <div class="text-[11px] text-slate-400 mt-0.5">Gửi thông báo tới Leader Cô Dung hoàn thành giáo án</div>
 </button>

 <button
 onclick={() => handleTeacherLogQuickAction('ĐỀ_XUẤT_KHEN_THƯỞNG', 'Đề xuất thưởng Sao cho các học sinh đạt điểm cao bài test')}
 class="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-500 text-left transition-all group"
 >
 <div class="text-xl mb-1">⭐</div>
 <div class="font-extrabold text-white group-hover:text-amber-400">Đề Xuất Khen Thưởng Sao</div>
 <div class="text-[11px] text-slate-400 mt-0.5">Báo cáo các em học sinh có tinh thần học tập vượt bậc</div>
 </button>

 <button
 onclick={() => handleTeacherLogQuickAction('GHI_CHÚ_LỚP_HỌC', 'Cần nhắc nhở lớp ôn tập kỹ collocations trước giờ kiểm tra')}
 class="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500 text-left transition-all group"
 >
 <div class="text-xl mb-1">📝</div>
 <div class="font-extrabold text-white group-hover:text-indigo-400">Ghi Chú &amp; Dặn Dò Phụ Huynh</div>
 <div class="text-[11px] text-slate-400 mt-0.5">Đồng bộ tức thì sang Sổ phụ huynh &amp; Zalo bot</div>
 </button>
 </div>

 <!-- Teacher's Assigned Classes -->
 <div class="space-y-3">
 <h3 class="text-sm font-extrabold text-slate-200">Các Lớp Được Phân Công Quản Lý ({teacherManagedSessions.length}):</h3>
 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 {#each teacherManagedSessions as sess}
 <div class="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
 <div class="flex justify-between items-start">
 <div>
 <span class="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30 uppercase">
 {sess.grade_level}
 </span>
 <h4 class="text-base font-black text-white mt-1">{sess.class_name}</h4>
 <div class="text-xs text-slate-400">{sess.day_name} • {sess.start_time} - {sess.end_time}</div>
 </div>
 <button
 onclick={() => openRollCall(sess)}
 class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md"
 >
 📋 Điểm Danh &amp; Ghi Sổ
 </button>
 </div>

 <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
 <span>Số học sinh thuộc quản lý:</span>
 <span class="font-bold text-emerald-400">{(sess.student_ids || []).length} học sinh</span>
 </div>
 </div>
 {/each}
 </div>
 </div>

 <!-- Live Stream of Teacher Actions Log -->
 <div class="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
 <div class="flex items-center justify-between border-b border-slate-800 pb-2">
 <span class="text-xs font-extrabold text-teal-400 uppercase tracking-wider">
 NHẬT KÝ THAO TÁC CỦA GIÁO VIÊN (ĐÃ BÁO CÁO LEADER CÔ DUNG)
 </span>
 <span class="text-[11px] text-slate-400">{recentTeacherActions.length} bản ghi gần nhất</span>
 </div>

 <div class="space-y-2 text-xs font-mono">
 {#each recentTeacherActions as act}
 <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
 <div>
 <span class="text-teal-400 font-bold">[{act.action}]</span>
 <span class="text-white ml-2">{act.actor_email}</span>
 <span class="text-slate-400 text-[10px] ml-2 font-sans">{act.data_after ? act.data_after.slice(0, 80) + '...' : ''}</span>
 </div>
 <span class="text-[10px] text-slate-500">{new Date(act.created_at).toLocaleTimeString('vi-VN')}</span>
 </div>
 {/each}
 {#if recentTeacherActions.length === 0}
 <div class="text-slate-500 italic text-center py-4">Chưa có thao tác nào từ giáo viên được ghi nhận.</div>
 {/if}
 </div>
 </div>
 </div>

 <!-- ================= TAB: QUẢN LÝ ĐẤU TRƯỜNG TRÒ CHƠI (GAMES GATEKEEPER) ================= -->
 {:else if activeTab === 'games'}
 <div class="space-y-6 max-w-4xl">
 <!-- Master Switch Control Card -->
 <div class="p-6 rounded-3xl bg-slate-900 border-2 {gameSettings.is_portal_open ? 'border-emerald-500/50' : 'border-rose-500/50'} shadow-xl space-y-4">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
 <div class="flex items-center gap-3">
 <div class="w-12 h-12 rounded-2xl {gameSettings.is_portal_open ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'} flex items-center justify-center text-3xl font-bold">
 {gameSettings.is_portal_open ? '🟢' : '🔒'}
 </div>
 <div>
 <div class="flex items-center gap-2">
 <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">CÔNG TẮC TỔNG (MASTER GATEKEEPER)</span>
 <span class="px-2 py-0.5 rounded text-[10px] font-black {gameSettings.is_portal_open ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}">
 {gameSettings.is_portal_open ? 'HỌC SINH ĐƯỢC CHƠI' : 'HỌC SINH BỊ KHÓA'}
 </span>
 </div>
 <h2 class="text-xl font-black text-white mt-0.5">
 Quyền Truy Cập Đấu Trường Game Của Học Sinh
 </h2>
 </div>
 </div>

 <div>
 {#if gameSettings.is_portal_open}
 <button
 onclick={() => handleAdminToggleMasterGames(false)}
 class="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2"
 >
 <span>🔒 Khóa Cổng Game Học Sinh</span>
 </button>
 {:else}
 <button
 onclick={() => handleAdminToggleMasterGames(true)}
 class="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2"
 >
 <span>🚀 Mở Cổng Game Cho Học Sinh</span>
 </button>
 {/if}
 </div>
 </div>

 <p class="text-xs text-slate-300 leading-relaxed">
 Khi <strong>Khóa</strong>: Học sinh khi vào mục trò chơi sẽ thấy thông báo chờ lệnh và yêu cầu tập trung làm bài chính khóa. 
 Giáo viên luôn có quyền vào chơi thử nghiệm bất cứ lúc nào để kiểm tra học liệu trước giờ dạy.
 </p>

 <!-- Direct Test Launcher Link -->
 <div class="pt-2 flex items-center gap-3">
 <a
 href="/games"
 class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
 >
 <span>🎮 Mở Đấu Trường Trò Chơi (Kiểm Tra Thực Tế)</span>
 <span>➔</span>
 </a>
 </div>
 </div>

 <!-- Granular Games List -->
 <div class="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
 <div class="border-b border-slate-800 pb-3">
 <h3 class="text-base font-extrabold text-white">Quản Lý Từng Trò Chơi Giáo Dục (Bật / Tắt Linh Hoạt)</h3>
 <p class="text-xs text-slate-400 mt-0.5">Giáo viên có thể mở riêng lẻ từng trò chơi theo đúng chủ điểm bài học trong ngày.</p>
 </div>

 <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
 <!-- Game 1 -->
 <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
 <div>
 <div class="font-bold text-white flex items-center gap-1.5">
 <span>⚡ Speed Match</span>
 </div>
 <div class="text-[11px] text-slate-400">Từ vựng phản xạ (12 thẻ)</div>
 </div>
 <button
 onclick={() => handleAdminToggleGame('speed_match')}
 class="px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all {gameSettings.active_games.speed_match ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}"
 >
 {gameSettings.active_games.speed_match ? 'Đang Bật' : 'Đã Tắt'}
 </button>
 </div>

 <!-- Game 2 -->
 <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
 <div>
 <div class="font-bold text-white flex items-center gap-1.5">
 <span>🔤 Word Scramble</span>
 </div>
 <div class="text-[11px] text-slate-400">Từ vựng ghép chữ Duolingo</div>
 </div>
 <button
 onclick={() => handleAdminToggleGame('word_scramble')}
 class="px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all {gameSettings.active_games.word_scramble ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}"
 >
 {gameSettings.active_games.word_scramble ? 'Đang Bật' : 'Đã Tắt'}
 </button>
 </div>

 <!-- Game 3 -->
 <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
 <div>
 <div class="font-bold text-white flex items-center gap-1.5">
 <span>☄️ Meteor Rush</span>
 </div>
 <div class="text-[11px] text-slate-400">Bắn thiên thạch 10 giây</div>
 </div>
 <button
 onclick={() => handleAdminToggleGame('meteor_rush')}
 class="px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all {gameSettings.active_games.meteor_rush ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}"
 >
 {gameSettings.active_games.meteor_rush ? 'Đang Bật' : 'Đã Tắt'}
 </button>
 </div>

 <!-- Game 4 -->
 <div class="p-4 rounded-2xl bg-slate-950 border border-indigo-500/30 flex items-center justify-between">
 <div>
 <div class="font-bold text-indigo-300 flex items-center gap-1.5">
 <span>🧩 Sentence Builder</span>
 </div>
 <div class="text-[11px] text-slate-400">Ngữ pháp cấu trúc câu K12</div>
 </div>
 <button
 onclick={() => handleAdminToggleGame('sentence_builder')}
 class="px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all {gameSettings.active_games.sentence_builder ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}"
 >
 {gameSettings.active_games.sentence_builder ? 'Đang Bật' : 'Đã Tắt'}
 </button>
 </div>

 <!-- Game 5 -->
 <div class="p-4 rounded-2xl bg-slate-950 border border-indigo-500/30 flex items-center justify-between">
 <div>
 <div class="font-bold text-indigo-300 flex items-center gap-1.5">
 <span>⏱️ Grammar Tense</span>
 </div>
 <div class="text-[11px] text-slate-400">Thì động từ &amp; bẫy ngữ pháp</div>
 </div>
 <button
 onclick={() => handleAdminToggleGame('grammar_tense')}
 class="px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all {gameSettings.active_games.grammar_tense ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}"
 >
 {gameSettings.active_games.grammar_tense ? 'Đang Bật' : 'Đã Tắt'}
 </button>
 </div>

 <!-- Game 6 -->
 <div class="p-4 rounded-2xl bg-slate-950 border border-purple-500/30 flex items-center justify-between">
 <div>
 <div class="font-bold text-purple-300 flex items-center gap-1.5">
 <span>🎴 Memory Flip 3D</span>
 </div>
 <div class="text-[11px] text-slate-400">Lật thẻ bài trí nhớ đa giác quan</div>
 </div>
 <button
 onclick={() => handleAdminToggleGame('memory_flip')}
 class="px-3 py-1.5 rounded-xl font-bold text-[11px] transition-all {gameSettings.active_games.memory_flip ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-400'}"
 >
 {gameSettings.active_games.memory_flip ? 'Đang Bật' : 'Đã Tắt'}
 </button>
 </div>
 </div>
 </div>

 <!-- Settings & Star Reward Configuration -->
 <div class="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
 <h3 class="text-base font-extrabold text-white">Cấu Hình Thưởng Sao &amp; Thông Điệp Khóa</h3>
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="game-reward">Mức Thưởng Sao (⭐) Mỗi Trận Thắng:</label>
 <select
 id="game-reward"
 value={gameSettings.reward_stars_per_game || 20}
 onchange={(e) => handleAdminSaveRewardStars(e.currentTarget.value)}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-emerald-500"
 >
 <option value="10">+10 ⭐ (100đ trừ học phí)</option>
 <option value="20">+20 ⭐ (200đ trừ học phí)</option>
 <option value="50">+50 ⭐ (500đ trừ học phí)</option>
 <option value="100">+100 ⭐ (1.000đ trừ học phí)</option>
 </select>
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="game-lock-msg">Thông Điệp Khóa Cho Học Sinh:</label>
 <input
 id="game-lock-msg"
 type="text"
 bind:value={gameSettings.lock_message}
 onblur={() => saveGameArenaSettings({ lock_message: gameSettings.lock_message }, currentUser)}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
 />
 </div>
 </div>
 </div>
 </div>

 <!-- ================= TAB 6: WEBHOOK BOT ================= -->
 {:else if activeTab === 'webhooks'}
 <div class="space-y-4 max-w-3xl">
 <div class="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
 <div class="border-b border-slate-800 pb-3">
 <h2 class="text-base font-extrabold text-white">Cấu Hình Webhook Báo Cáo Tức Thời Bot Zalo / Telegram</h2>
 <p class="text-xs text-slate-400 mt-0.5">Tự động phát thông báo khi có học sinh nộp bài, điểm danh xong, lập học phí hoặc giáo viên thực hiện thao tác.</p>
 </div>

 <div class="space-y-3 text-xs">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="wh-name">Tên Webhook / Bot:</label>
 <input
 id="wh-name"
 type="text"
 bind:value={webhookForm.name}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
 />
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="wh-url">Endpoint URL (Webhook Target):</label>
 <input
 id="wh-url"
 type="url"
 bind:value={webhookForm.url}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
 />
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="wh-events">Sự Kiện Lắng Nghe (Event Types):</label>
 <input
 id="wh-events"
 type="text"
 bind:value={webhookForm.event_types}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
 />
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="wh-secret">Secret Key (ký webhook):</label>
 <div class="flex gap-2">
 <input
 id="wh-secret"
 type="password"
 bind:value={webhookForm.secret}
 placeholder="Để trống hoặc bấm Tạo mới"
 autocomplete="new-password"
 class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
 />
 <button
 onclick={generateWebhookSecret}
 class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs whitespace-nowrap"
 >🎲 Tạo mới</button>
 </div>
 <p class="text-[11px] text-slate-500 mt-1">Secret phải trùng với giá trị cấu hình ở phía nhận webhook. Không hardcode secret trong code.</p>
 </div>
 </div>

 <div class="flex items-center justify-between pt-3 border-t border-slate-800">
 <button
 onclick={handleTestWebhook}
 class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5"
 >
 <span>📡 Gửi Tín Hiệu Thử Nghiệm</span>
 </button>

 <button
 onclick={handleSaveWebhook}
 class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30"
 >
 💾 Lưu Cấu Hình Webhook
 </button>
 </div>
 </div>
 </div>

 <!-- ================= TAB 7: SNAPSHOTS KIỂM TOÁN ================= -->
 {:else if activeTab === 'snapshots'}
 <div class="space-y-4">
 <div class="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
 <div>
 <h2 class="text-base font-extrabold text-white">Kiểm Toán Lịch Sử Snapshot (100% Audit Trail)</h2>
 <p class="text-xs text-slate-400">Toàn bộ hành động thêm/sửa/xóa, điểm danh, nộp bài đều được ghi vết vĩnh viễn.</p>
 </div>
 <span class="text-xs font-mono font-bold text-emerald-400">{snapshots.length} bản ghi</span>
 </div>

 <div class="rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
 <div class="overflow-x-auto">
 <table class="w-full text-left text-xs text-slate-300">
 <thead class="bg-slate-950/80 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-extrabold">
 <tr>
 <th class="p-4">Thời Gian</th>
 <th class="p-4">Tác Tử (Actor)</th>
 <th class="p-4">Hành Động</th>
 <th class="p-4">Đối Tượng</th>
 <th class="p-4 text-right">Chi Tiết Diff</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-slate-800 font-mono text-[11px]">
 {#each snapshots.slice(0, 30) as snap}
 <tr class="hover:bg-slate-800/40 transition-colors">
 <td class="p-4 text-slate-400">{new Date(snap.created_at).toLocaleString('vi-VN')}</td>
 <td class="p-4">
 <span class="font-bold text-white">{snap.actor_email}</span>
 <span class="text-slate-500">({snap.actor_role})</span>
 </td>
 <td class="p-4">
 <span class="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-bold">
 {snap.action}
 </span>
 </td>
 <td class="p-4 text-slate-400">{snap.entity_type} #{snap.entity_id}</td>
 <td class="p-4 text-right">
 <button
 onclick={() => selectedSnapshot = snap}
 class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans font-bold text-xs"
 >
 Xem Diff
 </button>
 </td>
 </tr>
 {/each}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 {/if}

 <!-- ================= MODALS ================= -->

 <!-- MODAL 1: THƯỞNG / PHẠT SAO HỌC SINH -->
 {#if showStarModal && selectedStudentForStar}
 <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
 <div class="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
 <div class="flex items-center justify-between border-b border-slate-800 pb-3">
 <div>
 <div class="text-xs font-bold text-amber-400 uppercase">QUẢN LÝ SAO THƯỞNG &amp; KỶ LUẬT</div>
 <h3 class="text-base font-black text-white mt-0.5">{selectedStudentForStar.name}</h3>
 </div>
 <button onclick={() => showStarModal = false} class="text-slate-400 hover:text-white">✕</button>
 </div>

 <div class="space-y-3 text-xs">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="star-amount">
 Số Sao Thay Đổi (Dương = Thưởng, Âm = Phạt):
 </label>
 <div class="flex items-center gap-2">
 <input
 id="star-amount"
 type="number"
 step="10"
 bind:value={starDelta}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-400"
 />
 <span class="text-amber-400 font-bold text-sm">⭐</span>
 </div>
 <div class="flex gap-1.5 mt-2">
 <button onclick={() => starDelta = 50} class="px-2 py-1 rounded bg-slate-800 text-amber-400 font-bold text-[10px]">+50 ⭐</button>
 <button onclick={() => starDelta = 100} class="px-2 py-1 rounded bg-slate-800 text-amber-400 font-bold text-[10px]">+100 ⭐</button>
 <button onclick={() => starDelta = 200} class="px-2 py-1 rounded bg-slate-800 text-amber-400 font-bold text-[10px]">+200 ⭐</button>
 <button onclick={() => starDelta = -20} class="px-2 py-1 rounded bg-slate-800 text-rose-400 font-bold text-[10px]">-20 ⭐</button>
 <button onclick={() => starDelta = -50} class="px-2 py-1 rounded bg-slate-800 text-rose-400 font-bold text-[10px]">-50 ⭐</button>
 </div>
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="star-reason">Lý Do Ghi Nhận:</label>
 <input
 id="star-reason"
 type="text"
 bind:value={starReason}
 placeholder="VD: Điểm thi 15p xuất sắc, vi phạm giờ giấc..."
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-amber-400"
 />
 </div>

 <div class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
 💡 Tỉ lệ chuẩn: <strong>100 Sao = 1.000 VNĐ</strong> trừ trực tiếp vào hóa đơn học phí hàng tháng của học sinh.
 </div>
 </div>

 <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
 <button onclick={() => showStarModal = false} class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">
 Hủy Bỏ
 </button>
 <button onclick={handleSaveStarAdjustment} class="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg">
 Xác Nhận Cập Nhật Sao
 </button>
 </div>
 </div>
 </div>
 {/if}

 <!-- MODAL 2: ĐỔI KHỐI LỚP HỌC SINH -->
 {#if showClassModal && selectedStudentForClass}
 <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
 <div class="bg-slate-900 border border-indigo-500/40 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
 <div class="flex items-center justify-between border-b border-slate-800 pb-3">
 <div>
 <div class="text-xs font-bold text-indigo-400 uppercase">CHUYỂN KHỐI LỚP &amp; PHÂN PHÒNG</div>
 <h3 class="text-base font-black text-white mt-0.5">{selectedStudentForClass.name}</h3>
 </div>
 <button onclick={() => showClassModal = false} class="text-slate-400 hover:text-white">✕</button>
 </div>

 <div class="space-y-4 text-xs">
 <!-- Active Enrolled Classes Tag List -->
 <div>
 <div class="flex items-center justify-between mb-1.5">
 <label class="font-bold text-slate-300">Khóa Học Đang Mở Cho Học Sinh Này:</label>
 <span class="text-[10px] text-emerald-400 font-bold">{currentStudentEnrolledList.length} lớp kích hoạt</span>
 </div>
 <div class="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 min-h-[42px] items-center">
 {#each currentStudentEnrolledList as g}
 <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
 <span>✓ {g}</span>
 {#if currentStudentEnrolledList.length > 1}
 <button
 type="button"
 onclick={() => handleRemoveAdditionalGrade(g)}
 class="text-rose-400 hover:text-rose-300 text-xs font-black ml-1 p-0.5 rounded hover:bg-rose-900/30"
 title="Gỡ quyền lớp này"
 >
 ✕
 </button>
 {/if}
 </span>
 {/each}
 </div>
 <p class="text-[10px] text-slate-400 mt-1">Học sinh chỉ nhìn thấy bài học và phòng thi của các lớp được liệt kê ở đây.</p>
 </div>

 <!-- Add Additional Grade Section -->
 <div class="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
 <label class="block font-bold text-slate-200">➕ Set / Cấp Quyền Thêm Lớp Mới:</label>
 <div class="flex gap-2">
 <select
 bind:value={additionalGradeToEnroll}
 class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-emerald-400 text-xs"
 >
 <option value="Lớp 1">Lớp 1 (Phonics &amp; Global Success)</option>
 <option value="Lớp 2">Lớp 2 (Global Success)</option>
 <option value="Lớp 3">Lớp 3 (Global Success)</option>
 <option value="Lớp 4">Lớp 4 (Global Success)</option>
 <option value="Lớp 5">Lớp 5 (Ôn Thi Chuyển Cấp)</option>
 <option value="Lớp 6">Lớp 6 (THCS Global Success)</option>
 <option value="Lớp 7">Lớp 7 (THCS Global Success A1)</option>
 <option value="Lớp 8">Lớp 8 (THCS Global Success)</option>
 <option value="Lớp 9">Lớp 9 (Luyện Thi Vào 10)</option>
 <option value="Lớp 10">Lớp 10 (THPT Mới)</option>
 <option value="Lớp 11">Lớp 11 (THPT Mới)</option>
 <option value="Lớp 12">Lớp 12 (Ôn Thi THPTQG 2026)</option>
 <option value="Luyện Thi IELTS">Luyện Thi IELTS Academic</option>
 <option value="Luyện Thi TOEIC">Luyện Thi TOEIC</option>
 <option value="Luyện Thi TOEFL">Luyện Thi TOEFL iBT</option>
 <option value="Luyện Thi VSTEP">Luyện Thi VSTEP B1-B2</option>
 </select>
 <button
 type="button"
 onclick={handleAddAdditionalGrade}
 class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1 flex-shrink-0"
 >
 <span>➕ Thêm Lớp</span>
 </button>
 </div>
 </div>

 <!-- Primary Grade & Timetable Section -->
 <div class="space-y-3 pt-2 border-t border-slate-800">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="target-grade">Khối Lớp Chính Khóa Mặc Định:</label>
 <select
 id="target-grade"
 bind:value={targetGrade}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-bold focus:outline-none focus:border-indigo-400"
 >
 <option value="Lớp 1">Lớp 1 (Phonics &amp; Global Success)</option>
 <option value="Lớp 2">Lớp 2 (Global Success)</option>
 <option value="Lớp 3">Lớp 3 (Global Success)</option>
 <option value="Lớp 4">Lớp 4 (Global Success)</option>
 <option value="Lớp 5">Lớp 5 (Ôn Thi Chuyển Cấp)</option>
 <option value="Lớp 6">Lớp 6 (THCS Global Success)</option>
 <option value="Lớp 7">Lớp 7 (THCS Global Success A1)</option>
 <option value="Lớp 8">Lớp 8 (THCS Global Success)</option>
 <option value="Lớp 9">Lớp 9 (Luyện Thi Vào 10 &amp; Chuyên Anh)</option>
 <option value="Lớp 10">Lớp 10 (THPT Mới)</option>
 <option value="Lớp 11">Lớp 11 (THPT Mới)</option>
 <option value="Lớp 12">Lớp 12 (Ôn Thi THPTQG 2026)</option>
 <option value="Luyện Thi IELTS">Luyện Thi IELTS Academic</option>
 <option value="Luyện Thi TOEIC / TOEFL">Luyện Thi TOEIC / TOEFL</option>
 </select>
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="target-class">Gán Vào Buổi Học / Lịch Học:</label>
 <select
 id="target-class"
 bind:value={targetClassId}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-medium focus:outline-none focus:border-indigo-400"
 >
 {#each classSessions as s}
 <option value={s.id}>
 {s.class_name} ({s.day_name} {s.start_time})
 </option>
 {/each}
 </select>
 </div>
 </div>
 </div>

 <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
 <button onclick={() => showClassModal = false} class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">
 Đóng
 </button>
 <button onclick={handleSaveClassChange} class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs">
 Lưu Khối Lớp Chính
 </button>
 </div>
 </div>
 </div>
 {/if}

 <!-- MODAL 3: THÊM HỌC SINH MỚI -->
 {#if showAddStudentModal}
 <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
 <div class="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
 <div class="flex items-center justify-between border-b border-slate-800 pb-3">
 <div>
 <div class="text-xs font-bold text-emerald-400 uppercase">THÊM HỌC SINH MỚI TRỰC TIẾP</div>
 <h3 class="text-base font-black text-white mt-0.5">Khởi Tạo Hồ Sơ Học Viên</h3>
 </div>
 <button onclick={() => showAddStudentModal = false} class="text-slate-400 hover:text-white">✕</button>
 </div>

 <div class="space-y-3 text-xs">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-st-name">Họ và Tên (*):</label>
 <input
 id="new-st-name"
 type="text"
 bind:value={newStudentForm.name}
 placeholder="VD: Trần Hoàng Minh"
 required
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
 />
 </div>

 <div class="grid grid-cols-2 gap-2">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-st-user">Tên Đăng Nhập:</label>
 <input
 id="new-st-user"
 type="text"
 bind:value={newStudentForm.username}
 placeholder="hoangminh..."
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
 />
 </div>
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-st-phone">Số Điện Thoại:</label>
 <input
 id="new-st-phone"
 type="tel"
 bind:value={newStudentForm.phone}
 placeholder="09..."
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
 />
 </div>
 </div>

 <div class="grid grid-cols-2 gap-2">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-st-grade">Khối Lớp:</label>
 <select
 id="new-st-grade"
 bind:value={newStudentForm.grade}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
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
 <option value="Luyện Thi IELTS">Luyện Thi IELTS</option>
 <option value="Luyện Thi TOEIC / TOEFL">Luyện Thi TOEIC / TOEFL</option>
 </select>
 </div>
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-st-school">Trường Học:</label>
 <input
 id="new-st-school"
 type="text"
 bind:value={newStudentForm.school}
 placeholder="THCS Giảng Võ..."
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
 />
 </div>
 </div>

 <div class="grid grid-cols-2 gap-2">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-st-pname">Tên Phụ Huynh:</label>
 <input
 id="new-st-pname"
 type="text"
 bind:value={newStudentForm.parent_name}
 placeholder="Anh Hùng..."
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
 />
 </div>
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-st-pphone">SĐT Phụ Huynh:</label>
 <input
 id="new-st-pphone"
 type="tel"
 bind:value={newStudentForm.parent_phone}
 placeholder="09..."
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
 />
 </div>
 </div>
 </div>

 <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
 <button onclick={() => showAddStudentModal = false} class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">
 Hủy Bỏ
 </button>
 <button onclick={handleAddStudent} class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg">
 Khởi Tạo Học Sinh
 </button>
 </div>
 </div>
 </div>
 {/if}

 <!-- MODAL 4: THÊM GIÁO VIÊN MỚI -->
 {#if showAddTeacherModal}
 <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
 <div class="bg-slate-900 border border-teal-500/40 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
 <div class="flex items-center justify-between border-b border-slate-800 pb-3">
 <div>
 <div class="text-xs font-bold text-teal-400 uppercase">CẤP QUYỀN GIÁO VIÊN &amp; TRỢ GIẢNG</div>
 <h3 class="text-base font-black text-white mt-0.5">Thêm Nhân Sự Giảng Dạy</h3>
 </div>
 <button onclick={() => showAddTeacherModal = false} class="text-slate-400 hover:text-white">✕</button>
 </div>

 <div class="space-y-3 text-xs">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-teach-name">Họ và Tên (*):</label>
 <input
 id="new-teach-name"
 type="text"
 bind:value={newTeacher.name}
 placeholder="VD: Cô Mai Phương"
 required
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-teal-500"
 />
 </div>

 <div class="grid grid-cols-2 gap-2">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-teach-user">Tên Đăng Nhập:</label>
 <input
 id="new-teach-user"
 type="text"
 bind:value={newTeacher.username}
 placeholder="teacher.phuong..."
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-teal-500"
 />
 </div>
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-teach-phone">Số Điện Thoại:</label>
 <input
 id="new-teach-phone"
 type="tel"
 bind:value={newTeacher.phone}
 placeholder="09..."
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-teal-500"
 />
 </div>
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="new-teach-certs">Chứng Chỉ &amp; Bằng Cấp:</label>
 <input
 id="new-teach-certs"
 type="text"
 bind:value={newTeacher.certs}
 placeholder="TESOL, IELTS 8.0, Cử nhân Sư phạm Anh..."
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-teal-500"
 />
 </div>
 </div>

 <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
 <button onclick={() => showAddTeacherModal = false} class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">
 Hủy Bỏ
 </button>
 <button onclick={handleAddTeacher} class="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-lg">
 Cấp Quyền Truy Cập
 </button>
 </div>
 </div>
 </div>
 {/if}

 <!-- MODAL 5: CẤU HÌNH LƯƠNG & ROLE GIÁO VIÊN (TeacherStaffModal) -->
 <TeacherStaffModal
 bind:isOpen={showStaffModal}
 staffProfile={editingStaffProfile}
 teacherId={editingStaffProfile?.teacher_id}
 currentUser={currentUser}
 onSaved={handleStaffSaved}
 onUpdated={handleStaffSaved}
 />

 <!-- MODAL 6: SỬA BUỔI HỌC (SessionEditModal) -->
 <SessionEditModal
 bind:isOpen={showSessionEditModal}
 session={editingSession}
 onSaved={handleSessionSaved}
 />

 <!-- MODAL 7: ĐIỂM DANH & SỔ ĐẦU BÀI (SessionRollCallModal) -->
 <SessionRollCallModal
 bind:isOpen={showRollCallModal}
 session={activeRollCallSession}
 onSaved={handleRollCallCompleted}
 />

 <!-- MODAL 8: HÓA ĐƠN HỌC PHÍ & PREVIEW 5 MẪU PDF (TuitionBillReport) -->
 {#if showPdfPreviewModal && previewBill}
 <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
 <div class="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl p-6 md:p-8 space-y-4 shadow-2xl my-8 relative">
 <div class="flex items-center justify-between pb-2 border-b border-slate-800">
 <div class="text-sm font-bold text-white flex items-center gap-2">
 <span>📑</span>
 <span>Bản Xem Trước Hóa Đơn &amp; Đổi Sao (Mẫu {previewTemplateId})</span>
 </div>
 <button
 onclick={() => showPdfPreviewModal = false}
 class="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
 >
 ✕
 </button>
 </div>
 <TuitionBillReport
 bill={previewBill}
 templateId={previewTemplateId}
 />
 </div>
 </div>
 {/if}

 <!-- MODAL 9: LẬP HÓA ĐƠN HỌC PHÍ MỚI -->
 {#if showBillModal}
 <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
 <div class="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 md:p-8 space-y-4 shadow-2xl my-8">
 <div class="flex items-center justify-between border-b border-slate-800 pb-3">
 <div>
 <div class="text-xs font-bold text-emerald-400 uppercase">LẬP HÓA ĐƠN HỌC PHÍ &amp; TRỪ SAO THƯỞNG</div>
 <h3 class="text-lg font-black text-white mt-0.5">Quy Đổi 100 Sao = 1.000 VNĐ</h3>
 </div>
 <button onclick={() => showBillModal = false} class="text-slate-400 hover:text-white">✕</button>
 </div>

 <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
 <div>
 <label class="block font-bold text-slate-300 mb-1" for="bill-st">Học Sinh:</label>
 <select
 id="bill-st"
 bind:value={billForm.student_id}
 onchange={(e) => {
 const found = studentsList.find(s => s.id === e.target.value);
 if (found) {
 billForm.student_name = found.name;
 const stars = getStudentStars(found.id);
 billForm.stars_available = stars.stars_balance || 0;
 billForm.stars_deducted = Math.min(stars.stars_balance || 0, 10000);
 let meta = {};
 try { meta = typeof found.metadata === 'string' ? JSON.parse(found.metadata) : (found.metadata || {}); } catch {}
 billForm.grade_level = meta.grade || 'Lớp 7';
 billForm.parent_name = meta.parent_name || '';
 billForm.parent_phone = meta.parent_phone || '';
 }
 }}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
 >
 {#each studentsList as s}
 <option value={s.id}>{s.name} (@{s.username})</option>
 {/each}
 </select>
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="bill-period">Kỳ Thu Phí:</label>
 <input
 id="bill-period"
 type="text"
 bind:value={billForm.billing_period}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
 />
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="bill-base">Học Phí Gốc (VNĐ):</label>
 <input
 id="bill-base"
 type="number"
 step="50000"
 bind:value={billForm.base_tuition_vnd}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
 />
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="bill-stars">
 Số Sao Trừ (Khả dụng: {billForm.stars_available} ⭐):
 </label>
 <input
 id="bill-stars"
 type="number"
 step="100"
 min="0"
 max={billForm.stars_available}
 bind:value={billForm.stars_deducted}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-400 font-mono font-bold"
 />
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="bill-template">Mẫu Thiết Kế PDF:</label>
 <select
 id="bill-template"
 bind:value={billForm.template_id}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-bold"
 >
 {#each TUITION_TEMPLATES as t}
 <option value={t.id}>{t.name} ({t.highlight})</option>
 {/each}
 </select>
 </div>

 <div>
 <label class="block font-bold text-slate-300 mb-1" for="bill-growth">Đánh Giá Tăng Trưởng:</label>
 <input
 id="bill-growth"
 type="text"
 bind:value={billForm.growth_notes}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
 />
 </div>
 </div>

 <div class="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs">
 <div>
 <span class="text-slate-300">Tổng Học Phí Sau Khi Trừ Sao:</span>
 <div class="text-[10px] text-slate-400">Giảm: {((billForm.stars_deducted || 0) * 10).toLocaleString()}đ</div>
 </div>
 <div class="text-xl font-black text-emerald-400 font-mono">
 {Math.max(0, (billForm.base_tuition_vnd || 0) - ((billForm.stars_deducted || 0) * 10)).toLocaleString()}đ
 </div>
 </div>

 <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
 <button onclick={() => showBillModal = false} class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">
 Hủy Bỏ
 </button>
 <button onclick={handleSaveBill} class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg">
 💾 Lưu &amp; Xem Trước PDF
 </button>
 </div>
 </div>
 </div>
 {/if}

 <!-- MODAL 10: SNAPSHOT DIFF VIEWER -->
 {#if selectedSnapshot}
 <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
 <div class="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl p-6 md:p-8 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
 <div class="flex items-start justify-between border-b border-slate-800 pb-3">
 <div>
 <span class="text-xs font-bold text-indigo-400">SNAPSHOT ID: {selectedSnapshot.id}</span>
 <h3 class="text-base font-black text-white mt-1">Chi Tiết Kiểm Toán: {selectedSnapshot.action}</h3>
 </div>
 <button onclick={() => selectedSnapshot = null} class="text-slate-400 hover:text-white">✕</button>
 </div>

 <div class="text-xs space-y-3 font-mono">
 <div class="text-slate-300">
 <strong>Người thực hiện:</strong> {selectedSnapshot.actor_email} ({selectedSnapshot.actor_role})
 </div>
 <div class="text-slate-300">
 <strong>Thời điểm:</strong> {selectedSnapshot.created_at}
 </div>

 <div>
 <div class="text-rose-400 font-bold mb-1">Dữ Liệu Trước Khi Thay Đổi (Before):</div>
 <pre class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[10px] text-rose-300 overflow-x-auto">{selectedSnapshot.data_before || '(Không có / Tạo mới)'}</pre>
 </div>

 <div>
 <div class="text-emerald-400 font-bold mb-1">Dữ Liệu Sau Khi Thay Đổi (After):</div>
 <pre class="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[10px] text-emerald-300 overflow-x-auto">{selectedSnapshot.data_after || '(Đã xóa / Không còn dữ liệu)'}</pre>
 </div>
 </div>

 <div class="flex justify-end pt-3 border-t border-slate-800">
 <button onclick={() => selectedSnapshot = null} class="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold">
 Đóng
 </button>
 </div>
 </div>
 </div>
 {/if}
{/if}
</div>
