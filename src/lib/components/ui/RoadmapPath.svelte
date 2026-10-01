<!-- src/lib/components/ui/RoadmapPath.svelte — stepper ngang luy tien trai → phai, gon + hieu ung vao -->
<script>
  import { onMount } from 'svelte';
  // nodes: [{ label, sub, status: 'done' | 'current' | 'locked' }]
  let { nodes = [] } = $props();

  let track = $state(null);
  let visible = $state(false);

  onMount(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !visible) {
          visible = true;
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    if (track) io.observe(track);
    return () => io.disconnect();
  });

  const statusEmoji = { done: '✅', current: '🎯', locked: '🔒' };
  const nodeStyle = {
    done: 'border-success-600 bg-success-600 text-white',
    current: 'border-accent-500 bg-accent-500 text-white shadow-lg shadow-accent-500/30',
    locked: 'border-line bg-surface-1 text-ink-500'
  };
  const labelStyle = {
    done: 'text-ink-900',
    current: 'text-ink-900',
    locked: 'text-ink-500'
  };
</script>

<div bind:this={track} class="relative py-2" role="img" aria-label="Lộ trình học">
  <!-- Duong noi ngang -->
  <div class="absolute top-[26px] left-[10%] right-[10%] h-[3px] rounded-full bg-line overflow-hidden" aria-hidden="true">
    <div
      class="h-full rounded-full bg-gradient-to-r from-success-600 via-accent-500 to-accent-500 transition-all duration-1000 ease-out"
      style="width: {visible ? '100%' : '0%'}"
    ></div>
  </div>

  <ol class="relative flex items-start justify-between gap-1 sm:gap-2">
    {#each nodes as n, i}
      <li
        class="flex flex-col items-center text-center flex-1 min-w-0 transition-all duration-500 ease-out {visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}"
        style="transition-delay: {i * 120}ms"
      >
        <div class="relative">
          <div class="w-[52px] h-[52px] rounded-full border-[3px] flex items-center justify-center text-xl bg-surface-0 {nodeStyle[n.status] || nodeStyle.locked}">
            {statusEmoji[n.status] || '🔒'}
          </div>
          {#if n.status === 'current'}
            <span class="absolute -inset-1 rounded-full border-2 border-accent-500/50 animate-ping pointer-events-none"></span>
          {/if}
          <!-- So thu tu -->
          <span class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink-900 text-white text-[10px] font-extrabold flex items-center justify-center">
            {i + 1}
          </span>
        </div>
        <div class="mt-2 font-extrabold text-xs sm:text-sm whitespace-nowrap {labelStyle[n.status] || labelStyle.locked}">
          {n.label}
        </div>
        {#if n.sub}
          <div class="text-[10px] sm:text-[11px] text-ink-500 font-medium leading-tight mt-0.5 px-1">{n.sub}</div>
        {/if}
      </li>
      {#if i < nodes.length - 1}
        <div class="hidden sm:flex items-center pt-[14px] text-ink-500/60 text-lg shrink-0 transition-all duration-500 {visible ? 'opacity-100' : 'opacity-0'}" style="transition-delay: {i * 120 + 60}ms" aria-hidden="true">→</div>
      {/if}
    {/each}
  </ol>
</div>

<style>
  @media (prefers-reduced-motion: reduce) {
    li, div { transition: none !important; }
  }
</style>
