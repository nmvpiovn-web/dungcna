<!-- src/lib/components/ui/TestimonialCard.svelte -->
<script>
  let { name = '', result = '', quote = '', avatar = '' } = $props();
</script>

<figure class="h-full flex flex-col gap-3 p-5 rounded-2xl bg-surface-0 border border-line shadow-sm">
  <div class="flex items-center gap-3">
    <div class="w-11 h-11 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-xl shrink-0">
      {avatar || '🎓'}
    </div>
    <div>
      <figcaption class="font-extrabold text-sm text-ink-900">{name}</figcaption>
      <div class="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-success-600/10 text-success-600 text-[11px] font-extrabold">
        🏆 {result}
      </div>
    </div>
  </div>
  <blockquote class="text-sm text-ink-500 leading-relaxed flex-1">“{quote}”</blockquote>
</figure>
