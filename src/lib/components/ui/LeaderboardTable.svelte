<!-- src/lib/components/ui/LeaderboardTable.svelte — CHI trong pham vi lop (an toan tre em) -->
<script>
  let { scope = 'class', scopeName = 'Lớp của bạn', rows = [] } = $props();
  const medal = ['🥇', '🥈', '🥉'];
</script>

<div class="rounded-2xl bg-surface-0 border border-line shadow-sm overflow-hidden">
  <div class="px-4 py-3 bg-brand-50 border-b border-brand-200 flex items-center justify-between">
    <div class="font-extrabold text-sm text-ink-900">🏆 Bảng xếp hạng tuần</div>
    <div class="text-[11px] font-bold text-brand-700">Phạm vi: {scopeName} 🔒</div>
  </div>
  {#if rows.length === 0}
    <div class="px-4 py-8 text-center text-sm text-ink-500">Chưa có dữ liệu tuần này — hãy là người đầu tiên ghi điểm! 🚀</div>
  {:else}
    <ul class="divide-y divide-[rgb(var(--line-rgb)/0.6)]">
      {#each rows as r, i}
        <li class={`flex items-center gap-3 px-4 py-2.5 ${r.is_me ? 'bg-accent-500/10' : ''}`}>
          <span class="w-7 text-center text-lg">{medal[i] || `${i + 1}`}</span>
          <span class="w-9 h-9 rounded-full bg-surface-1 border border-line flex items-center justify-center text-lg shrink-0">{r.avatar || '🎓'}</span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-bold text-ink-900 truncate">{r.name}{r.is_me ? ' (bạn)' : ''}</span>
            <span class="block text-[11px] text-ink-500">🔥 {r.streak || 0} ngày streak</span>
          </span>
          <span class="text-sm font-extrabold text-brand-600 tabular-nums">{Number(r.xp || 0).toLocaleString('vi-VN')} XP</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="px-4 py-2 bg-surface-1 text-[11px] text-ink-500 text-center border-t border-line">
    🔄 Reset mỗi tuần • Chỉ hiển thị trong {scope === 'class' ? 'lớp học' : 'phạm vi'} của bạn để bảo vệ trẻ em
  </div>
</div>
