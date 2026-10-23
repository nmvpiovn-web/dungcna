<svelte:head>
 <title>AdminCP Tổng • Trung Tâm Điều Hành Đa Nghiệp Vụ D1 • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
 import { onMount } from 'svelte';
 import { getAuthToken, getCurrentUser, deleteClassSession } from '$lib/unifiedStore';
 import ThemeStudioPanel from '$lib/components/ThemeStudioPanel.svelte';
 import AdminUsersPanel from '$lib/components/AdminUsersPanel.svelte';
 import SessionEditModal from '$lib/components/SessionEditModal.svelte';
 import SessionRollCallModal from '$lib/components/SessionRollCallModal.svelte';
 import TeacherStaffModal from '$lib/components/TeacherStaffModal.svelte';
 import LeaderFinance from '$lib/components/LeaderFinance.svelte';
 import { applyThemeVars, clearLocal } from '$lib/themeStudio.js';

 let currentUser = $state(null);
 let campuses = $state([]);
 let events = $state([]);
 let loading = $state(true);

 // 5 Focused Domain Tabs (Zero Clutter)
 let activeTab = $state('users'); // 'users' | 'schedule' | 'teachers' | 'tuition' | 'system'
 let subTabTeachers = $state('profiles'); // 'profiles' | 'workflows'
 let subTabTuition = $state('bills'); // 'bills' | 'links'
 let subTabSystem = $state('campuses'); // 'campuses' | 'reminders' | 'streams' | 'theme'

 let adminToast = $state('');

 // Self Password Change Modal State
 let showSelfPwModal = $state(false);
 let selfOldPassword = $state('');
 let selfNewPassword = $state('');
 let selfConfirmPassword = $state('');
 let selfPwSaving = $state(false);
 let selfPwMsg = $state('');
 let selfPwErr = $state(false);

 // Schedule & Roll Call State (D1)
 let scheduleSessions = $state([]);
 let scheduleLoading = $state(false);
 let scheduleSearch = $state('');
 let showSessionModal = $state(false);
 let editingSession = $state(null);
 let showRollCallModal = $state(false);
 let activeRollCallSession = $state(null);

 // Teachers & HR Workflows State (D1)
 let teacherProfiles = $state([]);
 let teacherLeaves = $state([]);
 let teacherAdvances = $state([]);
 let teacherRecruitments = $state([]);
 let teachersLoading = $state(false);
 let showStaffModal = $state(false);
 let selectedStaffProfile = $state(null);

 // Parent-Student Links State (D1)
 let parentLinks = $state([]);
 let parentLinksLoading = $state(false);
 let marketingCampaigns = $state([]);
 let campaignLeads = $state([]);

 // New / Edit Campus Modal State
 let showAddCampusModal = $state(false);
 let editingCampusId = $state('');
 let newCampus = $state({
  name: '',
  address: '',
  contact_phone: '',
  google_maps_url: '',
  is_primary: false
 });
 let isSavingCampus = $state(false);
 let campusToast = $state('');

 // Cross-role Reminder Form
 let reminderForm = $state({
  target_role: 'all',
  urgency: 'high',
  title: '',
  body: ''
 });
 let isSendingReminder = $state(false);
 let reminderToast = $state('');

 // Parent-Student Link Add Form (Tab 4 -> links)
 let newLinkParentInput = $state('');
 let newLinkStudentInput = $state('');
 let isAddingParentLink = $state(false);

 // Teacher Profile Add Form (Tab 3 -> profiles)
 let showAddTeacherProfileModal = $state(false);
 let newTeacherProfile = $state({
  teacher_name: '',
  username: '',
  role_title: 'Giáo viên Tiếng Anh',
  role_type: 'lead',
  rate_per_session_vnd: 300000,
  base_salary_vnd: 0
 });
 let isSavingTeacherProfile = $state(false);

 // HR Workflow Add Forms (Tab 3 -> workflows)
 let showAddLeaveForm = $state(false);
 let newLeaveForm = $state({ teacher_name: 'Ms. Nguyễn Thị Dung', session_date: new Date().toISOString().slice(0, 10), reason: '' });
 let showAddAdvanceForm = $state(false);
 let newAdvanceForm = $state({ amount_vnd: 1000000, reason: '', billing_cycle: '2026-10' });

 // Marketing Campaign Add Form (Tab 5 -> campaigns)
 let showAddCampaignForm = $state(false);
 let newCampaignForm = $state({
  title: '',
  badge_text: '🎃 CHIẾN DỊCH ƯU ĐÃI MỚI',
  offer_highlight: '🎁 Tặng +500 Sao thưởng & 02 buổi học thử miễn phí',
  discount_code: 'HALLOWEEN2026',
  bonus_stars: 500
 });

 function showNotice(msg) {
  adminToast = msg;
  setTimeout(() => { if (adminToast === msg) adminToast = ''; }, 4500);
 }

 function getHeaders() {
  const token = getAuthToken();
  return {
   'Content-Type': 'application/json',
   ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
 }

 async function loadData() {
  loading = true;
  currentUser = getCurrentUser();
  try {
   const headers = getHeaders();
   const [campRes, notifRes, mktRes] = await Promise.all([
    fetch('/api/campuses', { headers, credentials: 'include' }),
    fetch('/api/notifications?role=superadmin', { headers, credentials: 'include' }),
    fetch('/api/campaigns', { headers, credentials: 'include' }).catch(() => null)
   ]);
   const campData = await campRes.json().catch(() => ({}));
   const notifData = await notifRes.json().catch(() => ({}));
   const mktData = mktRes ? await mktRes.json().catch(() => ({})) : {};
   if (campData.success) campuses = campData.campuses || [];
   if (notifData.success) events = notifData.notifications || [];
   if (mktData.success) {
    marketingCampaigns = mktData.campaigns || [];
    campaignLeads = mktData.recent_leads || [];
   }
  } catch (e) {
   console.error('Failed to load AdminCP data:', e);
  } finally {
   loading = false;
  }
 }

 async function loadScheduleD1() {
  scheduleLoading = true;
  try {
   const res = await fetch('/api/schedule', { headers: getHeaders(), credentials: 'include' });
   const data = await res.json().catch(() => ({}));
   if (data.success && Array.isArray(data.sessions)) {
    scheduleSessions = data.sessions;
   }
  } catch (e) {
   console.error('Schedule D1 error:', e);
  } finally {
   scheduleLoading = false;
  }
 }

 async function handleDeleteSessionD1(sess) {
  if (!sess?.id) return;
  try {
   const res = await fetch(`/api/schedule?id=${encodeURIComponent(sess.id)}&force=1`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'include'
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok || res.status === 404 || data.success) {
    try { deleteClassSession(sess.id, currentUser); } catch {}
    scheduleSessions = scheduleSessions.filter(s => s.id !== sess.id);
    showNotice(`🗑️ Đã xóa buổi học "${sess.class_name}" khỏi Thời Khóa Biểu D1!`);
    await loadScheduleD1();
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể xóa buổi học'));
   }
  } catch (e) {
   showNotice('⚠️ Lỗi kết nối: ' + e.message);
  }
 }

 async function loadTeachersAndWorkflowsD1() {
  teachersLoading = true;
  try {
   const [staffRes, wfRes] = await Promise.all([
    fetch('/api/teachers/staff', { headers: getHeaders(), credentials: 'include' }),
    fetch('/api/teachers/workflows?type=all', { headers: getHeaders(), credentials: 'include' })
   ]);
   const staffData = await staffRes.json().catch(() => ({}));
   const wfData = await wfRes.json().catch(() => ({}));
   if (staffData.success && Array.isArray(staffData.profiles)) {
    teacherProfiles = staffData.profiles;
   }
   if (wfData.success) {
    teacherLeaves = wfData.leaves || [];
    teacherAdvances = wfData.advances || [];
    teacherRecruitments = wfData.recruitments || [];
   }
  } catch (e) {
   console.error('Teachers D1 error:', e);
  } finally {
   teachersLoading = false;
  }
 }

 async function handleLeaveDecision(leave, decision) {
  try {
   const res = await fetch('/api/teachers/workflows', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'resolve_leave',
     leave_id: leave.id,
     decision,
     substitute_teacher_id: leave.suggested_substitute_id || '',
     substitute_teacher_name: leave.suggested_substitute_name || '',
     leader_notes: decision === 'approve' ? 'Đã duyệt từ AdminCP Tổng' : 'Từ chối từ AdminCP Tổng'
    })
   });
   const data = await res.json().catch(() => ({}));
   if (data.success) {
    showNotice(decision === 'approve' ? '✅ Đã duyệt đơn xin nghỉ phép!' : 'Đã từ chối đơn xin nghỉ phép.');
    await loadTeachersAndWorkflowsD1();
   } else {
    showNotice('⚠️ ' + (data.error || 'Lỗi xử lý đơn xin nghỉ'));
   }
  } catch (e) {
   showNotice('⚠️ Lỗi kết nối: ' + e.message);
  }
 }

 async function handleAdvanceDecision(adv, decision) {
  try {
   const res = await fetch('/api/teachers/workflows', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'resolve_advance',
     advance_id: adv.id,
     decision,
     repayment_plan: adv.repayment_plan || 'Khấu trừ kỳ lương gần nhất'
    })
   });
   const data = await res.json().catch(() => ({}));
   if (data.success) {
    showNotice(decision === 'approve' ? '✅ Đã duyệt đơn ứng lương!' : 'Đã từ chối đơn ứng lương.');
    await loadTeachersAndWorkflowsD1();
   } else {
    showNotice('⚠️ ' + (data.error || 'Lỗi xử lý đơn ứng lương'));
   }
  } catch (e) {
   showNotice('⚠️ Lỗi kết nối: ' + e.message);
  }
 }

 async function loadParentLinksD1() {
  parentLinksLoading = true;
  try {
   const res = await fetch('/api/parents/children?status=all', { headers: getHeaders(), credentials: 'include' });
   const data = await res.json().catch(() => ({}));
   if (data.success && Array.isArray(data.links)) {
    parentLinks = data.links;
   }
  } catch (e) {
   console.error('Parent links D1 error:', e);
  } finally {
   parentLinksLoading = false;
  }
 }

 async function handleVerifyParentLink(linkId, status) {
  try {
   const res = await fetch('/api/parents/children', {
    method: 'PATCH',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ link_id: linkId, verification_status: status })
   });
   const data = await res.json().catch(() => ({}));
   if (data.success) {
    showNotice('✅ Đã cập nhật trạng thái liên kết phụ huynh!');
    await loadParentLinksD1();
   } else {
    showNotice('⚠️ ' + (data.error || 'Lỗi cập nhật liên kết phụ huynh'));
   }
  } catch (e) {
   showNotice('⚠️ Lỗi mạng: ' + e.message);
  }
 }

 async function handleCreateParentLink(e) {
  e.preventDefault();
  if (!newLinkParentInput.trim() || !newLinkStudentInput.trim()) {
   showNotice('⚠️ Vui lòng nhập username/ID Phụ huynh và Học sinh!');
   return;
  }
  isAddingParentLink = true;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'link_parent_student',
     user_id: newLinkParentInput.trim(),
     student_id: newLinkStudentInput.trim()
    })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    showNotice('✅ ' + (data.message || 'Đã gán và xác minh con cho phụ huynh trên D1!'));
    newLinkParentInput = '';
    newLinkStudentInput = '';
    await loadParentLinksD1();
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể liên kết phụ huynh - học sinh'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  } finally {
   isAddingParentLink = false;
  }
 }

 async function handleDeleteParentLink(lk) {
  if (!lk) return;
  try {
   const res = await fetch('/api/parents/children', {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     link_id: lk.link_id,
     parent_user_id: lk.parent_user_id,
     student_user_id: lk.student_user_id
    })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    parentLinks = parentLinks.filter(row => row.link_id !== lk.link_id);
    showNotice('🗑️ ' + (data.message || 'Đã xóa liên kết phụ huynh - học sinh khỏi D1!'));
    await loadParentLinksD1();
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể xóa liên kết'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  }
 }

 async function handleCreateTeacherProfile(e) {
  e.preventDefault();
  if (!newTeacherProfile.teacher_name.trim()) return;
  isSavingTeacherProfile = true;
  try {
   const res = await fetch('/api/teachers/staff', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'create_profile',
     ...newTeacherProfile
    })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    showNotice(data.message || '✅ Đã thêm hồ sơ giáo viên mới vào D1!');
    showAddTeacherProfileModal = false;
    newTeacherProfile = { teacher_name: '', username: '', role_title: 'Giáo viên Tiếng Anh', role_type: 'lead', rate_per_session_vnd: 300000, base_salary_vnd: 0 };
    await loadTeachersAndWorkflowsD1();
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể tạo hồ sơ giáo viên'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  } finally {
   isSavingTeacherProfile = false;
  }
 }

 async function handleDeleteTeacherProfile(prof) {
  if (!prof) return;
  const tid = prof.teacher_id || prof.id;
  try {
   const res = await fetch('/api/teachers/staff', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'delete_profile', teacher_id: tid })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    teacherProfiles = teacherProfiles.filter(p => (p.teacher_id || p.id) !== tid);
    showNotice(data.message || `🗑️ Đã xóa hồ sơ giáo viên ${prof.teacher_name} khỏi D1!`);
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể xóa hồ sơ giáo viên'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  }
 }

 async function handleCreateLeaveRequest(e) {
  e.preventDefault();
  if (!newLeaveForm.reason.trim()) return;
  try {
   const res = await fetch('/api/teachers/workflows', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'create_leave',
     teacher_name: newLeaveForm.teacher_name,
     session_date: newLeaveForm.session_date,
     reason: newLeaveForm.reason.trim()
    })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    showNotice('✅ Đã tạo đơn xin nghỉ phép mới trên D1!');
    newLeaveForm.reason = '';
    showAddLeaveForm = false;
    await loadTeachersAndWorkflowsD1();
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể tạo đơn xin nghỉ'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  }
 }

 async function handleDeleteLeave(lv) {
  if (!lv || !lv.id) return;
  try {
   const res = await fetch('/api/teachers/workflows', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'delete_leave', leave_id: lv.id })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    teacherLeaves = teacherLeaves.filter(x => x.id !== lv.id);
    showNotice(data.message || '🗑️ Đã xóa đơn xin nghỉ phép khỏi D1!');
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể xóa đơn xin nghỉ'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  }
 }

 async function handleCreateAdvanceRequest(e) {
  e.preventDefault();
  if (!newAdvanceForm.reason.trim()) return;
  try {
   const res = await fetch('/api/teachers/workflows', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'request_salary_advance',
     amount_vnd: Number(newAdvanceForm.amount_vnd) || 1000000,
     reason: newAdvanceForm.reason.trim(),
     billing_cycle: newAdvanceForm.billing_cycle
    })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    showNotice('✅ Đã tạo đơn ứng lương mới trên D1!');
    newAdvanceForm.reason = '';
    showAddAdvanceForm = false;
    await loadTeachersAndWorkflowsD1();
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể tạo đơn ứng lương'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  }
 }

 async function handleDeleteAdvance(adv) {
  if (!adv || !adv.id) return;
  try {
   const res = await fetch('/api/teachers/workflows', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'delete_advance', advance_id: adv.id })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    teacherAdvances = teacherAdvances.filter(x => x.id !== adv.id);
    showNotice(data.message || '🗑️ Đã xóa đơn ứng lương khỏi D1!');
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể xóa đơn ứng lương'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  }
 }

 async function handleCreateCampaign(e) {
  e.preventDefault();
  if (!newCampaignForm.title.trim()) return;
  try {
   const res = await fetch('/api/campaigns', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'save_campaign',
     ...newCampaignForm
    })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    showNotice(data.message || '✅ Đã lưu chiến dịch Marketing mới vào D1!');
    newCampaignForm.title = '';
    showAddCampaignForm = false;
    await loadData();
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể tạo chiến dịch'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  }
 }

 async function handleDeleteCampaign(campId) {
  if (!campId) return;
  try {
   const res = await fetch('/api/campaigns', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'delete_campaign', id: campId })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    marketingCampaigns = marketingCampaigns.filter(c => c.id !== campId);
    showNotice(data.message || '🗑️ Đã xóa chiến dịch Marketing khỏi D1!');
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể xóa chiến dịch'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  }
 }

 async function handleDeleteLead(leadId) {
  if (!leadId) return;
  try {
   const res = await fetch('/api/campaigns', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'delete_lead', id: leadId })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    campaignLeads = campaignLeads.filter(l => l.id !== leadId);
    showNotice(data.message || '🗑️ Đã xóa thông tin đăng ký ưu đãi khỏi D1!');
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  }
 }

 async function handleDeleteNotification(notifId) {
  if (!notifId) return;
  try {
   const res = await fetch('/api/notifications', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'delete_notification', notification_id: notifId })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    events = events.filter(ev => ev.id !== notifId);
    showNotice(data.message || '🗑️ Đã xóa thông báo hệ thống khỏi D1!');
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể xóa thông báo'));
   }
  } catch (err) {
   showNotice('⚠️ Lỗi mạng: ' + err.message);
  }
 }

 async function handleSelfChangePassword(e) {
  e.preventDefault();
  selfPwMsg = '';
  selfPwErr = false;
  if (!selfOldPassword || !selfNewPassword) {
   selfPwErr = true;
   selfPwMsg = 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.';
   return;
  }
  if (selfNewPassword.trim().length < 6) {
   selfPwErr = true;
   selfPwMsg = 'Mật khẩu mới phải có ít nhất 6 ký tự.';
   return;
  }
  if (selfNewPassword !== selfConfirmPassword) {
   selfPwErr = true;
   selfPwMsg = 'Mật khẩu xác nhận không khớp.';
   return;
  }
  selfPwSaving = true;
  try {
   const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     old_password: selfOldPassword,
     new_password: selfNewPassword.trim()
    })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    selfPwErr = false;
    selfPwMsg = '✅ Đã đổi mật khẩu thành công trên Cloudflare D1!';
    selfOldPassword = '';
    selfNewPassword = '';
    selfConfirmPassword = '';
    setTimeout(() => {
     showSelfPwModal = false;
     selfPwMsg = '';
    }, 1200);
   } else {
    selfPwErr = true;
    selfPwMsg = data.error || 'Đổi mật khẩu thất bại.';
   }
  } catch (err) {
   selfPwErr = true;
   selfPwMsg = 'Lỗi kết nối: ' + err.message;
  } finally {
   selfPwSaving = false;
  }
 }

 function openCreateCampusModal() {
  editingCampusId = '';
  newCampus = { name: '', address: '', contact_phone: '', google_maps_url: '', is_primary: false };
  campusToast = '';
  showAddCampusModal = true;
 }

 function openEditCampusModal(c) {
  editingCampusId = c.id;
  newCampus = {
   name: c.name || '',
   address: c.address || '',
   contact_phone: c.contact_phone || '',
   google_maps_url: c.google_maps_url || '',
   is_primary: Boolean(c.is_primary)
  };
  campusToast = '';
  showAddCampusModal = true;
 }

 async function handleCreateCampus(e) {
  e.preventDefault();
  if (!newCampus.name.trim() || !newCampus.address.trim()) {
   campusToast = '⚠️ Vui lòng điền tên cơ sở và địa chỉ!';
   return;
  }
  isSavingCampus = true;
  campusToast = '';
  try {
   const isEdit = Boolean(editingCampusId);
   const res = await fetch('/api/campuses', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: isEdit ? 'update' : 'create',
     ...(isEdit ? { id: editingCampusId } : {}),
     ...newCampus
    })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    if (Array.isArray(data.campuses)) {
     campuses = data.campuses;
    } else {
     await loadData();
    }
    campusToast = isEdit ? '✅ Đã cập nhật điểm học thành công!' : '✅ Đã thêm điểm học mới thành công!';
    newCampus = { name: '', address: '', contact_phone: '', google_maps_url: '', is_primary: false };
    editingCampusId = '';
    showAddCampusModal = false;
    showNotice(isEdit ? '✅ Đã cập nhật điểm học trên Cloudflare D1!' : '✅ Đã thêm điểm học mới vào Cloudflare D1!');
   } else {
    campusToast = '❌ ' + (data.error || 'Không thể lưu điểm học vào D1');
   }
  } catch (e) {
   campusToast = '❌ Lỗi: ' + e.message;
  } finally {
   isSavingCampus = false;
  }
 }

 async function handleDeleteCampus(id) {
  if (!id) return;
  try {
   const res = await fetch('/api/campuses', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'delete', id })
   });
   const data = await res.json().catch(() => ({}));
   if (res.ok && data.success) {
    if (Array.isArray(data.campuses)) {
     campuses = data.campuses;
    } else {
     campuses = campuses.filter(c => c.id !== id);
     await loadData();
    }
    showNotice('🗑️ Đã xóa điểm học khỏi hệ thống Cloudflare D1!');
   } else {
    showNotice('⚠️ ' + (data.error || 'Không thể xóa cơ sở'));
   }
  } catch (e) {
   showNotice('⚠️ Lỗi xóa cơ sở: ' + e.message);
  }
 }

 async function handleSendCrossReminder(e) {
  e.preventDefault();
  if (!reminderForm.title.trim() || !reminderForm.body.trim()) {
   reminderToast = '⚠️ Vui lòng nhập tiêu đề và nội dung nhắc nhở!';
   return;
  }
  isSendingReminder = true;
  reminderToast = '';
  try {
   const res = await fetch('/api/notifications', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     ...reminderForm,
     category: 'system',
     sender_id: currentUser?.id || 'user_superadmin_1',
     sender_name: currentUser?.name || 'SuperAdmin'
    })
   });
   const data = await res.json();
   if (data.success) {
    reminderToast = '🚀 Đã phát sóng nhắc nhở chéo tới các đối tượng thành công!';
    reminderForm.title = '';
    reminderForm.body = '';
    loadData();
   }
  } catch (e) {
   reminderToast = '❌ Lỗi gửi nhắc nhở: ' + e.message;
  } finally {
   isSendingReminder = false;
  }
 }

 function switchTab(tabId) {
  if (tabId === 'theme') {
   activeTab = 'system';
   subTabSystem = 'theme';
   return;
  }
  activeTab = tabId;
  if (tabId === 'schedule') loadScheduleD1();
  if (tabId === 'teachers') loadTeachersAndWorkflowsD1();
  if (tabId === 'tuition') loadParentLinksD1();
 }

 let filteredSchedule = $derived.by(() => {
  const q = scheduleSearch.trim().toLowerCase();
  if (!q) return scheduleSessions;
  return scheduleSessions.filter(s =>
   (s.class_name || '').toLowerCase().includes(q) ||
   (s.teacher_name || '').toLowerCase().includes(q) ||
   (s.subject_topic || '').toLowerCase().includes(q) ||
   (s.session_date || '').includes(q)
  );
 });

 onMount(() => {
  try {
   const qTab = new URLSearchParams(window.location.search).get('tab');
   if (qTab === 'theme') {
    activeTab = 'system';
    subTabSystem = 'theme';
   }
  } catch {}
  loadData();
  loadScheduleD1();
  loadTeachersAndWorkflowsD1();
  loadParentLinksD1();
 });
