<!-- src/lib/components/ui/RoadmapPath.svelte — path node ziczac kieu Duolingo (SVG responsive) -->
<script>
  // nodes: [{ label, sub, status: 'done' | 'current' | 'locked' }]
  let { nodes = [] } = $props();

  const W = 360, ROW_H = 96, TOP = 48;
  const H = $derived(TOP * 2 + nodes.length * ROW_H);
  const pos = (i) => {
    const x = i % 2 === 0 ? W * 0.28 : W * 0.72;
    const y = TOP + i * ROW_H + ROW_H / 2;
    return { x, y };
  };
  const path = $derived(
    nodes.map((_, i) => `${i === 0 ? 'M' : 'L'} ${pos(i).x} ${pos(i).y}`).join(' ')
  );
  const statusStyle = {
    done: 'fill: rgb(var(--success-600-rgb));',
    current: 'fill: rgb(var(--accent-500-rgb));',
    locked: 'fill: rgb(var(--ink-500-rgb)); opacity: .45;'
  };
  const statusEmoji = { done: '✅', current: '🎯', locked: '🔒' };
</script>

<svg viewBox={`0 0 ${W} ${H}`} class="w-full max-w-md mx-auto" role="img" aria-label="Lộ trình học">
  <path d={path} fill="none" stroke="rgb(var(--brand-200-rgb))" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 10" />
  {#each nodes as n, i}
    {@const p = pos(i)}
    {@const lx = i % 2 === 0 ? p.x + 44 : p.x - 44}
    {@const anchor = i % 2 === 0 ? 'start' : 'end'}
    <circle cx={p.x} cy={p.y} r="26" style={statusStyle[n.status] || statusStyle.locked} />
    <circle cx={p.x} cy={p.y} r="31" fill="none" stroke="rgb(var(--line-rgb))" stroke-width="2" />
    <text x={p.x} y={p.y + 7} text-anchor="middle" font-size="20">{statusEmoji[n.status] || '🔒'}</text>
    <text x={lx} y={p.y - 2} text-anchor={anchor} font-size="14" font-weight="800" fill="rgb(var(--ink-900-rgb))">{n.label}</text>
    {#if n.sub}
      <text x={lx} y={p.y + 16} text-anchor={anchor} font-size="11" fill="rgb(var(--ink-500-rgb))">{n.sub}</text>
    {/if}
  {/each}
</svg>
