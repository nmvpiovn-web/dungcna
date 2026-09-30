<!-- src/lib/components/ui/XpPill.svelte -->
<script>
  import { gamification } from '$lib/gamification.js';
  let { xp = null } = $props();
  let state = $state({ xp_total: 0 });
  gamification.subscribe((s) => (state = s));
  const shown = $derived((xp ?? state.xp_total ?? 0).toLocaleString('vi-VN'));
</script>

<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-extrabold" title="Điểm kinh nghiệm">
  ⚡ {shown} XP
</span>
