<!-- src/lib/components/ui/SectionHeading.svelte -->
<script>
  let {
    eyebrow = '',
    title = '',
    sub = '',
    align = 'center',
    center = false,          // alias: <SectionHeading center /> == align="center"
    dark = false,            // hien thi tren nen dam (vd section bg-brand-600)
    actionLabel = '',
    actionHref = ''
  } = $props();

  const isCenter = center || align === 'center';
  const alignCls = isCenter ? 'text-center items-center' : 'text-left items-start';
  // dark mode: chu sang tren nen dam
  const titleCls = dark ? 'text-white' : 'text-ink-900';
  const subCls = dark ? 'text-white/80' : 'text-ink-500';
  const eyebrowCls = dark
    ? 'bg-white/15 border-white/25 text-white'
    : 'bg-brand-50 border-brand-200 text-brand-700';
  const actionCls = dark ? 'text-white hover:text-white/85' : 'text-brand-600 hover:text-brand-700';
</script>

<div class={`flex flex-col gap-2 mb-8 ${alignCls}`}>
  {#if eyebrow}
    <span class={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-extrabold uppercase tracking-widest ${eyebrowCls}`}>
      {eyebrow}
    </span>
  {/if}
  <h2 class={`font-heading text-2xl sm:text-3xl font-extrabold leading-snug ${titleCls}`}>{title}</h2>
  {#if sub}
    <p class={`text-sm sm:text-base max-w-2xl leading-relaxed ${subCls}`}>{sub}</p>
  {/if}
  {#if actionLabel && actionHref}
    <a href={actionHref} class={`text-sm font-extrabold transition-colors ${actionCls}`}>
      {actionLabel}
    </a>
  {/if}
</div>
