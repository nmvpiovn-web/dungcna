<script>
 import { onMount } from 'svelte';
 import { 
 getCurrentUser, 
 isSuperAdmin, 
 getDiscussionsForEvaluation, 
 addEvaluationComment, 
 deleteEvaluationComment 
 } from '$lib/unifiedStore';

 let { evaluationId, studentName = 'Học viên' } = $props();

 let currentUser = $state(null);
 let comments = $state([]);
 let newContent = $state('');
 let commentType = $state('comment'); // 'comment' | 'rebuttal' | 'inquiry' | 'leader_conclusion'
 let isSubmitting = $state(false);
 let toastMsg = $state('');

 onMount(() => {
 currentUser = getCurrentUser();
 loadComments();
 });

 function loadComments() {
 if (!evaluationId) return;
 comments = getDiscussionsForEvaluation(evaluationId);
 }

 function showToast(msg) {
 toastMsg = msg;
 setTimeout(() => toastMsg = '', 3500);
 }

 function handleAddComment() {
 if (!newContent.trim()) {
 alert('Vui lòng nhập nội dung phản biện hoặc thảo luận!');
 return;
 }

 isSubmitting = true;
 try {
 const added = addEvaluationComment({
 evaluation_id: evaluationId,
 content: newContent.trim(),
 comment_type: commentType
 }, currentUser);

 newContent = '';
 commentType = 'comment';
 loadComments();
 showToast('Đã gửi ý kiến thảo luận / phản biện thành công!');
 } catch (err) {
 alert('Lỗi: ' + err.message);
 } finally {
 isSubmitting = false;
 }
 }

 function handleDelete(id) {
 if (confirm('Bạn có chắc muốn xóa ý kiến này?')) {
 deleteEvaluationComment(id);
 loadComments();
 showToast('Đã xóa ý kiến phản biện');
 }
 }

 function getBadgeStyle(badge) {
 if (badge?.includes('CODUNG') || badge?.includes('SUPERADMIN')) {
 return 'bg-amber-100 text-amber-800 border-amber-300';
 }
 if (badge?.includes('BANNGU') || badge?.includes('JOHN')) {
 return 'bg-teal-100 text-teal-800 border-teal-300';
 }
 if (badge?.includes('TROGIANG') || badge?.includes('HUONG')) {
 return 'bg-indigo-100 text-indigo-800 border-indigo-300';
 }
 if (badge?.includes('PHU_HUYNH')) {
 return 'bg-purple-100 text-purple-800 border-purple-300';
 }
 return 'bg-cx-100 text-cx-800 border-cx-300';
 }

 function getTypePill(type) {
 switch (type) {
 case 'rebuttal':
 return { label: '⚖️ Phản Biện Kết Quả / Giải Trình', color: 'bg-rose-50 text-rose-700 border-rose-200' };
 case 'inquiry':
 return { label: '❓ Câu Hỏi & Thắc Mắc', color: 'bg-cx-50 text-cx-700 border-cx-200' };
 case 'leader_conclusion':
 return { label: '👑 Kết Luận Từ Cô Dung Leader', color: 'bg-amber-50 text-amber-800 border-amber-300' };
 default:
 return { label: '💬 Thảo Luận Đồng Hành', color: 'bg-slate-100 text-slate-700 border-slate-200' };
 }
 }
</script>

