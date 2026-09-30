<!-- src/lib/components/ui/RoadmapCard.svelte — the khoa hoc (hoc Prep): tieu de + mo ta + tinh nang + gia -->
<script>
  import UiButton from './UiButton.svelte';
  let {
    title = '',
    gradeBand = '',
    level = '',
    description = '',
    duration = '',
    features = [],
    price = 0,
    cta = 'Xem chi tiết',
    href = '/courses'
  } = $props();

  const fmt = (v) => Number(v).toLocaleString('vi-VN');
</script>

<div class="relative flex flex-col p-5 sm:p-6 rounded-2xl bg-surface-0 border border-line shadow-sm hover:border-brand-200 hover:shadow-md transition-all">
  <div class="flex flex-wrap items-center gap-2 mb-3">
    {#if gradeBand}
      <span class="px-2.5 py-1 rounded-lg bg-brand-50 border border-brand-200 text-[11px] font-extrabold uppercase tracking-widest text-brand-700">{gradeBand}</span>
    {/if}
    {#if level}
      <span class="px-2.5 py-1 rounded-lg bg-surface-1 border border-line text-[11px] font-bold text-ink-500">{level}</span>
    {/if}
  </div>

  <h3 class="font-heading text-lg font-extrabold text-ink-900 leading-snug">{title}</h3>
  {#if description}
    <p class="text-sm text-ink-500 leading-relaxed mt-2">{description}</p>
  {/if}
  {#if duration}
    <div class="text-xs text-ink-500 font-medium mt-3">📅 {duration}</div>
  {/if}

  {#if features.length}
    <ul class="mt-3 space-y-1.5">
      {#each features as f}
        <li class="text-xs text-ink-900 font-medium flex gap-1.5"><span class="text-brand-600">✓</span><span>{f}</span></li>
      {/each}
    </ul>
  {/if}

  <div class="flex items-center justify-between mt-4 mb-4">
    {#if price > 0}
      <div>
        <span class="font-heading text-xl font-extrabold text-brand-600">{fmt(price)}đ</span>
        <span class="text-xs text-ink-500 font-medium">/tháng</span>
      </div>
    {:else}
      <span></span>
    {/if}
  </div>

  <div class="mt-auto">
    <UiButton size="sm" variant="ghost" {href} class="w-full">{cta}</UiButton>
  </div>
</div>
