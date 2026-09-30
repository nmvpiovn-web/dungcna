<!-- src/lib/components/ui/BadgeShelf.svelte — huy hieu so theo moc CEFR -->
<script>
  import { gamification, CEFR_BADGES } from '$lib/gamification.js';
  // defs: [{id, icon, level, label}] — mac dinh dung CEFR_BADGES
  let { defs = CEFR_BADGES } = $props();
  let state = $state({ badges: [] });
  gamification.subscribe((s) => (state = s));
  const owned = $derived(new Set(state.badges || []));
</script>

<div class="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
  {#each defs as b}
    {@const has = owned.has(b.id)}
    <div class={`flex flex-col items-center gap-1 p-3 rounded-2xl border text-center transition-all ${has ? 'bg-accent-500/10 border-accent-500/40' : 'bg-surface-1 border-line opacity-50 grayscale'}`}>
      <span class="text-3xl">{b.icon || '🏅'}</span>
      <span class="text-[11px] font-extrabold text-ink-900">{b.level || ''}</span>
      <span class="text-[10px] text-ink-500 leading-tight">{b.label || ''}</span>
    </div>
  {/each}
</div>
