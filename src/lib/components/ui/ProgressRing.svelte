<!-- src/lib/components/ui/ProgressRing.svelte — vong tien do SRS (flashcards/dictionary/grammar) -->
<script>
  let { percent = 0, label = '', size = 72 } = $props();
  const p = $derived(Math.max(0, Math.min(100, Math.round(percent))));
  const r = $derived((size - 10) / 2);
  const c = $derived(2 * Math.PI * r);
  const off = $derived(c - (p / 100) * c);
</script>

<div class="inline-flex flex-col items-center gap-1.5">
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} class="-rotate-90">
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="rgb(var(--line-rgb))" stroke-width="8" />
    <circle
      cx={size / 2} cy={size / 2} {r} fill="none"
      stroke="rgb(var(--brand-600-rgb))" stroke-width="8" stroke-linecap="round"
      stroke-dasharray={c} stroke-dashoffset={off}
      style="transition: stroke-dashoffset .6s ease;"
    />
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-size={size / 4} font-weight="800" fill="rgb(var(--ink-900-rgb))" class="rotate-90" transform={`rotate(90 ${size / 2} ${size / 2})`}>{p}%</text>
  </svg>
  {#if label}<span class="text-[11px] font-bold text-ink-500 text-center leading-tight">{label}</span>{/if}
</div>
