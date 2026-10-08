<!-- src/lib/components/AdminUsersPanel.svelte
 Quản lý tài khoản trong admincp (tab "Tài Khoản") — SUPERADMIN/ADMIN ONLY.
 - Danh sách users từ /api/admincp/users (GET)
 - Tìm kiếm theo tên/username, lọc theo role
 - Đổi role (dropdown), khóa/mở tài khoản (POST action) -->
<script>
 import { onMount } from 'svelte';
 import { playAudioFeedback } from '$lib/speech';

 let users = $state([]);
 let loading = $state(true);
 let error = $state('');
 let search = $state('');
 let roleFilter = $state('all');
 let processingId = $state(null);
 let toast = $state('');
 let searchTimer = null;

 const ROLE_LABELS = {
  student: 'Học sinh',
  parent: 'Phụ huynh',
  teacher: 'Giáo viên',
  leader: 'Leader',
  admin: 'Admin',
  superadmin: 'Superadmin'
 };
 const ASSIGNABLE = ['student', 'parent', 'teacher', 'leader', 'admin'];

 function tokenHeaders() {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
  const h = { 'Content-Type': 'application/json' };
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
 }

 function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('vi-VN'); } catch { return '—'; }
 }

 async function loadUsers() {
  loading = true; error = '';
  try {
   const params = new URLSearchParams();
   if (search.trim()) params.set('q', search.trim());
   if (roleFilter !== 'all') params.set('role', roleFilter);
   const res = await fetch('/api/admincp/users?' + params.toString(), { headers: tokenHeaders() });
   const data = await res.json().catch(() => ({}));
   if (data.success) {
    users = data.users || [];
   } else {
    error = data.error || 'Không tải được danh sách tài khoản.';
   }
  } catch {
   error = 'Lỗi kết nối máy chủ. Vui lòng thử lại.';
  } finally {
   loading = false;
  }
 }

 function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadUsers, 400);
 }

 function showToast(msg, ok = true) {
  toast = msg;
  try { playAudioFeedback?.(ok ? 'success' : 'error'); } catch {}
  setTimeout(() => { toast = ''; }, 3500);
 }

 async function changeRole(u, newRole) {
  if (newRole === u.role) return;
  if (!confirm(`Đổi role của "@${u.username}" từ ${ROLE_LABELS[u.role] || u.role} thành ${ROLE_LABELS[newRole] || newRole}?`)) {
   loadUsers(); // reset dropdown về giá trị cũ
   return;
  }
  processingId = u.id;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: tokenHeaders(),
    body: JSON.stringify({ action: 'update_role', user_id: u.id, role: newRole })
   });
   const data = await res.json().catch(() => ({}));
   if (data.success && data.user) {
    u.role = data.user.role;
    users = [...users];
    showToast('✓ ' + (data.message || 'Đã đổi role.'));
   } else {
    showToast('✗ ' + (data.error || 'Không đổi được role.'), false);
    loadUsers();
   }
  } catch {
   showToast('✗ Lỗi kết nối.', false);
   loadUsers();
  } finally {
   processingId = null;
  }
 }

 async function toggleLock(u) {
  const locking = (u.status || 'active') !== 'locked';
  if (!confirm(`${locking ? 'KHÓA' : 'MỞ KHÓA'} tài khoản "@${u.username}" (${u.name})?`)) return;
  processingId = u.id;
  try {
   const res = await fetch('/api/admincp/users', {
    method: 'POST',
    headers: tokenHeaders(),
    body: JSON.stringify({ action: 'toggle_status', user_id: u.id })
   });
   const data = await res.json().catch(() => ({}));
   if (data.success && data.user) {
    u.status = data.user.status;
    users = [...users];
    showToast('✓ ' + (data.message || 'Đã cập nhật trạng thái.'));
   } else {
    showToast('✗ ' + (data.error || 'Không cập nhật được trạng thái.'), false);
   }
  } catch {
   showToast('✗ Lỗi kết nối.', false);
  } finally {
   processingId = null;
  }
 }

 onMount(loadUsers);
</script>

