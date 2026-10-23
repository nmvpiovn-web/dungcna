<!-- src/lib/components/LeaderFinance.svelte
 Tổng quan tài chính cho leader / admincp: tổng phải thu / đã thu / còn nợ + Thêm / Xóa phiếu học phí trực tiếp D1. -->
<script>
 import { onMount } from 'svelte';

 let bills = $state([]);
 let students = $state([]);
 let loading = $state(true);
 let error = $state('');
 let feedback = $state('');
 let busyBillId = $state('');

 // Create Bill Modal State
 let showCreateBillModal = $state(false);
 let creatingBill = $state(false);
 let newBillStudentId = $state('');
 let newBillStudentName = $state('');
 let newBillGrade = $state('Lớp 7');
 let newBillProgram = $state('Tiếng Anh Global Success & Cambridge KET');
 let newBillPeriod = $state('Tháng 10/2026');
 let newBillAmount = $state(1200000);
 let newBillSessions = $state(12);
 let newBillStarsDeducted = $state(0);
 let newBillStatus = $state('pending');

 const fmtVND = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + 'đ';

 function getToken() {
  try { return localStorage.getItem('tienganh_token') || ''; } catch { return ''; }
 }

 function authHeaders() {
  const token = getToken();
  return token
   ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
   : { 'Content-Type': 'application/json' };
 }

 function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('vi-VN'); } catch { return '—'; }
 }

 const STATUS_LABELS = {
  paid: ['Đã thu', 'bg-emerald-50 text-emerald-700 border border-emerald-200'],
  pending: ['Chờ thu', 'bg-amber-50 text-amber-700 border border-amber-200'],
  approved: ['Đã duyệt', 'bg-blue-50 text-blue-700 border border-blue-200'],
  overdue: ['Quá hạn', 'bg-red-50 text-red-700 border border-red-200'],
  approved_by_superadmin: ['Đã duyệt', 'bg-blue-50 text-blue-700 border border-blue-200'],
  cancelled: ['Đã hủy', 'bg-slate-100 text-slate-500 border border-slate-200']
 };
 function statusBadge(s) {
  return STATUS_LABELS[s] || [s || '—', 'bg-slate-100 text-slate-600'];
 }

 let totalReceivable = $derived(bills.reduce((sum, b) => sum + (Number(b.final_amount_vnd) || 0), 0));
 let totalCollected = $derived(bills.filter(b => b.status === 'paid').reduce((sum, b) => sum + (Number(b.final_amount_vnd) || 0), 0));
 let totalDebt = $derived(totalReceivable - totalCollected);
 let recentBills = $derived([...bills].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 30));

 async function loadFinance() {
  loading = true; error = '';
  try {
   const token = getToken();
   const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
   const [res, uRes] = await Promise.all([
    fetch('/api/tuition', { headers, credentials: 'include' }),
    fetch('/api/admincp/users', { headers, credentials: 'include' }).catch(() => null)
   ]);
   const data = await res.json().catch(() => ({}));
   if (data.success) {
    bills = data.bills || [];
   } else {
    error = data.error || 'Không tải được dữ liệu học phí.';
   }
   if (uRes && uRes.ok) {
    const uData = await uRes.json().catch(() => ({}));
    if (Array.isArray(uData.users)) {
     students = uData.users.filter(u => u.role === 'student');
    }
   }
  } catch {
   error = 'Lỗi kết nối máy chủ. Vui lòng thử lại.';
  } finally {
   loading = false;
  }
 }

 function openCreateBill() {
  if (students.length > 0 && !newBillStudentId) {
   newBillStudentId = students[0].id;
   newBillStudentName = students[0].name;
   newBillGrade = students[0].grade || 'Lớp 7';
  }
  showCreateBillModal = true;
 }

 function onSelectStudent(e) {
  const sid = e.currentTarget.value;
  newBillStudentId = sid;
  const stu = students.find(s => s.id === sid);
  if (stu) {
   newBillStudentName = stu.name;
   newBillGrade = stu.grade || 'Lớp 7';
  }
 }

 async function submitCreateBill(e) {
  e.preventDefault();
  if (!newBillStudentId && !newBillStudentName.trim()) return;
  creatingBill = true;
  feedback = '';
  try {
   const res = await fetch('/api/tuition', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({
     student_id: newBillStudentId || `stu_${Date.now()}`,
     student_name: newBillStudentName.trim() || 'Học sinh',
     grade_level: newBillGrade,
     program_name: newBillProgram,
     billing_period: newBillPeriod,
     base_tuition_vnd: Number(newBillAmount) || 0,
     attendance_total_sessions: Number(newBillSessions) || 12,
     attendance_attended_sessions: Number(newBillSessions) || 12,
     stars_deducted: Math.max(0, Math.trunc(Number(newBillStarsDeducted) || 0)),
     status: newBillStatus
    })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    feedback = `❌ ${data.error || 'Không thể lập phiếu học phí'}`;
    return;
   }
   feedback = `✅ ${data.message || 'Đã lập phiếu học phí mới trên Cloudflare D1!'}`;
   showCreateBillModal = false;
   await loadFinance();
  } catch (err) {
   feedback = `❌ Lỗi mạng: ${err.message}`;
  } finally {
   creatingBill = false;
  }
 }

 async function deleteTuitionBill(bill) {
  if (!bill || !bill.id) return;
  busyBillId = bill.id;
  feedback = '';
  try {
   const res = await fetch(`/api/tuition?id=${encodeURIComponent(bill.id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include'
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || !data.success) {
    feedback = `❌ ${data.error || 'Không thể xóa phiếu học phí'}`;
    return;
   }
   bills = bills.filter(b => b.id !== bill.id);
   feedback = `🗑️ ${data.message || `Đã xóa phiếu học phí ${bill.id} khỏi D1!`}`;
  } catch (err) {
   feedback = `❌ Lỗi mạng: ${err.message}`;
  } finally {
   busyBillId = '';
  }
 }

 onMount(() => { loadFinance(); });
</script>

<div class="space-y-4">
 <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
  <div>
   <h3 class="text-base font-bold text-slate-900">💰 Tổng quan tài chính &amp; Hóa đơn Học phí (D1)</h3>
   <p class="text-xs text-slate-500">Quản lý lập phiếu thu học phí, khấu trừ sao và xóa/hủy hóa đơn trực tiếp trên Cloudflare D1.</p>
  </div>
  <div class="flex items-center gap-2">
   <button
    type="button"
    data-testid="btn-open-create-bill"
    onclick={openCreateBill}
    class="px-3.5 py-2 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
   >
    ➕ Lập Phiếu Học Phí Mới
   </button>
   <button type="button" onclick={loadFinance} class="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200">
    🔄 Tải lại
   </button>
  </div>
 </div>

 {#if feedback}
  <div class="p-3 rounded-xl border text-xs font-bold flex items-center justify-between {feedback.startsWith('❌') ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}">
   <span>{feedback}</span>
   <button type="button" onclick={() => feedback = ''} class="px-2 py-0.5 rounded bg-white/80 text-slate-600">✕</button>
  </div>
 {/if}

 {#if loading}
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
   {#each Array(3) as _}
    <div class="rounded-lg border border-slate-200 bg-white p-5 animate-pulse h-24"></div>
   {/each}
  </div>
 {:else if error}
  <div class="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
   ⚠️ {error}
   <button onclick={loadFinance} class="ml-2 px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-bold">Thử lại</button>
  </div>
 {:else}
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
   <div class="rounded-lg border border-slate-200 bg-white p-5">
    <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">Tổng phải thu</div>
    <div class="mt-1 text-2xl font-black text-slate-900">{fmtVND(totalReceivable)}</div>
    <div class="text-xs text-slate-400 mt-1">{bills.length} phiếu học phí</div>
   </div>
   <div class="rounded-lg border border-emerald-200 bg-emerald-50/50 p-5">
    <div class="text-xs font-semibold uppercase tracking-wide text-emerald-600">Đã thu</div>
    <div class="mt-1 text-2xl font-black text-emerald-700">{fmtVND(totalCollected)}</div>
    <div class="text-xs text-slate-400 mt-1">{bills.filter(b => b.status === 'paid').length} phiếu đã thanh toán</div>
   </div>
   <div class="rounded-lg border border-amber-200 bg-amber-50/50 p-5">
    <div class="text-xs font-semibold uppercase tracking-wide text-amber-600">Còn nợ</div>
    <div class="mt-1 text-2xl font-black text-amber-700">{fmtVND(totalDebt)}</div>
    <div class="text-xs text-slate-400 mt-1">{bills.filter(b => b.status !== 'paid' && b.status !== 'cancelled').length} phiếu chưa thu</div>
   </div>
  </div>

  <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
   <div class="px-4 py-3 border-b border-slate-200 font-bold text-sm text-slate-900 flex items-center justify-between">
    <span>🧾 Danh sách Phiếu học phí ({recentBills.length})</span>
   </div>
   {#if recentBills.length === 0}
    <div class="p-8 text-center text-sm text-slate-400">Chưa có phiếu học phí nào. Nhấn <strong>➕ Lập Phiếu Học Phí Mới</strong> để tạo.</div>
   {:else}
    <div class="overflow-x-auto">
     <table class="min-w-full text-sm">
      <thead>
       <tr class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <th class="px-4 py-2.5 font-semibold">Học sinh</th>
        <th class="px-4 py-2.5 font-semibold">Kỳ thu</th>
        <th class="px-4 py-2.5 font-semibold text-right">Số tiền</th>
        <th class="px-4 py-2.5 font-semibold">Trạng thái</th>
        <th class="px-4 py-2.5 font-semibold">Ngày lập</th>
        <th class="px-4 py-2.5 font-semibold text-right">Thao tác</th>
       </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
       {#each recentBills as b (b.id)}
        {@const [label, cls] = statusBadge(b.status)}
        <tr class="hover:bg-slate-50">
         <td class="px-4 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
          {b.student_name || '—'}
          <div class="text-[11px] font-normal text-slate-400">{b.grade_level || ''} {b.program_name ? `• ${b.program_name}` : ''}</div>
         </td>
         <td class="px-4 py-2.5 text-slate-500 whitespace-nowrap">{b.billing_period || '—'}</td>
         <td class="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{fmtVND(b.final_amount_vnd)}</td>
         <td class="px-4 py-2.5 whitespace-nowrap">
          <span class={`px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>{label}</span>
         </td>
         <td class="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(b.created_at)}</td>
         <td class="px-4 py-2.5 text-right whitespace-nowrap">
          <button
           type="button"
           data-testid="btn-delete-bill"
           disabled={busyBillId === b.id}
           onclick={() => deleteTuitionBill(b)}
           class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-xs transition"
          >
           {busyBillId === b.id ? '⏳...' : '🗑️ Xóa'}
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

{#if showCreateBillModal}
 <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
  <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden">
   <div class="shrink-0 flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-white">
    <h3 class="text-base font-black text-slate-900">➕ Lập Phiếu Học Phí Mới (D1)</h3>
    <button type="button" onclick={() => showCreateBillModal = false} class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold">✕</button>
   </div>
   <form onsubmit={submitCreateBill} class="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
     {#if students.length > 0}
      <div>
       <label for="cb-stu-sel" class="block font-bold text-slate-700 mb-1">Chọn Học sinh từ danh sách:</label>
       <select id="cb-stu-sel" value={newBillStudentId} onchange={onSelectStudent} class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-semibold">
        {#each students as stu (stu.id)}
         <option value={stu.id}>{stu.name} (@{stu.username}) — {stu.grade || 'Lớp 7'}</option>
        {/each}
       </select>
      </div>
     {/if}
     <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
       <label for="cb-stu-name" class="block font-bold text-slate-700 mb-1">Họ tên Học sinh *</label>
       <input id="cb-stu-name" type="text" required bind:value={newBillStudentName} placeholder="VD: Nguyễn Minh Quân" class="w-full px-3 py-2 rounded-lg border border-slate-300" />
      </div>
      <div>
       <label for="cb-period" class="block font-bold text-slate-700 mb-1">Kỳ thu học phí *</label>
       <input id="cb-period" type="text" required bind:value={newBillPeriod} placeholder="VD: Tháng 10/2026" class="w-full px-3 py-2 rounded-lg border border-slate-300" />
      </div>
      <div>
       <label for="cb-amount" class="block font-bold text-slate-700 mb-1">Học phí gốc (VNĐ) *</label>
       <input id="cb-amount" type="number" min="0" step="10000" required bind:value={newBillAmount} class="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold" />
      </div>
      <div>
       <label for="cb-status" class="block font-bold text-slate-700 mb-1">Trạng thái phiếu</label>
       <select id="cb-status" bind:value={newBillStatus} class="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-semibold">
        <option value="pending">⏳ Chờ thu (Pending)</option>
        <option value="approved">✅ Đã duyệt (Approved)</option>
        <option value="paid">💰 Đã thu (Paid)</option>
       </select>
      </div>
     </div>
    </div>
    <div data-testid="modal-cta-footer" class="sticky bottom-0 z-20 shrink-0 px-6 py-3.5 border-t border-slate-200 bg-white flex justify-end gap-2">
     <button type="button" onclick={() => showCreateBillModal = false} class="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 font-bold">Hủy</button>
     <button type="submit" disabled={creatingBill} class="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
      {creatingBill ? '⏳ Đang lưu...' : '💾 Lưu Phiếu Học Phí'}
     </button>
    </div>
   </form>
  </div>
 </div>
{/if}
