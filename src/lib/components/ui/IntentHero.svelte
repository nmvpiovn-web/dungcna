<!-- src/lib/components/ui/IntentHero.svelte — "Con bạn đang học lớp mấy?" (hoc Cambridge) -->
<script>
  import UiButton from './UiButton.svelte';
  let { options = [], primaryCta = null, secondaryCta = null } = $props();
</script>

<div class="text-center max-w-3xl mx-auto">
  <slot name="headline" />
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6 text-left">
    {#each options as opt}
      <a
        href={opt.href}
        class="group flex sm:flex-col items-center sm:items-start gap-3 p-4 sm:p-5 rounded-2xl bg-surface-0 border border-line shadow-sm hover:border-brand-200 hover:shadow-md hover:-translate-y-0.5 transition-all"
      >
        <div class="w-12 h-12 shrink-0 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
          {opt.icon}
        </div>
        <div>
          <div class="font-extrabold text-ink-900">{opt.label}</div>
          <div class="text-xs text-ink-500 mt-0.5 leading-relaxed">{opt.desc}</div>
        </div>
      </a>
    {/each}
  </div>
  {#if primaryCta || secondaryCta}
    <div class="flex flex-col sm:flex-row items-center justify-center gap-3 mt-7">
      {#if primaryCta}<UiButton size="lg" variant="accent" href={primaryCta.href}>{primaryCta.label}</UiButton>{/if}
      {#if secondaryCta}<UiButton size="lg" variant="ghost" href={secondaryCta.href}>{secondaryCta.label}</UiButton>{/if}
    </div>
  {/if}
</div>
