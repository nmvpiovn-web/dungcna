<!-- src/lib/components/ui/ZaloCta.svelte — nut Zalo noi goc phai duoi moi trang cong khai -->
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
  class="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-40 flex items-center gap-2 pl-3 pr-4 py-3 rounded-full bg-[#0068ff] text-white shadow-lg hover:scale-105 transition-transform"
>
  <span class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg font-extrabold">Z</span>
  <span class="text-xs font-extrabold hidden sm:inline">{label}</span>
</a>
