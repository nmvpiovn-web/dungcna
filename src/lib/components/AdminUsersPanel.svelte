<!-- src/lib/components/AdminUsersPanel.svelte
 Trung tâm Quản lý User, Phân quyền Role (Học sinh, Giáo viên, Phụ huynh, Leader, Admin) & Cấp lại Mật khẩu đồng bộ trực tiếp Cloudflare D1 -->
<script>
 import { onMount } from 'svelte';
 import { getAuthToken } from '$lib/unifiedStore';

 let users = $state([]);
 let loading = $state(true);
 let error = $state('');
 let toast = $state('');
 let toastType = $state('ok'); // 'ok' | 'err'
 let modalError = $state('');
 let q = $state('');
 let roleFilter = $state('all');
 let busyId = $state('');

 // Modals state
 let showCreateModal = $state(false);
 let creating = $state(false);
 let createForm = $state({
  role: 'student',
  name: '',
  username: '',
  password: '',
  phone: '',
  email: '',
  grade: 'Lớp 7',
  class_id: 'L7_GLOBAL_SUCCESS_A1',
  school: '',
  initial_stars: 500,
  role_type: 'lead',
  role_title: 'Giáo viên Tiếng Anh',
  salary_type: 'per_session',
  base_salary_vnd: 0,
  rate_per_session_vnd: 300000,
  student_id: '',
  must_change_password: false
 });

 let showResetPwModal = $state(false);
 let targetUserForPw = $state(null);
 let newPasswordVal = $state('');
 let forceChangeNextLogin = $state(false);
 let resettingPw = $state(false);

 let showEditModal = $state(false);
 let editForm = $state({
  user_id: '',
  username: '',
  role: 'student',
  name: '',
  phone: '',
  email: '',
  grade: 'Lớp 7',
  class_id: '',
  school: '',
  parent_name: '',
  parent_phone: '',
  role_title: 'Giáo viên Tiếng Anh',
  base_salary_vnd: 0,
  rate_per_session_vnd: 300000
 });
 let savingEdit = $state(false);

 let showStarModal = $state(false);
 let targetStudentForStar = $state(null);
 let starDelta = $state(50);
 let starReason = $state('Thưởng chuyên cần & hoàn thành bài tập xuất sắc');
 let savingStars = $state(false);

 let showLinkChildModal = $state(false);
 let targetParentForLink = $state(null);
 let childUsernameOrId = $state('');
 let linkingChild = $state(false);

 const ASSIGNABLE_ROLES = ['student', 'parent', 'teacher', 'leader', 'admin'];
 const GRADE_OPTIONS = [
  'Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5',
  'Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9',
  'Lớp 10', 'Lớp 11', 'Lớp 12',
  'Luyện Thi IELTS Academic', 'Ôn Thi THPT Quốc Gia 2026'
 ];
 const ROLE_BADGE = {
  superadmin: 'bg-rose-100 text-rose-800 border-rose-300',
  admin: 'bg-purple-100 text-purple-800 border-purple-300',
  leader: 'bg-amber-100 text-amber-800 border-amber-300',
  teacher: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  parent: 'bg-sky-100 text-sky-800 border-sky-300',
  student: 'bg-stone-100 text-stone-700 border-stone-300'
 };
 const ROLE_LABEL = {
  superadmin: '👑 SuperAdmin',
  admin: '🛡️ Admin',
  leader: '⭐ Leader',
  teacher: '👩‍🏫 Giáo viên',
  parent: '👨‍👩‍👧 Phụ huynh',
  student: '🎓 Học sinh'
 };

 function notify(msg, type = 'ok') {
  toast = msg;
  toastType = type;
  if (type === 'err') {
   modalError = msg;
  }
  setTimeout(() => { if (toast === msg) toast = ''; }, 5000);
 }

 function authHeaders() {
  const token = getAuthToken();
  return {
   'Content-Type': 'application/json',
   ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
 }

 let stats = $derived.by(() => {
  const total = users.length;
  const students = users.filter(u => u.role === 'student').length;
  const trialStudents = users.filter(u => u.role === 'student' && (u.status === 'trial' || u.approval_status === 'trial')).length;
  const teachers = users.filter(u => u.role === 'teacher').length;
  const parents = users.filter(u => u.role === 'parent').length;
  const managers = users.filter(u => ['superadmin', 'admin', 'leader'].includes(u.role)).length;
  return { total, students, trialStudents, teachers, parents, managers };
 });

 async function loadUsers() {
  loading = true;
  error = '';
  try {
   const params = new URLSearchParams();
   if (q.trim()) params.set('q', q.trim());
   if (roleFilter !== 'all') params.set('role', roleFilter);
   const res = await fetch(`/api/admincp/users?${params.toString()}`, {
    headers: authHeaders(),
    credentials: 'include'
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    error = data.error || `Lỗi tải danh sách (${res.status})`;
    users = [];
    return;
   }
   users = data.users || [];
  } catch (e) {
   error = e.message || 'Lỗi mạng khi tải danh sách tài khoản';
  } finally {
   loading = false;
  }
 }

 function openCreateUserModal() {
  modalError = '';
  showCreateModal = true;
 }

 async function handleCreateUser(e) {
  if (e && e.preventDefault) e.preventDefault();
  modalError = '';
  if (!createForm.name.trim() || !createForm.username.trim() || createForm.password.length < 6) {
   notify('Vui lòng điền Họ tên, Username và Mật khẩu (>= 6 ký tự).', 'err');
   return;
  }
  creating = true;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'create_user',
     ...createForm
    })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    notify(data.error || 'Tạo tài khoản thất bại', 'err');
    return;
   }
   notify(data.message || 'Đã tạo tài khoản thành công!');
   showCreateModal = false;
   createForm = {
    ...createForm,
    name: '',
    username: '',
    password: '',
    phone: '',
    email: ''
   };
   await loadUsers();
  } catch (err) {
   notify(err.message || 'Lỗi kết nối', 'err');
  } finally {
   creating = false;
  }
 }

 async function changeRole(u, newRole) {
  if (!newRole || newRole === u.role) return;
  busyId = u.id;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'update_role', user_id: u.id, role: newRole })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    notify(data.error || 'Không thể đổi role', 'err');
    return;
   }
   notify(data.message || 'Đã cập nhật vai trò');
   await loadUsers();
  } catch (e) {
   notify(e.message || 'Lỗi mạng', 'err');
  } finally {
   busyId = '';
  }
 }

 async function toggleLock(u) {
  busyId = u.id;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'toggle_status', user_id: u.id })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    notify(data.error || 'Không thể cập nhật trạng thái', 'err');
    return;
   }
   users = users.map(row => row.id === u.id ? { ...row, status: data.user?.status ?? row.status } : row);
   notify(data.message || 'Đã cập nhật trạng thái');
  } catch (e) {
   notify(e.message || 'Lỗi mạng', 'err');
  } finally {
   busyId = '';
  }
 }

 async function approveOfficial(u) {
  busyId = u.id;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'approve_user', user_id: u.id })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    notify(data.error || 'Lỗi phê duyệt', 'err');
    return;
   }
   notify(data.message || 'Đã duyệt chính thức!');
   await loadUsers();
  } catch (e) {
   notify(e.message || 'Lỗi mạng', 'err');
  } finally {
   busyId = '';
  }
 }

 function openResetPasswordModal(u) {
  modalError = '';
  targetUserForPw = u;
  newPasswordVal = '';
  forceChangeNextLogin = false;
  showResetPwModal = true;
 }

 async function submitResetPassword(e) {
  if (e && e.preventDefault) e.preventDefault();
  modalError = '';
  if (!targetUserForPw || newPasswordVal.trim().length < 6) {
   notify('Mật khẩu mới phải có ít nhất 6 ký tự.', 'err');
   return;
  }
  resettingPw = true;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'reset_password',
     user_id: targetUserForPw.id,
     new_password: newPasswordVal.trim(),
     force_change_next_login: forceChangeNextLogin
    })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    notify(data.error || 'Đặt lại mật khẩu thất bại', 'err');
    return;
   }
   notify(data.message || `Đã đổi mật khẩu cho @${targetUserForPw.username}!`);
   showResetPwModal = false;
   newPasswordVal = '';
   await loadUsers();
  } catch (err) {
   notify(err.message || 'Lỗi mạng', 'err');
  } finally {
   resettingPw = false;
  }
 }

 function openEditUserModal(u) {
  modalError = '';
  editForm = {
   user_id: u.id,
   username: u.username,
   role: u.role,
   name: u.name || '',
   phone: u.phone || '',
   email: u.email || '',
   grade: u.grade || 'Lớp 7',
   class_id: u.class_id || '',
   school: u.school || '',
   parent_name: u.parent_name || '',
   parent_phone: u.parent_phone || '',
   role_title: u.teacher_profile?.role_title || 'Giáo viên Tiếng Anh',
   base_salary_vnd: u.teacher_profile?.base_salary_vnd || 0,
   rate_per_session_vnd: u.teacher_profile?.rate_per_session_vnd || 300000
  };
  showEditModal = true;
 }

 async function submitEditUser(e) {
  if (e && e.preventDefault) e.preventDefault();
  modalError = '';
  savingEdit = true;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'update_user',
     ...editForm
    })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    notify(data.error || 'Cập nhật thất bại', 'err');
    return;
   }
   notify(data.message || 'Đã lưu hồ sơ thành công!');
   showEditModal = false;
   await loadUsers();
  } catch (err) {
   notify(err.message || 'Lỗi mạng', 'err');
  } finally {
   savingEdit = false;
  }
 }

 function openStarAdjustModal(u) {
  modalError = '';
  targetStudentForStar = u;
  starDelta = 50;
  starReason = 'Thưởng chuyên cần & hoàn thành bài tập xuất sắc';
  showStarModal = true;
 }

 async function submitStarAdjust(e) {
  if (e && e.preventDefault) e.preventDefault();
  modalError = '';
  if (!targetStudentForStar) return;
  savingStars = true;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'adjust_stars',
     user_id: targetStudentForStar.id,
     delta_stars: Number(starDelta),
     reason: starReason
    })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    notify(data.error || 'Lỗi điều chỉnh sao', 'err');
    return;
   }
   notify(data.message || 'Đã cập nhật sao!');
   showStarModal = false;
   await loadUsers();
  } catch (err) {
   notify(err.message || 'Lỗi mạng', 'err');
  } finally {
   savingStars = false;
  }
 }

 function openLinkParentModal(u) {
  modalError = '';
  targetParentForLink = u;
  childUsernameOrId = '';
  showLinkChildModal = true;
 }

 async function submitLinkParent(e) {
  if (e && e.preventDefault) e.preventDefault();
  modalError = '';
  if (!targetParentForLink || !childUsernameOrId.trim()) return;
  linkingChild = true;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'link_parent_student',
     user_id: targetParentForLink.id,
     student_id: childUsernameOrId.trim()
    })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    notify(data.error || 'Liên kết thất bại', 'err');
    return;
   }
   notify(data.message || 'Đã liên kết phụ huynh - học sinh thành công!');
   childUsernameOrId = '';
   await loadUsers();
   if (targetParentForLink) {
    const refreshed = users.find(x => x.id === targetParentForLink.id);
    if (refreshed) targetParentForLink = refreshed;
   }
  } catch (err) {
   notify(err.message || 'Lỗi mạng', 'err');
  } finally {
   linkingChild = false;
  }
 }

 async function unlinkChildFromParent(parentUser, childLink) {
  if (!parentUser || !childLink) return;
  const pid = parentUser.id || parentUser.user_id;
  const sid = childLink.student_user_id || childLink.student_id || childLink.student_username;
  const lid = childLink.link_id || childLink.id || '';
  linkingChild = true;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     action: 'unlink_parent_student',
     user_id: pid,
     student_id: sid,
     link_id: lid
    })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    notify(data.error || 'Gỡ liên kết học sinh thất bại', 'err');
    return;
   }
   notify(data.message || '🗑️ Đã gỡ liên kết học sinh khỏi phụ huynh thành công!');
   await loadUsers();
   if (targetParentForLink && targetParentForLink.id === pid) {
    const refreshed = users.find(x => x.id === pid);
    if (refreshed) targetParentForLink = refreshed;
   }
  } catch (err) {
   notify(err.message || 'Lỗi mạng khi gỡ liên kết', 'err');
  } finally {
   linkingChild = false;
  }
 }

 async function deleteUserAccount(u) {
  if (!u || (!u.id && !u.user_id)) return;
  const uid = u.id || u.user_id;
  busyId = uid;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ action: 'delete_user', user_id: uid })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    notify(data.error || 'Xóa tài khoản thất bại', 'err');
    return;
   }
   users = users.filter(row => row.id !== uid);
   showEditModal = false;
   notify(data.message || `🗑️ Đã xóa tài khoản @${u.username || uid} khỏi D1!`);
   await loadUsers();
  } catch (err) {
   notify(err.message || 'Lỗi mạng', 'err');
  } finally {
   busyId = '';
  }
 }

 onMount(() => {
  loadUsers();
 });
