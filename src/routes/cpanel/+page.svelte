<script>
  // Trang dieu huong /cpanel (them 2026-09-30): route nay chi co layout ma thieu +page
  // nen ca prerender lan user that deu gap 404. Layout cha (cpanel/+layout.svelte)
  // da co san logic role-based goto() trong onMount — page nay chi la diem vao
  // de route resolve, hien spinner cho den khi layout dieu huong xong.
</script>

<div class="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-center px-4">
  <div class="text-3xl animate-pulse">🧭</div>
  <div class="text-sm font-bold text-ink-500">Đang đưa bạn đến bảng điều khiển phù hợp...</div>
</div>
