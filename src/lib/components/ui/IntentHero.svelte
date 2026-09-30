<!-- src/lib/components/ui/IntentHero.svelte — "Con bạn đang học lớp mấy?" (hoc Cambridge) -->
<script>
  import UiButton from './UiButton.svelte';
  let { eyebrow = '', headline = '', subline = '', intents = [] } = $props();
</script>

<div class="text-center max-w-3xl mx-auto">
  {#if eyebrow}
    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-[11px] font-extrabold uppercase tracking-widest">
      {eyebrow}
    </span>
  {/if}
  {#if headline}
    <h1 class="font-heading text-4xl sm:text-5xl font-extrabold text-ink-900 leading-tight mt-4">{headline}</h1>
  {/if}
  {#if subline}
    <p class="text-sm sm:text-base text-ink-500 leading-relaxed mt-3 max-w-2xl mx-auto">{subline}</p>
  {/if}
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6 text-left">
    {#each intents as item}
      <a
        href={item.href}
        class="group flex sm:flex-col items-center sm:items-start gap-3 p-4 sm:p-5 rounded-2xl bg-surface-0 border border-line shadow-sm hover:border-brand-200 hover:shadow-md hover:-translate-y-0.5 transition-all"
      >
        <div class="w-12 h-12 shrink-0 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
          {item.emoji}
        </div>
        <div class="min-w-0">
          <div class="font-extrabold text-ink-900">{item.title}</div>
          <div class="text-xs text-ink-500 mt-0.5 leading-relaxed">{item.desc}</div>
          {#if item.cta}
            <div class="text-xs font-extrabold text-brand-600 mt-2 group-hover:text-brand-700">{item.cta} →</div>
          {/if}
        </div>
      </a>
    {/each}
  </div>
</div>