<div class="mt-4 pt-4 border-t border-slate-200 space-y-3">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-2">
 <span class="text-base">💬</span>
 <h4 class="font-bold text-xs uppercase tracking-wider text-slate-800">
 Khu Vực Thảo Luận &amp; Phản Biện Đánh Giá ({comments.length})
 </h4>
 </div>
 <span class="text-[10px] text-slate-500">
 Tương tác trực tiếp giữa Học sinh ↔ Giáo viên ↔ Cô Dung Leader
 </span>
 </div>

 {#if toastMsg}
 <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs font-semibold flex items-center justify-between">
 <span>✨ {toastMsg}</span>
 <button onclick={() => toastMsg = ''}>✕</button>
 </div>
 {/if}

 <!-- Comments List -->
 <div class="space-y-2.5 max-h-72 overflow-y-auto pr-1">
 {#if comments.length === 0}
 <div class="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
 Chưa có ý kiến thảo luận hoặc phản biện nào cho phiếu đánh giá này. Học sinh hoặc phụ huynh có thể đặt câu hỏi hoặc gửi giải trình ở khung bên dưới.
 </div>
 {:else}
 {#each comments as c}
 {@const typeObj = getTypePill(c.comment_type)}
 <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 transition-all">
 <div class="flex items-start justify-between gap-2">
 <div class="flex items-center gap-2">
 <img
 src={c.author_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'}
 alt=""
 class="w-7 h-7 rounded-full object-cover ring-1 ring-slate-300"
 />
 <div>
 <div class="flex items-center gap-1.5 flex-wrap">
 <span class="font-bold text-xs text-slate-900">{c.author_name}</span>
 <span class="text-[9px] font-mono px-1.5 py-0.5 rounded-md border font-extrabold {getBadgeStyle(c.author_badge)}">
 {c.author_badge}
 </span>
 <span class="text-[9px] px-2 py-0.5 rounded-md border font-bold {typeObj.color}">
 {typeObj.label}
 </span>
 </div>
 <div class="text-[10px] text-slate-400">
 {new Date(c.created_at).toLocaleString('vi-VN')}
 </div>
 </div>
 </div>

 {#if currentUser && (isSuperAdmin(currentUser) || currentUser.id === c.author_id)}
 <button
 type="button"
 onclick={() => handleDelete(c.id)}
 class="text-[10px] text-slate-400 hover:text-rose-500 transition-colors"
 title="Xóa ý kiến này"
 >
 ✕
 </button>
 {/if}
 </div>

 <div class="text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-line pl-9">
 {c.content}
 </div>
 </div>
 {/each}
 {/if}
 </div>

 <!-- New Comment Form -->
 <div class="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5 shadow-sm">
 <div class="flex items-center justify-between gap-2 flex-wrap text-xs">
 <span class="font-bold text-slate-700 flex items-center gap-1.5">
 <span>✍️</span>
 <span>Ý kiến thảo luận của bạn:</span>
 </span>

 <!-- Comment Type Selector -->
 <div class="flex items-center gap-1">
 <button
 type="button"
 onclick={() => commentType = 'comment'}
 class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all {commentType === 'comment' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}"
 >
 💬 Bình Luận
 </button>
 <button
 type="button"
 onclick={() => commentType = 'rebuttal'}
 class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all {commentType === 'rebuttal' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}"
 >
 ⚖️ Phản Biện / Giải Trình
 </button>
 <button
 type="button"
 onclick={() => commentType = 'inquiry'}
 class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all {commentType === 'inquiry' ? 'bg-cx-600 text-white' : 'bg-slate-100 text-slate-600'}"
 >
 ❓ Thắc Mắc
 </button>
 {#if currentUser && (isSuperAdmin(currentUser) || currentUser.role === 'teacher')}
 <button
 type="button"
 onclick={() => commentType = 'leader_conclusion'}
 class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all {commentType === 'leader_conclusion' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}"
 >
 👑 Kết Luận Leader
 </button>
 {/if}
 </div>
 </div>

 <textarea
 bind:value={newContent}
 rows="2"
 placeholder="Nhập câu hỏi, giải trình bài kiểm tra hoặc phản biện nhận xét... (Cô Dung và các thầy cô sẽ giải đáp trực tiếp)"
 class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
 ></textarea>

 <div class="flex items-center justify-between text-xs">
 <span class="text-[10px] text-slate-400">
 Đăng với tư cách: <strong class="text-slate-700">{currentUser?.name || 'Học viên'}</strong>
 </span>
 <button
 type="button"
 disabled={isSubmitting || !newContent.trim()}
 onclick={handleAddComment}
 class="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
 >
 <span>Gửi Ý Kiến</span>
 <span>➔</span>
 </button>
 </div>
 </div>
</div>
