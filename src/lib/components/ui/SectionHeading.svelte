<!-- src/lib/components/ui/SectionHeading.svelte -->
<script>
  let { eyebrow = '', title = '', sub = '', align = 'center' } = $props();
  const alignCls = align === 'left' ? 'text-left items-start' : 'text-center items-center';
</script>

<div class={`flex flex-col gap-2 mb-8 ${alignCls}`}>
  {#if eyebrow}
    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-[11px] font-extrabold uppercase tracking-widest">
      {eyebrow}
    </span>
  {/if}
  <h2 class="font-heading text-2xl sm:text-3xl font-extrabold text-ink-900 leading-snug">{title}</h2>
  {#if sub}
    <p class="text-sm sm:text-base text-ink-500 max-w-2xl leading-relaxed">{sub}</p>
  {/if}
</div>
