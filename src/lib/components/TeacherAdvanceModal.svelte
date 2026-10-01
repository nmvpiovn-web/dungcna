<script>
 import { getAuthToken } from '$lib/unifiedStore';

 let { isOpen = $bindable(false), onSubmitted = () => {} } = $props();

 let amountVnd = $state(2000000);
 let reason = $state('');
 let billingCycle = $state(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
 let isSubmitting = $state(false);
 let errorMsg = $state('');
 let successMsg = $state('');

 async function handleSubmit(e) {
 if (e) e.preventDefault();
 errorMsg = '';
 successMsg = '';

 if (!amountVnd || amountVnd <= 0) {
 errorMsg = 'Số tiền ứng lương phải lớn hơn 0đ';
 return;
 }
 if (!reason.trim()) {
 errorMsg = 'Vui lòng nêu rõ lý do cần tạm ứng lương';
 return;
 }

 const token = getAuthToken();
 if (!token) {
 errorMsg = 'Vui lòng đăng nhập lại để thao tác';
 return;
 }

 try {
 isSubmitting = true;
 const res = await fetch('/api/teachers/workflows', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${token}`
 },
 body: JSON.stringify({
 action: 'request_salary_advance',
 amount_vnd: amountVnd,
 reason: reason.trim(),
 billing_cycle: billingCycle
 })
 });

 const data = await res.json();
 if (data.success) {
 successMsg = `Đã gửi yêu cầu ứng lương ${amountVnd.toLocaleString('vi-VN')}đ tới Leader thành công!`;
 setTimeout(() => {
 isOpen = false;
 onSubmitted();
 reason = '';
 successMsg = '';
 }, 1200);
 } else {
 errorMsg = data.error || 'Lỗi khi gửi yêu cầu';
 }
 } catch (err) {
 errorMsg = err.message || 'Lỗi kết nối máy chủ';
 } finally {
 isSubmitting = false;
 }
 }
</script>

{#if isOpen}
 <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
 <div class="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
 
 <!-- Header -->
 <div class="flex items-center justify-between px-6 py-4 bg-emerald-600 text-white">
 <div class="flex items-center gap-2.5">
 <span class="text-xl">💵</span>
 <div>
 <h3 class="font-bold text-sm">Yêu Cầu Tạm Ứng Lương</h3>
 <p class="text-[11px] text-emerald-100">Khấu trừ tự động vào bảng lương tháng</p>
 </div>
 </div>
 <button
 type="button"
 onclick={() => isOpen = false}
 class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-sm font-bold"
 >
 ✕
 </button>
 </div>

 <!-- Form Body -->
 <form onsubmit={handleSubmit} class="p-6 space-y-4 text-xs">
 {#if errorMsg}
 <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 font-bold flex items-center gap-2">
 <span>⚠️</span> <span>{errorMsg}</span>
 </div>
 {/if}

 {#if successMsg}
 <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 font-bold flex items-center gap-2">
 <span>✅</span> <span>{successMsg}</span>
 </div>
 {/if}

 <div>
 <label for="adv-cycle" class="block font-bold text-slate-700 mb-1">
 Kỳ Lương Khấu Trừ:
 </label>
 <input
 id="adv-cycle"
 type="month"
 bind:value={billingCycle}
 required
 class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
 />
 </div>

 <div>
 <label for="adv-amount" class="block font-bold text-slate-700 mb-1">
 Số Tiền Cần Ứng (VNĐ) (*):
 </label>
 <div class="relative">
 <input
 id="adv-amount"
 type="number"
 step="100000"
 min="100000"
 max="20000000"
 bind:value={amountVnd}
 required
 class="w-full bg-slate-50 border border-slate-300 rounded-xl pl-3.5 pr-12 py-2.5 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-emerald-500"
 />
 <span class="absolute right-3.5 top-2.5 font-bold text-slate-400">₫</span>
 </div>
 <div class="text-[11px] text-emerald-600 font-semibold mt-1">
 Bằng chữ: {amountVnd ? amountVnd.toLocaleString('vi-VN') : 0} đồng
 </div>
 </div>

 <div>
 <label for="adv-reason" class="block font-bold text-slate-700 mb-1">
 Lý Do Ứng Lương (*):
 </label>
 <textarea
 id="adv-reason"
 rows="3"
 bind:value={reason}
 placeholder="Nêu rõ lý do (mua giáo trình, trang thiết bị dạy học, việc cá nhân...)"
 required
 class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
 ></textarea>
 </div>

 <div class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 text-[11px] space-y-1">
 <div class="font-bold flex items-center gap-1">
 <span>ℹ️</span> <span>Chính Sách Tạm Ứng Tiếng Anh Cô Dung:</span>
 </div>
 <p class="leading-relaxed">
 Khoản tiền ứng sẽ được Leader chuyển khoản sau khi duyệt và tự động đối trừ vào bảng lương tổng kết cuối tháng của giáo viên.
 </p>
 </div>

 <div class="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
 <button
 type="button"
 onclick={() => isOpen = false}
 class="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
 >
 Hủy Bỏ
 </button>
 <button
 type="submit"
 disabled={isSubmitting}
 class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-md shadow-emerald-600/25 transition-all disabled:opacity-50 flex items-center gap-1.5"
 >
 <span>{isSubmitting ? '⏳ Đang gửi...' : '💸 Gửi Yêu Cầu Ứng Lương'}</span>
 </button>
 </div>
 </form>
 </div>
 </div>
{/if}