<div class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
 <div class="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
  <div>
   <h2 class="text-base font-heading font-semibold text-slate-900">👥 Quản Lý Tài Khoản</h2>
   <p class="text-xs text-slate-600 font-normal mt-0.5">Tìm kiếm, đổi role và khóa/mở tài khoản. Chỉ superadmin/admin thấy được tab này.</p>
  </div>
  <div class="flex flex-col sm:flex-row gap-2">
   <input
    value={search}
    oninput={(e) => { search = e.target.value; onSearchInput(); }}
    placeholder="🔍 Tìm tên / username..."
    class="text-sm bg-slate-50 border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200 min-w-[220px]"
   />
   <select bind:value={roleFilter} onchange={loadUsers} class="text-sm font-semibold bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
    <option value="all">Tất cả role</option>
    {#each Object.entries(ROLE_LABELS) as [r, label]}
     <option value={r}>{label}</option>
    {/each}
   </select>
  </div>
 </div>

 {#if toast}
  <div class="p-3 rounded-md text-xs font-bold text-center {toast.startsWith('✓') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}">
   {toast}
  </div>
 {/if}

 {#if loading}
  <div class="text-center py-12 text-slate-500 text-xs font-medium">⏳ Đang tải danh sách tài khoản...</div>
 {:else if error}
  <div class="p-4 rounded-md text-xs font-bold text-center bg-rose-50 text-rose-800 border border-rose-200">{error}</div>
 {:else if users.length === 0}
  <div class="text-center py-12 text-slate-500 text-xs font-medium">Không tìm thấy tài khoản nào.</div>
 {:else}
  <div class="overflow-x-auto">
   <table class="w-full text-sm">
    <thead>
     <tr class="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
      <th class="py-2 pr-3 font-bold">Tài khoản</th>
      <th class="py-2 pr-3 font-bold">Liên hệ</th>
      <th class="py-2 pr-3 font-bold">Role</th>
      <th class="py-2 pr-3 font-bold">Trạng thái</th>
      <th class="py-2 pr-3 font-bold">Ngày tạo</th>
      <th class="py-2 font-bold text-right">Thao tác</th>
     </tr>
    </thead>
    <tbody>
     {#each users as u (u.id)}
      <tr class="border-b border-slate-100 hover:bg-slate-50">
       <td class="py-2.5 pr-3">
        <div class="font-bold text-slate-900">{u.name || '—'}</div>
        <div class="text-[11px] text-slate-500 font-mono">@{u.username}</div>
       </td>
       <td class="py-2.5 pr-3 text-xs text-slate-600">
        <div>{u.phone || '—'}</div>
        <div class="text-[11px]">{u.email || ''}</div>
       </td>
       <td class="py-2.5 pr-3">
        <select
         value={u.role}
         disabled={processingId === u.id}
         onchange={(e) => changeRole(u, e.target.value)}
         class="text-xs font-bold rounded-md border px-2 py-1.5
          {(u.role === 'superadmin' || u.role === 'admin')
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : (u.role === 'teacher' || u.role === 'leader')
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'}"
        >
         {#if u.role === 'superadmin'}
          <option value="superadmin">Superadmin</option>
         {/if}
         {#each ASSIGNABLE as r}
          <option value={r}>{ROLE_LABELS[r]}</option>
         {/each}
        </select>
       </td>
       <td class="py-2.5 pr-3">
        {#if (u.status || 'active') === 'locked'}
         <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Đã khóa
         </span>
        {:else}
         <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Hoạt động
         </span>
        {/if}
       </td>
       <td class="py-2.5 pr-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(u.created_at)}</td>
       <td class="py-2.5 text-right">
        <button
         onclick={() => toggleLock(u)}
         disabled={processingId === u.id}
         class="px-3 py-1.5 rounded-md text-xs font-bold border transition-all disabled:opacity-40
          {(u.status || 'active') === 'locked'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}"
        >
         {(u.status || 'active') === 'locked' ? '🔓 Mở khóa' : '🔒 Khóa'}
        </button>
       </td>
      </tr>
     {/each}
    </tbody>
   </table>
  </div>
  <p class="text-[11px] text-slate-500">Hiển thị {users.length} tài khoản. Không thể tự đổi role hoặc tự khóa chính mình.</p>
 {/if}
</div>
