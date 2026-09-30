<!-- src/lib/components/ui/UiCard.svelte -->
<script>
  let { tone = 'surface', children, ...rest } = $props();
  const tones = {
    surface: 'bg-surface-0 border-line',
    brand: 'bg-brand-50 border-brand-200'
  };
</script>

<div class={`rounded-2xl border shadow-sm ${tones[tone] || tones.surface} ${rest.class || ''}`} {...rest}>
  {@render children()}
</div>
