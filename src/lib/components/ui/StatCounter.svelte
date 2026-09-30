<!-- src/lib/components/ui/StatCounter.svelte — dem so dong khi scroll toi (hoc ELSA/Cambridge) -->
<script>
  import { onMount } from 'svelte';
  let { value = 0, suffix = '', label = '', duration = 1200 } = $props();
  let el = $state(null);
  let shown = $state(0);
  let started = $state(false);

  onMount(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started) {
          started = true;
          const t0 = performance.now();
          const tick = (t) => {
            const p = Math.min(1, (t - t0) / duration);
            shown = Math.round(value * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    if (el) io.observe(el);
    return () => io.disconnect();
  });

  const formatted = $derived(shown.toLocaleString('vi-VN'));
</script>

<div bind:this={el} class="text-center px-3 py-2">
  <div class="font-heading text-3xl sm:text-4xl font-extrabold text-brand-600 tabular-nums">
    {formatted}{suffix}
  </div>
  <div class="text-xs sm:text-sm text-ink-500 font-medium mt-1">{label}</div>
</div>
