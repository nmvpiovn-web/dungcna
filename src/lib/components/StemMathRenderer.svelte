<script>
  import { onMount } from 'svelte';

  let { formula = '', displayMode = false, caption = '' } = $props();

  let renderedHtml = $state('');
  let renderError = $state('');

  function renderLatex() {
    renderError = '';
    if (!formula) {
      renderedHtml = '';
      return;
    }

    if (typeof window !== 'undefined' && window.katex) {
      try {
        renderedHtml = window.katex.renderToString(formula, {
          displayMode: displayMode,
          throwOnError: false
        });
      } catch (e) {
        renderError = e.message;
        renderedHtml = formula;
      }
    } else {
      // Safe fallback rendering with semantic math styling
      renderedHtml = formula;
    }
  }

  $effect(() => {
    if (formula) {
      renderLatex();
    }
  });

  onMount(() => {
    // If katex is not loaded yet, retry after short delay
    if (typeof window !== 'undefined' && !window.katex) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js';
      script.defer = true;
      script.onload = () => renderLatex();
      document.head.appendChild(script);

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css';
      document.head.appendChild(link);
    } else {
      renderLatex();
    }
  });
</script>

<div class="stem-math-container my-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
  <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1 border-b border-slate-200/60 dark:border-slate-700/60 pb-1">
    <span class="font-semibold text-cx-600 dark:text-cx-400 flex items-center gap-1">
      <span>📐</span>
      <span>Công Thức STEM / Toán - Khoa Học</span>
    </span>
    {#if caption}
      <span class="italic">{caption}</span>
    {/if}
  </div>

  <div class="math-content font-mono overflow-x-auto py-1 text-slate-900 dark:text-slate-100 {displayMode ? 'text-center text-sm py-2' : ''}">
    {#if renderedHtml && typeof window !== 'undefined' && window.katex}
      {@html renderedHtml}
    {:else}
      <code>{formula}</code>
    {/if}
  </div>
</div>