</script>

<div class="space-y-4">
 <!-- Unified Control Bar & Quick Role Filter Pills -->
 <div class="p-4 rounded-xl bg-white border border-stone-200 shadow-xs space-y-3">
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
   <div>
    <h2 class="text-base font-bold text-stone-900">👥 Quản Lý Người Dùng, Phân Quyền Role &amp; Cấp Mật Khẩu (D1)</h2>
    <p class="text-xs text-stone-500 mt-0.5">
     Tổng số: <strong>{stats.total}</strong> tài khoản ({stats.students} Học sinh • {stats.teachers} Giáo viên • {stats.parents} Phụ huynh • {stats.managers} Quản lý)
    </p>
   </div>
   <div class="flex items-center gap-2 flex-wrap">
    <button
     type="button"
     data-testid="admincp-create-user-btn"
     onclick={openCreateUserModal}
     class="px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors"
    >
     ➕ Tạo Tài Khoản Mới
    </button>
    <button
     type="button"
     onclick={loadUsers}
     class="px-3 py-2 rounded-lg text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 transition-colors"
    >
     🔄 Đồng bộ D1
    </button>
   </div>
  </div>

  <!-- Search & Role Filter Bar -->
  <div class="flex flex-col md:flex-row gap-2.5">
   <form onsubmit={(e) => { e.preventDefault(); loadUsers(); }} class="flex gap-2 flex-1">
    <input
     type="search"
     bind:value={q}
     placeholder="Tìm theo tên, @username, số điện thoại hoặc email..."
     class="flex-1 px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:border-emerald-600"
    />
    <button
     type="submit"
     class="px-3.5 py-2 text-xs font-bold rounded-lg bg-brand-600 text-white hover:bg-brand-700"
    >
     Tìm
    </button>
   </form>
   <div class="flex flex-wrap items-center gap-1.5">
    {#each [
     ['all', `Tất cả (${stats.total})`],
     ['student', `🎓 Học sinh (${stats.students})`],
     ['teacher', `👩‍🏫 Giáo viên (${stats.teachers})`],
     ['parent', `👨‍👩‍👧 Phụ huynh (${stats.parents})`],
     ['leader', '⭐ Leader'],
     ['admin', '🛡️ Admin'],
     ['superadmin', '👑 SuperAdmin']
    ] as [rKey, rLabel]}
     <button
      type="button"
      onclick={() => { roleFilter = rKey; loadUsers(); }}
      class="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors {roleFilter === rKey ? 'bg-emerald-700 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}"
     >
      {rLabel}
     </button>
    {/each}
   </div>
  </div>
 </div>

 {#if toast}
  <div role="status" class="p-3 rounded-xl text-xs font-bold border {toastType === 'err' ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-emerald-50 text-emerald-800 border-emerald-300'}">
   {toast}
  </div>
 {/if}

 {#if error}
  <div class="p-4 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
   ⚠️ {error}
  </div>
 {/if}

 {#if loading}
  <div class="p-8 text-center text-xs text-stone-500 bg-white rounded-xl border border-stone-200">
   ⏳ Đang đồng bộ danh sách tài khoản từ Cloudflare D1...
  </div>
 {:else if users.length === 0}
  <div class="p-8 text-center text-xs text-stone-500 bg-white rounded-xl border border-stone-200">
   Không tìm thấy tài khoản nào khớp bộ lọc.
  </div>
 {:else}
  <div class="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-xs">
   <table class="min-w-full text-xs">
    <thead class="bg-stone-100 text-stone-700 uppercase text-[11px]">
     <tr>
      <th class="px-3 py-2.5 text-left">Tài khoản</th>
      <th class="px-3 py-2.5 text-left">Vai trò (Role)</th>
      <th class="px-3 py-2.5 text-left">Nghiệp vụ (Khối lớp / Lương / Liên kết)</th>
      <th class="px-3 py-2.5 text-left">Trạng thái</th>
      <th class="px-3 py-2.5 text-right">Thao tác (Đồng bộ D1)</th>
     </tr>
    </thead>
    <tbody class="divide-y divide-stone-200">
     {#each users as u (u.id)}
      <tr class="hover:bg-stone-50/80 transition-colors">
       <!-- Col 1: Account Info -->
       <td class="px-3 py-2.5">
        <div class="font-bold text-stone-900">{u.name || '—'}</div>
        <div class="font-mono text-[11px] text-stone-500">@{u.username}</div>
        {#if u.phone || u.email}
         <div class="text-[11px] text-stone-500 mt-0.5">
          {u.phone || ''}{u.phone && u.email ? ' • ' : ''}{u.email || ''}
         </div>
        {/if}
       </td>

       <!-- Col 2: Role Badge & Selector -->
       <td class="px-3 py-2.5">
        <div class="flex flex-col gap-1.5 items-start">
         <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border {ROLE_BADGE[u.role] || ROLE_BADGE.student}">
          {ROLE_LABEL[u.role] || u.role}
         </span>
         {#if u.role !== 'superadmin'}
          <select
           disabled={busyId === u.id}
           value={u.role}
           onchange={(e) => changeRole(u, e.currentTarget.value)}
           aria-label="Đổi role cho {u.username}"
           class="px-2 py-1 rounded border border-stone-300 bg-white text-[11px] font-semibold text-stone-800 disabled:opacity-50"
          >
           {#each ASSIGNABLE_ROLES as r}
            <option value={r}>Đổi sang: {r}</option>
           {/each}
          </select>
         {/if}
        </div>
       </td>

       <!-- Col 3: Role-specific operational info -->
       <td class="px-3 py-2.5">
        {#if u.role === 'student'}
         <div class="space-y-1">
          <div class="flex items-center gap-1.5 flex-wrap">
           <span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]">
            {u.grade || 'Chưa phân khối'}
           </span>
           {#if u.class_id}
            <span class="px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-mono text-[10px]">
             {u.class_id}
            </span>
           {/if}
           <span class="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
            ⭐ {u.stars_balance ?? 0} sao
           </span>
          </div>
          {#if u.school || u.parent_phone}
           <div class="text-[11px] text-stone-500">
            {u.school ? `🏫 ${u.school}` : ''} {u.parent_phone ? `• PH: ${u.parent_phone}` : ''}
           </div>
          {/if}
         </div>
        {:else if u.role === 'teacher'}
         <div class="space-y-1">
          <div class="font-semibold text-stone-800">
           {u.teacher_profile?.role_title || 'Giáo viên Tiếng Anh'}
          </div>
          <div class="text-[11px] text-stone-500">
           Ca dạy: <strong>{(Number(u.teacher_profile?.rate_per_session_vnd) || 300000).toLocaleString('vi-VN')}đ</strong>
           • Lương cứng: <strong>{(Number(u.teacher_profile?.base_salary_vnd) || 0).toLocaleString('vi-VN')}đ</strong>
          </div>
         </div>
        {:else if u.role === 'parent'}
         <div class="space-y-1.5">
          {#if u.linked_children && u.linked_children.length > 0}
           {#each u.linked_children as ch}
            <div class="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-sky-50/80 border border-sky-200 text-[11px] font-semibold text-sky-900">
             <div class="truncate">
              👶 {ch.student_name || ch.student_user_id} (@{ch.student_username || ''})
              <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] {ch.verification_status === 'verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
               {ch.verification_status}
              </span>
             </div>
             <button
              type="button"
              data-testid="btn-unlink-child-inline"
              onclick={() => unlinkChildFromParent(u, ch)}
              disabled={linkingChild}
              title="Xóa / Gỡ liên kết học sinh này khỏi phụ huynh"
              class="shrink-0 px-1.5 py-0.5 rounded bg-rose-100 hover:bg-rose-600 text-rose-700 hover:text-white font-bold text-[10px] transition"
             >
              ✕ Xóa con
             </button>
            </div>
           {/each}
          {:else}
           <span class="text-[11px] text-stone-400 italic">Chưa liên kết học sinh</span>
          {/if}
         </div>
        {:else}
         <span class="text-[11px] text-stone-500">Toàn quyền điều hành hệ thống</span>
        {/if}
       </td>

       <!-- Col 4: Status -->
       <td class="px-3 py-2.5">
        <div class="flex flex-col gap-1 items-start">
         {#if (u.status || 'active') === 'locked'}
          <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">🔒 Đã khóa</span>
         {:else if u.status === 'trial' || u.approval_status === 'trial'}
          <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">⏳ Học thử</span>
         {:else}
          <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">✅ Hoạt động</span>
         {/if}
         {#if u.must_change_password}
          <span class="text-[10px] font-semibold text-amber-700">⚠️ Chờ đổi MK lần đầu</span>
         {/if}
        </div>
       </td>

       <!-- Col 5: Actions -->
       <td class="px-3 py-2.5 text-right">
        <div class="inline-flex items-center justify-end gap-1.5 flex-wrap">
         <button
          type="button"
          data-testid="admincp-reset-pw-{u.username}"
          onclick={() => openResetPasswordModal(u)}
          class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-colors"
          title="Đặt lại mật khẩu mới cho @{u.username}"
         >
          🔑 Đổi MK
         </button>

         <button
          type="button"
          onclick={() => openEditUserModal(u)}
          class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 transition-colors"
          title="Sửa hồ sơ, phân khối lớp hoặc lương"
         >
          ✏️ Sửa
         </button>

         {#if u.role === 'student'}
          <button
           type="button"
           onclick={() => openStarAdjustModal(u)}
           class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border border-yellow-300 transition-colors"
           title="Cộng/trừ sao thưởng học sinh"
          >
           ⭐ Sao
          </button>
         {/if}

         {#if u.role === 'parent'}
          <button
           type="button"
           onclick={() => openLinkParentModal(u)}
           class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 transition-colors"
           title="Gán & xác minh học sinh cho phụ huynh"
          >
           🔗 Gán con
          </button>
         {/if}

         {#if u.status === 'trial' || u.approval_status === 'trial'}
          <button
           type="button"
           onclick={() => approveOfficial(u)}
           disabled={busyId === u.id}
           class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
           ✅ Duyệt
          </button>
         {/if}

         {#if u.role !== 'superadmin'}
          <button
           type="button"
           disabled={busyId === u.id}
           onclick={() => toggleLock(u)}
           class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-50 {(u.status || 'active') === 'locked' ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100' : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'}"
          >
           {(u.status || 'active') === 'locked' ? '🔓 Mở' : '🔒 Khóa'}
          </button>
          <button
           type="button"
           data-testid="admincp-delete-user-{u.username}"
           disabled={busyId === u.id}
           onclick={() => deleteUserAccount(u)}
           class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
           title="Xóa tài khoản"
          >
           🗑️ Xóa
          </button>
         {/if}
        </div>
       </td>
      </tr>
     {/each}
    </tbody>
   </table>
  </div>
 {/if}
</div>

<!-- MODAL 1: CREATE USER (Sticky CTA Footer at bottom) -->
{#if showCreateModal}
 <div class="fixed inset-0 z-50 flex items-center justify-center bg-stone-500/25 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
  <div class="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden">
   <div class="shrink-0 flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-white">
    <h3 class="text-base font-black text-stone-900">➕ Tạo Tài Khoản Mới Trên Cloudflare D1</h3>
    <button type="button" onclick={() => showCreateModal = false} class="w-8 h-8 rounded-full bg-stone-100 text-stone-600 font-bold">✕</button>
   </div>
   <form onsubmit={handleCreateUser} class="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
     <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
       <label for="cu-role" class="block font-bold text-stone-700 mb-1">Vai trò (Role):</label>
       <select id="cu-role" bind:value={createForm.role} class="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white font-bold text-stone-900">
        <option value="student">🎓 Học sinh (Student)</option>
        <option value="teacher">👩‍🏫 Giáo viên (Teacher)</option>
        <option value="parent">👨‍👩‍👧 Phụ huynh (Parent)</option>
        <option value="leader">⭐ Quản lý (Leader)</option>
        <option value="admin">🛡️ Quản trị viên (Admin)</option>
       </select>
      </div>
      <div>
       <label for="cu-name" class="block font-bold text-stone-700 mb-1">Họ và tên (*):</label>
       <input id="cu-name" type="text" required bind:value={createForm.name} placeholder="VD: Nguyễn Minh Quân" class="w-full px-3 py-2 rounded-lg border border-stone-300" />
      </div>
     </div>

     <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
       <label for="cu-username" class="block font-bold text-stone-700 mb-1">Username đăng nhập (*):</label>
       <input id="cu-username" type="text" required bind:value={createForm.username} placeholder="VD: minhquan7a" class="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono" />
      </div>
      <div>
       <label for="cu-password" class="block font-bold text-stone-700 mb-1">Mật khẩu khởi tạo (&ge; 6 ký tự):</label>
       <input id="cu-password" type="text" required minlength="6" bind:value={createForm.password} placeholder="VD: MatKhau123!" class="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono" />
      </div>
     </div>

     <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
       <label for="cu-phone" class="block font-bold text-stone-700 mb-1">Số điện thoại:</label>
       <input id="cu-phone" type="text" bind:value={createForm.phone} placeholder="09..." class="w-full px-3 py-2 rounded-lg border border-stone-300" />
      </div>
      <div>
       <label for="cu-email" class="block font-bold text-stone-700 mb-1">Email (Tùy chọn):</label>
       <input id="cu-email" type="email" bind:value={createForm.email} placeholder="Tự tạo nếu để trống" class="w-full px-3 py-2 rounded-lg border border-stone-300" />
      </div>
     </div>

     {#if createForm.role === 'student'}
      <div class="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-3">
       <div class="font-bold text-emerald-900">🎓 Cấu hình Học Vụ Học Sinh</div>
       <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
         <label for="cu-grade" class="block font-semibold text-stone-700 mb-1">Khối lớp:</label>
         <select id="cu-grade" bind:value={createForm.grade} class="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white">
          {#each GRADE_OPTIONS as g}
           <option value={g}>{g}</option>
          {/each}
         </select>
        </div>
        <div>
         <label for="cu-class" class="block font-semibold text-stone-700 mb-1">Mã lớp (Class ID):</label>
         <input id="cu-class" type="text" bind:value={createForm.class_id} placeholder="L7_GLOBAL_SUCCESS_A1" class="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono" />
        </div>
       </div>
      </div>
     {:else if createForm.role === 'teacher'}
      <div class="p-3 rounded-xl bg-teal-50/70 border border-teal-200 space-y-3">
       <div class="font-bold text-teal-900">👩‍🏫 Cấu hình Hồ Sơ Giáo Viên &amp; Định Mức Lương</div>
       <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
         <label for="cu-ttitle" class="block font-semibold text-stone-700 mb-1">Chức danh:</label>
         <input id="cu-ttitle" type="text" bind:value={createForm.role_title} class="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white" />
        </div>
        <div>
         <label for="cu-trate" class="block font-semibold text-stone-700 mb-1">Đơn giá / ca (VNĐ):</label>
         <input id="cu-trate" type="number" bind:value={createForm.rate_per_session_vnd} class="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white" />
        </div>
        <div>
         <label for="cu-tbase" class="block font-semibold text-stone-700 mb-1">Lương cứng (VNĐ):</label>
         <input id="cu-tbase" type="number" bind:value={createForm.base_salary_vnd} class="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white" />
        </div>
       </div>
      </div>
     {:else if createForm.role === 'parent'}
      <div class="p-3 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2">
       <label for="cu-stuid" class="block font-bold text-sky-900">🔗 Username hoặc ID Học sinh con (Tự động xác minh liên kết):</label>
       <input id="cu-stuid" type="text" bind:value={createForm.student_id} placeholder="VD: minhquan7a hoặc baokhiem" class="w-full px-3 py-2 rounded-lg border border-sky-300 bg-white font-mono" />
      </div>
     {/if}
    </div>

    <div data-testid="modal-cta-footer" class="sticky bottom-0 z-20 shrink-0 px-6 py-3.5 border-t border-stone-200 bg-white space-y-2">
     {#if modalError}
      <div role="alert" class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs">
       ⚠️ {modalError}
      </div>
     {/if}
     <div class="flex justify-end gap-2">
      <button type="button" onclick={() => showCreateModal = false} class="px-4 py-2 rounded-lg bg-stone-100 text-stone-700 font-bold">Hủy</button>
      <button type="submit" data-testid="admincp-submit-create-user-btn" disabled={creating} class="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-50">
       {creating ? '⏳ Đang tạo...' : '➕ Thêm & Lưu Tài Khoản D1'}
      </button>
     </div>
    </div>
   </form>
  </div>
 </div>
{/if}

<!-- MODAL 2: RESET PASSWORD (Sticky CTA Footer at bottom) -->
{#if showResetPwModal && targetUserForPw}
 <div class="fixed inset-0 z-50 flex items-center justify-center bg-stone-500/25 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
  <div class="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden">
   <div class="shrink-0 flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-white">
    <div>
     <h3 class="text-base font-black text-stone-900">🔑 Cấp / Đổi Mật Khẩu Mới</h3>
     <p class="text-xs text-stone-500">Tài khoản: <strong>{targetUserForPw.name}</strong> (@{targetUserForPw.username})</p>
    </div>
    <button type="button" onclick={() => showResetPwModal = false} class="w-8 h-8 rounded-full bg-stone-100 text-stone-600 font-bold">✕</button>
   </div>
   <form onsubmit={submitResetPassword} class="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
     <div>
      <label for="adm-new-pw" class="block font-bold text-stone-700 mb-1">Mật khẩu mới (&ge; 6 ký tự):</label>
      <input
       id="adm-new-pw"
       data-testid="admincp-new-password-input"
       type="text"
       required
       minlength="6"
       bind:value={newPasswordVal}
       placeholder="Nhập mật khẩu mới cho người dùng..."
       class="w-full px-3 py-2.5 rounded-lg border border-stone-300 font-mono text-sm text-stone-900 focus:outline-none focus:border-emerald-600"
      />
     </div>
     <label class="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
      <input type="checkbox" bind:checked={forceChangeNextLogin} class="rounded border-stone-300" />
      <span>Yêu cầu người dùng đổi lại mật khẩu ở lần đăng nhập kế tiếp</span>
     </label>
    </div>
    <div data-testid="modal-cta-footer" class="sticky bottom-0 z-20 shrink-0 px-6 py-3.5 border-t border-stone-200 bg-white space-y-2">
     {#if modalError}
      <div role="alert" class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs">
       ⚠️ {modalError}
      </div>
     {/if}
     <div class="flex justify-end gap-2">
      <button type="button" onclick={() => showResetPwModal = false} class="px-4 py-2 rounded-lg bg-stone-100 text-stone-700 font-bold">Hủy</button>
      <button
       type="submit"
       data-testid="admincp-confirm-reset-pw-btn"
       disabled={resettingPw}
       class="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-50"
      >
       {resettingPw ? '⏳ Đang lưu D1...' : '💾 Lưu Mật Khẩu Mới'}
      </button>
     </div>
    </div>
   </form>
  </div>
 </div>
{/if}

<!-- MODAL 3: EDIT USER / GRADE / SALARY (Sticky CTA Footer at bottom with Delete + Save) -->
{#if showEditModal}
 <div class="fixed inset-0 z-50 flex items-center justify-center bg-stone-500/25 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
  <div class="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden">
   <div class="shrink-0 flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-white">
    <h3 class="text-base font-black text-stone-900">✏️ Chỉnh Sửa Hồ Sơ &amp; Nghiệp Vụ (@{editForm.username})</h3>
    <button type="button" onclick={() => showEditModal = false} class="w-8 h-8 rounded-full bg-stone-100 text-stone-600 font-bold">✕</button>
   </div>
   <form onsubmit={submitEditUser} class="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
     <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
       <label for="ed-name" class="block font-bold text-stone-700 mb-1">Họ và tên:</label>
       <input id="ed-name" type="text" required bind:value={editForm.name} class="w-full px-3 py-2 rounded-lg border border-stone-300" />
      </div>
      <div>
       <label for="ed-phone" class="block font-bold text-stone-700 mb-1">Số điện thoại:</label>
       <input id="ed-phone" type="text" bind:value={editForm.phone} class="w-full px-3 py-2 rounded-lg border border-stone-300" />
      </div>
     </div>
     <div>
      <label for="ed-email" class="block font-bold text-stone-700 mb-1">Email:</label>
      <input id="ed-email" type="email" bind:value={editForm.email} class="w-full px-3 py-2 rounded-lg border border-stone-300" />
     </div>

     {#if editForm.role === 'student'}
      <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
       <div class="font-bold text-emerald-900">🎓 Phân Khối Lớp &amp; Thông Tin Phụ Huynh</div>
       <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
         <label for="ed-grade" class="block font-semibold text-stone-700 mb-1">Khối lớp chính:</label>
         <select id="ed-grade" bind:value={editForm.grade} class="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white">
          {#each GRADE_OPTIONS as g}
           <option value={g}>{g}</option>
          {/each}
         </select>
        </div>
        <div>
         <label for="ed-class" class="block font-semibold text-stone-700 mb-1">Mã lớp (Class ID):</label>
         <input id="ed-class" type="text" bind:value={editForm.class_id} class="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono bg-white" />
        </div>
       </div>
       <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
         <label for="ed-school" class="block font-semibold text-stone-700 mb-1">Trường theo học:</label>
         <input id="ed-school" type="text" bind:value={editForm.school} class="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white" />
        </div>
        <div>
         <label for="ed-pphone" class="block font-semibold text-stone-700 mb-1">SĐT Phụ huynh:</label>
         <input id="ed-pphone" type="text" bind:value={editForm.parent_phone} class="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white" />
        </div>
       </div>
      </div>
     {:else if editForm.role === 'teacher'}
      <div class="p-3 rounded-xl bg-teal-50 border border-teal-200 space-y-3">
       <div class="font-bold text-teal-900">👩‍🏫 Hồ Sơ Chuyên Môn &amp; Định Mức Lương Giáo Viên</div>
       <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
         <label for="ed-ttitle" class="block font-semibold text-stone-700 mb-1">Chức danh:</label>
         <input id="ed-ttitle" type="text" bind:value={editForm.role_title} class="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white" />
        </div>
        <div>
         <label for="ed-trate" class="block font-semibold text-stone-700 mb-1">Đơn giá / ca (VNĐ):</label>
         <input id="ed-trate" type="number" bind:value={editForm.rate_per_session_vnd} class="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white" />
        </div>
        <div>
         <label for="ed-tbase" class="block font-semibold text-stone-700 mb-1">Lương cứng (VNĐ):</label>
         <input id="ed-tbase" type="number" bind:value={editForm.base_salary_vnd} class="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white" />
        </div>
       </div>
      </div>
     {/if}
    </div>

    <div data-testid="modal-cta-footer" class="sticky bottom-0 z-20 shrink-0 px-6 py-3.5 border-t border-stone-200 bg-white space-y-2">
     {#if modalError}
      <div role="alert" class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs">
       ⚠️ {modalError}
      </div>
     {/if}
     <div class="flex items-center justify-between gap-2">
      <div>
       {#if editForm.role !== 'superadmin'}
        <button
         type="button"
         onclick={() => deleteUserAccount({ id: editForm.user_id, username: editForm.username, name: editForm.name })}
         class="px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold"
        >
         🗑️ Xóa Tài Khoản
        </button>
       {/if}
      </div>
      <div class="flex items-center gap-2 ml-auto">
       <button type="button" onclick={() => showEditModal = false} class="px-4 py-2 rounded-lg bg-stone-100 text-stone-700 font-bold">Hủy</button>
       <button type="submit" disabled={savingEdit} class="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-50">
        {savingEdit ? '⏳ Đang lưu...' : '💾 Lưu Thay Đổi D1'}
       </button>
      </div>
     </div>
    </div>
   </form>
  </div>
 </div>
{/if}

<!-- MODAL 4: STAR ADJUSTMENT (Sticky CTA Footer at bottom) -->
{#if showStarModal && targetStudentForStar}
 <div class="fixed inset-0 z-50 flex items-center justify-center bg-stone-500/25 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
  <div class="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden">
   <div class="shrink-0 flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-white">
    <h3 class="text-base font-black text-stone-900">⭐ Thưởng / Phạt Sao Học Sinh (D1)</h3>
    <button type="button" onclick={() => showStarModal = false} class="w-8 h-8 rounded-full bg-stone-100 text-stone-600 font-bold">✕</button>
   </div>
   <form onsubmit={submitStarAdjust} class="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
     <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
      Học sinh: <strong>{targetStudentForStar.name}</strong> (@{targetStudentForStar.username}) — Số dư hiện tại: <strong>{targetStudentForStar.stars_balance ?? 0} ⭐</strong>
     </div>
     <div>
      <label for="st-delta" class="block font-bold text-stone-700 mb-1">Số sao cộng/trừ (VD: 50 hoặc -20):</label>
      <input id="st-delta" type="number" required bind:value={starDelta} class="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono text-sm" />
     </div>
     <div>
      <label for="st-reason" class="block font-bold text-stone-700 mb-1">Lý do ghi sổ cái:</label>
      <input id="st-reason" type="text" required bind:value={starReason} class="w-full px-3 py-2 rounded-lg border border-stone-300" />
     </div>
    </div>
    <div data-testid="modal-cta-footer" class="sticky bottom-0 z-20 shrink-0 px-6 py-3.5 border-t border-stone-200 bg-white flex justify-end gap-2">
     <button type="button" onclick={() => showStarModal = false} class="px-4 py-2 rounded-lg bg-stone-100 text-stone-700 font-bold">Hủy</button>
     <button type="submit" disabled={savingStars} class="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold">
      {savingStars ? '⏳ Đang lưu...' : '💾 Lưu Cập Nhật Sao'}
     </button>
    </div>
   </form>
  </div>
 </div>
{/if}

<!-- MODAL 5: LINK / UNLINK PARENT TO STUDENT (Sticky CTA Footer at bottom) -->
{#if showLinkChildModal && targetParentForLink}
 <div class="fixed inset-0 z-50 flex items-center justify-center bg-stone-500/25 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
  <div class="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden">
   <div class="shrink-0 flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-white">
    <h3 class="text-base font-black text-stone-900">🔗 Gán Con &amp; Xóa Liên Kết Học Sinh Cho Phụ Huynh</h3>
    <button type="button" onclick={() => showLinkChildModal = false} class="w-8 h-8 rounded-full bg-stone-100 text-stone-600 font-bold">✕</button>
   </div>
   <form onsubmit={submitLinkParent} class="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
     <div class="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900">
      Phụ huynh: <strong>{targetParentForLink.name}</strong> (@{targetParentForLink.username})
     </div>

     <!-- Current Linked Children List with Delete/Unlink Button -->
     <div class="space-y-2">
      <div class="font-bold text-stone-700 flex items-center justify-between">
       <span>👶 Danh sách con đang liên kết ({targetParentForLink.linked_children?.length || 0}):</span>
      </div>
      {#if targetParentForLink.linked_children && targetParentForLink.linked_children.length > 0}
       <div class="space-y-1.5">
        {#each targetParentForLink.linked_children as ch}
         <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-stone-50 border border-stone-200">
          <div>
           <div class="font-bold text-stone-900">👶 {ch.student_name || ch.student_user_id} <span class="font-mono text-stone-500">(@{ch.student_username || ch.student_user_id})</span></div>
           <div class="text-[10px] text-emerald-700 font-semibold mt-0.5">Trạng thái: {ch.verification_status}</div>
          </div>
          <button
           type="button"
           data-testid="btn-unlink-child-modal"
           onclick={() => unlinkChildFromParent(targetParentForLink, ch)}
           disabled={linkingChild}
           class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-[11px] transition"
          >
           🗑️ Xóa con / Gỡ liên kết
          </button>
         </div>
        {/each}
       </div>
      {:else}
       <div class="p-3 rounded-xl bg-stone-50 border border-dashed border-stone-300 text-stone-400 text-center italic">
        Chưa có học sinh nào được gán cho phụ huynh này.
       </div>
      {/if}
     </div>

     <div class="border-t border-stone-200 pt-3 space-y-2">
      <label for="lk-stu-select" class="block font-bold text-stone-700">➕ Chọn nhanh học sinh từ danh sách hệ thống:</label>
      <select
       id="lk-stu-select"
       onchange={(e) => { if (e.currentTarget.value) childUsernameOrId = e.currentTarget.value; }}
       class="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white font-semibold"
      >
       <option value="">-- Chọn học sinh để gán cho phụ huynh --</option>
       {#each users.filter(x => x.role === 'student') as stu (stu.id)}
        <option value={stu.username || stu.id}>{stu.name} (@{stu.username}) — {stu.grade || 'Lớp 7'}</option>
       {/each}
      </select>

      <label for="lk-stu" class="block font-bold text-stone-700 mt-2">Hoặc nhập trực tiếp Username / Mã ID Học sinh:</label>
      <input id="lk-stu" type="text" required bind:value={childUsernameOrId} placeholder="VD: minhquan7a hoặc baokhiem" class="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono" />
     </div>
    </div>
    <div data-testid="modal-cta-footer" class="sticky bottom-0 z-20 shrink-0 px-6 py-3.5 border-t border-stone-200 bg-white flex justify-end gap-2">
     <button type="button" onclick={() => showLinkChildModal = false} class="px-4 py-2 rounded-lg bg-stone-100 text-stone-700 font-bold">Đóng</button>
     <button type="submit" disabled={linkingChild} class="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold">
      {linkingChild ? '⏳ Đang xử lý...' : '➕ Thêm & Lưu Liên Kết Con'}
     </button>
    </div>
   </form>
  </div>
 </div>
{/if}
