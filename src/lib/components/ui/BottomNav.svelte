<!-- src/lib/components/ui/BottomNav.svelte — 5 tab mobile & R10 APK -->
<script>
  import { page } from '$app/state';
  import { onMount } from 'svelte';

  let isApkOrR10 = $state(false);

  onMount(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent || '';
      isApkOrR10 = Boolean(
        (window.AndroidApp && typeof window.AndroidApp.isAndroidApp === 'function' && window.AndroidApp.isAndroidApp()) ||
        /TiengAnhCoDungApp|R10|DOOGEE/i.test(ua)
      );
    }
  });

  const tabs = [
    { href: '/', label: 'Trang chủ', icon: '🏠' },
    { href: '/quiz-menu', label: 'Quiz', icon: '🧩' },
    { href: '/exam', label: 'Phòng thi', icon: '📝' },
    { href: '/flashcards', label: 'Từ vựng', icon: '🔤' },
    { href: '/cpanel', label: 'Tôi', icon: '👤' }
  ];
  const isActive = (href) => href === '/' ? page.url.pathname === '/' : (page.url.pathname === href || page.url.pathname.startsWith(href + '/'));
  let hideForDedicatedWorkspace = $derived(page.url.pathname === '/app' || page.url.pathname.startsWith('/app/'));
</script>

{#if !hideForDedicatedWorkspace}
  <nav
    class={`${isApkOrR10 ? 'fixed' : 'lg:hidden fixed'} bottom-0 inset-x-0 z-40 bg-surface-0/95 backdrop-blur border-t border-line shadow-[0_-4px_16px_rgba(0,0,0,0.06)]`}
    style="padding-bottom: env(safe-area-inset-bottom);"
  >
    <div class="grid grid-cols-5 max-w-2xl mx-auto">
      {#each tabs as t}
        <a
          href={t.href === '/' && isApkOrR10 ? '/app' : t.href}
          class={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition-colors ${isActive(t.href) ? 'text-brand-600' : 'text-ink-500'}`}
          aria-current={isActive(t.href) ? 'page' : undefined}
        >
          <span class="text-xl leading-none">{t.icon}</span>
          <span>{t.label}</span>
        </a>
      {/each}
    </div>
  </nav>
{/if}
