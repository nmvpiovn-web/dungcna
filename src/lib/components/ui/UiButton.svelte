<!-- src/lib/components/ui/UiButton.svelte -->
<script>
  let { variant = 'primary', size = 'md', href = null, disabled = false, onclick = null, type = 'button', children, ...rest } = $props();

  const variants = {
    primary: 'bg-brand-600 hover:bg-brand-700 dark:bg-brand-700 text-white shadow-sm',
    accent: 'bg-accent-500 hover:brightness-105 text-white shadow-sm',
    ghost: 'bg-transparent hover:bg-brand-50 text-brand-600 border border-line',
    danger: 'bg-danger-600 hover:brightness-95 text-white shadow-sm'
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-5 py-2.5 text-sm rounded-xl',
    lg: 'px-7 py-3.5 text-base rounded-2xl',
    kid: 'px-6 py-3 text-base rounded-[1.25rem] btn-kid font-extrabold'
  };
  const cls = `inline-flex items-center justify-center gap-2 font-bold transition-all disabled:opacity-50 disabled:pointer-events-none ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${rest.class || ''}`;
</script>

{#if href}
  <a {href} class={cls} {onclick} {...rest}>{@render children()}</a>
{:else}
  <button {type} class={cls} {disabled} {onclick} {...rest}>{@render children()}</button>
{/if}
