<!-- src/lib/components/ui/ThemeSwitcher.svelte -->
<script>
  import { getTheme, setTheme, THEMES, THEME_LABELS } from '$lib/unifiedStore';

  let current = $state(typeof window !== 'undefined' ? getTheme() : 'sky');

  function pick(t) {
    current = setTheme(t);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('tienganh:theme-change', (e) => { current = e.detail || getTheme(); });
  }

  const icons = { light: '☀️', sky: '🌤️', dark: '🌙' };
</script>

<div class="inline-flex items-center gap-1 p-1 rounded-full bg-surface-1 border border-line" role="group" aria-label="Chọn giao diện">
  {#each THEMES as t}
    <button
      type="button"
      onclick={() => pick(t)}
      title={THEME_LABELS[t]}
      aria-pressed={current === t}
      class={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold transition-all ${current === t ? 'bg-brand-600 dark:bg-brand-700 text-white shadow-sm' : 'text-ink-500 hover:text-ink-900'}`}
    >
      <span>{icons[t]}</span>
      <span class="hidden sm:inline">{THEME_LABELS[t]}</span>
    </button>
  {/each}
</div>