</script>

<div class="bg-[#f8f5ee] text-stone-800 flex flex-col font-sans rounded-2xl border border-stone-200/80 overflow-hidden shadow-xs">
 <!-- AdminCP Focused Command Bar (Zero Unrelated Cross-Links Clutter) -->
 <header class="bg-white border-b border-stone-200 px-5 py-3.5">
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
   <div class="flex items-center gap-3">
    <div class="w-10 h-10 rounded-xl bg-emerald-700 flex items-center justify-center text-white font-black text-lg shadow-xs">
     ⚡
    </div>
    <div>
     <div class="text-[11px] uppercase tracking-widest font-black text-emerald-700">Trung Tâm Điều Hành Hệ Thống • Cloudflare D1</div>
     <h1 class="text-base sm:text-lg font-black text-stone-900 flex items-center gap-2">
      <span>Quản Trị Hệ Thống (AdminCP)</span>
      <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-mono">
       D1 LIVE SYNC
      </span>
     </h1>
    </div>
   </div>

   <div class="flex items-center gap-2 flex-wrap">
    <button
     type="button"
     data-testid="admincp-header-theme-btn"
     onclick={() => switchTab('theme')}
     class="px-3.5 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-900 text-xs font-extrabold border border-orange-300 transition-colors cursor-pointer"
    >
     🎃🏕️ Chọn Theme Sự Kiện (Halloween / Dã Ngoại / Workshop)
    </button>
    <a
     href="/quiz-menu?tab=create"
     class="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-300 transition-colors"
    >
     📝 Quiz Studio
    </a>
    <button
     type="button"
     data-testid="admincp-self-change-pw-btn"
     onclick={() => { selfPwMsg = ''; selfPwErr = false; showSelfPwModal = true; }}
     class="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300 transition-colors"
    >
     🔑 Đổi Mật Khẩu Của Tôi
    </button>
   </div>
  </div>
 </header>

 <!-- Main Body -->
 <div class="p-4 sm:p-6 space-y-5">
  {#if adminToast}
   <div role="status" class="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between">
    <span>{adminToast}</span>
    <button type="button" onclick={() => adminToast = ''} class="text-stone-500 font-bold">✕</button>
   </div>
  {/if}

  <!-- 6 Focused Domain Workflow Tabs (including Event Themes) -->
  <div class="flex flex-wrap items-center gap-2 pb-3 border-b border-stone-200">
   {#each [
    { id: 'users', label: '👥 Tài Khoản & Phân Quyền' },
    { id: 'schedule', label: `📅 Thời Khóa Biểu (${scheduleSessions.length})` },
    { id: 'teachers', label: `👩‍🏫 Giáo Viên & Nhân Sự (${teacherProfiles.length})` },
    { id: 'tuition', label: '💰 Học Phí & Phụ Huynh' },
    { id: 'system', label: '⚙️ Cấu Hình Cơ Sở & Hệ Thống' },
    { id: 'theme', label: '🎨 Chủ Đề Sự Kiện (Halloween • Dã Ngoại • Workshop)' }
   ] as tab}
    <button
     type="button"
     data-testid="admincp-tab-{tab.id}"
     onclick={() => switchTab(tab.id)}
     class="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all {(activeTab === tab.id || (tab.id === 'theme' && activeTab === 'system' && subTabSystem === 'theme')) ? 'bg-emerald-700 text-white shadow-xs' : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'}"
    >
     {tab.label}
    </button>
   {/each}
  </div>

  <!-- TAB 1: USERS, ROLES & PASSWORDS (D1) -->
  {#if activeTab === 'users'}
   <AdminUsersPanel />

  <!-- TAB 2: SCHEDULE & ROLL CALL (D1) -->
  {:else if activeTab === 'schedule'}
   <div class="space-y-4">
    <div class="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
     <div>
      <h2 class="text-base font-bold text-stone-900">📅 Quản Lý Thời Khóa Biểu, Phân Công Giáo Viên &amp; Điểm Danh (D1)</h2>
      <p class="text-xs text-stone-500 mt-0.5">
       Thêm, chỉnh sửa hoặc xóa ca học đồng bộ tức thời trên Cloudflare D1.
      </p>
     </div>
     <div class="flex items-center gap-2 flex-wrap">
      <button
       type="button"
       data-testid="admincp-add-session-btn"
       onclick={() => { editingSession = null; showSessionModal = true; }}
       class="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs"
      >
       ➕ Thêm Buổi Học Mới
      </button>
      <button
       type="button"
       onclick={loadScheduleD1}
       class="px-3 py-2 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300"
      >
       🔄 Tải lại lịch D1
      </button>
     </div>
    </div>

    <div class="flex gap-2">
     <input
      type="search"
      bind:value={scheduleSearch}
      placeholder="🔍 Tìm kiếm theo tên lớp, giáo viên phụ trách, chuyên đề hoặc ngày học..."
      class="w-full px-3.5 py-2 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:border-emerald-600"
     />
    </div>

    {#if scheduleLoading}
     <div class="p-8 text-center text-xs text-stone-500 bg-white rounded-2xl border border-stone-200">
      ⏳ Đang tải thời khóa biểu từ Cloudflare D1...
     </div>
    {:else if filteredSchedule.length === 0}
     <div class="p-8 text-center text-xs text-stone-500 bg-white rounded-2xl border border-stone-200">
      Chưa có buổi học nào khớp tìm kiếm. Nhấn "➕ Thêm Buổi Học Mới" để khởi tạo ca học trên D1.
     </div>
    {:else}
     <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each filteredSchedule as sess (sess.id)}
       <div class="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs flex flex-col justify-between space-y-3">
        <div class="space-y-2">
         <div class="flex items-center justify-between gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
           {sess.day_name || 'Lịch học'} • {sess.session_date || '—'}
          </span>
          <span class="font-mono text-xs font-bold text-stone-700 bg-stone-100 px-2.5 py-0.5 rounded-lg">
           ⏰ {sess.start_time} – {sess.end_time}
          </span>
         </div>
         <h3 class="text-sm font-black text-stone-900">{sess.class_name}</h3>
         <p class="text-xs text-stone-600">📚 Chuyên đề: <strong>{sess.subject_topic || sess.topic || 'Chuyên đề chuẩn'}</strong></p>
         <div class="text-xs text-stone-500 space-y-0.5">
          <div>👩‍🏫 Giáo viên chính: <strong class="text-stone-800">{sess.teacher_name || sess.teacher_id || 'Cô Dung'}</strong></div>
          {#if sess.assistant_teacher_name}
           <div>🤝 Trợ giảng: <strong class="text-stone-700">{sess.assistant_teacher_name}</strong></div>
          {/if}
          {#if sess.substitute_teacher_name}
           <div class="text-amber-700">🔄 Dạy thay: <strong>{sess.substitute_teacher_name}</strong></div>
          {/if}
          <div>📍 Phòng / Cơ sở: {sess.room_notes || sess.room || sess.location || 'Phòng học trung tâm'}</div>
          <div>🎓 Sĩ số gán lớp: <strong>{Array.isArray(sess.student_ids) ? sess.student_ids.length : 0} học sinh</strong></div>
         </div>
        </div>

        <!-- Call-To-Action Footer Pinned at Bottom of Card -->
        <div class="mt-auto pt-3 border-t border-stone-100 flex items-center justify-between gap-2 flex-wrap">
         <button
          type="button"
          data-testid="admincp-delete-session-{sess.id}"
          onclick={() => handleDeleteSessionD1(sess)}
          class="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
         >
          🗑️ Xóa
         </button>
         <div class="flex items-center gap-2 ml-auto">
          <button
           type="button"
           onclick={() => { editingSession = sess; showSessionModal = true; }}
           class="px-3 py-1.5 rounded-lg text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300"
          >
           ✏️ Sửa / Gán HS
          </button>
          <button
           type="button"
           onclick={() => { activeRollCallSession = sess; showRollCallModal = true; }}
           class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
           📋 Điểm Danh
          </button>
         </div>
        </div>
       </div>
      {/each}
     </div>
    {/if}
   </div>

  <!-- TAB 3: TEACHERS, PAYROLL RATES & HR WORKFLOWS (D1) — Isolated Sub-Views -->
  {:else if activeTab === 'teachers'}
   <div class="space-y-4">
    <div class="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
     <div class="flex flex-wrap items-center gap-2">
      <button
       type="button"
       onclick={() => subTabTeachers = 'profiles'}
       class="px-3.5 py-2 rounded-xl text-xs font-bold transition-colors {subTabTeachers === 'profiles' ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}"
      >
       👩‍🏫 Hồ Sơ &amp; Định Mức Lương ({teacherProfiles.length})
      </button>
      <button
       type="button"
       onclick={() => subTabTeachers = 'workflows'}
       class="px-3.5 py-2 rounded-xl text-xs font-bold transition-colors {subTabTeachers === 'workflows' ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}"
      >
       📝 Duyệt Đơn Nghỉ &amp; Ứng Lương ({teacherLeaves.length + teacherAdvances.length})
      </button>
     </div>
     <div class="flex flex-wrap items-center gap-2">
      <button
       type="button"
       data-testid="btn-add-teacher-profile"
       onclick={() => showAddTeacherProfileModal = !showAddTeacherProfileModal}
       class="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-700 hover:bg-emerald-800 text-white"
      >
       ➕ Thêm Hồ Sơ Giáo Viên
      </button>
      <button
       type="button"
       onclick={loadTeachersAndWorkflowsD1}
       class="px-3 py-2 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300"
      >
       🔄 Đồng bộ dữ liệu Giáo viên
      </button>
     </div>
    </div>

    {#if showAddTeacherProfileModal}
     <form onsubmit={handleCreateTeacherProfile} class="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3 text-xs">
      <div class="flex items-center justify-between">
       <h3 class="font-black text-emerald-900 text-sm">➕ Thêm Hồ Sơ Giáo Viên Mới (D1)</h3>
       <button type="button" onclick={() => showAddTeacherProfileModal = false} class="px-2 py-0.5 rounded bg-white text-stone-600 font-bold">✕</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
       <input type="text" required bind:value={newTeacherProfile.teacher_name} placeholder="Họ tên giáo viên *" class="px-3 py-2 rounded-lg border border-stone-300 bg-white font-semibold" />
       <input type="text" bind:value={newTeacherProfile.username} placeholder="Username (VD: gv_huong)" class="px-3 py-2 rounded-lg border border-stone-300 bg-white font-mono" />
       <input type="text" bind:value={newTeacherProfile.role_title} placeholder="Chức danh (VD: Giáo viên IELTS)" class="px-3 py-2 rounded-lg border border-stone-300 bg-white" />
       <input type="number" min="0" step="10000" bind:value={newTeacherProfile.rate_per_session_vnd} placeholder="Đơn giá / ca (VNĐ)" class="px-3 py-2 rounded-lg border border-stone-300 bg-white font-bold" />
      </div>
      <div class="flex justify-end gap-2">
       <button type="button" onclick={() => showAddTeacherProfileModal = false} class="px-3 py-1.5 rounded-lg bg-white border border-stone-300 font-bold">Hủy</button>
       <button type="submit" disabled={isSavingTeacherProfile} class="px-4 py-1.5 rounded-lg bg-emerald-700 text-white font-black">
        {isSavingTeacherProfile ? '⏳ Đang lưu...' : '💾 Lưu Hồ Sơ Giáo Viên'}
       </button>
      </div>
     </form>
    {/if}

    {#if teachersLoading}
     <div class="p-8 text-center text-xs text-stone-500 bg-white rounded-2xl border border-stone-200">
      ⏳ Đang tải hồ sơ giáo viên và quy trình HR từ D1...
     </div>
    {:else if subTabTeachers === 'profiles'}
     <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each teacherProfiles as prof (prof.teacher_id || prof.id)}
       <div class="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-3 flex flex-col justify-between">
        <div>
         <div class="flex items-center justify-between">
          <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
           {prof.role_title || 'Giáo viên'}
          </span>
          <span class="text-xs font-bold text-amber-600">⭐ {prof.leader_rating || 5.0}</span>
         </div>
         <h3 class="text-sm font-black text-stone-900 mt-2">{prof.teacher_name}</h3>
         <div class="text-[11px] font-mono text-stone-500">@{prof.username} • ID: {prof.teacher_id}</div>
         <div class="mt-3 p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1">
          <div class="flex justify-between">
           <span class="text-stone-500">Đơn giá / ca dạy:</span>
           <strong class="text-emerald-700 tabular-nums">{(Number(prof.rate_per_session_vnd) || 0).toLocaleString('vi-VN')} đ</strong>
          </div>
          <div class="flex justify-between">
           <span class="text-stone-500">Lương cơ bản:</span>
           <strong class="text-stone-800 tabular-nums">{(Number(prof.base_salary_vnd) || 0).toLocaleString('vi-VN')} đ</strong>
          </div>
         </div>
        </div>
        <div class="mt-auto pt-2 border-t border-stone-100 flex items-center gap-2">
         <button
          type="button"
          onclick={() => { selectedStaffProfile = prof; showStaffModal = true; }}
          class="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white transition-colors"
         >
          ⚙️ Điều Chỉnh Lương
         </button>
         <button
          type="button"
          data-testid="btn-delete-teacher-profile"
          onclick={() => handleDeleteTeacherProfile(prof)}
          class="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 transition-colors"
          title="Xóa hồ sơ giáo viên"
         >
          🗑️ Xóa
         </button>
        </div>
       </div>
      {/each}
     </div>
    {:else}
     <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-3">
       <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-stone-900">📝 Đơn Xin Nghỉ Phép &amp; Dạy Thay ({teacherLeaves.length})</h3>
        <button type="button" onclick={() => showAddLeaveForm = !showAddLeaveForm} class="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-xs font-bold">
         ➕ Tạo Đơn Nghỉ
        </button>
       </div>
       {#if showAddLeaveForm}
        <form onsubmit={handleCreateLeaveRequest} class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
         <div class="grid grid-cols-2 gap-2">
          <input type="text" required bind:value={newLeaveForm.teacher_name} placeholder="Tên giáo viên *" class="px-2.5 py-1.5 rounded border border-stone-300 bg-white" />
          <input type="date" required bind:value={newLeaveForm.session_date} class="px-2.5 py-1.5 rounded border border-stone-300 bg-white" />
         </div>
         <input type="text" required bind:value={newLeaveForm.reason} placeholder="Lý do xin nghỉ ca *" class="w-full px-2.5 py-1.5 rounded border border-stone-300 bg-white" />
         <div class="flex justify-end gap-1.5">
          <button type="button" onclick={() => showAddLeaveForm = false} class="px-2.5 py-1 rounded bg-white border border-stone-300 font-bold">Hủy</button>
          <button type="submit" class="px-3 py-1 rounded bg-emerald-700 text-white font-bold">💾 Lưu Đơn Nghỉ</button>
         </div>
        </form>
       {/if}
       {#if teacherLeaves.length === 0}
        <p class="text-xs text-stone-400">Chưa có đơn xin nghỉ phép nào.</p>
       {:else}
        <div class="space-y-2">
         {#each teacherLeaves as lv}
          <div class="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1.5">
           <div class="flex items-center justify-between font-bold">
            <span>{lv.teacher_name} • {lv.class_name || lv.session_date || lv.session_id}</span>
            <span class="px-2 py-0.5 rounded text-[10px] {(lv.admin_status || lv.status) === 'approved' ? 'bg-emerald-100 text-emerald-800' : (lv.admin_status || lv.status) === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}">
             {lv.admin_status || lv.status || 'pending'}
            </span>
           </div>
           <div class="text-stone-600">Lý do: {lv.reason}</div>
           <div class="flex justify-end gap-2 pt-2 border-t border-stone-200/70">
            {#if (lv.admin_status || lv.status || 'pending') === 'pending'}
             <button type="button" onclick={() => handleLeaveDecision(lv, 'reject')} class="px-2.5 py-1 rounded bg-rose-600 text-white font-bold text-[11px]">✕ Từ chối</button>
             <button type="button" onclick={() => handleLeaveDecision(lv, 'approve')} class="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold text-[11px]">✓ Duyệt &amp; Lưu</button>
            {/if}
            <button type="button" data-testid="btn-delete-leave" onclick={() => handleDeleteLeave(lv)} class="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-[11px]">
             🗑️ Xóa đơn
            </button>
           </div>
          </div>
         {/each}
        </div>
       {/if}
      </div>

      <div class="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-3">
       <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-stone-900">💸 Đơn Ứng Lương Giáo Viên ({teacherAdvances.length})</h3>
        <button type="button" onclick={() => showAddAdvanceForm = !showAddAdvanceForm} class="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-xs font-bold">
         ➕ Tạo Đơn Ứng Lương
        </button>
       </div>
       {#if showAddAdvanceForm}
        <form onsubmit={handleCreateAdvanceRequest} class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
         <div class="grid grid-cols-2 gap-2">
          <input type="number" min="100000" max="20000000" step="100000" required bind:value={newAdvanceForm.amount_vnd} placeholder="Số tiền ứng (VNĐ) *" class="px-2.5 py-1.5 rounded border border-stone-300 bg-white font-bold" />
          <input type="text" required bind:value={newAdvanceForm.billing_cycle} placeholder="Kỳ lương (VD: 2026-10)" class="px-2.5 py-1.5 rounded border border-stone-300 bg-white" />
         </div>
         <input type="text" required bind:value={newAdvanceForm.reason} placeholder="Lý do ứng lương *" class="w-full px-2.5 py-1.5 rounded border border-stone-300 bg-white" />
         <div class="flex justify-end gap-1.5">
          <button type="button" onclick={() => showAddAdvanceForm = false} class="px-2.5 py-1 rounded bg-white border border-stone-300 font-bold">Hủy</button>
          <button type="submit" class="px-3 py-1 rounded bg-emerald-700 text-white font-bold">💾 Lưu Đơn Ứng Lương</button>
         </div>
        </form>
       {/if}
       {#if teacherAdvances.length === 0}
        <p class="text-xs text-stone-400">Chưa có yêu cầu ứng lương nào.</p>
       {:else}
        <div class="space-y-2">
         {#each teacherAdvances as adv}
          <div class="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1.5">
           <div class="flex items-center justify-between font-bold">
            <span>{adv.teacher_name} • {(Number(adv.amount_vnd) || 0).toLocaleString('vi-VN')} đ</span>
            <span class="px-2 py-0.5 rounded text-[10px] {adv.status === 'approved' || adv.status === 'disbursed' ? 'bg-emerald-100 text-emerald-800' : adv.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}">
             {adv.status}
            </span>
           </div>
           <div class="text-stone-600">Lý do: {adv.reason}</div>
           <div class="flex justify-end gap-2 pt-2 border-t border-stone-200/70">
            {#if adv.status === 'pending'}
             <button type="button" onclick={() => handleAdvanceDecision(adv, 'reject')} class="px-2.5 py-1 rounded bg-rose-600 text-white font-bold text-[11px]">✕ Từ chối</button>
             <button type="button" onclick={() => handleAdvanceDecision(adv, 'approve')} class="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold text-[11px]">✓ Duyệt &amp; Lưu</button>
            {/if}
            <button type="button" data-testid="btn-delete-advance" onclick={() => handleDeleteAdvance(adv)} class="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-[11px]">
             🗑️ Xóa đơn
            </button>
           </div>
          </div>
         {/each}
        </div>
       {/if}
      </div>
     </div>
    {/if}
   </div>

  <!-- TAB 4: TUITION & PARENT LINKS (D1) — Isolated Sub-Views -->
  {:else if activeTab === 'tuition'}
   <div class="space-y-4">
    <div class="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
     <div class="flex flex-wrap items-center gap-2">
      <button
       type="button"
       onclick={() => subTabTuition = 'bills'}
       class="px-3.5 py-2 rounded-xl text-xs font-bold transition-colors {subTabTuition === 'bills' ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}"
      >
       💰 Sổ Cái Học Phí
      </button>
      <button
       type="button"
       onclick={() => subTabTuition = 'links'}
       class="px-3.5 py-2 rounded-xl text-xs font-bold transition-colors {subTabTuition === 'links' ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}"
      >
       👨‍👩‍👧 Liên Kết Phụ Huynh – Học Sinh ({parentLinks.length})
      </button>
     </div>
    </div>

    {#if subTabTuition === 'bills'}
     <div class="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs">
      <LeaderFinance />
     </div>
    {:else}
     <div class="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-3">
      <div class="flex items-center justify-between">
       <div>
        <h2 class="text-base font-bold text-stone-900">👨‍👩‍👧 Quản Lý Gán Con &amp; Xóa Liên Kết Phụ Huynh – Học Sinh (D1)</h2>
        <p class="text-xs text-stone-500">Thêm liên kết mới, xác minh (verified) hoặc xóa/gỡ liên kết con khỏi phụ huynh trực tiếp trên Cloudflare D1.</p>
       </div>
       <button type="button" onclick={loadParentLinksD1} class="px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-xs font-bold border border-stone-300">
        🔄 Tải lại
       </button>
      </div>

      <!-- Form Thêm Liên Kết Phụ Huynh - Học Sinh Trực Tiếp -->
      <form onsubmit={handleCreateParentLink} class="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200 flex flex-col sm:flex-row sm:items-end gap-3 text-xs">
       <div class="flex-1">
        <label for="pl-parent" class="block font-bold text-sky-900 mb-1">Username hoặc ID Phụ huynh *</label>
        <input id="pl-parent" type="text" required bind:value={newLinkParentInput} placeholder="VD: phuhuynh_quan hoặc user_parent_1" class="w-full px-3 py-2 rounded-lg border border-sky-300 bg-white font-mono" />
       </div>
       <div class="flex-1">
        <label for="pl-student" class="block font-bold text-sky-900 mb-1">Username hoặc ID Học sinh (Con) *</label>
        <input id="pl-student" type="text" required bind:value={newLinkStudentInput} placeholder="VD: minhquan7a hoặc baokhiem" class="w-full px-3 py-2 rounded-lg border border-sky-300 bg-white font-mono" />
       </div>
       <button type="submit" data-testid="btn-add-parent-link" disabled={isAddingParentLink} class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-black shrink-0">
        {isAddingParentLink ? '⏳ Đang gán...' : '➕ Gán Con & Xác Minh'}
       </button>
      </form>

      {#if parentLinksLoading}
       <div class="text-xs text-stone-500 py-4">⏳ Đang tải danh sách liên kết...</div>
      {:else if parentLinks.length === 0}
       <div class="text-xs text-stone-400 py-4">Chưa có liên kết phụ huynh - học sinh nào. Hãy nhập thông tin bên trên để gán con cho phụ huynh.</div>
      {:else}
       <div class="overflow-x-auto">
        <table class="min-w-full text-xs">
         <thead class="bg-stone-100 text-stone-600 uppercase text-[11px]">
          <tr>
           <th class="px-3 py-2 text-left">Phụ huynh</th>
           <th class="px-3 py-2 text-left">Học sinh liên kết (Con)</th>
           <th class="px-3 py-2 text-left">Khối</th>
           <th class="px-3 py-2 text-left">Trạng thái</th>
           <th class="px-3 py-2 text-right">Xét duyệt / Xóa con</th>
          </tr>
         </thead>
         <tbody class="divide-y divide-stone-200">
          {#each parentLinks as lk (lk.link_id)}
           <tr>
            <td class="px-3 py-2 font-semibold">{lk.parent_name || lk.parent_user_id} (@{lk.parent_username || ''})</td>
            <td class="px-3 py-2 font-semibold text-emerald-800">👶 {lk.student_name || lk.student_user_id} (@{lk.student_username || ''})</td>
            <td class="px-3 py-2">{lk.student_grade || '—'}</td>
            <td class="px-3 py-2">
             <span class="px-2 py-0.5 rounded-full text-[10px] font-bold {lk.verification_status === 'verified' ? 'bg-emerald-100 text-emerald-800' : lk.verification_status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}">
              {lk.verification_status}
             </span>
            </td>
            <td class="px-3 py-2 text-right space-x-1 whitespace-nowrap">
             {#if lk.verification_status !== 'verified'}
              <button type="button" onclick={() => handleVerifyParentLink(lk.link_id, 'verified')} class="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold text-[11px]">✓ Xác minh</button>
             {/if}
             {#if lk.verification_status !== 'rejected'}
              <button type="button" onclick={() => handleVerifyParentLink(lk.link_id, 'rejected')} class="px-2.5 py-1 rounded bg-amber-600 text-white font-bold text-[11px]">✕ Từ chối</button>
             {/if}
             <button
              type="button"
              data-testid="btn-delete-parent-link"
              onclick={() => handleDeleteParentLink(lk)}
              class="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-[11px] transition"
             >
              🗑️ Xóa con
             </button>
            </td>
           </tr>
          {/each}
         </tbody>
        </table>
       </div>
      {/if}
     </div>
    {/if}
   </div>

  <!-- TAB 5: SYSTEM SETTINGS (Campuses, Cross Reminders, Streams, Theme) — Isolated Sub-Views -->
  {:else if activeTab === 'system'}
   <div class="space-y-4">
    <div class="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
     <div class="flex flex-wrap items-center gap-2">
      {#each [
       ['campuses', `🏢 Cơ Sở Học (${campuses.length})`],
       ['campaigns', `🎃 Chiến Dịch Marketing (${marketingCampaigns.length || 2})`],
       ['theme', '🎨 Giao Diện (Theme)']
      ] as [sKey, sLabel]}
       <button
        type="button"
        onclick={() => subTabSystem = sKey}
        class="px-3.5 py-2 rounded-xl text-xs font-bold transition-colors {subTabSystem === sKey ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}"
       >
        {sLabel}
       </button>
      {/each}
     </div>

     {#if subTabSystem === 'campuses'}
      <button
       type="button"
       data-testid="add-campus-btn"
       onclick={openCreateCampusModal}
       class="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white"
      >
       ➕ Thêm Cơ Sở Học Mới
      </button>
     {/if}
    </div>

    {#if subTabSystem === 'campuses'}
     <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each campuses as c (c.id)}
       <div data-testid="campus-card-{c.id}" class="p-5 rounded-2xl bg-white border border-stone-200 flex flex-col justify-between gap-4 shadow-xs">
        <div class="space-y-1.5">
         <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold {c.is_primary ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-stone-100 text-stone-600 border border-stone-300'}">
           {c.is_primary ? '⭐ Cơ Sở Chính' : '📍 Điểm Học Mở Rộng'}
          </span>
          <span class="font-mono text-xs text-stone-500">ID: {c.id}</span>
         </div>
         <h3 class="text-base font-bold text-stone-900">{c.name}</h3>
         <p class="text-xs text-stone-600">📌 Địa chỉ: <strong>{c.address}</strong></p>
         <p class="text-xs text-stone-500">📞 Hotline: {c.contact_phone || 'Chưa cập nhật'}</p>
         {#if c.google_maps_url}
          <a href={c.google_maps_url} target="_blank" rel="noopener noreferrer" class="inline-block text-[11px] font-bold text-emerald-700 hover:underline">🗺️ Xem bản đồ Google Maps ↗</a>
         {/if}
        </div>
        <div class="mt-auto pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
         <span class="text-[11px] font-semibold {c.is_primary ? 'text-emerald-700' : 'text-stone-400'}">
          {c.is_primary ? 'Mặc định hệ thống' : 'Đồng bộ D1'}
         </span>
         <div class="flex items-center gap-2">
          <button
           type="button"
           data-testid="edit-campus-{c.id}"
           onclick={() => openEditCampusModal(c)}
           class="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-xs font-bold transition-all"
          >
           ✏️ Sửa
          </button>
          <button
           type="button"
           data-testid="delete-campus-{c.id}"
           onclick={() => handleDeleteCampus(c.id)}
           class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all"
          >
           🗑️ Xóa Cơ Sở
          </button>
         </div>
        </div>
       </div>
      {/each}
     </div>
    {:else if subTabSystem === 'campaigns'}
     <div class="p-5 rounded-2xl bg-white border border-stone-200 space-y-4 shadow-xs text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3">
       <div>
        <h2 class="text-base font-black text-stone-900">🎃 Quản Trị Chiến Dịch Popup Marketing &amp; Lễ Hội Halloween (D1)</h2>
        <p class="text-xs text-stone-500">Điều khiển Thêm / Xóa các Popup chào mời, học bổng Sao thưởng theo mùa lễ hội và danh sách Phụ huynh đăng ký.</p>
       </div>
       <div class="flex items-center gap-2">
        <span class="px-3 py-1 rounded-full bg-orange-100 text-orange-800 border border-orange-300 font-bold">
         🎁 {campaignLeads.length} lượt nhận học bổng
        </span>
        <button
         type="button"
         data-testid="btn-open-add-campaign"
         onclick={() => showAddCampaignForm = !showAddCampaignForm}
         class="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black"
        >
         ➕ Thêm Chiến Dịch Mới
        </button>
       </div>
      </div>

      {#if showAddCampaignForm}
       <form onsubmit={handleCreateCampaign} class="p-4 rounded-xl bg-orange-50/70 border border-orange-200 space-y-3">
        <div class="font-black text-orange-950 text-sm">➕ Tạo Chiến Dịch Popup Marketing Mới (D1)</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
         <input type="text" required bind:value={newCampaignForm.title} placeholder="Tiêu đề chiến dịch *" class="px-3 py-2 rounded-lg border border-stone-300 bg-white font-bold" />
         <input type="text" bind:value={newCampaignForm.badge_text} placeholder="Nhãn sự kiện (VD: 🎃 HALLOWEEN)" class="px-3 py-2 rounded-lg border border-stone-300 bg-white" />
         <input type="text" bind:value={newCampaignForm.discount_code} placeholder="Mã ưu đãi (VD: HALLOWEEN2026)" class="px-3 py-2 rounded-lg border border-stone-300 bg-white font-mono" />
        </div>
        <input type="text" bind:value={newCampaignForm.offer_highlight} placeholder="Mô tả quà tặng / học bổng *" class="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white" />
        <div class="flex justify-end gap-2">
         <button type="button" onclick={() => showAddCampaignForm = false} class="px-3 py-1.5 rounded-lg bg-white border border-stone-300 font-bold">Hủy</button>
         <button type="submit" class="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-black">💾 Lưu Chiến Dịch</button>
        </div>
       </form>
      {/if}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
       {#each marketingCampaigns as mc (mc.id)}
        <div class="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2 flex flex-col justify-between">
         <div class="space-y-1">
          <div class="flex items-center justify-between gap-2">
           <span class="px-2.5 py-0.5 rounded-full bg-orange-500 text-white font-black text-[10px]">{mc.badge_text}</span>
           <span class="font-mono text-[10px] text-stone-500">Mã: {mc.discount_code} (+{mc.bonus_stars}⭐)</span>
          </div>
          <h3 class="text-sm font-black text-stone-900">{mc.title}</h3>
          <p class="text-stone-600">{mc.offer_highlight}</p>
         </div>
         <div class="pt-3 border-t border-stone-200 flex items-center justify-between gap-2">
          <span class="font-bold {mc.is_active ? 'text-emerald-700' : 'text-stone-400'}">
           {mc.is_active ? '🟢 Đang kích hoạt Popup' : '⚪ Đang tạm ẩn'}
          </span>
          <div class="flex items-center gap-1.5">
           <button
            type="button"
            onclick={async () => {
             await fetch('/api/campaigns', {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify({ action: 'toggle_campaign', id: mc.id, is_active: !mc.is_active })
             });
             showNotice(`🎃 Đã cập nhật trạng thái chiến dịch "${mc.id}" trên D1!`);
             await loadData();
            }}
            class="px-3 py-1.5 rounded-xl bg-white hover:bg-stone-100 border border-stone-300 font-bold text-stone-800"
           >
            {mc.is_active ? 'Tạm ẩn Popup' : 'Kích hoạt Popup'}
           </button>
           <button
            type="button"
            data-testid="btn-delete-campaign"
            onclick={() => handleDeleteCampaign(mc.id)}
            class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold transition"
           >
            🗑️ Xóa
           </button>
          </div>
         </div>
        </div>
       {/each}
      </div>

      {#if campaignLeads.length > 0}
       <div class="pt-3 border-t border-stone-200 space-y-2">
        <div class="font-bold text-stone-800">📋 Danh sách Học sinh / Phụ huynh đăng ký nhận học bổng ({campaignLeads.length}):</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
         {#each campaignLeads as ld (ld.id)}
          <div class="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between gap-2">
           <div>
            <div class="font-bold text-stone-900">{ld.visitor_name} — <span class="font-mono text-emerald-700">{ld.phone}</span></div>
            <div class="text-[11px] text-stone-500">{ld.grade_interest} • {ld.note}</div>
           </div>
           <button type="button" onclick={() => handleDeleteLead(ld.id)} class="px-2 py-1 rounded bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-[10px]">
            🗑️ Xóa
           </button>
          </div>
         {/each}
        </div>
       </div>
      {/if}
     </div>
    {:else if subTabSystem === 'reminders'}
     <div class="max-w-2xl mx-auto p-6 rounded-2xl bg-white border border-stone-200 space-y-4 shadow-xs">
      <div>
       <h2 class="text-base font-black text-stone-900">⚡ Phát Sóng Nhắc Nhở Chéo Đa Kênh</h2>
       <p class="text-xs text-stone-500 mt-1">Gửi lệnh nhắc nhở trực tiếp từ AdminCP xuống Cpanel Giáo Viên, Học Sinh, Phụ Huynh hoặc Leader.</p>
      </div>
      {#if reminderToast}
       <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
        {reminderToast}
       </div>
      {/if}
      <form onsubmit={handleSendCrossReminder} class="space-y-4 text-xs">
       <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
         <label for="reminder-target-role" class="block font-bold text-stone-700 mb-1.5">Nhóm Cpanel Nhận Lệnh:</label>
         <select id="reminder-target-role" bind:value={reminderForm.target_role} class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 py-2.5 text-stone-900">
          <option value="all">🌐 Toàn bộ hệ thống (All Roles)</option>
          <option value="student">🎓 Cpanel Học Sinh</option>
          <option value="parent">👨‍👩‍👧 Cpanel Phụ Huynh</option>
          <option value="teacher">👩‍🏫 Cpanel Giáo Viên</option>
          <option value="leader">📊 Cpanel Quản Lý (Leader)</option>
         </select>
        </div>
        <div>
         <label for="reminder-urgency" class="block font-bold text-stone-700 mb-1.5">Mức Độ Ưu Tiên:</label>
         <select id="reminder-urgency" bind:value={reminderForm.urgency} class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 py-2.5 text-stone-900">
          <option value="normal">🟢 Thông thường</option>
          <option value="high">🟠 Quan trọng (High)</option>
          <option value="urgent">🔴 Khẩn cấp (Urgent Alert)</option>
         </select>
        </div>
       </div>
       <div>
        <label for="reminder-title" class="block font-bold text-stone-700 mb-1.5">Tiêu Đề Thông Báo (*):</label>
        <input id="reminder-title" type="text" bind:value={reminderForm.title} required placeholder="VD: Nhắc nhở hoàn thành chấm bài Writing trước 21:00 tối nay" class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 py-2.5 text-stone-900" />
       </div>
       <div>
        <label for="reminder-body" class="block font-bold text-stone-700 mb-1.5">Nội Dung Chi Tiết (*):</label>
        <textarea id="reminder-body" rows="3" bind:value={reminderForm.body} required placeholder="Nhập nội dung chỉ đạo hoặc nhắc nhở..." class="w-full bg-stone-50 border border-stone-300 rounded-xl p-3.5 text-stone-900"></textarea>
       </div>
       <div class="pt-2 border-t border-stone-100 flex justify-end">
        <button type="submit" disabled={isSendingReminder} class="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs shadow-sm transition-all">
         {isSendingReminder ? '⏳ Đang phát sóng...' : '💾 Lưu & Phát Sóng Nhắc Nhở'}
        </button>
       </div>
      </form>
     </div>
    {:else if subTabSystem === 'streams'}
     <div class="p-5 rounded-2xl bg-white border border-stone-200 space-y-4 shadow-xs">
      <div class="flex items-center justify-between">
       <h2 class="text-base font-bold text-stone-900">📡 Nhật Ký Sự Kiện Tương Tác Chéo Giữa Các Role (D1)</h2>
       <div class="flex items-center gap-2">
        <button type="button" onclick={() => subTabSystem = 'reminders'} class="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-bold text-white">➕ Thêm Thông Báo Mới</button>
        <button type="button" onclick={loadData} class="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-bold text-stone-700">🔄 Làm mới</button>
       </div>
      </div>
      <div class="space-y-2.5">
       {#each events as ev (ev.id)}
        <div class="p-3.5 rounded-xl bg-stone-50 border border-stone-200 flex items-start justify-between gap-4">
         <div class="space-y-1">
          <div class="flex items-center gap-2">
           <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
            Target: {ev.target_role}
           </span>
           <span class="text-xs font-bold text-stone-900">{ev.title}</span>
          </div>
          <p class="text-xs text-stone-600">{ev.body}</p>
          <div class="text-[11px] text-stone-500">
           Người gửi: <strong>{ev.sender_name || 'Ban Quản Lý'}</strong> • Thời gian: {new Date(ev.created_at).toLocaleString('vi-VN')}
          </div>
         </div>
         <button
          type="button"
          data-testid="btn-delete-notification"
          onclick={() => handleDeleteNotification(ev.id)}
          class="shrink-0 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-xs transition"
         >
          🗑️ Xóa
         </button>
        </div>
       {/each}
      </div>
     </div>
    {:else if subTabSystem === 'theme'}
     <div class="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs">
      <ThemeStudioPanel
       onSaved={(vars) => { clearLocal(); applyThemeVars(vars); }}
      />
     </div>
    {/if}
   </div>
  {/if}
 </div>
</div>

<!-- Shared Schedule & Staff Modals -->
<SessionEditModal
 bind:isOpen={showSessionModal}
 session={editingSession}
 existingSessions={scheduleSessions}
 onSaved={() => { showSessionModal = false; loadScheduleD1(); }}
 onDeleted={(delId) => { scheduleSessions = scheduleSessions.filter(s => s.id !== delId); showSessionModal = false; loadScheduleD1(); }}
/>

<SessionRollCallModal
 bind:isOpen={showRollCallModal}
 session={activeRollCallSession}
 onSaved={() => { loadScheduleD1(); }}
/>

<TeacherStaffModal
 bind:isOpen={showStaffModal}
 staffProfile={selectedStaffProfile}
 teacherId={selectedStaffProfile?.teacher_id}
 currentUser={currentUser}
 onSaved={() => { loadTeachersAndWorkflowsD1(); }}
/>

<!-- Add / Edit Campus Modal (Sticky Bottom CTA Footer) -->
{#if showAddCampusModal}
 <div class="fixed inset-0 z-50 flex items-center justify-center bg-stone-500/25 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
  <div class="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden">
   <div class="shrink-0 flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-white">
    <h3 class="text-base font-black text-stone-900">{editingCampusId ? '✏️ Cập Nhật Điểm Học' : '➕ Thêm Điểm Học Mới'}</h3>
    <button type="button" onclick={() => showAddCampusModal = false} class="w-8 h-8 rounded-full bg-stone-100 text-stone-600 font-bold">✕</button>
   </div>
   <form onsubmit={handleCreateCampus} class="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
     {#if campusToast}
      <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-bold">
       {campusToast}
      </div>
     {/if}
     <div>
      <label for="campus-name" class="block font-bold text-stone-700 mb-1">Tên Điểm Học (*):</label>
      <input id="campus-name" type="text" bind:value={newCampus.name} required placeholder="VD: Cơ sở 2 - Quận Cầu Giấy" class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 py-2.5 text-stone-900" />
     </div>
     <div>
      <label for="campus-address" class="block font-bold text-stone-700 mb-1">Địa Chỉ Chi Tiết (*):</label>
      <input id="campus-address" type="text" bind:value={newCampus.address} required placeholder="Số nhà, đường, quận/huyện..." class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 py-2.5 text-stone-900" />
     </div>
     <div>
      <label for="campus-phone" class="block font-bold text-stone-700 mb-1">Số Điện Thoại Liên Hệ:</label>
      <input id="campus-phone" type="text" bind:value={newCampus.contact_phone} placeholder="090..." class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 py-2.5 text-stone-900" />
     </div>
     <div>
      <label for="campus-maps" class="block font-bold text-stone-700 mb-1">Link Google Maps (Tùy chọn):</label>
      <input id="campus-maps" type="text" bind:value={newCampus.google_maps_url} placeholder="https://maps.google.com/..." class="w-full bg-stone-50 border border-stone-300 rounded-xl px-3.5 py-2.5 text-stone-900" />
     </div>
     <label class="flex items-center gap-2 pt-1 cursor-pointer select-none">
      <input type="checkbox" bind:checked={newCampus.is_primary} class="rounded border-stone-300 text-emerald-700" />
      <span class="font-bold text-stone-700">Đặt làm Cơ sở chính (Mặc định khi tạo ca học)</span>
     </label>
    </div>
    <div data-testid="modal-cta-footer" class="sticky bottom-0 z-20 shrink-0 px-6 py-3.5 border-t border-stone-200 bg-white flex justify-end gap-2">
     <button type="button" onclick={() => showAddCampusModal = false} class="px-4 py-2 rounded-lg bg-stone-100 text-stone-700 font-bold">Hủy</button>
     <button type="submit" data-testid="save-campus-btn" disabled={isSavingCampus} class="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold">
      {isSavingCampus ? '⏳ Đang lưu...' : (editingCampusId ? '💾 Lưu Cập Nhật' : '➕ Thêm & Lưu Cơ Sở')}
     </button>
    </div>
   </form>
  </div>
 </div>
{/if}

<!-- Self Password Change Modal for AdminCP (Sticky Bottom CTA Footer) -->
{#if showSelfPwModal}
 <div class="fixed inset-0 z-50 flex items-center justify-center bg-stone-500/25 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
  <div class="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden">
   <div class="shrink-0 flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-white">
    <h3 class="text-base font-black text-stone-900">🔑 Đổi Mật Khẩu Tài Khoản Đang Đăng Nhập</h3>
    <button type="button" onclick={() => showSelfPwModal = false} class="w-8 h-8 rounded-full bg-stone-100 text-stone-600 font-bold">✕</button>
   </div>
   <form onsubmit={handleSelfChangePassword} class="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
     {#if selfPwMsg}
      <div class="p-3 rounded-xl font-bold {selfPwErr ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
       {selfPwMsg}
      </div>
     {/if}
     <div>
      <label for="admcp-self-old" class="block font-bold text-stone-700 mb-1">Mật khẩu hiện tại (*):</label>
      <input id="admcp-self-old" type="password" required bind:value={selfOldPassword} class="w-full px-3 py-2 rounded-lg border border-stone-300" />
     </div>
     <div>
      <label for="admcp-self-new" class="block font-bold text-stone-700 mb-1">Mật khẩu mới (&ge; 6 ký tự):</label>
      <input id="admcp-self-new" type="password" required minlength="6" bind:value={selfNewPassword} class="w-full px-3 py-2 rounded-lg border border-stone-300" />
     </div>
     <div>
      <label for="admcp-self-confirm" class="block font-bold text-stone-700 mb-1">Xác nhận mật khẩu mới:</label>
      <input id="admcp-self-confirm" type="password" required minlength="6" bind:value={selfConfirmPassword} class="w-full px-3 py-2 rounded-lg border border-stone-300" />
     </div>
    </div>
    <div data-testid="modal-cta-footer" class="sticky bottom-0 z-20 shrink-0 px-6 py-3.5 border-t border-stone-200 bg-white flex justify-end gap-2">
     <button type="button" onclick={() => showSelfPwModal = false} class="px-4 py-2 rounded-lg bg-stone-100 text-stone-700 font-bold">Hủy</button>
     <button type="submit" disabled={selfPwSaving} class="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-50">
      {selfPwSaving ? '⏳ Đang lưu...' : '💾 Lưu Mật Khẩu Mới'}
     </button>
    </div>
   </form>
  </div>
 </div>
{/if}
