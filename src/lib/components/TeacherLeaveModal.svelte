<script>
 import { getAuthToken } from '$lib/unifiedStore';

 let { isOpen = $bindable(false), session = null, teachers = [], onSubmitted = () => {} } = $props();

 let sessionDate = $state(new Date().toISOString().slice(0, 10));
 let reason = $state('');
 let substituteTeacherId = $state('');
 let isSubmitting = $state(false);
 let errorMsg = $state('');
 let successMsg = $state('');

 let otherTeachers = $derived.by(() => {
 return teachers.filter(t => t.id !== session?.teacher_id && t.teacher_id !== session?.teacher_id);
 });

 async function handleSubmit(e) {
 if (e) e.preventDefault();
 errorMsg = '';
 successMsg = '';

 if (!sessionDate) {
 errorMsg = 'Vui lòng chọn ngày cần xin nghỉ';
 return;
 }
 if (!reason.trim()) {
 errorMsg = 'Vui lòng ghi rõ lý do xin nghỉ phép';
 return;
 }

 const token = getAuthToken();
 if (!token) {
 errorMsg = 'Vui lòng đăng nhập lại để thao tác';
 return;
 }

 const subTeacher = otherTeachers.find(t => t.teacher_id === substituteTeacherId || t.id === substituteTeacherId);

 try {
 isSubmitting = true;
 const res = await fetch('/api/teachers/workflows', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${token}`
 },
 body: JSON.stringify({
 action: 'request_leave',
 session_id: session?.id || null,
 session_date: sessionDate,
 reason: reason.trim(),
 substitute_teacher_id: substituteTeacherId || null,
 substitute_teacher_name: subTeacher?.teacher_name || subTeacher?.name || null
 })
 });

 const data = await res.json();
 if (data.success) {
 successMsg = 'Đã gửi đơn xin nghỉ và thông báo đến đồng nghiệp / Leader thành công!';
 setTimeout(() => {
 isOpen = false;
 onSubmitted();
 reason = '';
 substituteTeacherId = '';
 successMsg = '';
 }, 1200);
 } else {
 errorMsg = data.error || 'Lỗi khi gửi đơn';
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
 <div class="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
 
 <!-- Header -->
 <div class="flex items-center justify-between px-6 py-4 bg-teal-600 text-white">
 <div class="flex items-center gap-2.5">
 <span class="text-xl">📝</span>
 <div>
 <h3 class="font-bold text-sm">Đơn Xin Nghỉ Phép &amp; Đề Nghị Dạy Thay</h3>
 <p class="text-[11px] text-teal-100">Hệ thống đào tạo Tiếng Anh Cô Dung</p>
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

 {#if session}
 <div class="p-3 rounded-2xl bg-teal-50 border border-teal-200 space-y-1">
 <div class="font-bold text-teal-800 text-xs">Thông Tin Ca Học:</div>
 <div class="text-[11px] text-slate-700">
 <strong>{session.class_name}</strong> ({session.grade_level}) • {session.start_time} - {session.end_time}
 </div>
 <div class="text-[10px] text-slate-500">Phòng học: {session.location}</div>
 </div>
 {/if}

 <div>
 <label for="leave-date" class="block font-bold text-slate-700 mb-1">
 Ngày Cần Nghỉ Phép (*):
 </label>
 <input
 id="leave-date"
 type="date"
 bind:value={sessionDate}
 required
 class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
 />
 </div>

 <div>
 <label for="leave-sub" class="block font-bold text-slate-700 mb-1">
 Đề Nghị Đồng Nghiệp Dạy Thay (Nếu Có):
 </label>
 <select
 id="leave-sub"
 bind:value={substituteTeacherId}
 class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
 >
 <option value="">-- Chưa chỉ định (Báo trực tiếp Leader điều phối) --</option>
 {#each otherTeachers as t}
 <option value={t.teacher_id || t.id}>
 {t.teacher_name || t.name} ({t.role_title || t.role_level || 'Giáo viên'})
 </option>
 {/each}
 </select>
 <p class="text-[10px] text-slate-500 mt-1">
 * Sau khi chọn, hệ thống sẽ gửi thông báo đến đồng nghiệp. Khi đồng nghiệp xác nhận, đơn sẽ tự động chuyển tới Leader Cô Dung phê duyệt.
 </p>
 </div>

 <div>
 <label for="leave-reason" class="block font-bold text-slate-700 mb-1">
 Lý Do Xin Nghỉ (*):
 </label>
 <textarea
 id="leave-reason"
 rows="3"
 bind:value={reason}
 placeholder="Nêu rõ lý do (tham gia tập huấn, việc gia đình, lý do sức khỏe...)"
 required
 class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
 ></textarea>
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
 class="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold shadow-md shadow-teal-600/25 transition-all disabled:opacity-50 flex items-center gap-1.5"
 >
 <span>{isSubmitting ? '⏳ Đang gửi...' : '🚀 Gửi Đơn Cho Leader'}</span>
 </button>
 </div>
 </form>
 </div>
 </div>
{/if}
