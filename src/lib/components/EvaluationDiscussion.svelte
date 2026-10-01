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
      return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-700';
    }
    if (badge?.includes('BANNGU') || badge?.includes('JOHN')) {
      return 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-700';
    }
    if (badge?.includes('TROGIANG') || badge?.includes('HUONG')) {
      return 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-700';
    }
    if (badge?.includes('PHU_HUYNH')) {
      return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-700';
    }
    return 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/70 dark:text-cyan-300 dark:border-cyan-700';
  }

  function getTypePill(type) {
    switch (type) {
      case 'rebuttal':
        return { label: '⚖️ Phản Biện Kết Quả / Giải Trình', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200' };
      case 'inquiry':
        return { label: '❓ Câu Hỏi & Thắc Mắc', color: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300 border-cyan-200' };
      case 'leader_conclusion':
        return { label: '👑 Kết Luận Từ Cô Dung Leader', color: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300' };
      default:
        return { label: '💬 Thảo Luận Đồng Hành', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200' };
    }
  }
</script>

<div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-base">💬</span>
      <h4 class="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
        Khu Vực Thảo Luận &amp; Phản Biện Đánh Giá ({comments.length})
      </h4>
    </div>
    <span class="text-[10px] text-slate-500 dark:text-slate-400">
      Tương tác trực tiếp giữa Học sinh ↔ Giáo viên ↔ Cô Dung Leader
    </span>
  </div>

  {#if toastMsg}
    <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between">
      <span>✨ {toastMsg}</span>
      <button onclick={() => toastMsg = ''}>✕</button>
    </div>
  {/if}

  <!-- Comments List -->
  <div class="space-y-2.5 max-h-72 overflow-y-auto pr-1">
    {#if comments.length === 0}
      <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
        Chưa có ý kiến thảo luận hoặc phản biện nào cho phiếu đánh giá này. Học sinh hoặc phụ huynh có thể đặt câu hỏi hoặc gửi giải trình ở khung bên dưới.
      </div>
    {:else}
      {#each comments as c}
        {@const typeObj = getTypePill(c.comment_type)}
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 space-y-2 transition-all">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <img
                src={c.author_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'}
                alt=""
                class="w-7 h-7 rounded-full object-cover ring-1 ring-slate-300 dark:ring-slate-700"
              />
              <div>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-bold text-xs text-slate-900 dark:text-white">{c.author_name}</span>
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

          <div class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans whitespace-pre-line pl-9">
            {c.content}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- New Comment Form -->
  <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-sm">
    <div class="flex items-center justify-between gap-2 flex-wrap text-xs">
      <span class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
        <span>✍️</span>
        <span>Ý kiến thảo luận của bạn:</span>
      </span>

      <!-- Comment Type Selector -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          onclick={() => commentType = 'comment'}
          class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all {commentType === 'comment' ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}"
        >
          💬 Bình Luận
        </button>
        <button
          type="button"
          onclick={() => commentType = 'rebuttal'}
          class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all {commentType === 'rebuttal' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}"
        >
          ⚖️ Phản Biện / Giải Trình
        </button>
        <button
          type="button"
          onclick={() => commentType = 'inquiry'}
          class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all {commentType === 'inquiry' ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}"
        >
          ❓ Thắc Mắc
        </button>
        {#if currentUser && (isSuperAdmin(currentUser) || currentUser.role === 'teacher')}
          <button
            type="button"
            onclick={() => commentType = 'leader_conclusion'}
            class="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all {commentType === 'leader_conclusion' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}"
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
      class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
    ></textarea>

    <div class="flex items-center justify-between text-xs">
      <span class="text-[10px] text-slate-400">
        Đăng với tư cách: <strong class="text-slate-700 dark:text-slate-300">{currentUser?.name || 'Học viên'}</strong>
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
