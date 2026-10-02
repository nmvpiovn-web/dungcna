<!-- src/lib/components/LeaderNotifier.svelte
 Gửi thông báo hệ thống cho leader cpanel + danh sách thông báo đã gửi gần đây.
 Không dùng unifiedStore — fetch trực tiếp với Bearer token từ localStorage. -->
<script>
 import { onMount } from 'svelte';

 let title = $state('');
 let body = $state('');
 let target = $state('all'); // all | student | parent | teacher
 let category = $state('announcement');
 let notifications = $state([]);
 let loading = $state(true);
 let error = $state('');
 let sending = $state(false);
 let formError = $state('');
 let toast = $state('');

 const TARGET_LABELS = { all: 'Tất cả', student: 'Học sinh', parent: 'Phụ huynh', teacher: 'Giáo viên' };
 const CATEGORIES = [
  ['announcement', '📢 Thông báo chung'],
  ['schedule', '📅 Lịch học'],
  ['tuition', '💰 Học phí'],
  ['homework', '📚 Bài tập'],
  ['event', '🎉 Sự kiện'],
  ['urgent', '🚨 Khẩn cấp']
 ];
 const categoryLabel = (c) => (CATEGORIES.find(x => x[0] === c) || [c, c])[1];

 function getToken() {
  try { return localStorage.getItem('tienganh_token') || ''; } catch { return ''; }
 }
 function headers() {
  const t = getToken();
  return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
 }
 function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('vi-VN'); } catch { return '—'; }
 }
 function showToast(msg) {
  toast = msg;
  setTimeout(() => toast = '', 3000);
 }

 async function loadNotifications() {
  loading = true; error = '';
  try {
   const res = await fetch('/api/notifications', { headers: headers() });
   const data = await res.json().catch(() => ({}));
   if (data.success) {
    notifications = data.notifications || [];
   } else {
    error = data.error || 'Không tải được danh sách thông báo.';
   }
  } catch {
   error = 'Lỗi kết nối máy chủ. Vui lòng thử lại.';
  } finally {
   loading = false;
  }
 }

 async function sendNotification() {
  formError = '';
  if (!title.trim()) { formError = 'Tiêu đề không được để trống.'; return; }
  if (!body.trim()) { formError = 'Nội dung không được để trống.'; return; }
  sending = true;
  try {
   const res = await fetch('/api/notifications', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
     action: 'create',
     title: title.trim(),
     body: body.trim(),
     target_role: target,
     category
    })
   });
   const data = await res.json().catch(() => ({}));
   if (data.success) {
    showToast('✅ Đã gửi thông báo thành công.');
    title = ''; body = ''; target = 'all'; category = 'announcement';
    await loadNotifications();
   } else {
    formError = data.error || 'Gửi thông báo thất bại.';
   }
  } catch {
   formError = 'Lỗi kết nối máy chủ.';
  } finally {
   sending = false;
  }
 }

 onMount(() => { loadNotifications(); });
</script>

<div class="space-y-4">
 <h3 class="text-base font-bold text-slate-900">📣 Gửi thông báo hệ thống</h3>

 {#if toast}
  <div class="p-3 rounded-md text-xs font-semibold bg-cx-50 border border-cx-200 text-cx-800">{toast}</div>
 {/if}

 <div class="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
  <div>
   <label for="notif-title" class="block text-xs font-bold text-slate-600 mb-1">Tiêu đề <span class="text-red-500">*</span></label>
   <input
    id="notif-title"
    type="text"
    bind:value={title}
    placeholder="VD: Lịch nghỉ lễ 2/9..."
    maxlength="200"
    class="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cx-500"
   />
  </div>
  <div>
   <label for="notif-body" class="block text-xs font-bold text-slate-600 mb-1">Nội dung <span class="text-red-500">*</span></label>
   <textarea
    id="notif-body"
    bind:value={body}
    rows="4"
    placeholder="Nội dung chi tiết thông báo..."
    class="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cx-500"
   ></textarea>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
   <div>
    <label for="notif-target" class="block text-xs font-bold text-slate-600 mb-1">Đối tượng nhận</label>
    <select id="notif-target" bind:value={target} class="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cx-500">
     {#each Object.entries(TARGET_LABELS) as [val, label]}
      <option value={val}>{label}</option>
     {/each}
    </select>
   </div>
   <div>
    <label for="notif-category" class="block text-xs font-bold text-slate-600 mb-1">Danh mục</label>
    <select id="notif-category" bind:value={category} class="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cx-500">
     {#each CATEGORIES as [val, label]}
      <option value={val}>{label}</option>
     {/each}
    </select>
   </div>
  </div>
  {#if formError}
   <div class="p-3 rounded-md text-xs font-semibold bg-red-50 border border-red-200 text-red-700">⚠️ {formError}</div>
  {/if}
  <button
   onclick={sendNotification}
   disabled={sending}
   class="px-5 py-2.5 rounded-md bg-cx-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
  >
   {sending ? '⏳ Đang gửi...' : '📤 Gửi thông báo'}
  </button>
 </div>

 <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
  <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
   <span class="font-bold text-sm text-slate-900">🕘 Thông báo đã gửi gần đây</span>
   <button onclick={loadNotifications} class="px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200">🔄</button>
  </div>
  {#if loading}
   <div class="p-8 text-center text-sm text-slate-500">⏳ Đang tải...</div>
  {:else if error}
   <div class="p-5 text-sm text-red-700">⚠️ {error}</div>
  {:else if notifications.length === 0}
   <div class="p-8 text-center text-sm text-slate-400">Chưa có thông báo nào.</div>
  {:else}
   <div class="overflow-x-auto">
    <table class="min-w-full text-sm">
     <thead>
      <tr class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
       <th class="px-4 py-2.5 font-semibold">Tiêu đề</th>
       <th class="px-4 py-2.5 font-semibold">Đối tượng</th>
       <th class="px-4 py-2.5 font-semibold">Danh mục</th>
       <th class="px-4 py-2.5 font-semibold">Thời gian</th>
      </tr>
     </thead>
     <tbody class="divide-y divide-slate-100">
      {#each notifications.slice(0, 20) as n (n.id)}
       <tr class="hover:bg-slate-50">
        <td class="px-4 py-2.5">
         <div class="font-semibold text-slate-900">{n.title}</div>
         <div class="text-xs text-slate-500 line-clamp-2 max-w-md">{n.body}</div>
        </td>
        <td class="px-4 py-2.5 whitespace-nowrap">
         <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-cx-50 text-cx-700">{TARGET_LABELS[n.target_role] || n.target_role || '—'}</span>
        </td>
        <td class="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{categoryLabel(n.category)}</td>
        <td class="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDate(n.created_at)}</td>
       </tr>
      {/each}
     </tbody>
    </table>
   </div>
  {/if}
 </div>
</div>
