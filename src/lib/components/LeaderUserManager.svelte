<!-- src/lib/components/LeaderUserManager.svelte
 Quản lý người dùng cho leader cpanel: học sinh + giáo viên, tìm kiếm, lọc role, khóa/mở tài khoản.
 Không dùng unifiedStore — fetch trực tiếp với Bearer token từ localStorage. -->
<script>
 import { onMount } from 'svelte';

 let users = $state([]);
 let loading = $state(true);
 let error = $state('');
 let search = $state('');
 let roleFilter = $state('all'); // all | student | parent | teacher
 let processingId = $state(null);
 let toast = $state('');

 const ROLE_LABELS = { student: 'Học sinh', parent: 'Phụ huynh', teacher: 'Giáo viên' };

 function getToken() {
  try { return localStorage.getItem('tienganh_token') || ''; } catch { return ''; }
 }
 function headers() {
  const t = getToken();
  return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
 }

 function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('vi-VN'); } catch { return '—'; }
 }

 async function loadUsers() {
  loading = true; error = '';
  try {
   const [stuRes, staffRes] = await Promise.all([
    fetch('/api/students', { headers: headers() }),
    fetch('/api/teachers/staff', { headers: headers() })
   ]);
   const stuData = await stuRes.json().catch(() => ({}));
   const staffData = await staffRes.json().catch(() => ({}));
   const list = [];
   if (stuData.success && Array.isArray(stuData.students)) {
    for (const s of stuData.students) {
     list.push({
      id: s.id, name: s.name || s.username, username: s.username,
      role: 'student', status: s.status || 'active', created_at: s.created_at
     });
    }
   }
   if (staffData.success && Array.isArray(staffData.profiles)) {
    for (const p of staffData.profiles) {
     list.push({
      id: p.teacher_id || p.user_id || p.id, name: p.teacher_name || p.username, username: p.username,
      role: 'teacher', status: p.status || 'active', created_at: p.created_at
     });
    }
   }
   if (!stuData.success && !staffData.success) {
    error = stuData.error || staffData.error || 'Không tải được danh sách người dùng.';
   }
   users = list;
  } catch (e) {
   error = 'Lỗi kết nối máy chủ. Vui lòng thử lại.';
  } finally {
   loading = false;
  }
 }

 let filtered = $derived.by(() => {
  const q = search.trim().toLowerCase();
  return users.filter(u => {
   if (roleFilter !== 'all' && u.role !== roleFilter) return false;
   if (!q) return true;
   return (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
  });
 });

 function showToast(msg) {
  toast = msg;
  setTimeout(() => toast = '', 3000);
 }

 async function toggleLock(u) {
  if (u.role !== 'student') {
   showToast('Chỉ hỗ trợ khóa/mở tài khoản học sinh qua endpoint này.');
   return;
  }
  const newStatus = u.status === 'locked' ? 'active' : 'locked';
  const action = newStatus === 'locked' ? 'khóa' : 'mở khóa';
  if (!confirm(`Xác nhận ${action} tài khoản "${u.name}" (@${u.username})?`)) return;
  processingId = u.id;
  try {
   const res = await fetch('/api/students', {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ student_id: u.id, status: newStatus })
   });
   const data = await res.json().catch(() => ({}));
   if (data.success) {
    u.status = newStatus;
    users = [...users];
    showToast(`Đã ${action} tài khoản thành công.`);
   } else {
    showToast(`Thất bại: ${data.error || 'Không rõ lỗi'}`);
   }
  } catch {
   showToast('Lỗi kết nối máy chủ.');
  } finally {
   processingId = null;
  }
 }

 onMount(() => { loadUsers(); });
</script>

