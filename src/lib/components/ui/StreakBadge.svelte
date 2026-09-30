<!-- src/lib/components/ui/StreakBadge.svelte -->
<script>
  import { gamification } from '$lib/gamification.js';
  let { days = null } = $props();
  let state = $state({ streak_days: 0 });
  gamification.subscribe((s) => (state = s));
  const shown = $derived(days ?? state.streak_days ?? 0);
</script>

<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-500/15 border border-accent-500/40 text-accent-500 text-xs font-extrabold" title="Số ngày học liên tiếp">
  🔥 {shown} ngày
</span>
