<!-- src/lib/components/ui/FaqAccordion.svelte -->
<script>
  let { items = [] } = $props();
  let open = $state(0);
</script>

<div class="space-y-2.5">
  {#each items as item, i}
    <div class={`rounded-2xl border transition-colors ${open === i ? 'border-brand-200 bg-brand-50' : 'border-line bg-surface-0'}`}>
      <button
        type="button"
        onclick={() => (open = open === i ? -1 : i)}
        class="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left"
        aria-expanded={open === i}
      >
        <span class="font-bold text-sm sm:text-base text-ink-900">{item.q}</span>
        <span class={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-transform ${open === i ? 'bg-brand-600 dark:bg-brand-700 text-white rotate-45' : 'bg-surface-1 text-ink-500 border border-line'}`}>+</span>
      </button>
      {#if open === i}
        <div class="px-4 sm:px-5 pb-4 text-sm text-ink-500 leading-relaxed">{item.a}</div>
      {/if}
    </div>
  {/each}
</div>
