<!-- src/lib/components/ui/ZaloCta.svelte — nut Zalo noi goc phai duoi moi trang cong khai, tu dong bi day len theo DockBar -->
<script>
  import { SITE_CONTACT } from '$lib/site.js';
  let { zaloUrl = SITE_CONTACT.zaloUrl, label = 'Chat Zalo với Cô Dung' } = $props();
</script>

<a
  href={zaloUrl}
  target="_blank"
  rel="noopener noreferrer"
  title={label}
  aria-label={label}
  style="bottom: calc(var(--dockbar-push-height, 104px) + 0.5rem);"
  class="fixed right-4 lg:right-6 z-40 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg hover:scale-105 transition-all duration-200"
>
  <span class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg font-extrabold">Z</span>
  <span class="text-xs font-extrabold hidden sm:inline">{label}</span>
</a>
