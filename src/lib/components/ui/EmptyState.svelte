<!-- src/lib/components/ui/EmptyState.svelte -->
<script>
  import UiButton from './UiButton.svelte';
  let { icon = '📭', title = 'Chưa có dữ liệu', hint = '', actionLabel = '', actionHref = '' } = $props();
</script>

<div class="flex flex-col items-center justify-center text-center gap-2 py-10 px-6 rounded-2xl border border-dashed border-line bg-surface-1">
  <div class="text-4xl">{icon}</div>
  <div class="font-bold text-ink-900">{title}</div>
  {#if hint}<p class="text-sm text-ink-500 max-w-sm">{hint}</p>{/if}
  {#if actionLabel}
    <div class="mt-2">
      <UiButton size="sm" href={actionHref || undefined}>{actionLabel}</UiButton>
    </div>
  {/if}
</div>