<div class="space-y-4">
 <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
  <h3 class="text-base font-bold text-slate-900">👥 Quản lý người dùng</h3>
  <button onclick={loadUsers} class="px-3 py-2 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200">
   🔄 Tải lại
  </button>
 </div>

 <div class="flex flex-col sm:flex-row gap-2">
  <input
   type="search"
   placeholder="🔍 Tìm theo tên hoặc username..."
   bind:value={search}
   class="flex-1 px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cx-500"
  />
  <div class="flex gap-1.5 overflow-x-auto">
   {#each [['all', 'Tất cả'], ['student', 'Học sinh'], ['parent', 'Phụ huynh'], ['teacher', 'Giáo viên']] as [val, label]}
    <button
     onclick={() => roleFilter = val}
     class={`whitespace-nowrap px-3 py-2 rounded-md text-xs font-semibold transition-colors ${roleFilter === val ? 'bg-cx-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >{label}</button>
   {/each}
  </div>
 </div>

 {#if toast}
  <div class="p-3 rounded-md text-xs font-semibold bg-cx-50 border border-cx-200 text-cx-800">{toast}</div>
 {/if}

 {#if loading}
  <div class="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">⏳ Đang tải danh sách...</div>
 {:else if error}
  <div class="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
   ⚠️ {error}
   <button onclick={loadUsers} class="ml-2 px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-bold">Thử lại</button>
  </div>
 {:else if filtered.length === 0}
  <div class="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
   {#if roleFilter === 'parent'}
    Chưa có endpoint danh sách phụ huynh riêng — phụ huynh được quản lý qua liên kết với học sinh.
   {:else}
    Không tìm thấy người dùng nào.
   {/if}
  </div>
 {:else}
  <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
   <div class="overflow-x-auto">
    <table class="min-w-full text-sm">
     <thead>
      <tr class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
       <th class="px-4 py-2.5 font-semibold">Tên</th>
       <th class="px-4 py-2.5 font-semibold">Username</th>
       <th class="px-4 py-2.5 font-semibold">Vai trò</th>
       <th class="px-4 py-2.5 font-semibold">Trạng thái</th>
       <th class="px-4 py-2.5 font-semibold">Ngày tạo</th>
       <th class="px-4 py-2.5 font-semibold text-right">Thao tác</th>
      </tr>
     </thead>
     <tbody class="divide-y divide-slate-100">
      {#each filtered as u (u.id)}
       <tr class="hover:bg-slate-50">
        <td class="px-4 py-2.5 font-semibold text-slate-900 whitespace-nowrap">{u.name}</td>
        <td class="px-4 py-2.5 text-slate-500 whitespace-nowrap">@{u.username}</td>
        <td class="px-4 py-2.5 whitespace-nowrap">
         <span class="px-2 py-0.5 rounded-full text-[11px] font-bold {u.role === 'teacher' ? 'bg-cx-50 text-cx-700' : 'bg-blue-50 text-blue-700'}">
          {ROLE_LABELS[u.role] || u.role}
         </span>
        </td>
        <td class="px-4 py-2.5 whitespace-nowrap">
         <span class="px-2 py-0.5 rounded-full text-[11px] font-bold {u.status === 'locked' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}">
          {u.status === 'locked' ? '🔒 Đã khóa' : '✅ Hoạt động'}
         </span>
        </td>
        <td class="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(u.created_at)}</td>
        <td class="px-4 py-2.5 text-right whitespace-nowrap">
         {#if u.role === 'student'}
          <button
           onclick={() => toggleLock(u)}
           disabled={processingId === u.id}
           class={`px-3 py-1.5 rounded-md text-xs font-bold text-white disabled:opacity-50 ${u.status === 'locked' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
           {processingId === u.id ? '...' : u.status === 'locked' ? 'Mở khóa' : 'Khóa'}
          </button>
         {:else}
          <span class="text-xs text-slate-300">—</span>
         {/if}
        </td>
       </tr>
      {/each}
     </tbody>
    </table>
   </div>
   <div class="px-4 py-2.5 bg-slate-50 text-xs text-slate-500 border-t border-slate-200">
    Tổng: <strong>{filtered.length}</strong> / {users.length} người dùng
   </div>
  </div>
 {/if}
</div>
