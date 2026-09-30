<!-- src/lib/components/ui/BottomNav.svelte — 5 tab mobile, lg:hidden -->
<script>
  import { page } from '$app/state';
  const tabs = [
    { href: '/', label: 'Trang chủ', icon: '🏠' },
    { href: '/courses', label: 'Học', icon: '📚' },
    { href: '/exam', label: 'Phòng thi', icon: '📝' },
    { href: '/flashcards', label: 'Từ vựng', icon: '🔤' },
    { href: '/cpanel', label: 'Tôi', icon: '👤' }
  ];
  const isActive = (href) => href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<nav class="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-0/95 backdrop-blur border-t border-line shadow-[0_-4px_16px_rgba(0,0,0,0.06)]" style="padding-bottom: env(safe-area-inset-bottom);">
  <div class="grid grid-cols-5">
    {#each tabs as t}
      <a
        href={t.href}
        class={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition-colors ${isActive(t.href) ? 'text-brand-600' : 'text-ink-500'}`}
        aria-current={isActive(t.href) ? 'page' : undefined}
      >
        <span class="text-xl leading-none">{t.icon}</span>
        <span>{t.label}</span>
      </a>
    {/each}
  </div>
</nav>
