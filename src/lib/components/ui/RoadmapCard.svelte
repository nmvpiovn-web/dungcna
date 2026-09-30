<!-- src/lib/components/ui/RoadmapCard.svelte — the lo trinh chang (hoc Prep): dau vao -> dau ra -->
<script>
  import UiButton from './UiButton.svelte';
  let { from = '', to = '', lessons = '', skills = [], badge = '', href = '/courses' } = $props();
</script>

<div class="relative flex flex-col p-5 rounded-2xl bg-surface-0 border border-line shadow-sm hover:border-brand-200 hover:shadow-md transition-all">
  {#if badge}
    <span class="absolute -top-3 left-4 px-3 py-1 rounded-full bg-accent-500 text-white text-[11px] font-extrabold shadow-sm">{badge}</span>
  {/if}
  <div class="flex items-center gap-2 mt-1 mb-3">
    <span class="px-2.5 py-1 rounded-lg bg-surface-1 border border-line text-xs font-bold text-ink-500">{from}</span>
    <span class="text-brand-600 font-black">→</span>
    <span class="px-2.5 py-1 rounded-lg bg-brand-50 border border-brand-200 text-xs font-extrabold text-brand-700">{to}</span>
  </div>
  <div class="text-xs text-ink-500 font-medium mb-3">📅 {lessons}</div>
  <div class="flex flex-wrap gap-1.5 mb-4">
    {#each skills as s}
      <span class="px-2 py-0.5 rounded-full bg-surface-1 border border-line text-[11px] font-semibold text-ink-900">{s}</span>
    {/each}
  </div>
  <div class="mt-auto">
    <UiButton size="sm" variant="ghost" {href} class="w-full">Xem chi tiết</UiButton>
  </div>
</div>
