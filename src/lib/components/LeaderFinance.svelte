<!-- src/lib/components/LeaderFinance.svelte
 Tổng quan tài chính cho leader cpanel: tổng phải thu / đã thu / còn nợ + bảng bills gần đây.
 Không dùng unifiedStore — fetch trực tiếp với Bearer token từ localStorage. -->
<script>
 import { onMount } from 'svelte';

 let bills = $state([]);
 let loading = $state(true);
 let error = $state('');

 const fmtVND = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + 'đ';

 function getToken() {
  try { return localStorage.getItem('tienganh_token') || ''; } catch { return ''; }
 }

 function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('vi-VN'); } catch { return '—'; }
 }

 const STATUS_LABELS = {
  paid: ['Đã thu', 'bg-emerald-50 text-emerald-700'],
  pending: ['Chờ thu', 'bg-amber-50 text-amber-700'],
  overdue: ['Quá hạn', 'bg-red-50 text-red-700'],
  approved_by_superadmin: ['Đã duyệt', 'bg-blue-50 text-blue-700'],
  cancelled: ['Đã hủy', 'bg-slate-100 text-slate-500']
 };
 function statusBadge(s) {
  return STATUS_LABELS[s] || [s || '—', 'bg-slate-100 text-slate-600'];
 }

 let totalReceivable = $derived(bills.reduce((sum, b) => sum + (Number(b.final_amount_vnd) || 0), 0));
 let totalCollected = $derived(bills.filter(b => b.status === 'paid').reduce((sum, b) => sum + (Number(b.final_amount_vnd) || 0), 0));
 let totalDebt = $derived(totalReceivable - totalCollected);
 let recentBills = $derived([...bills].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 20));

 async function loadFinance() {
  loading = true; error = '';
  try {
   const token = getToken();
   const res = await fetch('/api/tuition', {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
   });
   const data = await res.json().catch(() => ({}));
   if (data.success) {
    bills = data.bills || [];
   } else {
    error = data.error || 'Không tải được dữ liệu học phí.';
   }
  } catch {
   error = 'Lỗi kết nối máy chủ. Vui lòng thử lại.';
  } finally {
   loading = false;
  }
 }

 onMount(() => { loadFinance(); });
</script>

<div class="space-y-4">
 <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
  <h3 class="text-base font-bold text-slate-900">💰 Tổng quan tài chính</h3>
  <button onclick={loadFinance} class="px-3 py-2 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200">
   🔄 Tải lại
  </button>
 </div>

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
   <div class="px-4 py-3 border-b border-slate-200 font-bold text-sm text-slate-900">🧾 Phiếu học phí gần đây</div>
   {#if recentBills.length === 0}
    <div class="p-8 text-center text-sm text-slate-400">Chưa có phiếu học phí nào.</div>
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
        </tr>
       {/each}
      </tbody>
     </table>
    </div>
   {/if}
  </div>
 {/if}
</div>
