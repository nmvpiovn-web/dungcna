<script>
  import { onMount } from 'svelte';
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
  
  // Navigation Tabs: 'students' | 'teachers' | 'schedule' | 'tuition' | 'teacher_cp' | 'webhooks' | 'snapshots'
  let activeTab = $state('students');

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
    secret: 'wh_sec_tienganh_2026_superadmin_fomo',
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
  });

  function loadData() {
    currentUser = getCurrentUser();
    allUsers = getAllUsers();
    snapshots = getAllSnapshots();
    webhooks = getAllWebhooks();
    tuitionBills = getAllTuitionBills();
    classSessions = getAllClassSessions();
    teacherProfiles = getAllTeacherProfiles();
    if (webhooks.length > 0) {
      webhookForm = { ...webhooks[0] };
    }
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
    targetGrade = meta.grade || 'Lớp 7';
    targetClassId = meta.class_id || 'L7_GLOBAL_SUCCESS_A1';
    showClassModal = true;
  }

  function handleSaveClassChange() {
    if (!selectedStudentForClass) return;
    const res = updateUserGradeAndClass(selectedStudentForClass.id, targetGrade, targetClassId, currentUser);
    if (res.success) {
      loadData();
      playAudioFeedback(true);
      showToast(`✅ Đã chuyển học sinh ${selectedStudentForClass.name} sang ${targetGrade}!`);
      showClassModal = false;
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
    const profile = teacherProfiles.find(p => p.teacher_id === teacher.id) || {
      teacher_id: teacher.id,
      teacher_name: teacher.name,
      teacher_email: teacher.email,
      role_level: 'assistant_fixed',
      role_label: 'Trợ Giảng Cố Định',
      base_salary_vnd: 5000000,
      per_session_rate_vnd: 200000,
      monthly_completed_sessions: 8,
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
    <div class="max-w-xl mx-auto my-12 p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200">
      <div class="w-16 h-16 mx-auto rounded-3xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-3xl shadow-inner">
        🎒
      </div>
      <div class="space-y-2">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold">
          <span>Tài Khoản Học Sinh: <strong>{currentUser.name}</strong></span>
        </div>
        <h2 class="text-xl font-heading font-black text-slate-900 dark:text-white">
          Khu Vực Dành Riêng Cho Giáo Viên &amp; Ban Quản Lý
        </h2>
        <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
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

  <!-- ================= TAB 1: QUẢN LÝ HỌC SINH & DUYỆT TRIAL ================= -->
  {#if activeTab === 'students'}
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
                    <div class="flex items-center gap-1.5">
                      <span class="px-2.5 py-1 rounded-xl bg-indigo-500/10 text-indigo-300 font-bold border border-indigo-500/20 text-xs">
                        {meta.grade || st.grade || 'Chưa chọn'}
                      </span>
                      <button
                        onclick={() => openClassModal(st)}
                        class="text-[10px] text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                        title="Đổi khối lớp"
                      >
                        ✏️
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

                <span class="px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase border {isLeader ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : profile.role_level === 'native' ? 'bg-teal-500/20 text-teal-300 border-teal-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'}">
                  {profile.role_label || (isLeader ? 'Leader Cô Dung' : 'Giáo Viên')}
                </span>
              </div>

              <!-- Compensation & Ratings -->
              <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2 text-xs">
                <div class="flex justify-between items-center text-slate-400">
                  <span>Lương Cứng:</span>
                  <span class="font-bold text-white">{(profile.base_salary_vnd || 5000000).toLocaleString()}đ / tháng</span>
                </div>
                <div class="flex justify-between items-center text-slate-400">
                  <span>Thù Lao Ca Dạy:</span>
                  <span class="font-bold text-emerald-400">{(profile.per_session_rate_vnd || 200000).toLocaleString()}đ / ca</span>
                </div>
                <div class="flex justify-between items-center text-slate-400">
                  <span>Ca Đã Dạy Tháng:</span>
                  <span class="font-bold text-indigo-400">{profile.monthly_completed_sessions || 8} ca</span>
                </div>
                <div class="flex justify-between items-center border-t border-slate-800 pt-1 text-slate-300">
                  <span>Đánh Giá Leader:</span>
                  <span class="font-bold text-amber-400">{'⭐'.repeat(profile.rating_stars || 5)}</span>
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

        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-bold text-slate-300 mb-1" for="target-grade">Khối Lớp Đào Tạo Mới:</label>
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
            <label class="block font-bold text-slate-300 mb-1" for="target-class">Gán Vào Buổi Học / Lớp:</label>
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

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button onclick={() => showClassModal = false} class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">
            Hủy Bỏ
          </button>
          <button onclick={handleSaveClassChange} class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs">
            Lưu &amp; Cập Nhật Lớp
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
    onSaved={handleStaffSaved}
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
    onCompleted={handleRollCallCompleted}
  />

  <!-- MODAL 8: HÓA ĐƠN HỌC PHÍ & PREVIEW 5 MẪU PDF (TuitionBillReport) -->
  <TuitionBillReport
    bind:isOpen={showPdfPreviewModal}
    bill={previewBill}
    templateId={previewTemplateId}
  />

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
